"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./useApi";
import { ADDRESSES } from "@stash/common";
import type { ApiResponse, TradeQuote, TradeExecution } from "@stash/common";

const TOKEN_KEY = "stash_token";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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

const MOCK_POSITIONS: TradePositionEntry[] = [
  {
    tokenIn: ADDRESSES.USDC,
    tokenOut: ADDRESSES.WETH,
    tokenInSymbol: "USDC",
    tokenOutSymbol: "WETH",
    amountIn: "1500000000",
    amountOut: "600000000000000000",
    status: "confirmed",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    txHash: "0xab12cd34ef56789012345678901234567890abcdef1234567890abcdef123456",
  },
  {
    tokenIn: ADDRESSES.USDC,
    tokenOut: ADDRESSES.EURC,
    tokenInSymbol: "USDC",
    tokenOutSymbol: "EURC",
    amountIn: "1300000000",
    amountOut: "1196000000",
    status: "confirmed",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    txHash: "0xef78901234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  },
];

const MOCK_HISTORY: TradeExecution[] = [];

function getToken(): string | null {
  if (DEMO_MODE) return "demo";
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function useTrade() {
  const token = getToken();
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
      if (DEMO_MODE) {
        // Simulate a quote with ~0.5% price impact
        const bps = slippageBps ?? 100;
        const amountOut = BigInt(amountIn) * 997n / 1000n;
        const amountOutMin = amountOut * BigInt(10000 - bps) / 10000n;
        return {
          tokenIn,
          tokenOut,
          amountIn,
          amountOutMin: amountOutMin.toString(),
          priceImpact: 0.005,
          slippageBps: bps,
          route: [tokenIn, tokenOut],
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        } as TradeQuote;
      }
      const res = await client.post<ApiResponse<TradeQuote>>("/trade/quote", {
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps,
      });
      return res.data.data;
    },
  });

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
      if (DEMO_MODE) {
        return {
          routerAddress: process.env.NEXT_PUBLIC_STASH_ROUTER_ADDRESS ?? "",
          tokenIn,
          tokenOut,
          amountIn,
          amountOutMin: "0",
          calldata: "0x",
        } as PrepareTradeResponse;
      }
      const res = await client.post<ApiResponse<PrepareTradeResponse>>(
        "/trade/prepare",
        { tokenIn, tokenOut, amountIn, slippageBps }
      );
      return res.data.data;
    },
  });

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
      if (DEMO_MODE) {
        return { success: true, tradeId: "demo-trade-1" } as ConfirmTradeResponse;
      }
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
      if (DEMO_MODE) return MOCK_HISTORY;
      const res = await client.get<ApiResponse<TradeExecution[]>>(
        "/trade/history"
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: DEMO_MODE ? false : 1,
  });

  const {
    data: activePositions,
    isLoading: isPositionsLoading,
    refetch: refetchPositions,
  } = useQuery({
    queryKey: ["trade-positions", token],
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_POSITIONS;
      const res = await client.get<ApiResponse<TradePositionEntry[]>>(
        "/trade/positions"
      );
      return res.data.data;
    },
    enabled: !!token,
    retry: DEMO_MODE ? false : 1,
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
    isHistoryLoading: DEMO_MODE ? false : isHistoryLoading,
    refetchHistory,
    activePositions: activePositions ?? [],
    isPositionsLoading: DEMO_MODE ? false : isPositionsLoading,
    refetchPositions,
  };
}
