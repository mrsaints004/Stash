import {AdminModule} from './admin/admin.module';
import { RedisModule } from './redis/redis.module';
import { WorkersModule } from './workers/workers.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { ProtocolModule } from './protocol/protocol.module';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './config/rate-limit.guard';
import { validateEnvironment } from './config/environment';
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
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfigFactory,
    }),
    HealthModule,
    RedisModule,
    AuthModule,
    UserModule,
    PortfolioModule,
    ProtocolModule,
    LifecycleModule,
    BlockchainModule,
    CollateralModule,
    OracleModule,
    CreditModule,
    TradeModule,
    RiskModule,
    WorkersModule,
    ActivityModule,
    AdminModule,
  ],
})
export class AppModule {}
