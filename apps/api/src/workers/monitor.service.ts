import {RedisService} from '../redis/redis.module';
import { LiquidationExecutorService } from './liquidation-executor.service';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Wallet, RiskAlert } from '../database/entities';
import { CreditService } from '../credit/credit.service';
import { RiskService } from '../risk/risk.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { ChainIndexerService } from './chain-indexer.service';
@Injectable()
export class MonitorService implements OnApplicationBootstrap,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;private running=false;private readonly logger=new Logger(MonitorService.name);
  constructor(private readonly redis:RedisService,private readonly db:DataSource,private readonly config:ConfigService,private readonly credit:CreditService,
    private readonly risk:RiskService,private readonly lifecycle:LifecycleService,private readonly indexer:ChainIndexerService,private readonly liquidations:LiquidationExecutorService){}
  onApplicationBootstrap(){if(this.config.get<string>('WORKERS_ENABLED','true')!=='true')return;this.timer=setInterval(()=>void this.tick(),10000);void this.tick();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async tick(){
    if(this.running)return;this.running=true;
    const runner=this.db.createQueryRunner();let locked=false;
    try{
      await runner.connect();locked=(await runner.query("SELECT pg_try_advisory_lock(hashtextextended('stash:risk-worker',0)) AS locked"))[0].locked;
      if(!locked)return;
      try{await this.indexer.tick();}catch{this.logger.error('Indexer is unavailable; continuing independent risk monitoring');}
      for(const intent of await this.lifecycle.pending()){try{await this.lifecycle.refresh(intent);}catch{this.logger.error('Transaction confirmation refresh unavailable');}}
      const wallets=await this.db.getRepository(Wallet).find({where:{isPrimary:true},order:{id:'ASC'}});
      for(const wallet of wallets){
        await this.redis.client.set(`stash:worker:${this.config.get<string>('CHAIN_ID','5042002')}`,new Date().toISOString(),'EX',60);
        try{
          const state=await this.credit.calculateStashPower(wallet.userId);
          if(state.debtAmount===0)continue;
          const snapshot=await this.risk.checkRisk(wallet.userId);
          if(snapshot.riskLevel==='liquidation'&&state.collateralPositions[0])await this.liquidations.enqueue(wallet.userId,wallet.address,state.collateralPositions[0].assetAddress);
          if(snapshot.riskLevel==='safe')continue;
          const alerts=this.db.getRepository(RiskAlert);const latest=await alerts.findOne({where:{userId:wallet.userId},order:{createdAt:'DESC'}});
          if(latest?.level===snapshot.riskLevel&&Date.now()-latest.createdAt.getTime()<3600000)continue;
          await alerts.save(alerts.create({userId:wallet.userId,level:snapshot.riskLevel,message:`Position risk is ${snapshot.riskLevel}. Review your collateral and debt.`,state:{...state}}));
        }catch{this.logger.error(`Risk evaluation unavailable for wallet ${wallet.id}; no liquidation assumption was made`);}
      }
      await this.liquidations.tick();
      await this.redis.client.set(`stash:worker:${this.config.get<string>('CHAIN_ID','5042002')}`,new Date().toISOString(),'EX',60);
    }catch(error){this.logger.error(error instanceof Error?error.message:'Background monitoring unavailable');}
    finally{try{if(locked)await runner.query("SELECT pg_advisory_unlock(hashtextextended('stash:risk-worker',0))");}finally{try{await runner.release();}finally{this.running=false;}}}
  }
}
