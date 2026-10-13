export type TradeStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface TradeQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  quoteId: string;
  expectedAmountOut: string;
  provider: string;
  fees: { platform: { amount: string; token: string }; router: unknown; providerItems?: {label:string;amountAtomic:string;symbol:string;decimals:number|null}[]; borrowing: { type: string; note: string; baseApr?: number; lastRiskPremiumBps?: number | null; liquidityUsdcAtomic?: string }; network?: { amount: string; native: boolean } };
  priceImpact: number | null;
  slippageBps: number;
  route: string[];
  expiresAt: string;
}

export interface TradeRequest {
  tokenIn: string;
  tokenOut: string;
  /** Amount in tokenIn's decimals (bigint string) */
  amountIn: string;
  slippageBps?: number;
}

export interface TradeExecution {
  id: string;
  userId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string;
  status: TradeStatus;
  createdAt: string;
  confirmedAt?: string;
}
