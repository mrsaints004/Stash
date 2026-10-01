import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('chains')
export class Chain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int', unique: true })
  chainId!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  rpcUrl!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
