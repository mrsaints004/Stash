import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
@Entity('risk_alerts') @Index(['userId','createdAt'])
export class RiskAlert {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type:'uuid' }) userId!: string;
  @Column({ type:'varchar' }) level!: string;
  @Column({ type:'text' }) message!: string;
  @Column({ type:'jsonb' }) state!: Record<string,unknown>;
  @Column({ type:'timestamp',nullable:true }) readAt!: Date|null;
  @CreateDateColumn() createdAt!: Date;
}
