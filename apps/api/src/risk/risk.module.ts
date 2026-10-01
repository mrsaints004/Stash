import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RiskSnapshot,
  CreditPosition,
  CollateralPosition,
} from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { OracleModule } from '../oracle/oracle.module';
import { CreditModule } from '../credit/credit.module';
import { CollateralModule } from '../collateral/collateral.module';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiskSnapshot, CreditPosition, CollateralPosition]),
    AuthModule,
    OracleModule,
    CreditModule,
    CollateralModule,
  ],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
