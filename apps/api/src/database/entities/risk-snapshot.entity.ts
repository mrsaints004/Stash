import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('risk_snapshots')
export class RiskSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalCollateralUsd!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  totalDebtUsd!: string;

  @Column({ type: 'decimal', precision: 8, scale: 6 })
  ltv!: string;

  @Column({ type: 'varchar' })
  riskLevel!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
