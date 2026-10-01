import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TradePosition,
  TradeExecution,
  Transaction,
} from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { CreditModule } from '../credit/credit.module';
import { OracleModule } from '../oracle/oracle.module';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradePosition, TradeExecution, Transaction]),
    AuthModule,
    BlockchainModule,
    CreditModule,
    OracleModule,
  ],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
