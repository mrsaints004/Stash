import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('collateral_positions')
export class CollateralPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  walletAddress!: string;

  @Column({ type: 'varchar' })
  assetSymbol!: string;

  @Column({ type: 'varchar' })
  assetAddress!: string;

  @Column({ type: 'varchar' })
  amount!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  usdValue!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
