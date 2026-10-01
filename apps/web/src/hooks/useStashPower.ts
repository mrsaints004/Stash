"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse, PortfolioSummary, RiskLevel } from "@stash/common";

const TOKEN_KEY = "stash_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function useStashPower() {
  const token = getToken();
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
    refetchInterval: 15_000,
    retry: 1,
  });

  return {
    totalCollateralUsd: data?.totalCollateralUsd ?? "0",
    stashPower: data?.stashPower ?? "0",
    usedCredit: data?.usedCredit ?? "0",
    availableCredit: data?.availableCredit ?? "0",
    ltv: data?.ltv ?? 0,
    riskLevel: (data?.riskLevel as RiskLevel) ?? "safe",
    isLoading,
    error,
    refetch,
  };
}
