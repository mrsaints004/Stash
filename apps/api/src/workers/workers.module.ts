import { LiquidationExecutorService } from './liquidation-executor.service';
import { LiquidationJob } from '../database/entities/liquidation-job.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { CreditModule } from '../credit/credit.module';
import { RiskModule } from '../risk/risk.module';
import { Wallet,RiskAlert,IndexerState,Transaction,TradeExecution,TradePosition,User } from '../database/entities';
import { ChainIndexerService } from './chain-indexer.service';
import { MonitorService } from './monitor.service';
@Module({imports:[TypeOrmModule.forFeature([LiquidationJob,Wallet,RiskAlert,IndexerState,Transaction,TradeExecution,TradePosition,User]),BlockchainModule,CreditModule,RiskModule],providers:[ChainIndexerService,MonitorService,LiquidationExecutorService]})
export class WorkersModule{}
