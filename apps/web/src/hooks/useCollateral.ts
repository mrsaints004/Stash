"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse, CollateralPosition } from "@stash/common";

const TOKEN_KEY = "stash_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

interface PrepareDepositResponse {
  vaultAddress: string;
  assetAddress: string;
  amount: string;
  calldata: string;
}

interface PrepareWithdrawResponse {
  vaultAddress: string;
  assetAddress: string;
  amount: string;
  calldata: string;
}

interface ConfirmResponse {
  success: boolean;
  positionId: string;
}

export function useCollateral() {
  const token = getToken();
  const client = useApi(token);
  const queryClient = useQueryClient();

  // Fetch collateral positions
  const {
    data: positions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["collateral-positions", token],
    queryFn: async () => {
      const res = await client.get<ApiResponse<CollateralPosition[]>>(
        "/collateral/positions"
      );
      return res.data.data;
    },
    enabled: !!token,
    refetchInterval: 15_000,
    retry: 1,
  });

  // Prepare deposit mutation
  const prepareDepositMutation = useMutation({
    mutationFn: async ({
      assetAddress,
      amount,
    }: {
      assetAddress: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<PrepareDepositResponse>>(
        "/collateral/prepare-deposit",
        { assetAddress, amount }
      );
      return res.data.data;
    },
  });

  // Confirm deposit mutation
  const confirmDepositMutation = useMutation({
    mutationFn: async ({
      txHash,
      assetAddress,
      amount,
    }: {
      txHash: string;
      assetAddress: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<ConfirmResponse>>(
        "/collateral/confirm-deposit",
        { txHash, assetAddress, amount }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collateral-positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
    },
  });

  // Prepare withdraw mutation
  const prepareWithdrawMutation = useMutation({
    mutationFn: async ({
      assetAddress,
      amount,
    }: {
      assetAddress: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<PrepareWithdrawResponse>>(
        "/collateral/prepare-withdraw",
        { assetAddress, amount }
      );
      return res.data.data;
    },
  });

  // Confirm withdraw mutation
  const confirmWithdrawMutation = useMutation({
    mutationFn: async ({
      txHash,
      assetAddress,
      amount,
    }: {
      txHash: string;
      assetAddress: string;
      amount: string;
    }) => {
      const res = await client.post<ApiResponse<ConfirmResponse>>(
        "/collateral/confirm-withdraw",
        { txHash, assetAddress, amount }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collateral-positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
    },
  });

  const prepareDeposit = (assetAddress: string, amount: string) =>
    prepareDepositMutation.mutateAsync({ assetAddress, amount });

  const confirmDeposit = (
    txHash: string,
    assetAddress: string,
    amount: string
  ) => confirmDepositMutation.mutateAsync({ txHash, assetAddress, amount });

  const prepareWithdraw = (assetAddress: string, amount: string) =>
    prepareWithdrawMutation.mutateAsync({ assetAddress, amount });

  const confirmWithdraw = (
    txHash: string,
    assetAddress: string,
    amount: string
  ) => confirmWithdrawMutation.mutateAsync({ txHash, assetAddress, amount });

  return {
    positions: positions ?? [],
    isLoading,
    refetch,
    prepareDeposit,
    confirmDeposit,
    prepareWithdraw,
    confirmWithdraw,
    isPreparing:
      prepareDepositMutation.isPending || prepareWithdrawMutation.isPending,
    isConfirming:
      confirmDepositMutation.isPending || confirmWithdrawMutation.isPending,
  };
}
