import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  type!: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'trade';

  @Column({ type: 'varchar' })
  txHash!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'int' })
  chainId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
