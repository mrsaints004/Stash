"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";
import type { ApiResponse, PortfolioSummary, RiskLevel } from "@stash/common";

const TOKEN_KEY = "stash_token";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const MOCK_DATA = {
  totalCollateralUsd: "12450.00",
  stashPower: "9337.50",
  usedCredit: "2800.00",
  availableCredit: "6537.50",
  ltv: 0.2249,
  riskLevel: "safe" as RiskLevel,
};

function getToken(): string | null {
  if (DEMO_MODE) return "demo";
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function useStashPower() {
  const token = getToken();
  const client = useApi(token);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["portfolio-summary", token],
    queryFn: async () => {
      if (DEMO_MODE) return MOCK_DATA;
      const res = await client.get<ApiResponse<PortfolioSummary>>(
        "/portfolio/summary"
      );
      return res.data.data;
    },
    enabled: !!token,
    refetchInterval: DEMO_MODE ? false : 15_000,
    retry: DEMO_MODE ? false : 1,
  });

  return {
    totalCollateralUsd: data?.totalCollateralUsd ?? "0",
    stashPower: data?.stashPower ?? "0",
    usedCredit: data?.usedCredit ?? "0",
    availableCredit: data?.availableCredit ?? "0",
    ltv: data?.ltv ?? 0,
    riskLevel: (data?.riskLevel as RiskLevel) ?? "safe",
    isLoading: DEMO_MODE ? false : isLoading,
    error,
    refetch,
  };
}
