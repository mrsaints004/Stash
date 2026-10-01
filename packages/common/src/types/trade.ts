export type TradeStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface TradeQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  priceImpact: number;
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
