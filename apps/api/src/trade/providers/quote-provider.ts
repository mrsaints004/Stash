import type { Address, Hex } from 'viem';
export interface QuoteRequest {
  chainId: number; sellToken: Address; buyToken: Address; sellAmount: string;
  taker: Address; origin: Address; slippageBps: number;
}
export interface ExecutableRoute {
  provider: string; sellAmount: string; buyAmount: string; minimumBuyAmount: string;
  target: Address; spender: Address; data: Hex; value: string; expiresAt: string;
  route: string[]; priceImpact: number | null; fees: unknown;
}
export interface QuoteProvider { readonly name: string; getQuote(request: QuoteRequest): Promise<ExecutableRoute>; }
export function unsigned(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || value.length > 78) throw new Error(`Invalid ${label}`);
  return value;
}
export function address(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new Error('Invalid route address');
  return value as Address;
}
export function calldata(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})+$/.test(value) || value.length < 10 || value.length > 262144) throw new Error('Invalid route calldata');
  return value as Hex;
}

export function transactionValue(value: unknown): string {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value)) return BigInt(value).toString();
  return unsigned(value, 'transaction value');
}
