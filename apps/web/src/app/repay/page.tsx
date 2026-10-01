"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Header } from "@/components/layout/Header";
import { RiskBadge } from "@/components/common/RiskBadge";
import { useStashPower } from "@/hooks/useStashPower";
import { useCredit } from "@/hooks/useCredit";
import { useAuth } from "@/hooks/useAuth";
import {
  ADDRESSES,
  parseUnits,
  formatUnits,
  formatUsd,
  formatPercent,
  LTV,
} from "@stash/common";
import type { RiskLevel } from "@stash/common";
import { ERC20_ABI, STASH_CREDIT_ABI } from "@stash/abis";
import type { Address } from "viem";

const USDC_ADDRESS = ADDRESSES.USDC as Address;
const USDC_DECIMALS = 6;
const CREDIT_ADDRESS = (process.env.NEXT_PUBLIC_STASH_CREDIT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

type RepayStep =
  | "input"
  | "approving"
  | "repaying"
  | "confirming"
  | "success";

export default function RepayPage() {
  const { address, isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const {
    ltv,
    totalCollateralUsd,
    usedCredit,
    riskLevel,
    stashPower,
    availableCredit,
  } = useStashPower();
  const { confirmRepay } = useCredit();

  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<RepayStep>("input");
  const [error, setError] = useState<string | null>(null);

  // Read on-chain debt
  const { data: onChainDebt, refetch: refetchDebt } = useReadContract({
    address: CREDIT_ADDRESS,
    abi: STASH_CREDIT_ABI,
    functionName: "debtOf",
    args: [address!],
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: {
      enabled: isConnected && !!address,
    },
  });

  // Read USDC allowance for credit contract
  const { data: currentAllowance, refetch: refetchAllowance } =
    useReadContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address!, CREDIT_ADDRESS],
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

  // Repay tx
  const {
    data: repayTxHash,
    writeContract: writeRepay,
    isPending: isRepaying,
    reset: resetRepay,
  } = useWriteContract();

  const { isLoading: isWaitingRepay, isSuccess: repayConfirmed } =
    useWaitForTransactionReceipt({
      hash: repayTxHash,
    });

  // Debt amount (prefer on-chain, fallback to usedCredit from portfolio)
  const debtAmount: bigint =
    typeof onChainDebt === "bigint" ? onChainDebt : 0n;
  const debtFormatted = formatUnits(debtAmount, USDC_DECIMALS);
  const debtUsd = formatUsd(Number(debtFormatted));

  // USDC balance
  const walletUsdc: bigint =
    typeof usdcBalance === "bigint" ? usdcBalance : 0n;

  // Compute projected LTV after repayment
  const getProjectedLtv = (): number | null => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return null;
    const collateralNum = Number(totalCollateralUsd);
    const debtNum = Number(usedCredit);
    if (collateralNum <= 0) return null;
    const repayUsd = Number(amount);
    const newDebt = Math.max(0, debtNum - repayUsd);
    return collateralNum > 0 ? newDebt / collateralNum : 0;
  };

  const projectedLtv = getProjectedLtv();

  // After approval is confirmed, proceed with repay
  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      refetchAllowance();
      handleRepay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, step]);

  // After repay tx is confirmed, confirm with backend
  useEffect(() => {
    if (repayConfirmed && repayTxHash && step === "repaying") {
      handleConfirmRepay(repayTxHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repayConfirmed, repayTxHash, step]);

  const handleRepay = () => {
    if (!amount || !address) return;
    setStep("repaying");
    setError(null);

    try {
      const parsedAmount = parseUnits(amount, USDC_DECIMALS);
      writeRepay({
        address: CREDIT_ADDRESS,
        abi: STASH_CREDIT_ABI,
        functionName: "repay",
        args: [parsedAmount],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Repay failed";
      setError(message);
      setStep("input");
    }
  };

  const handleConfirmRepay = async (txHash: string) => {
    setStep("confirming");
    try {
      const parsedAmount = parseUnits(amount, USDC_DECIMALS);
      await confirmRepay(txHash, parsedAmount.toString());
      setStep("success");
      refetchDebt();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Confirmation failed";
      setError(message);
      setStep("input");
    }
  };

  const handleSubmit = () => {
    if (!amount || !address) return;
    setError(null);

    const parsedAmount = parseUnits(amount, USDC_DECIMALS);

    if (parsedAmount > walletUsdc) {
      setError("Insufficient USDC balance");
      return;
    }

    if (parsedAmount > debtAmount) {
      setError("Amount exceeds current debt");
      return;
    }

    const allowance = (currentAllowance as bigint) ?? 0n;

    if (allowance < parsedAmount) {
      setStep("approving");
      try {
        writeApprove({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CREDIT_ADDRESS, parsedAmount],
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Approval failed";
        setError(message);
        setStep("input");
      }
    } else {
      handleRepay();
    }
  };

  const handleMax = () => {
    // Set to min of debt and wallet balance
    const maxRepay = debtAmount < walletUsdc ? debtAmount : walletUsdc;
    const formatted = formatUnits(maxRepay, USDC_DECIMALS);
    setAmount(formatted);
  };

  const handleReset = () => {
    setAmount("");
    setStep("input");
    setError(null);
    resetApprove();
    resetRepay();
  };

  const isProcessing =
    isApproving || isWaitingApprove || isRepaying || isWaitingRepay;

  const getButtonLabel = (): string => {
    switch (step) {
      case "approving":
        if (isApproving) return "Confirm approval in wallet...";
        if (isWaitingApprove) return "Waiting for approval...";
        return "Approving...";
      case "repaying":
        if (isRepaying) return "Confirm repay in wallet...";
        if (isWaitingRepay) return "Waiting for repay...";
        return "Repaying...";
      case "confirming":
        return "Confirming with Stash...";
      default:
        return "Repay USDC";
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
              Connect your wallet to repay debt.
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
              Sign in with your wallet to repay debt.
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
              Repayment Successful
            </h2>
            <p className="text-sm text-stash-muted mb-2">
              Successfully repaid {amount} USDC
            </p>
            {repayTxHash && (
              <p className="text-xs text-stash-muted mb-6 break-all">
                Tx: {repayTxHash}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="rounded-lg border border-stash-border bg-stash-surface px-6 py-3 text-sm font-medium text-stash-text hover:border-stash-border-light transition-colors"
              >
                Repay More
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
          <div className="mb-2">
            <h1 className="text-stash-text text-xl font-semibold">
              Repay Debt
            </h1>
            <p className="mt-1 text-sm text-stash-muted">
              Pay back borrowed USDC to free up your collateral.
            </p>
          </div>

          {/* Current Debt Summary */}
          <div className="my-6 rounded-lg border border-stash-border bg-stash-bg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stash-muted">Current Debt</span>
              <span className="text-stash-text font-medium">{debtUsd}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-stash-muted">USDC Balance</span>
              <span className="text-stash-text font-medium">
                {formatUsd(Number(formatUnits(walletUsdc, USDC_DECIMALS)))}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-stash-muted">Current LTV</span>
              <span className="flex items-center gap-2">
                <span className="text-stash-text font-medium">
                  {formatPercent(ltv)}
                </span>
                <RiskBadge level={riskLevel as RiskLevel} />
              </span>
            </div>
            {projectedLtv !== null && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-stash-muted">Projected LTV</span>
                <span className="text-stash-green font-medium">
                  {formatPercent(projectedLtv)}
                </span>
              </div>
            )}
          </div>

          {/* No debt state */}
          {debtAmount === 0n && (
            <div className="mb-4 rounded-lg border border-stash-border bg-stash-bg px-4 py-6 text-center">
              <p className="text-sm text-stash-muted">
                You have no outstanding debt.
              </p>
              <Link
                href="/dashboard"
                className="mt-3 inline-block text-sm text-stash-gold hover:opacity-80 transition-opacity"
              >
                Return to Dashboard
              </Link>
            </div>
          )}

          {/* Amount Input */}
          {debtAmount > 0n && (
            <>
              <div className="mb-6">
                <label className="block text-sm font-medium text-stash-muted mb-2">
                  Repay Amount (USDC)
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
                {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                  <p className="mt-2 text-sm text-stash-muted">
                    ~{formatUsd(Number(amount))}
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

              <p className="mt-4 text-center text-xs text-stash-muted">
                Repaying debt reduces your LTV ratio and frees up collateral.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
