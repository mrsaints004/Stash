import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CollateralPosition,
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
      CreditPosition,
      CollateralPosition,
      Transaction,
      Repayment,
    ]),
    AuthModule,
    OracleModule,
  ],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
