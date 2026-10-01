"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse, TradeQuote, TradeExecution } from "@stash/common";

const TOKEN_KEY = "stash_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

interface PrepareTradeResponse {
  routerAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  calldata: string;
}

interface ConfirmTradeResponse {
  success: boolean;
  tradeId: string;
}

interface TradePositionEntry {
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  amountOut: string;
  status: string;
  createdAt: string;
  txHash: string;
}

export function useTrade() {
  const token = getToken();
  const client = useApi(token);
  const queryClient = useQueryClient();

  // Get quote
  const getQuoteMutation = useMutation({
    mutationFn: async ({
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
    }: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      slippageBps?: number;
    }) => {
      const res = await client.post<ApiResponse<TradeQuote>>("/trade/quote", {
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps,
      });
      return res.data.data;
    },
  });

  // Prepare trade
  const prepareTradeMutation = useMutation({
    mutationFn: async ({
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
    }: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      slippageBps?: number;
    }) => {
      const res = await client.post<ApiResponse<PrepareTradeResponse>>(
        "/trade/prepare",
        { tokenIn, tokenOut, amountIn, slippageBps }
      );
      return res.data.data;
    },
  });

  // Confirm trade
  const confirmTradeMutation = useMutation({
    mutationFn: async ({
      txHash,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
    }: {
      txHash: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      amountOut: string;
    }) => {
      const res = await client.post<ApiResponse<ConfirmTradeResponse>>(
        "/trade/confirm",
        { txHash, tokenIn, tokenOut, amountIn, amountOut }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["trade-history"] });
      queryClient.invalidateQueries({ queryKey: ["trade-positions"] });
    },
  });

  // Trade history
  const {
    data: tradeHistory,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["trade-history", token],
    queryFn: async () => {
      const res = await client.get<ApiResponse<TradeExecution[]>>(
        "/trade/history"
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: 1,
  });

  // Active positions
  const {
    data: activePositions,
    isLoading: isPositionsLoading,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ["trade-positions", token],
    queryFn: async () => {
      const res = await client.get<ApiResponse<TradePositionEntry[]>>(
        "/trade/positions"
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: 1,
  });

  const getQuote = (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageBps?: number
  ) => getQuoteMutation.mutateAsync({ tokenIn, tokenOut, amountIn, slippageBps });

  const prepareTrade = (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageBps?: number
  ) =>
    prepareTradeMutation.mutateAsync({
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
    });

  const confirmTrade = (
    txHash: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOut: string
  ) =>
    confirmTradeMutation.mutateAsync({
      txHash,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
    });

  return {
    getQuote,
    quote: getQuoteMutation.data ?? null,
    isQuoting: getQuoteMutation.isPending,
    quoteError: getQuoteMutation.error,
    prepareTrade,
    confirmTrade,
    isPreparing: prepareTradeMutation.isPending,
    isConfirming: confirmTradeMutation.isPending,
    tradeHistory: tradeHistory ?? [],
    isHistoryLoading,
    refetchHistory,
    activePositions: activePositions ?? [],
    isPositionsLoading,
    refetchPositions,
  };
}
