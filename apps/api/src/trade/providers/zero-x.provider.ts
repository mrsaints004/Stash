import { QuoteProvider, QuoteRequest, ExecutableRoute, unsigned, address, calldata, transactionValue } from './quote-provider';
export class ZeroXProvider implements QuoteProvider {
  readonly name = '0x';
  constructor(private readonly apiKey: string, private readonly http: typeof fetch = fetch) {}
  async getQuote(request: QuoteRequest): Promise<ExecutableRoute> {
    if (!this.apiKey) throw new Error('0x API key is not configured');
    const params = new URLSearchParams({ chainId: String(request.chainId), sellToken: request.sellToken,
      buyToken: request.buyToken, sellAmount: request.sellAmount, taker: request.taker,
      txOrigin: request.origin, recipient: request.taker, slippageBps: String(request.slippageBps) });
    const response = await this.http(`https://api.0x.org/swap/allowance-holder/quote?${params}`, {
      headers: { '0x-api-key': this.apiKey, '0x-version': 'v2' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`0x quote unavailable (${response.status})`);
    const value: any = await response.json();
    if (value.liquidityAvailable !== true || value.sellToken?.toLowerCase() !== request.sellToken.toLowerCase() ||
      value.buyToken?.toLowerCase() !== request.buyToken.toLowerCase() || value.sellAmount !== request.sellAmount) throw new Error('0x returned no matching liquidity');
    const target = address(value.transaction?.to);
    const spender = address(value.issues?.allowance?.spender ?? value.allowanceTarget ?? target);
    const amount = unsigned(value.buyAmount, 'buy amount'); const minimum = unsigned(value.minBuyAmount, 'minimum output');
    if (BigInt(minimum) <= 0n || BigInt(amount) < BigInt(minimum)) throw new Error('Invalid 0x output bound');
    const minimumForSlippage = BigInt(amount) * BigInt(10000-request.slippageBps) / 10000n;
    if (BigInt(minimum) < minimumForSlippage) throw new Error('Provider exceeded requested slippage');
    return { provider: this.name, sellAmount: request.sellAmount, buyAmount: amount, minimumBuyAmount: minimum,
      target, spender, data: calldata(value.transaction?.data), value: transactionValue(value.transaction?.value ?? '0'),
      expiresAt: new Date(Date.now()+30000).toISOString(),
      route: (value.route?.fills ?? []).map((fill: any) => String(fill.source)), priceImpact: null, fees: value.fees ?? null };
  }
}
