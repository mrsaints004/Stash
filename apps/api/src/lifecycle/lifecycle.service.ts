import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { type Address, type Hash } from 'viem';
import { TransactionIntent } from '../database/entities/transaction-intent.entity';
import { Transaction } from '../database/entities';
import { BlockchainService } from '../blockchain/blockchain.service';
@Injectable()
export class LifecycleService {
  constructor(@InjectRepository(TransactionIntent) private readonly repo: Repository<TransactionIntent>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    private readonly config: ConfigService, private readonly blockchain: BlockchainService) {}
  async prepare(userId: string, wallet: string, type: string, transaction: { to: string; data: string; value?: string }, expiresAt?: Date) {
    const intent = await this.repo.save(this.repo.create({ userId, walletAddress: wallet.toLowerCase(), type,
      chainId: Number(this.config.get<string>('CHAIN_ID', '5042002')), to: transaction.to.toLowerCase(), data: transaction.data.toLowerCase(),
      value: transaction.value ?? '0', status: 'CREATED', expiresAt: expiresAt ?? new Date(Date.now()+600000) }));
    return intent.id;
  }
  async get(userId: string, id: string) {
    const intent = await this.repo.findOne({ where: { userId, id } });
    if (!intent) throw new NotFoundException('Transaction intent not found'); return intent;
  }
  async awaitingSignature(userId: string, id: string) {
    const result = await this.repo.update({ id, userId, status: 'CREATED' }, { status: 'AWAITING_SIGNATURE' });
    if (!result.affected) throw new BadRequestException('Transaction is no longer awaiting a signature'); return this.get(userId,id);
  }
  async rejected(userId: string, id: string) {
    await this.repo.update({ id, userId, status: 'AWAITING_SIGNATURE' }, { status: 'USER_REJECTED' }); return this.get(userId,id);
  }
  async submit(userId: string, id: string, hash: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new BadRequestException('Invalid transaction hash');
    const intent = await this.get(userId,id);
    if (intent.txHash && intent.txHash.toLowerCase()!==hash.toLowerCase()) throw new BadRequestException('Intent already has a different transaction');
    const tx = await this.blockchain.getClient().getTransaction({ hash: hash as Hash });
    if (tx.from.toLowerCase()!==intent.walletAddress || tx.to?.toLowerCase()!==intent.to ||
      tx.input.toLowerCase()!==intent.data || tx.value.toString()!==intent.value) throw new BadRequestException('Transaction does not match the prepared wallet action');
    // A valid mined/submitted transaction must be tracked even if its preparation window has since elapsed.
    if (intent.txHash && ['CONFIRMED','REVERTED'].includes(intent.status)) return intent;
    intent.txHash=hash.toLowerCase(); intent.status='SUBMITTED'; await this.repo.save(intent);
    return this.refresh(intent);
  }
  async refresh(intent: TransactionIntent) {
    if (!intent.txHash) {
      if (intent.expiresAt.getTime()<Date.now() && ['CREATED','AWAITING_SIGNATURE'].includes(intent.status)) {
        intent.status='EXPIRED'; await this.repo.save(intent);
      }
      return intent;
    }
    if (['CONFIRMED','REVERTED'].includes(intent.status)) return intent;
    const client=this.blockchain.getClient();
    let receipt;
    try { receipt=await client.getTransactionReceipt({ hash:intent.txHash as Hash }); }
    catch { if(intent.status!=='PENDING') { intent.status='PENDING'; await this.repo.save(intent); } return intent; }
    const depth=Number(this.config.get<string>('TX_CONFIRMATIONS','2'));
    if (await client.getBlockNumber()<receipt.blockNumber+BigInt(depth-1)) { intent.status='PENDING'; }
    else { intent.status=receipt.status==='success'?'CONFIRMED':'REVERTED'; }
    await this.repo.save(intent);
    if (intent.status==='CONFIRMED' && intent.txHash) {
      const existing = await this.txRepo.findOne({ where: { txHash: intent.txHash, chainId: intent.chainId } });
      if (!existing) await this.txRepo.save(this.txRepo.create({ userId: intent.userId, txHash: intent.txHash,
        type: intent.type as Transaction['type'], chainId: intent.chainId, status: 'confirmed', confirmedAt: new Date() }));
    }
    return intent;
  }
  async pending() { return this.repo.find({ where: [{ status:'SUBMITTED' },{ status:'PENDING' }], take:100, order:{ createdAt:'ASC' } }); }
  async list(userId: string) { return this.repo.find({where:{userId},order:{createdAt:'DESC'},take:100}); }
}
