"use client";

import { ConnectButton } from "@/components/wallet/ConnectButton";
import Link from "next/link";
import { Header } from "@/components/layout/Header";

const STEPS = [
  {
    num: "01",
    title: "Deposit",
    desc: "Supply WETH or cirBTC as collateral. Your assets earn Aave yield while backing your credit line.",
  },
  {
    num: "02",
    title: "Unlock Credit",
    desc: "Receive USDC-denominated Stash Power — up to 75% of your collateral value, instantly.",
  },
  {
    num: "03",
    title: "Trade",
    desc: "Swap any supported token on Arc Network with sub-second finality. No selling your holdings.",
  },
];

const STATS = [
  { label: "Network", value: "Arc" },
  { label: "Collateral", value: "WETH, cirBTC" },
  { label: "Max LTV", value: "75%" },
  { label: "Finality", value: "<1 sec" },
];

const ASSETS = [
  { symbol: "WETH", name: "Wrapped Ether", type: "Collateral" },
  { symbol: "cirBTC", name: "Circle BTC", type: "Collateral" },
  { symbol: "USDC", name: "USD Coin", type: "Credit" },
  { symbol: "EURC", name: "Euro Coin", type: "Trading" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Subtle top glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stash-gold/20 to-transparent" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-stash-border bg-stash-surface px-3 py-1 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-stash-green animate-pulse" />
              <span className="text-xs text-stash-muted">Live on Arc Network</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              <span className="text-stash-text">Trade with your crypto.</span>
              <br />
              <span className="text-stash-gold">Keep your crypto.</span>
            </h1>

            <p className="mt-6 text-lg text-stash-muted max-w-xl leading-relaxed">
              Deposit collateral, unlock USDC credit, and execute trades on Arc
              Network — without selling a single token.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ConnectButton />
              <Link
                href="/dashboard"
                className="rounded-lg border border-stash-border bg-stash-surface px-5 py-2.5 text-sm font-medium text-stash-text hover:border-stash-border-light transition-colors"
              >
                Open Dashboard
              </Link>
            </div>
          </div>

          {/* Protocol stats strip */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg border border-stash-border overflow-hidden">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-stash-surface px-5 py-4">
                <div className="text-xs text-stash-muted">{stat.label}</div>
                <div className="mt-1 text-sm font-semibold text-stash-text">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-stash-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-stash-text">How it works</h2>
            <p className="mt-2 text-sm text-stash-muted">Three steps to start trading with your holdings as collateral.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="group relative rounded-lg border border-stash-border bg-stash-surface p-6 card-hover"
              >
                <span className="text-[11px] font-mono font-bold text-stash-gold tracking-wider">
                  STEP {step.num}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-stash-text">{step.title}</h3>
                <p className="mt-2 text-sm text-stash-muted leading-relaxed">{step.desc}</p>
                {/* Connector line between cards */}
                <div className="hidden sm:block absolute top-1/2 -right-3 w-6 h-px bg-stash-border group-last:hidden" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Assets */}
      <section className="border-t border-stash-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <h2 className="text-2xl font-bold text-stash-text">Supported Assets</h2>
              <p className="mt-2 text-sm text-stash-muted max-w-md leading-relaxed">
                Stash supports a curated set of high-liquidity assets on Arc Network.
                Collateral assets earn yield through Aave V4 while backing your credit line.
              </p>
              <div className="mt-8 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-stash-gold" />
                  <span className="text-sm text-stash-muted">Collateral earns Aave V4 supply APY</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-stash-green" />
                  <span className="text-sm text-stash-muted">All trades routed through Uniswap V4</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-stash-text" />
                  <span className="text-sm text-stash-muted">Sub-second finality on Arc Network</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-stash-border overflow-hidden">
              <div className="grid grid-cols-4 gap-px bg-stash-border text-xs font-medium text-stash-muted">
                <div className="bg-stash-surface px-4 py-3">Asset</div>
                <div className="bg-stash-surface px-4 py-3">Name</div>
                <div className="bg-stash-surface px-4 py-3">Type</div>
                <div className="bg-stash-surface px-4 py-3 text-right">Status</div>
              </div>
              {ASSETS.map((asset) => (
                <div key={asset.symbol} className="grid grid-cols-4 gap-px bg-stash-border">
                  <div className="bg-stash-bg px-4 py-3.5 text-sm font-mono font-medium text-stash-text">
                    {asset.symbol}
                  </div>
                  <div className="bg-stash-bg px-4 py-3.5 text-sm text-stash-muted">{asset.name}</div>
                  <div className="bg-stash-bg px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      asset.type === "Collateral"
                        ? "bg-stash-gold/10 text-stash-gold"
                        : asset.type === "Credit"
                          ? "bg-stash-green/10 text-stash-green"
                          : "bg-stash-surface-2 text-stash-muted"
                    }`}>
                      {asset.type}
                    </span>
                  </div>
                  <div className="bg-stash-bg px-4 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-stash-green">
                      <span className="h-1.5 w-1.5 rounded-full bg-stash-green" />
                      Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Risk & Security */}
      <section className="border-t border-stash-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-stash-text">Built for safety</h2>
            <p className="mt-2 text-sm text-stash-muted">Protocol-level risk parameters protect every position.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
              <div className="text-3xl font-bold font-mono text-stash-gold glow-gold">75%</div>
              <div className="mt-2 text-sm font-medium text-stash-text">Maximum LTV</div>
              <p className="mt-1 text-xs text-stash-muted leading-relaxed">
                Borrow up to 75% of your collateral value. Conservative limits protect against volatility.
              </p>
            </div>
            <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
              <div className="text-3xl font-bold font-mono text-yellow-400">65%</div>
              <div className="mt-2 text-sm font-medium text-stash-text">Warning Threshold</div>
              <p className="mt-1 text-xs text-stash-muted leading-relaxed">
                Receive alerts when your LTV approaches risk levels. Time to add collateral or repay.
              </p>
            </div>
            <div className="rounded-lg border border-stash-border bg-stash-surface p-6">
              <div className="text-3xl font-bold font-mono text-stash-red">80%</div>
              <div className="mt-2 text-sm font-medium text-stash-text">Liquidation Threshold</div>
              <p className="mt-1 text-xs text-stash-muted leading-relaxed">
                Positions exceeding 80% LTV are subject to liquidation. 5% bonus incentivizes liquidators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stash-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-stash-text">
            Ready to trade without selling?
          </h2>
          <p className="mt-3 text-sm text-stash-muted max-w-md mx-auto">
            Connect your wallet, deposit collateral, and start trading in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stash-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-stash-gold/10 border border-stash-gold/20">
              <span className="text-[10px] font-bold text-stash-gold">S</span>
            </div>
            <span className="text-xs text-stash-muted">Stash Protocol</span>
          </div>
          <p className="text-xs text-stash-dim">
            Built on{" "}
            <a
              href="https://www.circle.com/arc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stash-muted hover:text-stash-text transition-colors"
            >
              Arc Network
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
