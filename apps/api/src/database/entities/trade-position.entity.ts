import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('trade_positions')
export class TradePosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  tokenIn!: string;

  @Column({ type: 'varchar' })
  tokenOut!: string;

  @Column({ type: 'varchar' })
  amountIn!: string;

  @Column({ type: 'varchar' })
  amountOut!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
