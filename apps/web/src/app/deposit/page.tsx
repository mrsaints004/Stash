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
import { TokenAmount } from "@/components/common/TokenAmount";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useCollateral } from "@/hooks/useCollateral";
import { useAuth } from "@/hooks/useAuth";
import { ADDRESSES, TOKENS, parseUnits, formatUnits, formatUsd } from "@stash/common";
import { ERC20_ABI } from "@stash/abis";
import { api } from "@/lib/api";
import type { Address } from "viem";

// Vault address used as the spender for approvals.
// The backend's prepare-deposit returns the actual vault address,
// but we need a constant for the allowance read ahead of time.
// In production this would come from environment config.
const VAULT_ADDRESS = ADDRESSES.AaveV4MainSpoke as Address;

interface AssetOption {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

const DEPOSIT_ASSETS: AssetOption[] = [
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
];

type DepositStep = "input" | "approving" | "depositing" | "confirming" | "success";

interface PriceData {
  [address: string]: string;
}

export default function DepositPage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const { wethBalance, cirBtcBalance, refetch: refetchBalances } = useTokenBalances();
  const { prepareDeposit, confirmDeposit } = useCollateral();

  const [selectedAsset, setSelectedAsset] = useState<AssetOption>(DEPOSIT_ASSETS[0]);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<DepositStep>("input");
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<PriceData>({});

  // Fetch oracle prices
  useEffect(() => {
    async function fetchPrices() {
      try {
        const res = await api.get<{ data: PriceData }>("/oracle/prices");
        setPrices(res.data.data);
      } catch {
        // Prices are non-critical; silently ignore
      }
    }
    fetchPrices();
    const interval = setInterval(fetchPrices, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Get wallet balance for the selected asset
  const getWalletBalance = useCallback((): bigint => {
    if (selectedAsset.symbol === "WETH") return wethBalance;
    if (selectedAsset.symbol === "cirBTC") return cirBtcBalance;
    return 0n;
  }, [selectedAsset, wethBalance, cirBtcBalance]);

  // Compute USD value of the entered amount
  const usdValue = (() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return null;
    const priceKey = selectedAsset.address.toLowerCase();
    const price = prices[priceKey] || prices[selectedAsset.symbol];
    if (!price) return null;
    return formatUsd(Number(amount) * Number(price));
  })();

  // Read current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: selectedAsset.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, VAULT_ADDRESS],
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
    useWaitForTransactionReceipt({
      hash: approveTxHash,
    });

  // Deposit tx
  const {
    data: depositTxHash,
    writeContract: writeDeposit,
    isPending: isDepositing,
    reset: resetDeposit,
  } = useWriteContract();

  const { isLoading: isWaitingDeposit, isSuccess: depositConfirmed } =
    useWaitForTransactionReceipt({
      hash: depositTxHash,
    });

  // After approval is confirmed, proceed with deposit
  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      refetchAllowance();
      handleDeposit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, step]);

