import { BlockchainModule } from '../blockchain/blockchain.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CollateralPosition,
  Wallet,
  CreditPosition,
  Transaction,
  Repayment,
} from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { OracleModule } from '../oracle/oracle.module';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      CreditPosition,
      CollateralPosition,
      Transaction,
      Repayment,
    ]),
    BlockchainModule,
    AuthModule,
    OracleModule,
  ],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
