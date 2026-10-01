import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OraclePrice } from '../database/entities';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { OracleService } from './oracle.service';
import { OracleController } from './oracle.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OraclePrice]),
    BlockchainModule,
  ],
  controllers: [OracleController],
  providers: [OracleService],
  exports: [OracleService],
})
export class OracleModule {}
