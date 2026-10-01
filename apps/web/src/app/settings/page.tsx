"use client";

import Link from "next/link";
import { useDemoAccount as useAccount } from "@/hooks/useDemoAccount";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/hooks/useAuth";
import { useStashPower } from "@/hooks/useStashPower";
import { LTV, formatPercent, truncateAddress } from "@stash/common";
import { arcTestnet } from "@/config/wagmi";

export default function SettingsPage() {
  const { address, isConnected, chain } = useAccount();
  const { isAuthenticated, login, logout, isLoading: authLoading } = useAuth();
  const { ltv, riskLevel } = useStashPower();

  // Not connected
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
              Connect your wallet to view settings.
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
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="rounded-lg border border-stash-border bg-stash-surface p-8">
            <h2 className="text-xl font-semibold text-stash-text mb-2">
              Sign In Required
            </h2>
            <p className="text-sm text-stash-muted mb-6">
              Sign in with your wallet to view settings.
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

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-stash-text">
            Settings
          </h1>
        </div>

        {/* Wallet Section */}
        <div className="mb-6 rounded-lg border border-stash-border bg-stash-surface p-6">
          <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-4">
            Wallet
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Address</span>
              <span className="text-sm text-stash-text font-mono">
                {address ? truncateAddress(address, 6) : "Not connected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Full Address</span>
              <span className="text-xs text-stash-muted font-mono break-all max-w-[250px] text-right">
                {address ?? "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Network</span>
              <span className="text-sm text-stash-text">
                {chain?.name ?? arcTestnet.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Chain ID</span>
              <span className="text-sm text-stash-text font-mono">
                {chain?.id ?? arcTestnet.id}
              </span>
            </div>
          </div>
        </div>

        {/* Risk Preferences Section */}
        <div className="mb-6 rounded-lg border border-stash-border bg-stash-surface p-6">
          <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-4">
            Risk Parameters
          </h3>
          <p className="text-xs text-stash-muted mb-4">
            These are protocol-level parameters and cannot be changed.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Max LTV</span>
              <span className="text-sm text-stash-text font-medium font-mono">
                {formatPercent(LTV.MAX)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">Warning Threshold</span>
              <span className="text-sm text-yellow-400 font-medium font-mono">
                {formatPercent(LTV.WARNING)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stash-muted">
                Liquidation Threshold
              </span>
              <span className="text-sm text-stash-red font-medium font-mono">
                {formatPercent(LTV.LIQUIDATION)}
              </span>
            </div>
            <div className="border-t border-stash-border pt-3 flex items-center justify-between">
              <span className="text-sm text-stash-muted">Your Current LTV</span>
              <span className="text-sm text-stash-text font-medium font-mono">
                {formatPercent(ltv)}
              </span>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
          <h3 className="text-[11px] font-medium text-stash-muted uppercase tracking-wider mb-4">
            Session
          </h3>
          <p className="text-xs text-stash-muted mb-4">
            Sign out of your Stash session. This will clear your authentication
            token but will not disconnect your wallet.
          </p>
          <button
            onClick={logout}
            className="rounded-lg border border-stash-red/20 bg-stash-red/5 px-6 py-3 text-sm font-medium text-stash-red hover:bg-stash-red/10 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
