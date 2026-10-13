import type { Metadata } from "next";
import { Web3Provider } from "@/providers/Web3Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stash — Trade with your crypto. Keep your crypto.",
  description:
    "Deposit WETH or cirBTC as collateral, get USDC trading power, and trade — all without selling your holdings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className="font-sans bg-stash-bg text-stash-text antialiased"
      >
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
