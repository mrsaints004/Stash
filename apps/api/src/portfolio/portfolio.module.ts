import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollateralPosition } from '../database/entities';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { AuthModule } from '../auth/auth.module';
import { CollateralModule } from '../collateral/collateral.module';
import { CreditModule } from '../credit/credit.module';
import { OracleModule } from '../oracle/oracle.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollateralPosition]),
    AuthModule,
    CollateralModule,
    CreditModule,
    OracleModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
