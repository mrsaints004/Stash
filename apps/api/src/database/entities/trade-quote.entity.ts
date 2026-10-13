import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
@Entity('trade_quotes')
@Index(['userId', 'expiresAt'])
export class TradeQuoteRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar' }) walletAddress!: string;
  @Column({ type: 'int' }) chainId!: number;
  @Column({ type: 'jsonb' }) payload!: Record<string, any>;
  @Column({ type: 'timestamp' }) expiresAt!: Date;
  @CreateDateColumn() createdAt!: Date;
}
