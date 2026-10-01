import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BlockchainService } from '../blockchain/blockchain.service';
import Redis from 'ioredis';

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
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [database, redis, arcRpc] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkArcRpc(),
    ]);

    const services = { database, redis, arcRpc };
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
        return { status: 'ok' };
      }
      return { status: 'down', message: 'Database not initialized' };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    const redis = new Redis({
      host,
      port,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      await redis.ping();
      await redis.quit();
      return { status: 'ok' };
    } catch (error) {
      try {
        await redis.disconnect();
      } catch {
        // ignore cleanup errors
      }
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkArcRpc(): Promise<ServiceStatus> {
    try {
      const blockNumber = await this.blockchainService.getBlockNumber();
      return { status: 'ok', message: `Block #${blockNumber}` };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
