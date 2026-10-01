"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse } from "@stash/common";

const TOKEN_KEY = "stash_token";
const PAGE_SIZE = 20;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export interface ActivityEntry {
  id: string;
  type: "deposit" | "withdraw" | "borrow" | "repay" | "trade";
  description: string;
  amount: string;
  symbol: string;
  status: "pending" | "confirmed" | "failed";
  txHash: string;
  createdAt: string;
}

interface ActivityResponse {
  items: ActivityEntry[];
  total: number;
}

export function useActivity() {
  const token = getToken();
  const client = useApi(token);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activity", token, offset],
    queryFn: async () => {
      const res = await client.get<ApiResponse<ActivityResponse>>(
        `/activity?limit=${PAGE_SIZE}&offset=${offset}`
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: 1,
  });

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const hasMore = data ? offset + PAGE_SIZE < data.total : false;

  return {
    transactions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    hasMore,
    loadMore,
    refetch,
  };
}
