"use client";

import { useAccount, useReadContracts } from "wagmi";
import { ADDRESSES } from "@stash/common";
import { ERC20_ABI } from "@stash/abis";
import type { Address } from "viem";

const WETH_ADDRESS = ADDRESSES.WETH as Address;
const CIRBTC_ADDRESS = ADDRESSES.cirBTC as Address;

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
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
    },
  });

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
