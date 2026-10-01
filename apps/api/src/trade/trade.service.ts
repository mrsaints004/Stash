import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { encodeFunctionData, type Address } from 'viem';
import {
  TradePosition,
  TradeExecution,
  Transaction,
} from '../database/entities';
import { OracleService } from '../oracle/oracle.service';
import { CreditService } from '../credit/credit.service';

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const WETH_ADDRESS = '0x128cC466B61f542da60c70e3aA11c10e19B84EDB';
const CIRBTC_ADDRESS = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';
const EURC_ADDRESS = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1';
const ARC_CHAIN_ID = 5042002;

const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 500;
const PROTOCOL_FEE_BPS = 30;

const ALLOWED_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [USDC_ADDRESS.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [WETH_ADDRESS.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
  [CIRBTC_ADDRESS.toLowerCase()]: { symbol: 'cirBTC', decimals: 8 },
  [EURC_ADDRESS.toLowerCase()]: { symbol: 'EURC', decimals: 6 },
};

const ROUTER_ABI = [
  {
    type: 'function' as const,
    name: 'swap' as const,
    inputs: [
      { name: 'tokenIn' as const, type: 'address' as const },
      { name: 'tokenOut' as const, type: 'address' as const },
      { name: 'amountIn' as const, type: 'uint256' as const },
      { name: 'amountOutMin' as const, type: 'uint256' as const },
    ],
    outputs: [{ name: 'amountOut' as const, type: 'uint256' as const }],
    stateMutability: 'nonpayable' as const,
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: 'function' as const,
    name: 'approve' as const,
    inputs: [
      { name: 'spender' as const, type: 'address' as const },
      { name: 'amount' as const, type: 'uint256' as const },
    ],
    outputs: [{ name: '' as const, type: 'bool' as const }],
    stateMutability: 'nonpayable' as const,
  },
] as const;

export interface TradeQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  expectedAmountOut: string;
  amountOutMin: string;
  priceImpact: string;
  route: string[];
  slippageBps: number;
  protocolFeeBps: number;
  expiresAt: string;
}

@Injectable()
export class TradeService {
  private readonly routerAddress: Address;

