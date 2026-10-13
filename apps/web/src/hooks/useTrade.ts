"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "./useSessionToken";
import { useApi } from "./useApi";
import type { ApiResponse, TradeQuote, TradeExecution } from "@stash/common";


interface PrepareTradeResponse {
  intentId: string;
  to: `0x${string}`; data: `0x${string}`; value: string; chainId: number;
  gas: string; fees: TradeQuote['fees'];
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
  const token = useSessionToken();
  const client = useApi(token);
  const queryClient = useQueryClient();

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

  const prepareTradeMutation = useMutation({ mutationFn: async (quoteId: string) => {
    const res = await client.post<ApiResponse<PrepareTradeResponse>>('/trade/prepare', { quoteId });
    return res.data.data;
  } });

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

  const prepareTrade = (quoteId: string) => prepareTradeMutation.mutateAsync(quoteId);

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
    isHistoryLoading: isHistoryLoading,
    refetchHistory,
    activePositions: activePositions ?? [],
    isPositionsLoading: isPositionsLoading,
    refetchPositions,
  };
}
