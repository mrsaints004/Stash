"use client";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { config } from '@/config/wagmi';
export interface ProtocolAsset { address: `0x${string}`; symbol: string; name: string; decimals: number; collateralFactorBps: number; depositsEnabled: boolean; }
export interface ProtocolConfig { chainId: number; chainName: string; vaultAddress: `0x${string}`; creditAddress: `0x${string}`; routerAddress: `0x${string}`; usdc: ProtocolAsset; assets: ProtocolAsset[]; }
export function useProtocol() {
  return useQuery({ queryKey: ['protocol-config'], queryFn: async () => {
    const response = await api.get<{ data: ProtocolConfig }>('/protocol/config');
    if (response.data.data.chainId !== config.chains[0].id) throw new Error('Wallet network configuration does not match the Stash API');
    return response.data.data;
  }, staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, retry: 2, retryDelay: 3000 });
}
