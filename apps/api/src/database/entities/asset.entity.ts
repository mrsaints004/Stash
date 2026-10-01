import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  symbol!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  address!: string;

  @Column({ type: 'int' })
  decimals!: number;

  @Column({ type: 'boolean' })
  isCollateral!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
