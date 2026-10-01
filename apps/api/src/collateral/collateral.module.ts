import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollateralPosition, Transaction } from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { CreditModule } from '../credit/credit.module';
import { CollateralController } from './collateral.controller';
import { CollateralService } from './collateral.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollateralPosition, Transaction]),
    AuthModule,
    BlockchainModule,
    CreditModule,
  ],
  controllers: [CollateralController],
  providers: [CollateralService],
  exports: [CollateralService],
})
export class CollateralModule {}
