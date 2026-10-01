import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TradePosition } from './trade-position.entity';

@Entity('trade_executions')
export class TradeExecution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tradePositionId!: string;

  @Column({ type: 'varchar', nullable: true })
  txHash!: string | null;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  gasUsed!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt!: Date | null;

  @ManyToOne(() => TradePosition)
  @JoinColumn({ name: 'tradePositionId' })
  tradePosition!: TradePosition;
}
