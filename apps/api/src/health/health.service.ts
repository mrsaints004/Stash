import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import {RedisService} from '../redis/redis.module';

interface ServiceStatus {
  status: 'ok' | 'down';
  message?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    arcRpc: ServiceStatus;
    riskWorker: ServiceStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [database, redis, arcRpc, riskWorker] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkArcRpc(),
      this.checkRiskWorker(),
    ]);

    const services = { database, redis, arcRpc, riskWorker };
    const statuses = Object.values(services).map((s) => s.status);

    let status: 'ok' | 'degraded' | 'down';
    if (statuses.every((s) => s === 'ok')) {
      status = 'ok';
    } else if (statuses.every((s) => s === 'down')) {
      status = 'down';
    } else {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      services,
    };
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        return { status: 'ok' };
      }
      return { status: 'down', message: 'Database not initialized' };
    } catch (error) {
      return {
        status: 'down',
        message: 'Service unavailable',
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    try {
      await this.redisService.client.ping();
      return {status:'ok'};
    } catch {
      return {status:'down',message:'Redis unavailable'};
    }
  }

  private async checkRiskWorker(): Promise<ServiceStatus> {
    if(this.configService.get<string>('WORKERS_REQUIRED','false')!=='true')return {status:'ok',message:'Worker readiness check disabled'};
    try{const heartbeat=await this.redisService.client.get(`stash:worker:${this.configService.get<string>('CHAIN_ID','5042002')}`);return heartbeat?{status:'ok'}:{status:'down',message:'Risk worker heartbeat missing'};}catch{return{status:'down',message:'Worker heartbeat unavailable'};}
  }
  private async checkArcRpc(): Promise<ServiceStatus> {
    try {
      const block = await this.blockchainService.getClient().getBlock({blockTag:'latest'});
      if (Date.now()/1000-Number(block.timestamp)>60) return {status:'down',message:'RPC head is stale'};
      return { status: 'ok', message: `Block #${block.number}` };
    } catch (error) {
      return {
        status: 'down',
        message: 'Service unavailable',
      };
    }
  }
}
