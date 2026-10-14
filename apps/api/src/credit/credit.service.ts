import { LifecycleService } from '../lifecycle/lifecycle.service';
import { ProtocolService } from '../protocol/protocol.service';
import { VAULT_V2_ABI, CREDIT_V2_ABI } from '../config/protocol.config';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PROTOCOL_EVENTS } from '../blockchain/events';
import { recordConfirmedAction } from '../blockchain/confirmed-action';
import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { encodeFunctionData, parseAbi, type Address } from 'viem';
import {
  Wallet,
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
  debtUsd: number;
  liquidationThreshold: number;
  healthFactor: string;
  liquidationDistance: number | null;
  collateralPositions: { assetSymbol: string; assetAddress: string; amount: string; usdValue: string; collateralFactorBps: number }[];
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
    private readonly blockchainService: BlockchainService,
    private readonly protocol: ProtocolService,
    private readonly lifecycle: LifecycleService,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
  ) {
    this.creditAddress = this.configService.get<string>(
      'STASH_CREDIT_ADDRESS',
      '0x0000000000000000000000000000000000000000',
    ) as Address;
  }

  async calculateStashPower(userId: string): Promise<StashPowerResult> {
    const wallet = await this.walletRepo.findOne({ where: { userId, isPrimary: true } });
    if (!wallet) throw new BadRequestException('No primary wallet found');
    const client = this.blockchainService.getClient();
    const vault = this.configService.getOrThrow<string>('STASH_VAULT_ADDRESS') as Address;
    const configuration = await this.protocol.configuration();
    let totalCollateralUsd = 0;
    const collateralPositions: StashPowerResult['collateralPositions'] = [];
    for (const asset of configuration.assets) {
      const balance = await client.readContract({ address: vault, abi: VAULT_V2_ABI,
        functionName: 'balanceOf', args: [wallet.address as Address, asset.address] });
      if (balance === 0n) continue;
      const price = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'priceUsd6', args: [asset.address] });
      const usdValue = Number(balance) / 10 ** asset.decimals * Number(price) / 1e6;
      totalCollateralUsd += usdValue;
      collateralPositions.push({ assetSymbol: asset.symbol, assetAddress: asset.address, amount: balance.toString(),
        usdValue: usdValue.toFixed(2), collateralFactorBps: asset.collateralFactorBps });
    }
    const lendingHealth = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'lendingHealth', args: [wallet.address as Address] });
    const [chainDebt, capacity] = await Promise.all([
      client.readContract({ address: this.creditAddress, abi: CREDIT_ABI, functionName: 'debtOf', args: [wallet.address as Address] }),
      client.readContract({ address: vault, abi: parseAbi(['function borrowingCapacity(address user) view returns (uint256)']), functionName: 'borrowingCapacity', args: [wallet.address as Address] }),
    ]);
    const debtAmount = Number(chainDebt) / 1e6;
    const usdcPrice = chainDebt === 0n ? 1000000n : await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'priceUsd6', args: [configuration.usdc.address] });
    const debtUsd = debtAmount * Number(usdcPrice) / 1e6;
    const usedCredit = debtAmount;
    const [maximumCredit, available] = await Promise.all([
      client.readContract({ address: this.creditAddress, abi: CREDIT_V2_ABI, functionName: 'maximumCredit' }),
      client.readContract({ address: this.creditAddress, abi: CREDIT_V2_ABI, functionName: 'availableCredit', args: [wallet.address as Address] }),
    ]);
    const stashPower = Number(capacity < maximumCredit ? capacity : maximumCredit) / 1e6;
    const availableCredit = Number(available) / 1e6;

    // Current LTV = debt / totalCollateral (0 if no collateral)
    const ltv = totalCollateralUsd > 0 ? debtUsd / totalCollateralUsd : (debtAmount > 0 ? 1 : 0);

    // Update credit position in DB
    const updatedPosition = await this.getOrCreateCreditPosition(userId);
    updatedPosition.stashPower = stashPower.toFixed(2);
    updatedPosition.usedCredit = usedCredit.toFixed(6);
    updatedPosition.debtAmount = debtAmount.toFixed(6);
    updatedPosition.ltv = ltv.toFixed(6);
    await this.creditRepo.save(updatedPosition);

    return {
      totalCollateralUsd,
      stashPower,
      usedCredit,
      availableCredit,
      ltv,
      debtAmount,
      debtUsd,
      liquidationThreshold: Number(lendingHealth[3]) / 10000,
      healthFactor: lendingHealth[5].toString(),
      liquidationDistance: debtAmount === 0 ? null : Math.max(0, 1 - 1 / (Number(lendingHealth[5]) / 1e18)),
      collateralPositions,
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

    await this.blockchainService.getClient().simulateContract({
      address: this.creditAddress, abi: CREDIT_ABI,
      functionName: 'borrow', args: [parsedAmount], account: walletAddress as Address,
    });
    const intentId = await this.lifecycle.prepare(userId, walletAddress, 'borrow', { to: this.creditAddress, data });
    return { data: {
      intentId,
      creditAddress: this.creditAddress,
      amount,
      calldata: data,
      to: this.creditAddress,
      data,
    } };
  }

  async confirmBorrow(
    userId: string,
    walletAddress: string,
    txHash: string,
    amount: string,
  ) {
    const args = await this.blockchainService.verifyEvent(txHash, walletAddress, this.creditAddress,
      PROTOCOL_EVENTS, 'Borrowed', { user: walletAddress, amount });
    const actualAmount = BigInt(String(args.amount));
    return recordConfirmedAction(this.transactionRepo, userId, txHash, 'borrow', Number(this.configService.get<string>('CHAIN_ID', '5042002')), async manager => {
      const repo = manager.getRepository(CreditPosition);
      let position = await repo.findOne({ where: { userId } });
      if (!position) position = repo.create({ userId, stashPower: '0', usedCredit: '0', debtAmount: '0', ltv: '0' });
      // Read authoritative debt; interest accounting belongs to the lending adapter.
      const debt = await this.blockchainService.getClient().readContract({
        address: this.creditAddress, abi: CREDIT_ABI, functionName: 'debtOf', args: [walletAddress as Address],
      });
      position.debtAmount = (Number(debt) / 1e6).toFixed(6);
      position.usedCredit = position.debtAmount;
      await repo.save(position);

      return { position };
    });
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
    const currentDebt = Number((await this.getDebt(userId)).debtUsd);
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

    const intentId = await this.lifecycle.prepare(userId, walletAddress, 'repay', { to: this.creditAddress, data });
    return { data: {
      intentId,
      creditAddress: this.creditAddress,
      amount,
      calldata: data,
      to: this.creditAddress,
      data,
      requiresApproval: true,
      approvalTo: (await this.protocol.configuration()).usdc.address,
      approvalData,
    } };
  }

  async confirmRepay(
    userId: string,
    walletAddress: string,
    txHash: string,
    amount: string,
  ) {
    const args = await this.blockchainService.verifyEvent(txHash, walletAddress, this.creditAddress,
      PROTOCOL_EVENTS, 'Repaid', { user: walletAddress });
    const actualAmount = BigInt(String(args.amount));
    return recordConfirmedAction(this.transactionRepo, userId, txHash, 'repay', Number(this.configService.get<string>('CHAIN_ID', '5042002')), async manager => {
      const repo = manager.getRepository(CreditPosition);
      let position = await repo.findOne({ where: { userId } });
      if (!position) position = repo.create({ userId, stashPower: '0', usedCredit: '0', debtAmount: '0', ltv: '0' });
      // Read authoritative debt; interest accounting belongs to the lending adapter.
      const debt = await this.blockchainService.getClient().readContract({
        address: this.creditAddress, abi: CREDIT_ABI, functionName: 'debtOf', args: [walletAddress as Address],
      });
      position.debtAmount = (Number(debt) / 1e6).toFixed(6);
      position.usedCredit = position.debtAmount;
      await repo.save(position);
      const repayments = manager.getRepository(Repayment); await repayments.save(repayments.create({ userId, amount: actualAmount.toString(), txHash: txHash.toLowerCase(), status: 'confirmed' }));
      return { position };
    });
  }

  async getDebt(userId: string) {
    const wallet = await this.walletRepo.findOne({ where: { userId, isPrimary: true } });
    if (!wallet) throw new BadRequestException('No primary wallet found');
    const debt = await this.blockchainService.getClient().readContract({
      address: this.creditAddress, abi: CREDIT_ABI, functionName: 'debtOf', args: [wallet.address as Address],
    });
    return { debtAmount: debt.toString(), debtUsd: (Number(debt) / 1e6).toFixed(6) };
  }
}
