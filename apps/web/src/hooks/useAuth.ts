"use client";

import { useState, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useSessionToken, notifySessionChanged } from "./useSessionToken";
import { api } from "@/lib/api";
import type { ApiResponse, AuthChallenge, AuthToken } from "@stash/common";

const TOKEN_KEY = "stash_token";

export function useAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const token = useSessionToken();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
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
      const { accessToken, expiresAt } = verifyRes.data.data;
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem("stash_wallet", address.toLowerCase());
      localStorage.setItem("stash_token_expires", expiresAt);
      notifySessionChanged();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, signMessageAsync]);

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("stash_wallet");
      localStorage.removeItem("stash_token_expires");
      notifySessionChanged();
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
