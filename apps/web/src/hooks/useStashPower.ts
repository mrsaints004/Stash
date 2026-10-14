"use client";

import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "./useSessionToken";
import { useApi } from "./useApi";
import type { ApiResponse, PortfolioSummary, RiskLevel } from "@stash/common";




export function useStashPower() {
  const token = useSessionToken();
  const client = useApi(token);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["portfolio-summary", token],
    queryFn: async () => {

      const res = await client.get<ApiResponse<PortfolioSummary>>(
        "/portfolio/summary"
      );
      return res.data.data;
    },
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
    retryDelay: 3000,
  });

  return {
    liquidationThreshold: data?.liquidationThreshold ?? null,
    healthFactor: data?.healthFactor ?? null,
    liquidationDistance: data?.liquidationDistance ?? null,
    totalCollateralUsd: data?.totalCollateralUsd ?? "0",
    stashPower: data?.stashPower ?? "0",
    debtUsd: data?.totalDebtUsd ?? "0",
    usedCredit: data?.usedCredit ?? "0",
    availableCredit: data?.availableCredit ?? "0",
    ltv: data?.ltv ?? 0,
    riskLevel: (data?.riskLevel as RiskLevel) ?? "safe",
    isLoading: isLoading || (!!token && !data && !error),
    error,
    refetch,
  };
}
