import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../database/entities';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  async getActivity(userId: string, limit?: number, offset?: number) {
    const take = limit ?? 20;
    const skip = offset ?? 0;
    if (!Number.isInteger(take) || take < 1 || take > 100 || !Number.isInteger(skip) || skip < 0) throw new BadRequestException('Invalid activity pagination');

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return {
      items: transactions.map(tx => ({ ...tx, description: `${tx.type[0].toUpperCase()}${tx.type.slice(1)} transaction`, amount: null, symbol: null })),
      total,
      limit: take,
      offset: skip,
    };
  }
}
