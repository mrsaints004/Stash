import { Global,Module,Injectable,OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
@Injectable()
export class RedisService implements OnModuleDestroy{
  readonly client:Redis;
  constructor(config:ConfigService){
    const url=config.get<string>('REDIS_URL');const options={lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:3000,retryStrategy:()=>null};
    this.client=url?new Redis(url,options):new Redis({...options,host:config.get<string>('REDIS_HOST','localhost'),port:Number(config.get<string>('REDIS_PORT','6379')),password:config.get<string>('REDIS_PASSWORD')});this.client.on('error',()=>{});
  }
  onModuleDestroy(){this.client.disconnect();}
}
@Global() @Module({providers:[RedisService],exports:[RedisService]}) export class RedisModule{}
