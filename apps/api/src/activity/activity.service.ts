import { Injectable } from '@nestjs/common';
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

    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return {
      transactions,
      total,
      limit: take,
      offset: skip,
    };
  }
}
