import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('credit_positions')
export class CreditPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  stashPower!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  usedCredit!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  debtAmount!: string;

  @Column({ type: 'decimal', precision: 8, scale: 6 })
  ltv!: string;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
