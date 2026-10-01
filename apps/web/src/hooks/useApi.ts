"use client";

import { useMemo } from "react";
import axios from "axios";

/**
 * Returns an Axios instance with the Authorization header set
 * for authenticated API requests.
 */
export function useApi(token: string | null) {
  const client = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (token) {
      instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }

    return instance;
  }, [token]);

  return client;
}
