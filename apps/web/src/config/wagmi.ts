import { http, createConfig } from "wagmi";
import { type Chain } from "viem";

export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  testnet: true,
};

// No connectors array — wagmi auto-discovers wallets via EIP-6963.
// Only real EVM wallets (MetaMask, Rabby, Coinbase, Trust, etc.)
// announce themselves through EIP-6963. Non-EVM extensions are excluded.
export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
