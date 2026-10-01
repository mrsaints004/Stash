import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('oracle_prices')
export class OraclePrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  assetSymbol!: string;

  @Column({ type: 'varchar' })
  assetAddress!: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  priceUsd!: string;

  @Column({ type: 'varchar' })
  source!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
