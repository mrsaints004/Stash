import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from '../database/entities';

/** Serialize accounting per user and hash; commit the receipt and positions together. */
export async function recordConfirmedAction(
  repository: Repository<Transaction>, userId: string, txHash: string,
  type: Transaction['type'], chainId: number,
  apply: (manager: EntityManager) => Promise<Record<string, unknown>>,
) {
  const normalizedHash = txHash.toLowerCase();
  return repository.manager.transaction(async manager => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`receipt:${chainId}:${normalizedHash}`]);
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`position:${userId}`]);
    const transactions = manager.getRepository(Transaction);
    const existing = await transactions.findOne({ where: { txHash: normalizedHash, chainId } });
    if (existing) {
      if (existing.userId !== userId || existing.type !== type) throw new BadRequestException('Transaction already recorded for a different action');
      if (existing.status === 'confirmed') return { transaction: existing, replayed: true };
    }
    const result = await apply(manager);
    const transaction = await transactions.save(transactions.create({ ...(existing ? { id: existing.id } : {}), userId, txHash: normalizedHash,
      type, chainId, status: 'confirmed', confirmedAt: new Date() }));
    return { ...result, transaction };
  });
}
