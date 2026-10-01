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

  // In demo mode, always authenticated
  if (DEMO_MODE) {
    return {
      isAuthenticated: true,
      token: "demo",
      login: async () => {},
      logout: () => {},
      isLoading: false,
      error: null,
    };
  }

  // Hydrate token from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(TOKEN_KEY);
      setToken(stored);
    }
  }, []);

  // Clear token when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, [isConnected]);

  const login = useCallback(async () => {
    if (!address || !isConnected) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Request challenge from backend
      const challengeRes = await api.post<ApiResponse<AuthChallenge>>(
        "/auth/challenge",
        { address }
      );
      const { message } = challengeRes.data.data;

      // 2. Sign the challenge message with wallet
      const signature = await signMessageAsync({ message });

      // 3. Verify the signature with the backend
      const verifyRes = await api.post<ApiResponse<AuthToken>>(
        "/auth/verify",
        {
          address,
          message,
          signature,
        }
      );
      const { accessToken } = verifyRes.data.data;

      // 4. Store JWT in localStorage
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
    setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  return {
    isAuthenticated: !!token,
    token,
    login,
    logout,
    isLoading,
    error,
  };
}
