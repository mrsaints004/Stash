"use client";

import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

export function notifySessionChanged() {
  window.dispatchEvent(new Event("stash-session"));
}

function subscribe(callback: () => void) {
  window.addEventListener("stash-session", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("stash-session", callback);
    window.removeEventListener("storage", callback);
  };
}

export function useSessionToken() {
  const { address, isConnected } = useAccount();
  return useSyncExternalStore(subscribe, () => {
    if (!isConnected || !address) return null;
    if (localStorage.getItem("stash_wallet") !== address.toLowerCase()) return null;
    const expires = localStorage.getItem("stash_token_expires");
    if (!expires || Date.parse(expires) <= Date.now() || !Number.isFinite(Date.parse(expires))) return null;
    return localStorage.getItem("stash_token");
  }, () => null);
}
