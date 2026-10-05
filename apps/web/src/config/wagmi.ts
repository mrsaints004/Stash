import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
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

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected({ target: "metaMask" }),
  ],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
