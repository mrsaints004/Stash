"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./useApi";
import { ADDRESSES } from "@stash/common";
import type { ApiResponse, CollateralPosition } from "@stash/common";

const TOKEN_KEY = "stash_token";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const MOCK_POSITIONS: CollateralPosition[] = [
  {
    id: "demo-col-1",
    userId: "demo-user",
    walletAddress: "0x641b05B3d4256363d9eB79032ad3ff96F2B63202",
    assetSymbol: "WETH",
    assetAddress: ADDRESSES.WETH,
    amount: "3500000000000000000",
    usdValue: "8750.00",
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-col-2",
    userId: "demo-user",
    walletAddress: "0x641b05B3d4256363d9eB79032ad3ff96F2B63202",
    assetSymbol: "cirBTC",
    assetAddress: ADDRESSES.cirBTC,
    amount: "15000000",
    usdValue: "3700.00",
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

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

function getToken(): string | null {
  if (DEMO_MODE) return "demo";
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function useCollateral() {
  const token = getToken();
  const client = useApi(token);
  const queryClient = useQueryClient();

  const {
    data: positions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["collateral-positions", token],
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_POSITIONS;
      const res = await client.get<ApiResponse<CollateralPosition[]>>(
        "/collateral/positions"
      );
      return res.data.data;
    },
    enabled: !!token,
    refetchInterval: DEMO_MODE ? false : 15_000,
    retry: DEMO_MODE ? false : 1,
  });

  const prepareDepositMutation = useMutation({
    mutationFn: async ({
      assetAddress,
      amount,
    }: {
      assetAddress: string;
      amount: string;
    }) => {
      if (DEMO_MODE) {
        return {
          vaultAddress: process.env.NEXT_PUBLIC_STASH_VAULT_ADDRESS ?? "",
          assetAddress,
          amount,
          calldata: "0x",
        } as PrepareDepositResponse;
      }
      const res = await client.post<ApiResponse<PrepareDepositResponse>>(
        "/collateral/prepare-deposit",
        { assetAddress, amount }
      );
      return res.data.data;
    },
  });

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
      if (DEMO_MODE) {
        return { success: true, positionId: "demo-pos-1" } as ConfirmResponse;
      }
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

  const prepareWithdrawMutation = useMutation({
    mutationFn: async ({
      assetAddress,
      amount,
    }: {
      assetAddress: string;
      amount: string;
    }) => {
      if (DEMO_MODE) {
        return {
          vaultAddress: process.env.NEXT_PUBLIC_STASH_VAULT_ADDRESS ?? "",
          assetAddress,
          amount,
          calldata: "0x",
        } as PrepareWithdrawResponse;
      }
      const res = await client.post<ApiResponse<PrepareWithdrawResponse>>(
        "/collateral/prepare-withdraw",
        { assetAddress, amount }
      );
      return res.data.data;
    },
  });

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
      if (DEMO_MODE) {
        return { success: true, positionId: "demo-pos-2" } as ConfirmResponse;
      }
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
    isLoading: DEMO_MODE ? false : isLoading,
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
