"use client";

import { useAccount } from "wagmi";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_ADDRESS = "0x641b05B3d4256363d9eB79032ad3ff96F2B63202" as const;

export function useDemoAccount() {
  const account = useAccount();

  if (DEMO_MODE) {
    return {
      ...account,
      address: DEMO_ADDRESS,
      isConnected: true as const,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected" as const,
      chain: {
        id: 5042002,
        name: "Arc Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
        blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
        testnet: true,
      },
    };
  }

  return account;
}
