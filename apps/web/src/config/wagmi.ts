import { http, createConfig, type Config } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { defineChain } from 'viem';
const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 5042002);
if (![5042, 5042002].includes(id)) throw new Error('Stash supports Arc only');
const chain = defineChain({ id, name: id === 5042 ? 'Arc' : 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? (id === 5042 ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io')] } },
  blockExplorers: { default: { name: 'Explorer', url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? (id === 5042 ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io') } },
  testnet: id === 5042002 });
export const config: Config = createConfig({ chains: [chain], transports: { [id]: http() },
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Stash', darkMode: true }),
  ], ssr: true, multiInjectedProviderDiscovery: true });