  // After deposit tx is confirmed, confirm with backend
  useEffect(() => {
    if (depositConfirmed && depositTxHash && step === "depositing") {
      handleConfirmDeposit(depositTxHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositConfirmed, depositTxHash, step]);

  const handleDeposit = async () => {
    if (!amount || !address) return;
    setStep("depositing");
    setError(null);

    try {
      const parsedAmount = parseUnits(amount, selectedAsset.decimals);
      const txData = await prepareDeposit(
        selectedAsset.address,
        parsedAmount.toString()
      );

      writeDeposit({
        address: (txData.vaultAddress || VAULT_ADDRESS) as Address,
        abi: [
          {
            type: "function",
            name: "deposit",
            stateMutability: "nonpayable",
            inputs: [
              { name: "asset", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
          },
        ] as const,
        functionName: "deposit",
        args: [selectedAsset.address, parsedAmount],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Deposit failed";
      setError(message);
      setStep("input");
    }
  };

  const handleConfirmDeposit = async (txHash: string) => {
    setStep("confirming");
    try {
      const parsedAmount = parseUnits(amount, selectedAsset.decimals);
      await confirmDeposit(txHash, selectedAsset.address, parsedAmount.toString());
      setStep("success");
      refetchBalances();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Confirmation failed";
      setError(message);
      setStep("input");
    }
  };

  const handleSubmit = async () => {
    if (!amount || !address) return;
    setError(null);

    const parsedAmount = parseUnits(amount, selectedAsset.decimals);
    const balance = getWalletBalance();

    if (parsedAmount > balance) {
      setError("Insufficient balance");
      return;
    }

    const allowance = (currentAllowance as bigint) ?? 0n;

    // Check if approval is needed
    if (allowance < parsedAmount) {
      setStep("approving");
      try {
        writeApprove({
          address: selectedAsset.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [VAULT_ADDRESS, parsedAmount],
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Approval failed";
        setError(message);
        setStep("input");
      }
    } else {
      // Already approved, go straight to deposit
      await handleDeposit();
    }
  };

  const handleMax = () => {
    const balance = getWalletBalance();
    const formatted = formatUnits(balance, selectedAsset.decimals);
    setAmount(formatted);
  };

  const handleReset = () => {
    setAmount("");
    setStep("input");
    setError(null);
    resetApprove();
    resetDeposit();
  };

  const isProcessing =
    isApproving || isWaitingApprove || isDepositing || isWaitingDeposit;

  const getButtonLabel = (): string => {
    switch (step) {
      case "approving":
        if (isApproving) return "Confirm approval in wallet...";
        if (isWaitingApprove) return "Waiting for approval...";
        return "Approving...";
      case "depositing":
        if (isDepositing) return "Confirm deposit in wallet...";
        if (isWaitingDeposit) return "Waiting for deposit...";
        return "Depositing...";
      case "confirming":
        return "Confirming with Stash...";
      default:
        return "Approve & Deposit";
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-stash-bg">
        <Header />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="rounded-lg border border-stash-border bg-stash-surface p-8">
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Connect Wallet
            </h2>
            <p className="text-sm text-stash-muted">
              Connect your wallet to deposit collateral.
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
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="rounded-lg border border-stash-border bg-stash-surface p-8">
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Sign In Required
            </h2>
            <p className="text-sm text-stash-muted mb-6">
              Sign in with your wallet to deposit collateral.
            </p>
            <button
              onClick={login}
              disabled={authLoading}
              className="rounded-lg bg-stash-gold px-6 py-3 text-sm font-medium text-stash-bg hover:bg-stash-gold-light transition-colors disabled:opacity-50"
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
              Deposit Successful
            </h2>
            <p className="text-sm text-stash-muted mb-2">
              Successfully deposited {amount} {selectedAsset.symbol}
            </p>
            {depositTxHash && (
              <p className="text-xs text-stash-muted mb-6 break-all">
                Tx: {depositTxHash}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="rounded-lg border border-stash-border bg-stash-surface px-6 py-3 text-sm font-medium text-stash-text hover:border-stash-border-light transition-colors"
              >
                Deposit More
              </button>
              <Link
                href="/dashboard"
                className="rounded-lg bg-stash-gold px-6 py-3 text-sm font-medium text-stash-bg hover:bg-stash-gold-light transition-colors"
              >
                View Dashboard
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
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-stash-muted hover:text-stash-text transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
          <h1 className="text-xl font-semibold text-stash-text mb-6">
            Deposit Collateral
          </h1>

          {/* Asset Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-stash-muted mb-3">
              Select Asset
            </label>
            <div className="grid grid-cols-2 gap-3">
              {DEPOSIT_ASSETS.map((asset) => {
                const balance =
                  asset.symbol === "WETH" ? wethBalance : cirBtcBalance;
                const isSelected = selectedAsset.symbol === asset.symbol;

                return (
                  <button
                    key={asset.symbol}
                    onClick={() => {
                      setSelectedAsset(asset);
                      setAmount("");
                      setError(null);
                    }}
                    disabled={isProcessing}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-stash-gold/40 bg-stash-gold/5"
                        : "border-stash-border bg-stash-bg hover:border-stash-border-light"
                    } disabled:opacity-50`}
                  >
                    <div className="text-sm font-semibold text-stash-text">
                      {asset.symbol}
                    </div>
                    <div className="mt-1 text-xs text-stash-muted">
                      {asset.name}
                    </div>
                    <div className="mt-2 text-xs text-stash-muted">
                      Balance:{" "}
                      <TokenAmount
                        amount={balance.toString()}
                        decimals={asset.decimals}
                        symbol={asset.symbol}
                        maxDisplayDecimals={6}
                        className="text-stash-text"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-stash-muted mb-2">
              Amount
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(e) => {
                  // Allow only valid decimal inputs
                  const val = e.target.value;
                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                    setAmount(val);
                    setError(null);
                  }
                }}
                disabled={isProcessing}
                className="w-full rounded-lg border border-stash-border bg-stash-bg px-4 py-3 pr-20 text-lg text-stash-text placeholder:text-stash-dim focus:border-stash-gold/40 focus:outline-none focus:ring-1 focus:ring-stash-gold/20 disabled:opacity-50"
              />
              <button
                onClick={handleMax}
                disabled={isProcessing}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-stash-gold/10 px-3 py-1 text-xs font-medium text-stash-gold hover:bg-stash-gold/20 transition-colors disabled:opacity-50"
              >
                Max
              </button>
            </div>
            {usdValue && (
              <p className="mt-2 text-sm text-stash-muted">
                ~{usdValue}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-stash-red/20 bg-stash-red/5 px-4 py-3">
              <p className="text-sm text-stash-red">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={
              !amount ||
              isNaN(Number(amount)) ||
              Number(amount) <= 0 ||
              isProcessing
            }
            className="w-full rounded-lg bg-stash-gold py-3.5 text-sm font-medium text-stash-bg hover:bg-stash-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-stash-bg"
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
              getButtonLabel()
            )}
          </button>

          {/* Info */}
          <p className="mt-4 text-center text-xs text-stash-muted">
            Depositing collateral unlocks Stash Power for trading.
          </p>
        </div>
      </main>
    </div>
  );
}
