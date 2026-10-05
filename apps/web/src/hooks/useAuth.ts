"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "@/lib/api";
import type { ApiResponse, AuthChallenge, AuthToken } from "@stash/common";

const TOKEN_KEY = "stash_token";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function useAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate token from localStorage on mount
  useEffect(() => {
    if (DEMO_MODE) return;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(TOKEN_KEY);
      setToken(stored);
    }
  }, []);

  // Clear token when wallet disconnects
  useEffect(() => {
    if (DEMO_MODE) return;
    if (!isConnected) {
      setToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, [isConnected]);

  const login = useCallback(async () => {
    if (DEMO_MODE) return;
    if (!address || !isConnected) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const challengeRes = await api.post<ApiResponse<AuthChallenge>>(
        "/auth/challenge",
        { address }
      );
      const { message } = challengeRes.data.data;
      const signature = await signMessageAsync({ message });
      const verifyRes = await api.post<ApiResponse<AuthToken>>(
        "/auth/verify",
        { address, message, signature }
      );
      const { accessToken } = verifyRes.data.data;
      localStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, signMessageAsync]);

  const logout = useCallback(() => {
    if (DEMO_MODE) return;
    setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  // In demo mode, always authenticated (pages use useDemoAccount for isConnected)
  if (DEMO_MODE) {
    return {
      isAuthenticated: true,
      token: "demo",
      login,
      logout,
      isLoading: false,
      error: null,
    };
  }

  return {
    isAuthenticated: !!token,
    token,
    login,
    logout,
    isLoading,
    error,
  };
}
