"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse } from "@stash/common";

const TOKEN_KEY = "stash_token";
const PAGE_SIZE = 20;
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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

const MOCK_ACTIVITY: ActivityResponse = {
  items: [
    {
      id: "demo-1",
      type: "deposit",
      description: "Deposited 2.0 WETH as collateral",
      amount: "2.0",
      symbol: "WETH",
      status: "confirmed",
      txHash: "0xabc123def456789012345678901234567890abcdef1234567890abcdef123456",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "demo-2",
      type: "deposit",
      description: "Deposited 0.15 cirBTC as collateral",
      amount: "0.15",
      symbol: "cirBTC",
      status: "confirmed",
      txHash: "0xdef789012345678901234567890abcdef1234567890abcdef1234567890abcd",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "demo-3",
      type: "trade",
      description: "Swapped 1,500 USDC for 0.6 WETH",
      amount: "1,500",
      symbol: "USDC",
      status: "confirmed",
      txHash: "0x123456789012345678901234567890abcdef1234567890abcdef1234567890ab",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "demo-4",
      type: "trade",
      description: "Swapped 1,300 USDC for 1,196 EURC",
      amount: "1,300",
      symbol: "USDC",
      status: "confirmed",
      txHash: "0x456789012345678901234567890abcdef1234567890abcdef1234567890abcd",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: "demo-5",
      type: "borrow",
      description: "Borrowed 2,800 USDC against collateral",
      amount: "2,800",
      symbol: "USDC",
      status: "confirmed",
      txHash: "0x789012345678901234567890abcdef1234567890abcdef1234567890abcdef01",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
    },
  ],
  total: 5,
};

function getToken(): string | null {
  if (DEMO_MODE) return "demo";
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function useActivity() {
  const token = getToken();
  const client = useApi(token);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activity", token, offset],
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_ACTIVITY;
      const res = await client.get<ApiResponse<ActivityResponse>>(
        `/activity?limit=${PAGE_SIZE}&offset=${offset}`
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: DEMO_MODE ? false : 1,
  });

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  const hasMore = data ? offset + PAGE_SIZE < data.total : false;

  return {
    transactions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading: DEMO_MODE ? false : isLoading,
    hasMore,
    loadMore,
    refetch,
  };
}
