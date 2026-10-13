import { QuoteProvider, QuoteRequest, ExecutableRoute, unsigned, address, calldata, transactionValue } from './quote-provider';
export class LifiProvider implements QuoteProvider {
  readonly name = 'LI.FI';
  constructor(private readonly apiKey: string, private readonly http: typeof fetch = fetch) {}
  async getQuote(request: QuoteRequest): Promise<ExecutableRoute> {
    const params = new URLSearchParams({ fromChain: String(request.chainId), toChain: String(request.chainId),
      fromToken: request.sellToken, toToken: request.buyToken, fromAmount: request.sellAmount,
      fromAddress: request.taker, toAddress: request.taker, slippage: String(request.slippageBps/10000), allowBridges: 'none' });
    const response = await this.http(`https://li.quest/v1/quote?${params}`, {
      headers: this.apiKey ? { 'x-lifi-api-key': this.apiKey } : {}, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`LI.FI quote unavailable (${response.status})`);
    const value: any = await response.json(); const action=value.action;
    if (Number(action?.fromChainId)!==request.chainId || Number(action?.toChainId)!==request.chainId ||
      action?.fromToken?.address?.toLowerCase()!==request.sellToken.toLowerCase() ||
      action?.toToken?.address?.toLowerCase()!==request.buyToken.toLowerCase() || action?.fromAmount!==request.sellAmount ||
      action?.fromAddress?.toLowerCase()!==request.taker.toLowerCase() || action?.toAddress?.toLowerCase()!==request.taker.toLowerCase()) throw new Error('LI.FI returned a mismatched or cross-chain route');
    const amount=unsigned(value.estimate?.toAmount,'buy amount'); const minimum=unsigned(value.estimate?.toAmountMin,'minimum output');
    if (BigInt(minimum)<=0n || BigInt(amount)<BigInt(minimum) || BigInt(minimum)<BigInt(amount)*BigInt(10000-request.slippageBps)/10000n) throw new Error('Invalid LI.FI output bound');
    return { provider:this.name, sellAmount:request.sellAmount, buyAmount:amount, minimumBuyAmount:minimum,
      target:address(value.transactionRequest?.to), spender:address(value.estimate?.approvalAddress),
      data:calldata(value.transactionRequest?.data), value: transactionValue(value.transactionRequest?.value ?? '0'),
      expiresAt:new Date(Date.now()+30000).toISOString(), route:[String(value.tool)], priceImpact:null,
      fees:{ router:value.estimate?.feeCosts ?? [], gas:value.estimate?.gasCosts ?? [] } };
  }
}
