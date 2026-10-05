"use client";

import { useAccount, useReadContracts } from "wagmi";
import { ADDRESSES } from "@stash/common";
import { ERC20_ABI } from "@stash/abis";
import type { Address } from "viem";

const WETH_ADDRESS = ADDRESSES.WETH as Address;
const CIRBTC_ADDRESS = ADDRESSES.cirBTC as Address;
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ~2.5 WETH, ~0.15 cirBTC
const MOCK_WETH = 2500000000000000000n;
const MOCK_CIRBTC = 15000000n;

interface TokenBalancesResult {
  wethBalance: bigint;
  cirBtcBalance: bigint;
  isLoading: boolean;
  refetch: () => void;
}

export function useTokenBalances(): TokenBalancesResult {
  const { address, isConnected } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: WETH_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      },
      {
        address: CIRBTC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      },
    ],
    query: {
      enabled: !DEMO_MODE && isConnected && !!address,
      refetchInterval: DEMO_MODE ? false : 15_000,
    },
  });

  if (DEMO_MODE) {
    return {
      wethBalance: MOCK_WETH,
      cirBtcBalance: MOCK_CIRBTC,
      isLoading: false,
      refetch: () => {},
    };
  }

  const wethBalance =
    data?.[0]?.status === "success" ? (data[0].result as bigint) : 0n;
  const cirBtcBalance =
    data?.[1]?.status === "success" ? (data[1].result as bigint) : 0n;

  return {
    wethBalance,
    cirBtcBalance,
    isLoading,
    refetch,
  };
}
