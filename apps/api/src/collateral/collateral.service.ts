import { LifecycleService } from '../lifecycle/lifecycle.service';
import { ProtocolService } from '../protocol/protocol.service';
import { PROTOCOL_EVENTS } from '../blockchain/events';
import { recordConfirmedAction } from '../blockchain/confirmed-action';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { encodeFunctionData, type Address } from 'viem';
import { CollateralPosition, Transaction } from '../database/entities';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CreditService } from '../credit/credit.service';

const WETH_ADDRESS = '0x128cC466B61f542da60c70e3aA11c10e19B84EDB';
const CIRBTC_ADDRESS = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';
const ARC_CHAIN_ID = 5042002;
const LTV_MAX = 0.75;

const SUPPORTED_COLLATERAL: Record<string, { symbol: string; decimals: number }> = {
  [WETH_ADDRESS.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
  [CIRBTC_ADDRESS.toLowerCase()]: { symbol: 'cirBTC', decimals: 8 },
};

const VAULT_ABI = [
  {
    type: 'function' as const,
    name: 'deposit' as const,
    inputs: [
      { name: 'asset' as const, type: 'address' as const },
      { name: 'amount' as const, type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'withdraw' as const,
    inputs: [
      { name: 'asset' as const, type: 'address' as const },
      { name: 'amount' as const, type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'balanceOf' as const,
    inputs: [
      { name: 'user' as const, type: 'address' as const },
      { name: 'asset' as const, type: 'address' as const },
    ],
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
  {
    type: 'function' as const,
    name: 'allowance' as const,
    inputs: [
      { name: 'owner' as const, type: 'address' as const },
      { name: 'spender' as const, type: 'address' as const },
    ],
    outputs: [{ name: '' as const, type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
] as const;

@Injectable()
export class CollateralService {
  private readonly vaultAddress: Address;

  constructor(
    @InjectRepository(CollateralPosition)
    private readonly collateralRepo: Repository<CollateralPosition>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
    private readonly creditService: CreditService,
    private readonly protocol: ProtocolService,
    private readonly lifecycle: LifecycleService,
  ) {
    this.vaultAddress = this.configService.get<string>(
      'STASH_VAULT_ADDRESS',
      '0x0000000000000000000000000000000000000000',
    ) as Address;
  }

  async prepareDeposit(
    userId: string,
    walletAddress: string,
    assetAddress: string,
    amount: string,
  ) {
    const normalizedAsset = assetAddress.toLowerCase();
    const collateralInfo = (await this.protocol.configuration()).assets.find(asset => asset.address.toLowerCase() === normalizedAsset);
    if (!collateralInfo || !collateralInfo.depositsEnabled) {
      throw new BadRequestException(
        'Unsupported collateral asset',
      );
    }

    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const depositData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [assetAddress as Address, parsedAmount],
    });

    const approvalData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [this.vaultAddress, parsedAmount],
    });

    // Check current allowance to determine if approval is needed
    let requiresApproval = true;
    try {
      const client = this.blockchainService.getClient();
      const allowance = await client.readContract({
        address: assetAddress as Address,
        abi: ERC20_APPROVE_ABI,
        functionName: 'allowance',
        args: [walletAddress as Address, this.vaultAddress],
      });
      requiresApproval = allowance < parsedAmount;
    } catch {
      // If allowance check fails, assume approval is required
      requiresApproval = true;
    }

    const intentId = await this.lifecycle.prepare(userId, walletAddress, 'deposit', { to: this.vaultAddress, data: depositData });
    return {
      intentId,
      vaultAddress: this.vaultAddress,
      to: this.vaultAddress,
      calldata: depositData,
      data: depositData,
      requiresApproval,
      approvalTo: assetAddress,
      approvalData,
    };
  }

  async confirmDeposit(
    userId: string,
    walletAddress: string,
    txHash: string,
    assetAddress: string,
    amount: string,
  ) {
    const normalizedAsset = assetAddress.toLowerCase();
    const info = (await this.protocol.configuration()).assets.find(asset => asset.address.toLowerCase() === normalizedAsset);
    if (!info) throw new BadRequestException('Unsupported collateral asset');
    await this.blockchainService.verifyEvent(txHash, walletAddress, this.vaultAddress,
      PROTOCOL_EVENTS, 'Deposited', { user: walletAddress, asset: assetAddress, amount });
    return recordConfirmedAction(this.transactionRepo, userId, txHash, 'deposit', Number(this.configService.get<string>('CHAIN_ID', '5042002')), async manager => {
      const repo = manager.getRepository(CollateralPosition);
      let position = await repo.findOne({ where: { userId, assetAddress: normalizedAsset } });
      if (!position) position = repo.create({ userId, walletAddress, assetSymbol: info.symbol,
        assetAddress: normalizedAsset, amount: '0', usdValue: '0.00' });
      const next = await this.blockchainService.getClient().readContract({ address: this.vaultAddress, abi: VAULT_ABI, functionName: 'balanceOf', args: [walletAddress as Address, assetAddress as Address] });
      position.amount = next.toString();
      position.walletAddress = walletAddress;
      await repo.save(position);
      return { position };
    });
  }

  async prepareWithdraw(
    userId: string,
    walletAddress: string,
    assetAddress: string,
    amount: string,
  ) {
    const normalizedAsset = assetAddress.toLowerCase();
    const collateralInfo = (await this.protocol.configuration()).assets.find(asset => asset.address.toLowerCase() === normalizedAsset);
    if (!collateralInfo) {
      throw new BadRequestException('Unsupported collateral asset');
    }

    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const client = this.blockchainService.getClient();
    const balance = await client.readContract({ address: this.vaultAddress, abi: VAULT_ABI,
      functionName: 'balanceOf', args: [walletAddress as Address, assetAddress as Address] });
    if (parsedAmount > balance) throw new BadRequestException('Insufficient collateral balance for withdrawal');
    await client.simulateContract({ address: this.vaultAddress, abi: VAULT_ABI,
      functionName: 'withdraw', args: [assetAddress as Address, parsedAmount], account: walletAddress as Address });

    const withdrawData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [assetAddress as Address, parsedAmount],
    });

    const intentId = await this.lifecycle.prepare(userId, walletAddress, 'withdraw', { to: this.vaultAddress, data: withdrawData });
    return {
      intentId,
      vaultAddress: this.vaultAddress,
      to: this.vaultAddress,
      calldata: withdrawData,
      data: withdrawData,
    };
  }

  async confirmWithdraw(
    userId: string,
    walletAddress: string,
    txHash: string,
    assetAddress: string,
    amount: string,
  ) {
    const normalizedAsset = assetAddress.toLowerCase();
    const info = (await this.protocol.configuration()).assets.find(asset => asset.address.toLowerCase() === normalizedAsset);
    if (!info) throw new BadRequestException('Unsupported collateral asset');
    await this.blockchainService.verifyEvent(txHash, walletAddress, this.vaultAddress,
      PROTOCOL_EVENTS, 'Withdrawn', { user: walletAddress, asset: assetAddress, amount });
    return recordConfirmedAction(this.transactionRepo, userId, txHash, 'withdraw', Number(this.configService.get<string>('CHAIN_ID', '5042002')), async manager => {
      const repo = manager.getRepository(CollateralPosition);
      let position = await repo.findOne({ where: { userId, assetAddress: normalizedAsset } });
      if (!position) position = repo.create({ userId, walletAddress, assetSymbol: info.symbol,
        assetAddress: normalizedAsset, amount: '0', usdValue: '0.00' });
      const next = await this.blockchainService.getClient().readContract({ address: this.vaultAddress, abi: VAULT_ABI, functionName: 'balanceOf', args: [walletAddress as Address, assetAddress as Address] });
      position.amount = next.toString();
      position.walletAddress = walletAddress;
      await repo.save(position);
      return { position };
    });
  }

  async getPositions(userId: string) {
    return (await this.creditService.calculateStashPower(userId)).collateralPositions;
  }
  async getPositionsForUser(userId: string) { return this.getPositions(userId); }
}
