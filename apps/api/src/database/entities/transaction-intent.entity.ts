import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
export type IntentStatus = 'CREATED' | 'AWAITING_SIGNATURE' | 'SUBMITTED' | 'PENDING' | 'CONFIRMED' | 'USER_REJECTED' | 'FAILED' | 'REVERTED' | 'EXPIRED';
@Entity('transaction_intents')
@Index(['userId', 'status'])
export class TransactionIntent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar' }) walletAddress!: string;
  @Column({ type: 'int' }) chainId!: number;
  @Column({ type: 'varchar' }) type!: string;
  @Column({ type: 'varchar' }) to!: string;
  @Column({ type: 'text' }) data!: string;
  @Column({ type: 'varchar', default: '0' }) value!: string;
  @Column({ type: 'varchar', default: 'CREATED' }) status!: IntentStatus;
  @Column({ type: 'varchar', nullable: true }) txHash!: string | null;
  @Column({ type: 'timestamp' }) expiresAt!: Date;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
