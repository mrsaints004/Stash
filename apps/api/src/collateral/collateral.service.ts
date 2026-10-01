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
    const collateralInfo = SUPPORTED_COLLATERAL[normalizedAsset];
    if (!collateralInfo) {
      throw new BadRequestException(
        'Unsupported collateral asset. Only WETH and cirBTC are accepted.',
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

    return {
      to: this.vaultAddress,
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
    const collateralInfo = SUPPORTED_COLLATERAL[normalizedAsset];
    if (!collateralInfo) {
      throw new BadRequestException('Unsupported collateral asset');
    }

    // Record transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: 'deposit',
      txHash,
      status: 'confirmed',
      chainId: ARC_CHAIN_ID,
      confirmedAt: new Date(),
    });
    await this.transactionRepo.save(transaction);

    // Update or create collateral position
    let position = await this.collateralRepo.findOne({
      where: { userId, assetAddress: normalizedAsset },
    });

    if (position) {
      const currentAmount = BigInt(position.amount);
      const depositAmount = BigInt(amount);
      position.amount = (currentAmount + depositAmount).toString();
      position.walletAddress = walletAddress;
    } else {
      position = this.collateralRepo.create({
        userId,
        walletAddress,
        assetSymbol: collateralInfo.symbol,
        assetAddress: normalizedAsset,
        amount,
        usdValue: '0.00',
      });
    }

    await this.collateralRepo.save(position);

    return { position, transaction };
  }

  async prepareWithdraw(
    userId: string,
    _walletAddress: string,
    assetAddress: string,
    amount: string,
  ) {
    const normalizedAsset = assetAddress.toLowerCase();
    const collateralInfo = SUPPORTED_COLLATERAL[normalizedAsset];
    if (!collateralInfo) {
      throw new BadRequestException('Unsupported collateral asset');
    }

    const parsedAmount = BigInt(amount);
    if (parsedAmount <= 0n) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check user has enough collateral
    const position = await this.collateralRepo.findOne({
      where: { userId, assetAddress: normalizedAsset },
    });

    if (!position) {
      throw new NotFoundException('No collateral position found for this asset');
    }

    const currentAmount = BigInt(position.amount);
    if (currentAmount < parsedAmount) {
      throw new BadRequestException(
        'Insufficient collateral balance for withdrawal',
      );
    }

    // Check LTV won't breach after withdrawal
    // Get all positions for user to calculate total collateral
    const allPositions = await this.collateralRepo.find({
      where: { userId },
    });

    const remainingUsdAfterWithdraw = allPositions.reduce((total, pos) => {
      if (pos.assetAddress === normalizedAsset) {
        // For the asset being withdrawn, calculate reduced value
        const remaining = currentAmount - parsedAmount;
        if (remaining === 0n) return total;
        const ratio =
          Number(remaining) / Number(currentAmount);
        return total + Number(pos.usdValue) * ratio;
      }
      return total + Number(pos.usdValue);
    }, 0);

    // Check if there's any debt that would cause LTV breach
    const debt = await this.creditService.getDebt(userId);
    const debtAmount = Number(debt.debtAmount);

    if (debtAmount > 0 && remainingUsdAfterWithdraw > 0) {
      const projectedLtv = debtAmount / remainingUsdAfterWithdraw;
      if (projectedLtv > LTV_MAX) {
        throw new BadRequestException('Withdrawal would breach LTV limit');
      }
    } else if (debtAmount > 0 && remainingUsdAfterWithdraw <= 0) {
      throw new BadRequestException('Withdrawal would breach LTV limit');
    }

    if (remainingUsdAfterWithdraw < 0) {
      throw new BadRequestException(
        'Withdrawal would result in negative collateral',
      );
    }

    const maxBorrowable = remainingUsdAfterWithdraw * LTV_MAX;

    const withdrawData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [assetAddress as Address, parsedAmount],
    });

    return {
      to: this.vaultAddress,
      data: withdrawData,
      maxBorrowableAfterWithdraw: maxBorrowable.toFixed(2),
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
    const collateralInfo = SUPPORTED_COLLATERAL[normalizedAsset];
    if (!collateralInfo) {
      throw new BadRequestException('Unsupported collateral asset');
    }

    // Record transaction
    const transaction = this.transactionRepo.create({
      userId,
      type: 'withdraw',
      txHash,
      status: 'confirmed',
      chainId: ARC_CHAIN_ID,
      confirmedAt: new Date(),
    });
    await this.transactionRepo.save(transaction);

    // Update collateral position
    const position = await this.collateralRepo.findOne({
      where: { userId, assetAddress: normalizedAsset },
    });

    if (!position) {
      throw new NotFoundException('No collateral position found for this asset');
    }

    const currentAmount = BigInt(position.amount);
    const withdrawAmount = BigInt(amount);
    const remaining = currentAmount - withdrawAmount;

    if (remaining < 0n) {
      throw new BadRequestException('Withdraw amount exceeds position balance');
    }

    position.amount = remaining.toString();
    position.walletAddress = walletAddress;
    await this.collateralRepo.save(position);

    return { position, transaction };
  }

  async getPositions(userId: string) {
    return this.collateralRepo.find({
      where: { userId },
    });
  }

  async getPositionsForUser(userId: string): Promise<CollateralPosition[]> {
    return this.collateralRepo.find({
      where: { userId },
    });
  }
}
