import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { encodeFunctionData, type Address } from 'viem';
import {
  CreditPosition,
  CollateralPosition,
  Transaction,
  Repayment,
} from '../database/entities';
import { OracleService } from '../oracle/oracle.service';

const WETH_ADDRESS = '0x128cC466B61f542da60c70e3aA11c10e19B84EDB';
const CIRBTC_ADDRESS = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const ARC_CHAIN_ID = 5042002;

const ASSET_SYMBOLS: Record<string, string> = {
  [WETH_ADDRESS.toLowerCase()]: 'WETH',
  [CIRBTC_ADDRESS.toLowerCase()]: 'cirBTC',
};

const ASSET_DECIMALS: Record<string, number> = {
  [WETH_ADDRESS.toLowerCase()]: 18,
  [CIRBTC_ADDRESS.toLowerCase()]: 8,
};

const LTV_MAX = 0.75;

const CREDIT_ABI = [
  {
    type: 'function' as const,
    name: 'borrow' as const,
    inputs: [{ name: 'amount' as const, type: 'uint256' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'repay' as const,
    inputs: [{ name: 'amount' as const, type: 'uint256' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'debtOf' as const,
    inputs: [{ name: 'user' as const, type: 'address' as const }],
    outputs: [{ name: '' as const, type: 'uint256' as const }],
    stateMutability: 'view' as const,
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

export interface StashPowerResult {
  totalCollateralUsd: number;
  stashPower: number;
  usedCredit: number;
  availableCredit: number;
  ltv: number;
  debtAmount: number;
}

@Injectable()
export class CreditService {
  private readonly creditAddress: Address;

  constructor(
    @InjectRepository(CreditPosition)
    private readonly creditRepo: Repository<CreditPosition>,
    @InjectRepository(CollateralPosition)
    private readonly collateralRepo: Repository<CollateralPosition>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Repayment)
    private readonly repaymentRepo: Repository<Repayment>,
    private readonly oracleService: OracleService,
    private readonly configService: ConfigService,
  ) {
    this.creditAddress = this.configService.get<string>(
      'STASH_CREDIT_ADDRESS',
      '0x0000000000000000000000000000000000000000',
    ) as Address;
  }

  async calculateStashPower(userId: string): Promise<StashPowerResult> {
    // Fetch all collateral positions for user
    const positions = await this.collateralRepo.find({
      where: { userId },
    });

    // Calculate total collateral USD value
    let totalCollateralUsd = 0;

    for (const position of positions) {
      const symbol = ASSET_SYMBOLS[position.assetAddress.toLowerCase()];
      if (!symbol) continue;

      const decimals = ASSET_DECIMALS[position.assetAddress.toLowerCase()];
      if (decimals === undefined) continue;

      const priceUsd = await this.oracleService.getPrice(symbol);
      const amount = Number(BigInt(position.amount)) / 10 ** decimals;
      const positionUsd = amount * priceUsd;
      totalCollateralUsd += positionUsd;
    }

    // Get existing credit position for debt info
    const creditPosition = await this.creditRepo.findOne({
      where: { userId },
    });

    const debtAmount = creditPosition ? Number(creditPosition.debtAmount) : 0;
    const usedCredit = creditPosition ? Number(creditPosition.usedCredit) : 0;

    // Stash Power = total collateral * LTV_MAX
    const stashPower = totalCollateralUsd * LTV_MAX;
    const availableCredit = Math.max(0, stashPower - usedCredit);

    // Current LTV = debt / totalCollateral (0 if no collateral)
    const ltv = totalCollateralUsd > 0 ? debtAmount / totalCollateralUsd : 0;

    // Update credit position in DB
    const updatedPosition = await this.getOrCreateCreditPosition(userId);
    updatedPosition.stashPower = stashPower.toFixed(2);
    updatedPosition.usedCredit = usedCredit.toFixed(2);
    updatedPosition.debtAmount = debtAmount.toFixed(2);
    updatedPosition.ltv = ltv.toFixed(6);
    await this.creditRepo.save(updatedPosition);

    return {
      totalCollateralUsd,
      stashPower,
      usedCredit,
      availableCredit,
      ltv,
      debtAmount,
    };
  }

  async getOrCreateCreditPosition(userId: string): Promise<CreditPosition> {
    let position = await this.creditRepo.findOne({
      where: { userId },
    });

    if (!position) {
      position = this.creditRepo.create({
        userId,
        stashPower: '0.00',
        usedCredit: '0.00',
        debtAmount: '0.00',
        ltv: '0.000000',
      });
      position = await this.creditRepo.save(position);
    }

    return position;
  }

  async prepareBorrow(
    userId: string,
    walletAddress: string,
    amount: string,
  ) {
    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check available credit
    const stashPowerResult = await this.calculateStashPower(userId);
    const borrowAmountUsd = Number(parsedAmount) / 10 ** 6; // USDC has 6 decimals

    if (borrowAmountUsd > stashPowerResult.availableCredit) {
      throw new BadRequestException(
        `Insufficient available credit. Available: ${stashPowerResult.availableCredit.toFixed(2)} USD, Requested: ${borrowAmountUsd.toFixed(2)} USD`,
      );
    }

    const data = encodeFunctionData({
      abi: CREDIT_ABI,
      functionName: 'borrow',
      args: [parsedAmount],
    });

    return {
      to: this.creditAddress,
      data,
    };
  }

  async confirmBorrow(
    userId: string,
    walletAddress: string,
    txHash: string,
    amount: string,
  ) {
    // Record transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: 'borrow' as const,
      txHash,
      status: 'confirmed',
      chainId: ARC_CHAIN_ID,
      confirmedAt: new Date(),
    });
    await this.transactionRepo.save(transaction);

    // Update credit position
    const position = await this.getOrCreateCreditPosition(userId);
    const borrowAmountUsd = Number(BigInt(amount)) / 10 ** 6;
    const currentUsedCredit = Number(position.usedCredit);
    const currentDebt = Number(position.debtAmount);

    position.usedCredit = (currentUsedCredit + borrowAmountUsd).toFixed(2);
    position.debtAmount = (currentDebt + borrowAmountUsd).toFixed(2);

    // Recalculate LTV
    const positions = await this.collateralRepo.find({
      where: { userId },
    });

    let totalCollateralUsd = 0;
    for (const collateral of positions) {
      const symbol = ASSET_SYMBOLS[collateral.assetAddress.toLowerCase()];
      if (!symbol) continue;
      const decimals = ASSET_DECIMALS[collateral.assetAddress.toLowerCase()];
      if (decimals === undefined) continue;
      const priceUsd = await this.oracleService.getPrice(symbol);
      const amt = Number(BigInt(collateral.amount)) / 10 ** decimals;
      totalCollateralUsd += amt * priceUsd;
    }

    const newDebt = currentDebt + borrowAmountUsd;
    const ltv = totalCollateralUsd > 0 ? newDebt / totalCollateralUsd : 0;
    position.ltv = ltv.toFixed(6);

    await this.creditRepo.save(position);

    return { position, transaction };
  }

  async prepareRepay(
    userId: string,
    walletAddress: string,
    amount: string,
  ) {
    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check debt exists
    const position = await this.getOrCreateCreditPosition(userId);
    const currentDebt = Number(position.debtAmount);
    if (currentDebt <= 0) {
      throw new BadRequestException('No outstanding debt to repay');
    }

    // Build repay tx data
    const data = encodeFunctionData({
      abi: CREDIT_ABI,
      functionName: 'repay',
      args: [parsedAmount],
    });

    // Build ERC20 approve tx for USDC
    const approvalData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [this.creditAddress, parsedAmount],
    });

    return {
      to: this.creditAddress,
      data,
      requiresApproval: true,
      approvalTo: USDC_ADDRESS,
      approvalData,
    };
  }

  async confirmRepay(
    userId: string,
    walletAddress: string,
    txHash: string,
    amount: string,
  ) {
    // Record transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: 'repay' as const,
      txHash,
      status: 'confirmed',
      chainId: ARC_CHAIN_ID,
      confirmedAt: new Date(),
    });
    await this.transactionRepo.save(transaction);

    // Create repayment entity
    const repayment = this.repaymentRepo.create({
      userId,
      amount,
      txHash,
      status: 'confirmed',
    });
    await this.repaymentRepo.save(repayment);

    // Update credit position
    const position = await this.getOrCreateCreditPosition(userId);
    const repayAmountUsd = Number(BigInt(amount)) / 10 ** 6;
    const currentUsedCredit = Number(position.usedCredit);
    const currentDebt = Number(position.debtAmount);

    position.usedCredit = Math.max(0, currentUsedCredit - repayAmountUsd).toFixed(2);
    position.debtAmount = Math.max(0, currentDebt - repayAmountUsd).toFixed(2);

    // Recalculate LTV
    const positions = await this.collateralRepo.find({
      where: { userId },
    });

    let totalCollateralUsd = 0;
    for (const collateral of positions) {
      const symbol = ASSET_SYMBOLS[collateral.assetAddress.toLowerCase()];
      if (!symbol) continue;
      const decimals = ASSET_DECIMALS[collateral.assetAddress.toLowerCase()];
      if (decimals === undefined) continue;
      const priceUsd = await this.oracleService.getPrice(symbol);
      const amt = Number(BigInt(collateral.amount)) / 10 ** decimals;
      totalCollateralUsd += amt * priceUsd;
    }

    const newDebt = Math.max(0, currentDebt - repayAmountUsd);
    const ltv = totalCollateralUsd > 0 ? newDebt / totalCollateralUsd : 0;
    position.ltv = ltv.toFixed(6);

    await this.creditRepo.save(position);

    return { position, repayment, transaction };
  }

  async getDebt(userId: string) {
    const position = await this.getOrCreateCreditPosition(userId);
    return {
      debtAmount: position.debtAmount,
      usedCredit: position.usedCredit,
      ltv: position.ltv,
    };
  }
}
