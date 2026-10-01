"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Header } from "@/components/layout/Header";
import { TokenAmount } from "@/components/common/TokenAmount";
import { RiskBadge } from "@/components/common/RiskBadge";
import { useCollateral } from "@/hooks/useCollateral";
import { useStashPower } from "@/hooks/useStashPower";
import { useAuth } from "@/hooks/useAuth";
import {
  ADDRESSES,
  TOKENS,
  LTV,
  parseUnits,
  formatUnits,
  formatUsd,
  formatPercent,
} from "@stash/common";
import type { RiskLevel } from "@stash/common";
import type { Address } from "viem";

const VAULT_ADDRESS = ADDRESSES.AaveV4MainSpoke as Address;

interface WithdrawAsset {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

const WITHDRAW_ASSETS: WithdrawAsset[] = [
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

type WithdrawStep = "input" | "withdrawing" | "confirming" | "success";

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const {
    positions,
    prepareWithdraw,
    confirmWithdraw,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = useCollateral();
  const { ltv, totalCollateralUsd, usedCredit, riskLevel } = useStashPower();

  const [selectedAsset, setSelectedAsset] = useState<WithdrawAsset>(
    WITHDRAW_ASSETS[0]
  );
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<WithdrawStep>("input");
  const [error, setError] = useState<string | null>(null);

  // Withdraw tx
  const {
    data: withdrawTxHash,
    writeContract: writeWithdraw,
    isPending: isWithdrawing,
    reset: resetWithdraw,
  } = useWriteContract();

  const { isLoading: isWaitingWithdraw, isSuccess: withdrawConfirmed } =
    useWaitForTransactionReceipt({
      hash: withdrawTxHash,
    });

  // After withdraw tx is confirmed, confirm with backend
  useEffect(() => {
    if (withdrawConfirmed && withdrawTxHash && step === "withdrawing") {
      handleConfirmWithdraw(withdrawTxHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawConfirmed, withdrawTxHash, step]);

  // Get deposited balance for selected asset
  const getDepositedBalance = (): string => {
    const position = positions.find(
      (p) =>
        p.assetAddress.toLowerCase() === selectedAsset.address.toLowerCase()
    );
    return position?.amount ?? "0";
  };

  const getDepositedUsd = (): string => {
    const position = positions.find(
      (p) =>
        p.assetAddress.toLowerCase() === selectedAsset.address.toLowerCase()
    );
    return position?.usdValue ?? "0";
  };

  // Check if withdrawal would push LTV above warning threshold
  const getWithdrawWarning = (): string | null => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return null;

    const collateralNum = Number(totalCollateralUsd);
    const debtNum = Number(usedCredit);
    if (collateralNum <= 0 || debtNum <= 0) return null;

    // Estimate USD value being withdrawn
    const depositedUsd = Number(getDepositedUsd());
    const depositedAmount = getDepositedBalance();
    if (Number(depositedAmount) <= 0) return null;

    const withdrawUsd =
      (Number(amount) / Number(formatUnits(BigInt(depositedAmount), selectedAsset.decimals))) *
      depositedUsd;
    const newCollateral = collateralNum - withdrawUsd;

    if (newCollateral <= 0) {
      return "This withdrawal would remove all your collateral.";
    }

    const newLtv = debtNum / newCollateral;

    if (newLtv >= LTV.LIQUIDATION) {
      return `Warning: This withdrawal would push your LTV to ${formatPercent(newLtv)}, above the liquidation threshold (${formatPercent(LTV.LIQUIDATION)}).`;
    }

    if (newLtv >= LTV.WARNING) {
      return `Caution: This withdrawal would push your LTV to ${formatPercent(newLtv)}, above the warning threshold (${formatPercent(LTV.WARNING)}).`;
    }

    return null;
  };

  const handleConfirmWithdraw = async (txHash: string) => {
    setStep("confirming");
    try {
      const parsedAmount = parseUnits(amount, selectedAsset.decimals);
      await confirmWithdraw(
        txHash,
        selectedAsset.address,
        parsedAmount.toString()
      );
      setStep("success");
      refetchPositions();
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
    const depositedBalance = BigInt(getDepositedBalance());

    if (parsedAmount > depositedBalance) {
      setError("Amount exceeds deposited balance");
      return;
    }

    setStep("withdrawing");

    try {
      const txData = await prepareWithdraw(
        selectedAsset.address,
        parsedAmount.toString()
      );

      writeWithdraw({
        address: (txData.vaultAddress || VAULT_ADDRESS) as Address,
        abi: [
          {
            type: "function",
            name: "withdraw",
            stateMutability: "nonpayable",
            inputs: [
              { name: "asset", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
          },
        ] as const,
        functionName: "withdraw",
        args: [selectedAsset.address, parsedAmount],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Withdrawal failed";
      setError(message);
      setStep("input");
    }
  };

  const handleMax = () => {
    const deposited = getDepositedBalance();
    const formatted = formatUnits(BigInt(deposited), selectedAsset.decimals);
    setAmount(formatted);
  };

  const handleReset = () => {
    setAmount("");
    setStep("input");
    setError(null);
    resetWithdraw();
  };

  const isProcessing = isWithdrawing || isWaitingWithdraw;
  const withdrawWarning = getWithdrawWarning();

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
              Connect your wallet to withdraw collateral.
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
              Sign in with your wallet to withdraw collateral.
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
              Withdrawal Successful
            </h2>
            <p className="text-sm text-stash-muted mb-2">
              Successfully withdrew {amount} {selectedAsset.symbol}
            </p>
            {withdrawTxHash && (
              <p className="text-xs text-stash-muted mb-6 break-all">
                Tx: {withdrawTxHash}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="rounded-lg border border-stash-border bg-stash-surface px-6 py-3 text-sm font-medium text-stash-text hover:border-stash-border-light transition-colors"
              >
                Withdraw More
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
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-stash-text">
              Withdraw Collateral
            </h1>
            <RiskBadge level={riskLevel as RiskLevel} />
          </div>

          {/* Current Position Summary */}
          <div className="mb-6 rounded-lg border border-stash-border bg-stash-bg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stash-muted">Total Collateral</span>
              <span className="text-stash-text font-medium">
                {formatUsd(totalCollateralUsd)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-stash-muted">Current LTV</span>
              <span className="text-stash-text font-medium">
                {formatPercent(ltv)}
              </span>
            </div>
          </div>

          {/* Asset Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-stash-muted mb-3">
              Select Asset
            </label>
            <div className="grid grid-cols-2 gap-3">
              {WITHDRAW_ASSETS.map((asset) => {
                const position = positions.find(
                  (p) =>
                    p.assetAddress.toLowerCase() ===
                    asset.address.toLowerCase()
                );
                const deposited = position?.amount ?? "0";
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
                      Deposited:{" "}
                      {positionsLoading ? (
                        <span className="inline-block h-3 w-16 animate-pulse rounded bg-stash-border" />
                      ) : (
                        <TokenAmount
                          amount={deposited}
                          decimals={asset.decimals}
                          symbol={asset.symbol}
                          maxDisplayDecimals={6}
                          className="text-stash-text"
                        />
                      )}
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
          </div>

          {/* LTV Warning */}
          {withdrawWarning && (
            <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <p className="text-sm text-yellow-400">{withdrawWarning}</p>
            </div>
          )}

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
                {isWithdrawing
                  ? "Confirm in wallet..."
                  : isWaitingWithdraw
                    ? "Waiting for confirmation..."
                    : "Confirming..."}
              </span>
            ) : (
              "Withdraw"
            )}
          </button>

          <p className="mt-4 text-center text-xs text-stash-muted">
            Withdrawing reduces your Stash Power and may affect your LTV ratio.
          </p>
        </div>
      </main>
    </div>
  );
}
