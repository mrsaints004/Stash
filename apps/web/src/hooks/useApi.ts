"use client";

import { notifySessionChanged } from "@/hooks/useSessionToken";

import { useMemo } from "react";
import axios from "axios";

const TOKEN_KEY = "stash_token";

/**
 * Returns an Axios instance with the Authorization header set
 * for authenticated API requests.
 */
export function useApi(token: string | null) {
  const client = useMemo(() => {
    const instance = axios.create({
      baseURL: typeof window !== "undefined" ? "/api/proxy" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"),
      timeout: 15_000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (token) {
      instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }

    // Clear stale token on 401
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (
          error.response?.status === 401 &&
          typeof window !== "undefined"
        ) {
          localStorage.removeItem(TOKEN_KEY);
          notifySessionChanged();
        }
        const detail = error.response?.data?.message;
        if (detail) error.message = Array.isArray(detail) ? detail.join("; ") : String(detail);
        return Promise.reject(error);
      }
    );

    return instance;
  }, [token]);

  return client;
}
