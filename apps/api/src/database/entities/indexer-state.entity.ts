import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';
@Entity('indexer_state')
export class IndexerState {
  @PrimaryColumn({ type:'varchar' }) key!: string;
  @Column({ type:'bigint' }) blockNumber!: string;
  @Column({ type:'varchar' }) blockHash!: string;
  @Column({ type:'jsonb', default:()=>"'[]'::jsonb" }) checkpoints!: { number:string; hash:string }[];
  @UpdateDateColumn() updatedAt!: Date;
}
