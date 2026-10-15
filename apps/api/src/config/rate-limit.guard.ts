import { CanActivate, ExecutionContext, HttpException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const INCREMENT = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n`;

/** Shared across replicas; forwarded IP headers are not trusted by this guard. */
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly redis: Redis;
  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    const options = { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: () => null };
    this.redis = url ? new Redis(url, options) : new Redis({ ...options,
      host: config.get<string>('REDIS_HOST', 'localhost'), port: Number(config.get<string>('REDIS_PORT', '6379')),
      password: config.get<string>('REDIS_PASSWORD'),
    });
    this.redis.on('error', () => {});
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ ip: string; path: string; method: string }>();
    if (request.method === 'GET' && ['/health','/health/live'].includes(request.path)) return true;
    const auth = request.path.startsWith('/auth/');
    let count: number;
    try {
      count = Number(await this.redis.eval(INCREMENT, 1, `stash:rate:${auth ? 'auth' : 'api'}:${request.ip}`, '60'));
    } catch {
      return true;
    }
    if (count > (auth ? 20 : 120)) throw new HttpException('Too many requests; retry in one minute', 429);
    return true;
  }

  onModuleDestroy() { this.redis.disconnect(); }
}
