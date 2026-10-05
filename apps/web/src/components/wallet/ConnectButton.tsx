"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useState, useRef, useEffect } from "react";
import { truncateAddress } from "@stash/common";

// Non-EVM extensions that inject providers but aren't real EVM wallets
const IGNORED_CONNECTORS = new Set([
  "com.namada",
  "xverse",
]);

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Filter to real EVM wallets only
  const evmConnectors = connectors.filter(
    (c) => !IGNORED_CONNECTORS.has(c.id) && !IGNORED_CONNECTORS.has(c.name.toLowerCase())
  );

  // Show error briefly
  useEffect(() => {
    if (connectError) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [connectError]);

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!isConnected) {
    return (
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => {
            setShowError(false);
            // If only one EVM connector, connect directly
            if (evmConnectors.length <= 1) {
              const connector = evmConnectors[0] ?? connectors[0];
              if (connector) connect({ connector });
            } else {
              setPickerOpen(!pickerOpen);
            }
          }}
          disabled={isPending}
          className="rounded-lg bg-stash-gold px-4 py-2 text-sm font-medium text-stash-bg hover:bg-stash-gold-light transition-colors disabled:opacity-50"
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>

        {/* Wallet picker dropdown */}
        {pickerOpen && !isPending && (
          <div className="absolute right-0 mt-2 w-56 rounded-lg border border-stash-border bg-stash-surface shadow-lg shadow-black/40 z-50">
            <div className="px-3 py-2 border-b border-stash-border">
              <div className="text-[11px] text-stash-muted uppercase tracking-wider font-medium">
                Select Wallet
              </div>
            </div>
            {evmConnectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setPickerOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-stash-text hover:bg-stash-surface-2 transition-colors last:rounded-b-lg"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stash-bg border border-stash-border text-[10px] font-bold text-stash-muted">
                  {connector.name.charAt(0)}
                </span>
                {connector.name}
              </button>
            ))}
          </div>
        )}

        {/* Error tooltip */}
        {showError && connectError && (
          <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-stash-red/20 bg-stash-surface p-3 shadow-lg shadow-black/40 z-50">
            <p className="text-xs text-stash-red">
              {connectError.message.includes("provider") || connectError.message.includes("not found")
                ? "No compatible wallet found. Please install MetaMask or Rabby."
                : "Connection failed. Please try again."}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 rounded-lg border border-stash-border bg-stash-surface px-3 py-2 text-sm font-medium text-stash-text hover:border-stash-border-light transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-stash-green" />
        <span className="font-mono text-[13px]">
          {address ? truncateAddress(address, 4) : ""}
        </span>
        <svg className="h-3 w-3 text-stash-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-stash-border bg-stash-surface shadow-lg shadow-black/40 z-50">
          <div className="px-3 py-2 border-b border-stash-border">
            <div className="text-[11px] text-stash-muted">Connected</div>
            <div className="text-xs font-mono text-stash-text mt-0.5">
              {address ? truncateAddress(address, 6) : ""}
            </div>
          </div>
          <button
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            className="w-full px-3 py-2.5 text-left text-sm text-stash-red hover:bg-stash-surface-2 transition-colors rounded-b-lg"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
