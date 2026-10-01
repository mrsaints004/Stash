import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { CollateralModule } from './collateral/collateral.module';
import { OracleModule } from './oracle/oracle.module';
import { CreditModule } from './credit/credit.module';
import { TradeModule } from './trade/trade.module';
import { RiskModule } from './risk/risk.module';
import { ActivityModule } from './activity/activity.module';
import { databaseConfigFactory } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfigFactory,
    }),
    HealthModule,
    AuthModule,
    UserModule,
    PortfolioModule,
    BlockchainModule,
    CollateralModule,
    OracleModule,
    CreditModule,
    TradeModule,
    RiskModule,
    ActivityModule,
  ],
})
export class AppModule {}
