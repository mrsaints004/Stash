"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/layout/Header";
import { TokenAmount } from "@/components/common/TokenAmount";
import { RiskBadge } from "@/components/common/RiskBadge";
import { useAuth } from "@/hooks/useAuth";
import { useStashPower } from "@/hooks/useStashPower";
import { useCollateral } from "@/hooks/useCollateral";
import { useTrade } from "@/hooks/useTrade";
import { TOKENS, formatUsd, formatPercent } from "@stash/common";
import type { RiskLevel } from "@stash/common";

type TabId = "collateral" | "credit" | "trades";

function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-stash-border ${className}`}
    />
  );
}

export default function PositionsPage() {
  const { isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const {
    totalCollateralUsd,
    stashPower,
    usedCredit,
    availableCredit,
    ltv,
    riskLevel,
    isLoading: powerLoading,
  } = useStashPower();
  const {
    positions,
    isLoading: positionsLoading,
  } = useCollateral();
  const {
    activePositions,
    isPositionsLoading: tradesLoading,
  } = useTrade();

  const [activeTab, setActiveTab] = useState<TabId>("collateral");

  const isDataLoading = powerLoading || positionsLoading;

  // Not connected
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
              Connect your wallet to view your positions.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Not authenticated
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
              Sign in with your wallet to view your positions.
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "collateral", label: "Collateral" },
    { id: "credit", label: "Credit" },
    { id: "trades", label: "Trades" },
  ];

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
            Positions
          </h1>
          <p className="mt-1 text-sm text-stash-muted">
            Your collateral, credit, and trade positions.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-stash-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-stash-gold text-stash-text"
                  : "border-transparent text-stash-muted hover:text-stash-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Collateral Tab */}
        {activeTab === "collateral" && (
          <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                Collateral Positions
              </h3>
              <span className="text-sm text-stash-text font-medium font-mono">
                Total: {isDataLoading ? "..." : formatUsd(totalCollateralUsd)}
              </span>
            </div>

            {isDataLoading ? (
              <div className="space-y-3">
                <LoadingSkeleton className="h-12 w-full" />
                <LoadingSkeleton className="h-12 w-full" />
              </div>
            ) : positions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-stash-muted mb-4">
                  No collateral deposited yet.
                </p>
                <Link
                  href="/deposit"
                  className="bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg px-6 py-3 text-sm"
                >
                  Deposit Collateral
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stash-border">
                      <th className="pb-3 text-left text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        USD Value
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        % of Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const token = Object.values(TOKENS).find(
                        (t) =>
                          t.address.toLowerCase() ===
                          pos.assetAddress.toLowerCase()
                      );
                      const pctOfTotal =
                        Number(totalCollateralUsd) > 0
                          ? (Number(pos.usdValue) /
                              Number(totalCollateralUsd)) *
                            100
                          : 0;

                      return (
                        <tr
                          key={pos.assetAddress}
                          className="border-b border-stash-border last:border-0"
                        >
                          <td className="py-4">
                            <div className="text-sm font-medium text-stash-text">
                              {pos.assetSymbol}
                            </div>
                            <div className="text-xs text-stash-muted">
                              {token?.name ?? ""}
                            </div>
                          </td>
                          <td className="py-4 text-right">
                            <TokenAmount
                              amount={pos.amount}
                              decimals={token?.decimals ?? 18}
                              symbol=""
                              maxDisplayDecimals={6}
                              className="text-sm text-stash-text font-mono"
                            />
                          </td>
                          <td className="py-4 text-right text-sm text-stash-text font-mono">
                            {formatUsd(pos.usdValue)}
                          </td>
                          <td className="py-4 text-right text-sm text-stash-muted">
                            {pctOfTotal.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {positions.length > 0 && (
              <div className="mt-4 flex gap-3">
                <Link
                  href="/deposit"
                  className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-4 py-2 text-xs font-medium"
                >
                  Deposit More
                </Link>
                <Link
                  href="/withdraw"
                  className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-4 py-2 text-xs font-medium"
                >
                  Withdraw
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Credit Tab */}
        {activeTab === "credit" && (
          <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                Credit Position
              </h3>
              <RiskBadge level={riskLevel as RiskLevel} />
            </div>

            {isDataLoading ? (
              <div className="space-y-3">
                <LoadingSkeleton className="h-8 w-48" />
                <LoadingSkeleton className="h-6 w-full" />
                <LoadingSkeleton className="h-6 w-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                    <div className="text-xs text-stash-muted mb-1">
                      Total Stash Power
                    </div>
                    <div className="text-lg font-semibold text-stash-text font-mono">
                      {formatUsd(stashPower)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                    <div className="text-xs text-stash-muted mb-1">
                      Available Credit
                    </div>
                    <div className="text-lg font-semibold text-stash-green font-mono">
                      {formatUsd(availableCredit)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                    <div className="text-xs text-stash-muted mb-1">
                      Used Credit
                    </div>
                    <div className="text-lg font-semibold text-stash-text font-mono">
                      {formatUsd(usedCredit)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-stash-border bg-stash-bg p-4">
                    <div className="text-xs text-stash-muted mb-1">
                      Current LTV
                    </div>
                    <div className="text-lg font-semibold text-stash-text font-mono">
                      {formatPercent(ltv)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Link
                    href="/trade"
                    className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-4 py-2 text-xs font-medium"
                  >
                    Borrow / Trade
                  </Link>
                  <Link
                    href="/repay"
                    className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-4 py-2 text-xs font-medium"
                  >
                    Repay Debt
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {/* Trades Tab */}
        {activeTab === "trades" && (
          <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
            <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-6">
              Trade Positions
            </h3>

            {tradesLoading ? (
              <div className="space-y-3">
                <LoadingSkeleton className="h-12 w-full" />
                <LoadingSkeleton className="h-12 w-full" />
              </div>
            ) : activePositions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-stash-muted mb-4">
                  No trade positions yet.
                </p>
                <Link
                  href="/trade"
                  className="bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg px-6 py-3 text-sm"
                >
                  Start Trading
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stash-border">
                      <th className="pb-3 text-left text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Pair
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Amount In
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Amount Out
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium text-stash-muted uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePositions.map((trade, i) => {
                      const tokenInMeta = Object.values(TOKENS).find(
                        (t) =>
                          t.address.toLowerCase() ===
                          trade.tokenIn.toLowerCase()
                      );
                      const tokenOutMeta = Object.values(TOKENS).find(
                        (t) =>
                          t.address.toLowerCase() ===
                          trade.tokenOut.toLowerCase()
                      );

                      return (
                        <tr
                          key={`${trade.txHash}-${i}`}
                          className="border-b border-stash-border last:border-0"
                        >
                          <td className="py-4 text-sm text-stash-text">
                            {trade.tokenInSymbol ||
                              tokenInMeta?.symbol ||
                              "?"}{" "}
                            →{" "}
                            {trade.tokenOutSymbol ||
                              tokenOutMeta?.symbol ||
                              "?"}
                          </td>
                          <td className="py-4 text-right text-sm text-stash-text font-mono">
                            {tokenInMeta ? (
                              <TokenAmount
                                amount={trade.amountIn}
                                decimals={tokenInMeta.decimals}
                                symbol=""
                                maxDisplayDecimals={6}
                              />
                            ) : (
                              trade.amountIn
                            )}
                          </td>
                          <td className="py-4 text-right text-sm text-stash-text font-mono">
                            {tokenOutMeta ? (
                              <TokenAmount
                                amount={trade.amountOut}
                                decimals={tokenOutMeta.decimals}
                                symbol=""
                                maxDisplayDecimals={6}
                              />
                            ) : (
                              trade.amountOut
                            )}
                          </td>
                          <td className="py-4 text-right">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                trade.status === "confirmed"
                                  ? "bg-stash-green/10 text-stash-green"
                                  : trade.status === "failed"
                                    ? "bg-stash-red/10 text-stash-red"
                                    : "bg-yellow-500/10 text-yellow-400"
                              }`}
                            >
                              {trade.status}
                            </span>
                          </td>
                          <td className="py-4 text-right text-xs text-stash-muted">
                            {new Date(trade.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
