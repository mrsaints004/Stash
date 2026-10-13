"use client";

import { useAccount, useReadContracts } from "wagmi";
import { useProtocol } from "./useProtocol";
import { ERC20_ABI } from "@stash/abis";
import type { Address } from "viem";


interface TokenBalancesResult {
  wethBalance: bigint;
  cirBtcBalance: bigint;
  isLoading: boolean;
  error: boolean;
  refetch: () => void;
}

export function useTokenBalances(): TokenBalancesResult {
  const { address, isConnected } = useAccount();
  const protocol = useProtocol();
  const WETH_ADDRESS = protocol.data?.assets.find(asset => asset.symbol === "WETH")?.address;
  const CIRBTC_ADDRESS = protocol.data?.assets.find(asset => asset.symbol === "cirBTC")?.address;

  const { data, isLoading, refetch, error } = useReadContracts({
    contracts: [
      {
        address: WETH_ADDRESS as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      },
      {
        address: CIRBTC_ADDRESS as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address!],
      },
    ],
    query: {
      enabled: isConnected && !!address && !!WETH_ADDRESS && !!CIRBTC_ADDRESS,
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
    isLoading: isLoading || protocol.isLoading,
    error: !!error || !!protocol.error || (!!protocol.data && (!WETH_ADDRESS || !CIRBTC_ADDRESS)) || !!data?.some(result => result.status === "failure"),
    refetch,
  };
}
