"use client";

import Link from "next/link";
import { useDemoAccount as useAccount } from "@/hooks/useDemoAccount";
import { Header } from "@/components/layout/Header";
import { TokenAmount } from "@/components/common/TokenAmount";
import { RiskBadge } from "@/components/common/RiskBadge";
import { useAuth } from "@/hooks/useAuth";
import { useStashPower } from "@/hooks/useStashPower";
import { useCollateral } from "@/hooks/useCollateral";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { TOKENS, formatUsd, formatPercent, LTV } from "@stash/common";
import type { RiskLevel } from "@stash/common";

function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-stash-border ${className}`}
    />
  );
}

function StashPowerCard({
  stashPower,
  usedCredit,
  availableCredit,
  isLoading,
}: {
  stashPower: string;
  usedCredit: string;
  availableCredit: string;
  isLoading: boolean;
}) {
  const total = Number(stashPower);
  const used = Number(usedCredit);
  const progressPercent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <div className="rounded-lg border border-stash-border bg-stash-surface p-6 card-hover">
      <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase">
        Stash Power
      </p>
      <div className="mt-3">
        {isLoading ? (
          <LoadingSkeleton className="h-9 w-32" />
        ) : (
          <span className="text-3xl font-bold font-mono text-stash-gold glow-gold">
            {formatUsd(availableCredit)}
          </span>
        )}
        <span className="ml-2 text-sm text-stash-muted">available</span>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-stash-muted mb-1.5">
          <span>Used: <span className="font-mono text-stash-text">{isLoading ? "..." : formatUsd(usedCredit)}</span></span>
          <span>Total: <span className="font-mono text-stash-text">{isLoading ? "..." : formatUsd(stashPower)}</span></span>
        </div>
        <div className="h-1.5 rounded-full bg-stash-bg overflow-hidden">
          <div
            className="h-full rounded-full bg-stash-gold transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-stash-dim leading-relaxed">
        Your USDC trading capacity backed by deposited collateral.
      </p>
    </div>
  );
}

function CollateralCard({
  totalCollateralUsd,
  positions,
  isLoading,
}: {
  totalCollateralUsd: string;
  positions: Array<{
    assetSymbol: string;
    assetAddress: string;
    amount: string;
    usdValue: string;
  }>;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-stash-border bg-stash-surface p-6 card-hover">
      <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase">
        Collateral
      </p>
      <div className="mt-3">
        {isLoading ? (
          <LoadingSkeleton className="h-9 w-32" />
        ) : (
          <span className="text-3xl font-bold font-mono text-stash-text">
            {formatUsd(totalCollateralUsd)}
          </span>
        )}
        <span className="ml-2 text-sm text-stash-muted">deposited</span>
      </div>

      {/* Individual positions */}
      {!isLoading && positions.length > 0 && (
        <div className="mt-5 space-y-2.5">
          {positions.map((pos) => {
            const token = Object.values(TOKENS).find(
              (t) =>
                t.address.toLowerCase() === pos.assetAddress.toLowerCase()
            );
            return (
              <div
                key={pos.assetAddress}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-stash-muted">
                  <TokenAmount
                    amount={pos.amount}
                    decimals={token?.decimals ?? 18}
                    symbol={pos.assetSymbol}
                    maxDisplayDecimals={6}
                    className="font-mono text-stash-text"
                  />
                </span>
                <span className="font-mono text-stash-muted">
                  {formatUsd(pos.usdValue)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && positions.length === 0 && (
        <p className="mt-4 text-xs text-stash-dim">
          No collateral deposited yet.
        </p>
      )}

      <p className="mt-4 text-xs text-stash-dim leading-relaxed">
        Total value of WETH and cirBTC held in your vault.
      </p>
    </div>
  );
}

function RiskLevelCard({
  riskLevel,
  ltv,
  isLoading,
}: {
  riskLevel: RiskLevel;
  ltv: number;
  isLoading: boolean;
}) {
  const riskColor: Record<RiskLevel, string> = {
    safe: "text-stash-green",
    warning: "text-yellow-400",
    danger: "text-stash-red",
    liquidation: "text-stash-red",
  };

  const barColor: Record<RiskLevel, string> = {
    safe: "bg-stash-green",
    warning: "bg-yellow-400",
    danger: "bg-stash-red",
    liquidation: "bg-stash-red",
  };

  return (
    <div className="rounded-lg border border-stash-border bg-stash-surface p-6 card-hover">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase">
          Risk Level
        </p>
        {!isLoading && <RiskBadge level={riskLevel} />}
      </div>
      <div className="mt-3">
        {isLoading ? (
          <LoadingSkeleton className="h-9 w-24" />
        ) : (
          <span
            className={`text-3xl font-bold font-mono ${riskColor[riskLevel] ?? riskColor.safe}`}
          >
            {formatPercent(ltv)}
          </span>
        )}
        <span className="ml-2 text-sm text-stash-muted">LTV</span>
      </div>

      {/* LTV bar */}
      {!isLoading && (
        <div className="mt-5">
          <div className="relative h-1.5 rounded-full bg-stash-bg overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${barColor[riskLevel] ?? barColor.safe}`}
              style={{ width: `${Math.min(ltv * 100, 100)}%` }}
            />
            {/* Warning threshold marker */}
            <div
              className="absolute top-0 h-full w-px bg-yellow-400"
              style={{ left: `${LTV.WARNING * 100}%` }}
            />
            {/* Liquidation threshold marker */}
            <div
              className="absolute top-0 h-full w-px bg-stash-red"
              style={{ left: `${LTV.LIQUIDATION * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-stash-dim">
            <span>0%</span>
            <span>{formatPercent(LTV.WARNING)} warn</span>
            <span>{formatPercent(LTV.LIQUIDATION)} liq</span>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-stash-dim leading-relaxed">
        Current health of your position based on LTV ratio.
      </p>
    </div>
  );
}

function PortfolioCard({
  totalCollateralUsd,
  usedCredit,
  isLoading,
}: {
  totalCollateralUsd: string;
  usedCredit: string;
  isLoading: boolean;
}) {
  const totalValue = Number(totalCollateralUsd) + Number(usedCredit);

  return (
    <div className="rounded-lg border border-stash-border bg-stash-surface p-6 card-hover">
      <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase">
        Portfolio
      </p>
      <div className="mt-3">
        {isLoading ? (
          <LoadingSkeleton className="h-9 w-32" />
        ) : (
          <span className="text-3xl font-bold font-mono text-stash-text">
            {formatUsd(totalValue)}
          </span>
        )}
        <span className="ml-2 text-sm text-stash-muted">total value</span>
      </div>

      {!isLoading && (
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-stash-muted">Collateral</span>
            <span className="font-mono text-stash-text">
              {formatUsd(totalCollateralUsd)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-stash-muted">Active Trades</span>
            <span className="font-mono text-stash-text">{formatUsd(usedCredit)}</span>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-stash-dim leading-relaxed">
        Combined value of collateral and open trade positions.
      </p>
    </div>
  );
}

function WalletBalancesCard({
  wethBalance,
  cirBtcBalance,
  isLoading,
}: {
  wethBalance: bigint;
  cirBtcBalance: bigint;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
      <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase mb-4">
        Wallet Balances
      </p>
      {isLoading ? (
        <div className="space-y-3">
          <LoadingSkeleton className="h-5 w-40" />
          <LoadingSkeleton className="h-5 w-36" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stash-muted">WETH</span>
            <TokenAmount
              amount={wethBalance.toString()}
              decimals={18}
              symbol="WETH"
              maxDisplayDecimals={6}
              className="font-mono text-stash-text font-medium"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-stash-muted">cirBTC</span>
            <TokenAmount
              amount={cirBtcBalance.toString()}
              decimals={8}
              symbol="cirBTC"
              maxDisplayDecimals={6}
              className="font-mono text-stash-text font-medium"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const {
    isAuthenticated,
    login,
    logout,
    isLoading: authLoading,
    error: authError,
  } = useAuth();
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
    wethBalance,
    cirBtcBalance,
    isLoading: balancesLoading,
  } = useTokenBalances();

  const isDataLoading = powerLoading || positionsLoading;

  // Not connected or not authenticated
  if (!isConnected || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-stash-bg">
        <Header />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-stash-text">Dashboard</h1>
            <p className="mt-1 text-sm text-stash-muted">
              Overview of your Stash positions and trading power.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-lg border border-stash-border bg-stash-surface p-8 text-center max-w-md">
              <svg
                className="mx-auto h-12 w-12 text-stash-dim mb-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              <h2 className="text-lg font-bold text-stash-text mb-2">
                {!isConnected
                  ? "Connect Your Wallet"
                  : "Sign In to View Your Dashboard"}
              </h2>
              <p className="text-sm text-stash-muted mb-6">
                {!isConnected
                  ? "Connect your wallet to access your Stash dashboard."
                  : "Sign a message with your wallet to authenticate and view your positions."}
              </p>
              {isConnected && !isAuthenticated && (
                <>
                  <button
                    onClick={login}
                    disabled={authLoading}
                    className="rounded-lg bg-stash-gold text-stash-bg px-8 py-3 text-sm font-medium hover:bg-stash-gold-light transition-colors disabled:opacity-50"
                  >
                    {authLoading ? (
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
                        Signing in...
                      </span>
                    ) : (
                      "Sign In with Wallet"
                    )}
                  </button>
                  {authError && (
                    <p className="mt-3 text-sm text-stash-red">{authError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stash-bg">
      <Header />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header row */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stash-text">Dashboard</h1>
            <p className="mt-1 text-sm text-stash-muted">
              Overview of your Stash positions and trading power.
            </p>
          </div>
          <button
            onClick={logout}
            className="text-xs font-mono text-stash-muted hover:text-stash-text transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Main stats grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StashPowerCard
            stashPower={stashPower}
            usedCredit={usedCredit}
            availableCredit={availableCredit}
            isLoading={isDataLoading}
          />
          <CollateralCard
            totalCollateralUsd={totalCollateralUsd}
            positions={positions}
            isLoading={isDataLoading}
          />
          <RiskLevelCard
            riskLevel={riskLevel as RiskLevel}
            ltv={ltv}
            isLoading={isDataLoading}
          />
          <PortfolioCard
            totalCollateralUsd={totalCollateralUsd}
            usedCredit={usedCredit}
            isLoading={isDataLoading}
          />
        </div>

        {/* Wallet balances + Actions row */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Wallet Balances */}
          <WalletBalancesCard
            wethBalance={wethBalance}
            cirBtcBalance={cirBtcBalance}
            isLoading={balancesLoading}
          />

          {/* Quick Actions */}
          <div className="lg:col-span-2 rounded-lg border border-stash-border bg-stash-surface p-6">
            <p className="text-[11px] font-mono font-bold text-stash-gold tracking-wider uppercase mb-4">
              Quick Actions
            </p>
            <div className="space-y-1">
              <Link
                href="/deposit"
                className="group flex items-center justify-between rounded-lg px-4 py-3 hover:bg-stash-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-stash-gold text-sm">+</span>
                  <div>
                    <span className="text-sm font-medium text-stash-text">
                      Deposit Collateral
                    </span>
                    <p className="text-xs text-stash-muted">
                      Add WETH or cirBTC to increase your Stash Power
                    </p>
                  </div>
                </div>
                <svg
                  className="h-4 w-4 text-stash-dim group-hover:text-stash-muted transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <Link
                href="/withdraw"
                className="group flex items-center justify-between rounded-lg px-4 py-3 hover:bg-stash-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="h-3.5 w-3.5 text-stash-gold"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
                  </svg>
                  <div>
                    <span className="text-sm font-medium text-stash-text">
                      Withdraw Collateral
                    </span>
                    <p className="text-xs text-stash-muted">
                      Remove collateral back to your wallet
                    </p>
                  </div>
                </div>
                <svg
                  className="h-4 w-4 text-stash-dim group-hover:text-stash-muted transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <Link
                href="/repay"
                className="group flex items-center justify-between rounded-lg px-4 py-3 hover:bg-stash-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="h-3.5 w-3.5 text-stash-gold"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <div>
                    <span className="text-sm font-medium text-stash-text">
                      Repay Debt
                    </span>
                    <p className="text-xs text-stash-muted">
                      Pay back borrowed USDC to reduce LTV
                    </p>
                  </div>
                </div>
                <svg
                  className="h-4 w-4 text-stash-dim group-hover:text-stash-muted transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              <Link
                href="/trade"
                className="group flex items-center justify-between rounded-lg px-4 py-3 hover:bg-stash-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="h-3.5 w-3.5 text-stash-gold"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                  </svg>
                  <div>
                    <span className="text-sm font-medium text-stash-text">
                      Trade
                    </span>
                    <p className="text-xs text-stash-muted">
                      Swap tokens using your Stash Power
                    </p>
                  </div>
                </div>
                <svg
                  className="h-4 w-4 text-stash-dim group-hover:text-stash-muted transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
