import {providerFees} from './provider-fees';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseAbi, encodeFunctionData, type Address } from 'viem';
import { TradePosition, TradeExecution, Transaction, TradeQuoteRecord } from '../database/entities';
import { BlockchainService } from '../blockchain/blockchain.service';
import { recordConfirmedAction } from '../blockchain/confirmed-action';
import { PROTOCOL_EVENTS } from '../blockchain/events';
import { CreditService } from '../credit/credit.service';
import { ProtocolService } from '../protocol/protocol.service';
import { contractAddress, ROUTER_V2_ABI } from '../config/protocol.config';
import { QuoteProvider, ExecutableRoute } from './providers/quote-provider';
import { ZeroXProvider } from './providers/zero-x.provider';
import { LifiProvider } from './providers/lifi.provider';

@Injectable()
export class TradeService {
  constructor(
    @InjectRepository(TradePosition) private readonly positions: Repository<TradePosition>,
    @InjectRepository(TradeExecution) private readonly executions: Repository<TradeExecution>,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    @InjectRepository(TradeQuoteRecord) private readonly quotes: Repository<TradeQuoteRecord>,
    private readonly credit: CreditService, private readonly protocol: ProtocolService,
    private readonly lifecycle: LifecycleService,
    private readonly config: ConfigService, private readonly blockchain: BlockchainService,
  ) {}
  private providers(): QuoteProvider[] {
    const all: Record<string, QuoteProvider> = {
      '0x': new ZeroXProvider(this.config.get<string>('ZEROX_API_KEY', '')),
      'lifi': new LifiProvider(this.config.get<string>('LIFI_API_KEY', '')),
    };
    return this.config.get<string>('ROUTING_PROVIDERS', '0x,lifi').split(',').map(name => {
      const provider = all[name.trim()]; if (!provider) throw new Error('Unknown routing provider'); return provider;
    });
  }
  async getQuote(userId: string, walletAddress: string, tokenIn: string, tokenOut: string, amountIn: string, slippageBps = 50) {
    const configuration = await this.protocol.configuration();
    if (tokenIn.toLowerCase() !== configuration.usdc.address.toLowerCase()) throw new BadRequestException('Stash Power trades pay with USDC');
    if (!/^\d+$/.test(amountIn) || BigInt(amountIn) <= 0n || !Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new BadRequestException('Invalid amount or slippage');
    const router = contractAddress(this.config, 'STASH_ROUTER_ADDRESS'); const client = this.blockchain.getClient();
    if (!/^0x[0-9a-fA-F]{40}$/.test(tokenOut) || !await client.readContract({ address: router, abi: ROUTER_V2_ABI, functionName: 'allowedOutput', args: [tokenOut as Address] })) throw new BadRequestException('Unsupported output asset');
    const state = await this.credit.calculateStashPower(userId);
    const availableAtomic = await client.readContract({address:configuration.creditAddress,abi:parseAbi(['function availableCredit(address user) view returns(uint256)']),functionName:'availableCredit',args:[walletAddress as Address]});
    if (BigInt(amountIn) > availableAtomic) throw new BadRequestException('Insufficient Stash Power');
    if (state.debtAmount > 0 && Number(state.healthFactor) / 1e18 <= 1.1) throw new BadRequestException('Position risk is too high to increase debt');
    const feeBps = await client.readContract({ address: router, abi: ROUTER_V2_ABI, functionName: 'protocolFeeBps' });
    const platformFee = BigInt(amountIn) * feeBps / 10000n;
    const sellAmount = (BigInt(amountIn) - platformFee).toString();
    let route: ExecutableRoute | undefined;
    for (const provider of this.providers()) {
      try {
        const candidate = await provider.getQuote({ chainId: configuration.chainId, sellToken: configuration.usdc.address,
          buyToken: tokenOut as Address, sellAmount, taker: router, origin: walletAddress as Address, slippageBps });
        if (BigInt(candidate.value) !== 0n) continue;
        const allowed = await client.readContract({ address: router, abi: ROUTER_V2_ABI,
          functionName: 'approvedRoute', args: [candidate.target, candidate.spender] });
        if (allowed) { route = candidate; break; }
      } catch { /* Try the next configured provider; never return a synthetic quote. */ }
    }
    if (!route) throw new ServiceUnavailableException('No executable route from an approved aggregator is available. Check liquidity and provider configuration.');
    const deadline = BigInt(Math.floor(Date.parse(route.expiresAt) / 1000));
    const calldata = encodeFunctionData({ abi: ROUTER_V2_ABI, functionName: 'borrowAndSwap', args: [{
      tokenOut: tokenOut as Address, amountIn: BigInt(amountIn), minimumOut: BigInt(route.minimumBuyAmount), deadline,
      target: route.target, spender: route.spender, routeData: route.data,
    }] });
    const payload = { tokenIn: configuration.usdc.address, tokenOut, amountIn, expectedAmountOut: route.buyAmount,
      amountOutMin: route.minimumBuyAmount, priceImpact: route.priceImpact, route: route.route,
      provider: route.provider, slippageBps, expiresAt: route.expiresAt, routerAddress: router, calldata,
      fees: { platform: { amount: platformFee.toString(), token: configuration.usdc.address }, router: route.fees, providerItems: providerFees(route.provider,route.fees,[configuration.usdc,...configuration.assets]),
        borrowing: { type: 'variable-interest', ...await this.protocol.lendingTerms(walletAddress as Address), note: 'Interest accrues on borrowed USDC until repayment. Base APR excludes account risk premium and can change at execution.' } } };
    const record = await this.quotes.save(this.quotes.create({ userId, walletAddress: walletAddress.toLowerCase(),
      chainId: configuration.chainId, expiresAt: new Date(route.expiresAt), payload }));
    return { ...payload, quoteId: record.id };
  }
  async prepareTrade(userId: string, walletAddress: string, quoteId: string) {
    const quote = await this.quotes.findOne({ where: { id: quoteId, userId, walletAddress: walletAddress.toLowerCase() } });
    if (!quote || quote.expiresAt.getTime() <= Date.now()+5000) throw new BadRequestException('Quote expired; request a new quote');
    if (quote.chainId !== Number(this.config.get<string>('CHAIN_ID','5042002')) || quote.payload.routerAddress.toLowerCase() !== contractAddress(this.config,'STASH_ROUTER_ADDRESS').toLowerCase()) throw new BadRequestException('Quote configuration changed');
    const payload = quote.payload; const client = this.blockchain.getClient();
    // eth_call/estimateGas executes the entire borrow + swap path, including current debt, liquidity and approvals.
    const call = { account: walletAddress as Address, to: payload.routerAddress as Address, data: payload.calldata as `0x${string}`, value: 0n };
    await client.call(call);
    const gas = await client.estimateGas(call); const gasPrice = await client.getGasPrice();
    const intentId = await this.lifecycle.prepare(userId, walletAddress, 'trade', { to: payload.routerAddress, data: payload.calldata }, quote.expiresAt);
    return { data: { ...payload, intentId, quoteId, chainId: quote.chainId, to: payload.routerAddress, data: payload.calldata, value: '0',
      requiresApproval: false, gas: gas.toString(), fees: { ...payload.fees, network: { amount: (gas*gasPrice).toString(), native: true } } } };
  }
  async confirmTrade(userId: string, walletAddress: string, txHash: string, tokenIn: string, tokenOut: string, amountIn: string, _amountOut: string) {
    const args = await this.blockchain.verifyEvent(txHash, walletAddress, contractAddress(this.config, 'STASH_ROUTER_ADDRESS'),
      PROTOCOL_EVENTS, 'TradeExecuted', { user: walletAddress, tokenIn, tokenOut, amountIn });
    return recordConfirmedAction(this.transactions, userId, txHash, 'trade', Number(this.config.get<string>('CHAIN_ID', '5042002')), async manager => {
      const positions = manager.getRepository(TradePosition);
      const position = await positions.save(positions.create({ userId, tokenIn, tokenOut, amountIn, amountOut: String(args.amountOut), status: 'confirmed' }));
      const executions = manager.getRepository(TradeExecution);
      const execution = await executions.save(executions.create({ tradePositionId: position.id, txHash: txHash.toLowerCase(), status: 'confirmed', confirmedAt: new Date() }));
      return { tradePosition: position, tradeExecution: execution };
    });
  }
  async getTradeHistory(userId: string) {
    const configuration = await this.protocol.configuration(); const tokens = [configuration.usdc, ...configuration.assets];
    const positions = await this.positions.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(positions.map(async position => {
      const execution = await this.executions.findOne({ where: { tradePositionId: position.id } });
      return { ...position, txHash: execution?.txHash ?? null,
        tokenInSymbol: tokens.find(token => token.address.toLowerCase()===position.tokenIn.toLowerCase())?.symbol ?? position.tokenIn,
        tokenOutSymbol: tokens.find(token => token.address.toLowerCase()===position.tokenOut.toLowerCase())?.symbol ?? position.tokenOut };
    }));
  }
  async getActivePositions(userId: string) { return (await this.getTradeHistory(userId)).filter(position => position.status === 'confirmed'); }
}
