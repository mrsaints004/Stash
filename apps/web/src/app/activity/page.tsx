"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/hooks/useAuth";
import { useActivity } from "@/hooks/useActivity";
import type { ActivityEntry } from "@/hooks/useActivity";

const TYPE_CONFIG: Record<
  ActivityEntry["type"],
  { label: string; color: string; bg: string; icon: string }
> = {
  deposit: {
    label: "Deposit",
    color: "text-stash-gold",
    bg: "bg-stash-gold/10",
    icon: "M12 4.5v15m7.5-7.5h-15",
  },
  withdraw: {
    label: "Withdraw",
    color: "text-stash-muted",
    bg: "bg-stash-surface-2",
    icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
  },
  borrow: {
    label: "Borrow",
    color: "text-stash-gold",
    bg: "bg-stash-gold/10",
    icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z",
  },
  repay: {
    label: "Repay",
    color: "text-stash-green",
    bg: "bg-stash-green/10",
    icon: "m4.5 12.75 6 6 9-13.5",
  },
  trade: {
    label: "Trade",
    color: "text-stash-gold",
    bg: "bg-stash-gold/10",
    icon: "M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: {
    label: "Pending",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  confirmed: {
    label: "Confirmed",
    color: "text-stash-green",
    bg: "bg-stash-green/10",
  },
  failed: {
    label: "Failed",
    color: "text-stash-red",
    bg: "bg-stash-red/10",
  },
};

function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-stash-border ${className}`}
    />
  );
}

export default function ActivityPage() {
  const { isConnected } = useAccount();
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const { transactions, isLoading, hasMore, loadMore } = useActivity();

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
              Connect your wallet to view your activity.
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
              Sign in with your wallet to view your activity.
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
            Activity
          </h1>
          <p className="mt-1 text-sm text-stash-muted">
            Your transaction history.
          </p>
        </div>

        <div className="rounded-lg border border-stash-border bg-stash-surface">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <LoadingSkeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <LoadingSkeleton className="h-4 w-48" />
                    <LoadingSkeleton className="h-3 w-32" />
                  </div>
                  <LoadingSkeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-stash-muted mb-4">
                No activity yet.
              </p>
              <Link
                href="/deposit"
                className="bg-stash-gold text-stash-bg font-medium hover:bg-stash-gold-light transition-colors rounded-lg px-6 py-3 text-sm"
              >
                Make Your First Deposit
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-stash-border">
              {transactions.map((tx) => {
                const typeConfig = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.deposit;
                const statusConfig =
                  STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.pending;

                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-stash-surface-2 transition-colors"
                  >
                    {/* Type Icon */}
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${typeConfig.bg}`}
                    >
                      <svg
                        className={`h-5 w-5 ${typeConfig.color}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={typeConfig.icon}
                        />
                      </svg>
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${typeConfig.color}`}
                        >
                          {typeConfig.label}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.bg} ${statusConfig.color}`}
                        >
                          {statusConfig.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-stash-text truncate">
                        {tx.description}
                      </p>
                      {tx.txHash && (
                        <a
                          href={`https://explorer.arc.io/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-block text-[10px] font-mono text-stash-muted hover:text-stash-gold truncate max-w-[200px] transition-colors"
                        >
                          {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                        </a>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <div className="text-sm font-medium text-stash-text font-mono">
                        {tx.amount} {tx.symbol}
                      </div>
                      <div className="text-xs text-stash-muted">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="p-4 text-center border-t border-stash-border">
              <button
                onClick={loadMore}
                className="border border-stash-border bg-stash-surface text-stash-text hover:border-stash-border-light transition-colors rounded-lg px-6 py-2 text-sm font-medium"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
