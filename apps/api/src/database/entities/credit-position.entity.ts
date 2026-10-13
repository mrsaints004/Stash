import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('credit_positions')
@Index(['userId'], { unique: true })
export class CreditPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'decimal', precision: 24, scale: 6 })
  stashPower!: string;

  @Column({ type: 'decimal', precision: 24, scale: 6 })
  usedCredit!: string;

  @Column({ type: 'decimal', precision: 24, scale: 6 })
  debtAmount!: string;

  @Column({ type: 'decimal', precision: 8, scale: 6 })
  ltv!: string;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
