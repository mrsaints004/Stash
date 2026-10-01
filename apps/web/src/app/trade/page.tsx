"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Header } from "@/components/layout/Header";
import { useStashPower } from "@/hooks/useStashPower";
import { useTrade } from "@/hooks/useTrade";
import { useAuth } from "@/hooks/useAuth";
import {
  ADDRESSES,
  TOKENS,
  DEFAULT_SLIPPAGE_BPS,
  parseUnits,
  formatUnits,
  formatUsd,
  formatPercent,
} from "@stash/common";
import { ERC20_ABI, STASH_ROUTER_ABI } from "@stash/abis";
import type { Address } from "viem";

const ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_STASH_ROUTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

interface TokenOption {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

const ALL_TOKENS: TokenOption[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: ADDRESSES.USDC as Address,
    decimals: 6,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: ADDRESSES.WETH as Address,
    decimals: 18,
  },
  {
    symbol: "cirBTC",
    name: "Circle BTC",
    address: ADDRESSES.cirBTC as Address,
    decimals: 8,
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    address: ADDRESSES.EURC as Address,
    decimals: 6,
  },
];

type TradeStep =
  | "input"
  | "quoting"
  | "quoted"
  | "approving"
  | "trading"
  | "confirming"
  | "success";

export default function TradePage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const { availableCredit, stashPower, usedCredit } = useStashPower();
  const {
    getQuote,
    quote,
    isQuoting,
    prepareTrade,
    confirmTrade,
  } = useTrade();

  const [tokenIn, setTokenIn] = useState<TokenOption>(ALL_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<TokenOption>(ALL_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [customSlippage, setCustomSlippage] = useState("");
  const [step, setStep] = useState<TradeStep>("input");
  const [error, setError] = useState<string | null>(null);

  // Read tokenIn balance
  const { data: tokenInBalance } = useReadContract({
    address: tokenIn.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Read allowance for router
  const { data: currentAllowance, refetch: refetchAllowance } =
    useReadContract({
      address: tokenIn.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address!, ROUTER_ADDRESS],
      query: {
        enabled: isConnected && !!address,
      },
    });

  // Approval tx
  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: isWaitingApprove, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Swap tx
  const {
    data: swapTxHash,
    writeContract: writeSwap,
    isPending: isSwapping,
    reset: resetSwap,
  } = useWriteContract();

  const { isLoading: isWaitingSwap, isSuccess: swapConfirmed } =
    useWaitForTransactionReceipt({ hash: swapTxHash });

  const walletBalance: bigint =
    typeof tokenInBalance === "bigint" ? tokenInBalance : 0n;

  // After approval confirmed, proceed with swap
  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      refetchAllowance();
      handleSwap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, step]);

  // After swap confirmed, confirm with backend
  useEffect(() => {
    if (swapConfirmed && swapTxHash && step === "trading") {
      handleConfirmTrade(swapTxHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapConfirmed, swapTxHash, step]);

  const handleGetQuote = async () => {
    if (!amountIn || !address) return;
    setStep("quoting");
    setError(null);

    try {
      const parsedAmount = parseUnits(amountIn, tokenIn.decimals);
      await getQuote(
        tokenIn.address,
        tokenOut.address,
        parsedAmount.toString(),
        slippageBps
      );
      setStep("quoted");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to get quote";
      setError(message);
      setStep("input");
    }
  };

  const handleSwap = useCallback(async () => {
    if (!amountIn || !address || !quote) return;
    setStep("trading");
    setError(null);

    try {
      const parsedAmountIn = parseUnits(amountIn, tokenIn.decimals);
      const amountOutMin = BigInt(quote.amountOutMin);

      writeSwap({
        address: ROUTER_ADDRESS,
        abi: STASH_ROUTER_ABI,
        functionName: "swap",
        args: [
          tokenIn.address,
          tokenOut.address,
          parsedAmountIn,
          amountOutMin,
        ],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Trade failed";
      setError(message);
      setStep("quoted");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountIn, address, quote, tokenIn, tokenOut]);

  const handleConfirmTrade = async (txHash: string) => {
    setStep("confirming");
    try {
      const parsedAmountIn = parseUnits(amountIn, tokenIn.decimals);
      await confirmTrade(
        txHash,
        tokenIn.address,
        tokenOut.address,
        parsedAmountIn.toString(),
        quote?.amountOutMin ?? "0"
      );
      setStep("success");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Confirmation failed";
      setError(message);
      setStep("quoted");
    }
  };

  const handleExecuteTrade = async () => {
    if (!amountIn || !address || !quote) return;
    setError(null);

    const parsedAmount = parseUnits(amountIn, tokenIn.decimals);
    const allowance = (currentAllowance as bigint) ?? 0n;

    if (allowance < parsedAmount) {
      setStep("approving");
      try {
        writeApprove({
          address: tokenIn.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ROUTER_ADDRESS, parsedAmount],
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Approval failed";
        setError(message);
        setStep("quoted");
      }
    } else {
      await handleSwap();
    }
  };

  const handleSwapDirection = () => {
    const tempIn = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tempIn);
    setAmountIn("");
    setStep("input");
    setError(null);
  };

  const handleReset = () => {
    setAmountIn("");
    setStep("input");
    setError(null);
    resetApprove();
    resetSwap();
  };

  const isProcessing =
    isQuoting ||
    isApproving ||
    isWaitingApprove ||
    isSwapping ||
    isWaitingSwap;

  const getButtonLabel = (): string => {
    switch (step) {
      case "quoting":
        return "Getting quote...";
      case "approving":
        if (isApproving) return "Confirm approval in wallet...";
        if (isWaitingApprove) return "Waiting for approval...";
        return "Approving...";
      case "trading":
        if (isSwapping) return "Confirm trade in wallet...";
        if (isWaitingSwap) return "Waiting for trade...";
        return "Trading...";
      case "confirming":
        return "Confirming with Stash...";
      default:
        return "";
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-stash-bg">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="rounded-lg border border-stash-border bg-stash-surface p-8">
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Connect Wallet
            </h2>
            <p className="text-sm text-stash-muted">
              Connect your wallet to trade tokens.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stash-bg">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="rounded-lg border border-stash-border bg-stash-surface p-8">
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Sign In Required
            </h2>
            <p className="text-sm text-stash-muted mb-6">
              Sign in with your wallet to trade tokens.
            </p>
            <button
              onClick={login}
              disabled={authLoading}
              className="bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg px-6 py-3 text-sm disabled:opacity-50"
            >
              {authLoading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Success state
  if (step === "success") {
    return (
      <div className="min-h-screen bg-stash-bg">
        <Header />
        <main className="mx-auto max-w-lg px-4 py-16">
          <div className="rounded-lg border border-stash-green/20 bg-stash-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stash-green/10">
              <svg
                className="h-6 w-6 text-stash-green"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Trade Successful
            </h2>
            <p className="text-sm text-stash-muted mb-2">
              Swapped {amountIn} {tokenIn.symbol} for {tokenOut.symbol}
            </p>
            {swapTxHash && (
              <p className="text-xs text-stash-muted mb-6 break-all font-mono">
                Tx: {swapTxHash}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-6 py-3 text-sm font-medium"
              >
                Trade Again
              </button>
              <Link
                href="/positions"
                className="bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg px-6 py-3 text-sm"
              >
                View Positions
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stash-bg">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-stash-muted hover:text-stash-text transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-stash-text">
            Trade
          </h1>
          <p className="mt-1 text-sm text-stash-muted">
            Swap tokens using your Stash Power.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Trade Form */}
          <div className="lg:col-span-2 rounded-lg border border-stash-border bg-stash-surface p-6">
            {/* From Section */}
            <div className="mb-2">
              <label className="block text-sm font-medium text-stash-muted mb-2">
                From
              </label>
              <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <select
                    value={tokenIn.symbol}
                    onChange={(e) => {
                      const selected = ALL_TOKENS.find(
                        (t) => t.symbol === e.target.value
                      );
                      if (selected) {
                        if (selected.symbol === tokenOut.symbol) {
                          setTokenOut(tokenIn);
                        }
                        setTokenIn(selected);
                        setAmountIn("");
                        setStep("input");
                        setError(null);
                      }
                    }}
                    disabled={isProcessing}
                    className="rounded-lg border border-stash-border bg-stash-surface px-3 py-2 text-sm text-stash-text focus:outline-none focus:border-stash-gold/40"
                  >
                    {ALL_TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amountIn}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setAmountIn(val);
                        setError(null);
                        if (step === "quoted") setStep("input");
                      }
                    }}
                    disabled={isProcessing}
                    className="flex-1 bg-transparent text-right text-lg font-mono text-stash-text placeholder:text-stash-dim focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-stash-muted">
                  <span className="font-mono">
                    Balance: {formatUnits(walletBalance, tokenIn.decimals)}{" "}
                    {tokenIn.symbol}
                  </span>
                  <button
                    onClick={() => {
                      setAmountIn(
                        formatUnits(walletBalance, tokenIn.decimals)
                      );
                      if (step === "quoted") setStep("input");
                    }}
                    disabled={isProcessing}
                    className="text-stash-gold hover:text-stash-gold-light transition-colors disabled:opacity-50"
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>

            {/* Swap Direction Button */}
            <div className="flex justify-center my-2">
              <button
                onClick={handleSwapDirection}
                disabled={isProcessing}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stash-border bg-stash-surface hover:border-stash-border-light transition-colors disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4 text-stash-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
                  />
                </svg>
              </button>
            </div>

            {/* To Section */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-stash-muted mb-2">
                To
              </label>
              <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <select
                    value={tokenOut.symbol}
                    onChange={(e) => {
                      const selected = ALL_TOKENS.find(
                        (t) => t.symbol === e.target.value
                      );
                      if (selected) {
                        if (selected.symbol === tokenIn.symbol) {
                          setTokenIn(tokenOut);
                        }
                        setTokenOut(selected);
                        setStep("input");
                        setError(null);
                      }
                    }}
                    disabled={isProcessing}
                    className="rounded-lg border border-stash-border bg-stash-surface px-3 py-2 text-sm text-stash-text focus:outline-none focus:border-stash-gold/40"
                  >
                    {ALL_TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1 text-right text-lg font-mono text-stash-muted">
                    {quote && step !== "input"
                      ? formatUnits(
                          BigInt(quote.amountOutMin),
                          tokenOut.decimals
                        )
                      : "0.0"}
                  </div>
                </div>
                <div className="text-xs text-stash-muted">
                  Estimated output
                </div>
              </div>
            </div>

            {/* Slippage Settings */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-stash-muted mb-2">
                Slippage Tolerance
              </label>
              <div className="flex items-center gap-2">
                {[50, 100].map((bps) => (
                  <button
                    key={bps}
                    onClick={() => {
                      setSlippageBps(bps);
                      setCustomSlippage("");
                    }}
                    disabled={isProcessing}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      slippageBps === bps && !customSlippage
                        ? "bg-stash-gold/10 text-stash-gold border border-stash-gold/20"
                        : "border border-stash-border text-stash-muted hover:border-stash-border-light"
                    } disabled:opacity-50`}
                  >
                    {bps / 100}%
                  </button>
                ))}
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Custom"
                    value={customSlippage}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setCustomSlippage(val);
                        if (val && !isNaN(Number(val))) {
                          setSlippageBps(Math.round(Number(val) * 100));
                        }
                      }
                    }}
                    disabled={isProcessing}
                    className="w-full rounded-lg border border-stash-border bg-stash-bg px-3 py-1.5 pr-8 text-xs text-stash-text placeholder:text-stash-dim focus:border-stash-gold/40 focus:outline-none focus:ring-1 focus:ring-stash-gold/20 disabled:opacity-50"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stash-muted">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Quote Details */}
            {quote && step !== "input" && (
              <div className="mb-6 rounded-lg border border-stash-border bg-stash-bg p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stash-muted">Price Impact</span>
                  <span
                    className={
                      quote.priceImpact > 0.03
                        ? "text-stash-red"
                        : quote.priceImpact > 0.01
                          ? "text-yellow-400"
                          : "text-stash-text"
                    }
                  >
                    {formatPercent(quote.priceImpact)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stash-muted">Minimum Received</span>
                  <span className="text-stash-text font-mono">
                    {formatUnits(BigInt(quote.amountOutMin), tokenOut.decimals)}{" "}
                    {tokenOut.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stash-muted">Slippage</span>
                  <span className="text-stash-text">
                    {quote.slippageBps / 100}%
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 rounded-lg border border-stash-red/20 bg-stash-red/5 px-4 py-3">
                <p className="text-sm text-stash-red">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            {step === "input" || step === "quoting" ? (
              <button
                onClick={handleGetQuote}
                disabled={
                  !amountIn ||
                  isNaN(Number(amountIn)) ||
                  Number(amountIn) <= 0 ||
                  isProcessing ||
                  tokenIn.symbol === tokenOut.symbol
                }
                className="w-full bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg py-3.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isQuoting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Getting Quote...
                  </span>
                ) : (
                  "Get Quote"
                )}
              </button>
            ) : (
              <button
                onClick={handleExecuteTrade}
                disabled={isProcessing}
                className="w-full bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg py-3.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {getButtonLabel()}
                  </span>
                ) : (
                  "Execute Trade"
                )}
              </button>
            )}
          </div>

          {/* Right Panel: Position Summary */}
          <div className="space-y-6">
            <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
              <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-4">
                Available Credit
              </h3>
              <div className="text-2xl font-semibold text-stash-text font-mono">
                {formatUsd(availableCredit)}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stash-muted">Total Stash Power</span>
                  <span className="text-stash-text font-mono">
                    {formatUsd(stashPower)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stash-muted">Used</span>
                  <span className="text-stash-text font-mono">
                    {formatUsd(usedCredit)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
              <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-3">
                Quick Links
              </h3>
              <div className="space-y-2">
                <Link
                  href="/deposit"
                  className="block rounded-lg border border-stash-border bg-stash-bg px-4 py-3 text-sm text-stash-text hover:border-stash-border-light transition-colors"
                >
                  Deposit more collateral
                </Link>
                <Link
                  href="/positions"
                  className="block rounded-lg border border-stash-border bg-stash-bg px-4 py-3 text-sm text-stash-text hover:border-stash-border-light transition-colors"
                >
                  View positions
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
