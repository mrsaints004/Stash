"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse } from "@stash/common";

const TOKEN_KEY = "stash_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

interface PrepareResponse {
  creditAddress: string;
  amount: string;
  calldata: string;
}

interface ConfirmResponse {
  success: boolean;
  positionId: string;
}

interface DebtResponse {
  debtAmount: string;
  debtUsd: string;
}

export function useCredit() {
  const token = getToken();
  const client = useApi(token);
  const queryClient = useQueryClient();

  // Fetch current debt
  const {
    data: debtData,
    isLoading: isDebtLoading,
    refetch: refetchDebt,
  } = useQuery({
    queryKey: ["credit-debt", token],
    queryFn: async () => {
      const res = await client.get<ApiResponse<DebtResponse>>("/credit/debt");
      return res.data.data;
    },
    enabled: !!token,
    refetchInterval: 15_000,
    retry: 1,
  });

  // Prepare borrow mutation
  const prepareBorrowMutation = useMutation({
    mutationFn: async ({ amount }: { amount: string }) => {
      const res = await client.post<ApiResponse<PrepareResponse>>(
        "/credit/prepare-borrow",
        { amount }
      );
      return res.data.data;
    },
  });

  // Confirm borrow mutation
  const confirmBorrowMutation = useMutation({
    mutationFn: async ({
      txHash,
      amount,
    }: {
      txHash: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<ConfirmResponse>>(
        "/credit/confirm-borrow",
        { txHash, amount }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["credit-debt"] });
    },
  });

  // Prepare repay mutation
  const prepareRepayMutation = useMutation({
    mutationFn: async ({ amount }: { amount: string }) => {
      const res = await client.post<ApiResponse<PrepareResponse>>(
        "/credit/prepare-repay",
        { amount }
      );
      return res.data.data;
    },
  });

  // Confirm repay mutation
  const confirmRepayMutation = useMutation({
    mutationFn: async ({
      txHash,
      amount,
    }: {
      txHash: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<ConfirmResponse>>(
        "/credit/confirm-repay",
        { txHash, amount }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["credit-debt"] });
    },
  });

  const prepareBorrow = (amount: string) =>
    prepareBorrowMutation.mutateAsync({ amount });

  const confirmBorrow = (txHash: string, amount: string) =>
    confirmBorrowMutation.mutateAsync({ txHash, amount });

  const prepareRepay = (amount: string) =>
    prepareRepayMutation.mutateAsync({ amount });

  const confirmRepay = (txHash: string, amount: string) =>
    confirmRepayMutation.mutateAsync({ txHash, amount });

  return {
    debt: debtData?.debtAmount ?? "0",
    debtUsd: debtData?.debtUsd ?? "0",
    isDebtLoading,
    refetchDebt,
    prepareBorrow,
    confirmBorrow,
    prepareRepay,
    confirmRepay,
    isPreparing:
      prepareBorrowMutation.isPending || prepareRepayMutation.isPending,
    isConfirming:
      confirmBorrowMutation.isPending || confirmRepayMutation.isPending,
  };
}