  constructor(
    @InjectRepository(TradePosition)
    private readonly tradePositionRepo: Repository<TradePosition>,
    @InjectRepository(TradeExecution)
    private readonly tradeExecutionRepo: Repository<TradeExecution>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly oracleService: OracleService,
    private readonly creditService: CreditService,
    private readonly configService: ConfigService,
  ) {
    this.routerAddress = this.configService.get<string>(
      'STASH_ROUTER_ADDRESS',
      '0x0000000000000000000000000000000000000000',
    ) as Address;
  }

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageBps?: number,
  ): Promise<TradeQuote> {
    const normalizedIn = tokenIn.toLowerCase();
    const normalizedOut = tokenOut.toLowerCase();

    const tokenInInfo = ALLOWED_TOKENS[normalizedIn];
    const tokenOutInfo = ALLOWED_TOKENS[normalizedOut];

    if (!tokenInInfo) {
      throw new BadRequestException(`Unsupported token: ${tokenIn}`);
    }
    if (!tokenOutInfo) {
      throw new BadRequestException(`Unsupported token: ${tokenOut}`);
    }
    if (normalizedIn === normalizedOut) {
      throw new BadRequestException('tokenIn and tokenOut must be different');
    }

    const slippage = slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (slippage > MAX_SLIPPAGE_BPS) {
      throw new BadRequestException(
        `Slippage cannot exceed ${MAX_SLIPPAGE_BPS} bps (${MAX_SLIPPAGE_BPS / 100}%)`,
      );
    }

    const parsedAmountIn = BigInt(amountIn);
    if (parsedAmountIn <= 0n) {
      throw new BadRequestException('amountIn must be greater than 0');
    }

    // Calculate expected output using oracle prices
    const amountInUsd = await this.tokenAmountToUsd(
      normalizedIn,
      tokenInInfo,
      parsedAmountIn,
    );

    // Apply protocol fee
    const amountAfterFee = amountInUsd * (1 - PROTOCOL_FEE_BPS / 10000);

    // Convert to output token
    const expectedAmountOut = await this.usdToTokenAmount(
      normalizedOut,
      tokenOutInfo,
      amountAfterFee,
    );

    // Apply slippage for minimum output
    const amountOutMin =
      (expectedAmountOut * BigInt(10000 - slippage)) / 10000n;

    // Simple price impact calculation (0.1% for demonstration)
    const priceImpact = '0.10';

    // Quote expires in 30 seconds
    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();

    return {
      tokenIn,
      tokenOut,
      amountIn,
      expectedAmountOut: expectedAmountOut.toString(),
      amountOutMin: amountOutMin.toString(),
      priceImpact,
      route: [tokenIn, tokenOut],
      slippageBps: slippage,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      expiresAt,
    };
  }

  async prepareTrade(
    userId: string,
    walletAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageBps?: number,
  ) {
    const normalizedIn = tokenIn.toLowerCase();
    const tokenInInfo = ALLOWED_TOKENS[normalizedIn];

    if (!tokenInInfo) {
      throw new BadRequestException(`Unsupported token: ${tokenIn}`);
    }

    // Validate user has sufficient stash power for the trade amount
    const parsedAmountIn = BigInt(amountIn);
    const amountInUsd = await this.tokenAmountToUsd(
      normalizedIn,
      tokenInInfo,
      parsedAmountIn,
    );
    const stashPower = await this.creditService.calculateStashPower(userId);

    if (amountInUsd > stashPower.availableCredit + stashPower.usedCredit) {
      throw new BadRequestException(
        'Insufficient stash power for this trade amount',
      );
    }

    // Get a quote
    const quote = await this.getQuote(tokenIn, tokenOut, amountIn, slippageBps);
    const amountOutMin = BigInt(quote.amountOutMin);

    // Build swap tx data
    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'swap',
      args: [
        tokenIn as Address,
        tokenOut as Address,
        parsedAmountIn,
        amountOutMin,
      ],
    });

    // Build ERC20 approve tx
    const approvalData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [this.routerAddress, parsedAmountIn],
    });

    return {
      to: this.routerAddress,
      data,
      quote,
      requiresApproval: true,
      approvalTo: tokenIn,
      approvalData,
    };
  }

  async confirmTrade(
    userId: string,
    walletAddress: string,
    txHash: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOut: string,
  ) {
    // Record transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: 'trade' as const,
      txHash,
      status: 'confirmed',
      chainId: ARC_CHAIN_ID,
      confirmedAt: new Date(),
    });
    await this.transactionRepo.save(transaction);

    // Create trade position
    const tradePosition = this.tradePositionRepo.create({
      userId,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      status: 'confirmed',
    });
    await this.tradePositionRepo.save(tradePosition);

    // Create trade execution
    const tradeExecution = this.tradeExecutionRepo.create({
      tradePositionId: tradePosition.id,
      txHash,
      status: 'confirmed',
      confirmedAt: new Date(),
    });
    await this.tradeExecutionRepo.save(tradeExecution);

    // Update CreditPosition usedCredit if trading with USDC (borrowed funds)
    const normalizedIn = tokenIn.toLowerCase();
    if (normalizedIn === USDC_ADDRESS.toLowerCase()) {
      const creditPosition =
        await this.creditService.getOrCreateCreditPosition(userId);
      const tradeAmountUsd = Number(BigInt(amountIn)) / 10 ** 6;
      const currentUsedCredit = Number(creditPosition.usedCredit);
      creditPosition.usedCredit = (
        currentUsedCredit + tradeAmountUsd
      ).toFixed(2);
      // The credit repo is not directly accessible here; recalculate via service
      await this.creditService.calculateStashPower(userId);
    }

    return { tradePosition, tradeExecution, transaction };
  }

  async getTradeHistory(userId: string) {
    return this.tradePositionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getActivePositions(userId: string) {
    return this.tradePositionRepo.find({
      where: { userId, status: 'confirmed' },
      order: { createdAt: 'DESC' },
    });
  }

  private async tokenAmountToUsd(
    normalizedAddress: string,
    tokenInfo: { symbol: string; decimals: number },
    amount: bigint,
  ): Promise<number> {
    if (
      tokenInfo.symbol === 'USDC' ||
      tokenInfo.symbol === 'EURC'
    ) {
      // Stablecoins pegged 1:1 to USD
      return Number(amount) / 10 ** tokenInfo.decimals;
    }
    const priceUsd = await this.oracleService.getPrice(tokenInfo.symbol);
    return (Number(amount) / 10 ** tokenInfo.decimals) * priceUsd;
  }

  private async usdToTokenAmount(
    normalizedAddress: string,
    tokenInfo: { symbol: string; decimals: number },
    usdAmount: number,
  ): Promise<bigint> {
    if (
      tokenInfo.symbol === 'USDC' ||
      tokenInfo.symbol === 'EURC'
    ) {
      // Stablecoins pegged 1:1 to USD
      return BigInt(Math.floor(usdAmount * 10 ** tokenInfo.decimals));
    }
    const priceUsd = await this.oracleService.getPrice(tokenInfo.symbol);
    if (priceUsd === 0) {
      throw new BadRequestException(
        `Unable to get price for ${tokenInfo.symbol}`,
      );
    }
    const tokenAmount = usdAmount / priceUsd;
    return BigInt(Math.floor(tokenAmount * 10 ** tokenInfo.decimals));
  }
}
