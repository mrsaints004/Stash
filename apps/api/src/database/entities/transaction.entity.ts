import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('transactions')
@Index(['chainId', 'txHash'], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  type!: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'trade' | 'liquidation';

  @Column({ type: 'varchar' })
  txHash!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'int' })
  chainId!: number;

  @Column({ type: 'bigint', nullable: true }) blockNumber!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
