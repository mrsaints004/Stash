"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "./useSessionToken";
import { useApi } from "./useApi";
import type { ApiResponse } from "@stash/common";

const PAGE_SIZE = 20;

export interface ActivityEntry {
  id: string;
  type: "deposit" | "withdraw" | "borrow" | "repay" | "trade" | "liquidation";
  description: string;
  amount: string | null;
  symbol: string | null;
  status: "pending" | "confirmed" | "failed" | "orphaned";
  txHash: string;
  createdAt: string;
}

interface ActivityResponse {
  items: ActivityEntry[];
  total: number;
}



export function useActivity() {
  const token = useSessionToken();
  const client = useApi(token);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, refetch, error } = useQuery({
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
    error,
    transactions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading: isLoading,
    hasMore,
    loadMore,
    refetch,
  };
}
