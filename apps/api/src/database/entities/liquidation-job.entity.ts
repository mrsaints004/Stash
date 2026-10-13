import { Entity,PrimaryGeneratedColumn,Column,CreateDateColumn,UpdateDateColumn,Index } from 'typeorm';
@Entity('liquidation_jobs') @Index(['userId','status'])
export class LiquidationJob{
  @PrimaryGeneratedColumn('uuid')id!:string;
  @Column({type:'uuid'})userId!:string;
  @Column({type:'varchar'})walletAddress!:string;
  @Column({type:'varchar'})assetAddress!:string;
  @Column({type:'varchar',default:'QUEUED'})status!:string;
  @Column({type:'jsonb',nullable:true})transaction!:Record<string,string>|null;
  @Column({type:'varchar',nullable:true})txHash!:string|null;
  @Column({type:'text',nullable:true})error!:string|null;
  @CreateDateColumn()createdAt!:Date;
  @UpdateDateColumn()updatedAt!:Date;
}
