import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { decodeEventLog, type Address, type Log } from 'viem';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PROTOCOL_EVENTS } from '../blockchain/events';
import { recordConfirmedAction } from '../blockchain/confirmed-action';
import { contractAddress } from '../config/protocol.config';
import { IndexerState, User, Wallet, Transaction, TradePosition, TradeExecution, TransactionIntent } from '../database/entities';

@Injectable()
export class ChainIndexerService {
  constructor(private readonly db:DataSource, private readonly config:ConfigService, private readonly blockchain:BlockchainService) {}
  async tick() {
    const runner=this.db.createQueryRunner(); await runner.connect();
    const key=`stash:indexer:${this.config.get<string>('CHAIN_ID','5042002')}`;
    const locked=(await runner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key]))[0].locked;
    if(!locked) { await runner.release(); return; }
    try {
      const client=this.blockchain.getClient(); const states=this.db.getRepository(IndexerState);
      let state=await states.findOne({where:{key}});
      if(!state) {
        const start=BigInt(this.config.getOrThrow<string>('INDEXER_START_BLOCK'));
        if(start<1n) throw new Error('Indexer start block must be the deployment block');
        const previous=await client.getBlock({blockNumber:start-1n});
        state=await states.save(states.create({key,blockNumber:(start-1n).toString(),blockHash:previous.hash!,checkpoints:[]}));
      }
      const canonical=await client.getBlock({blockNumber:BigInt(state.blockNumber)});
      if(canonical.hash!==state.blockHash) { await this.recoverReorg(state); return; }
      const head=await client.getBlockNumber(); const confirmations=BigInt(this.config.get<string>('TX_CONFIRMATIONS','2'));
      if(head<confirmations) return;
      const safe=head-confirmations+1n; const from=BigInt(state.blockNumber)+1n;
      if(from>safe) return; const to=from+199n<safe?from+199n:safe;
      const addresses=['STASH_VAULT_ADDRESS','STASH_CREDIT_ADDRESS','STASH_ROUTER_ADDRESS','STASH_LIQUIDATION_ADDRESS'].map(name=>contractAddress(this.config,name));
      const logs=await client.getLogs({address:addresses,fromBlock:from,toBlock:to});
      const grouped=new Map<string,Log[]>();
      for(const log of logs) { if(log.removed||!log.transactionHash) continue; const values=grouped.get(log.transactionHash)??[];values.push(log);grouped.set(log.transactionHash,values); }
      for(const values of grouped.values()) await this.apply(values);
      const block=await client.getBlock({blockNumber:to});
      state.checkpoints=[...state.checkpoints,{number:state.blockNumber,hash:state.blockHash}].slice(-64);
      state.blockNumber=to.toString();state.blockHash=block.hash!;await states.save(state);
    } finally { await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);await runner.release(); }
  }
  private async apply(logs:Log[]) {
    const decoded=logs.flatMap(log=>{try{return [{log,event:decodeEventLog({abi:PROTOCOL_EVENTS,data:log.data,topics:log.topics})}];}catch{return [];} });
    const route=contractAddress(this.config,'STASH_ROUTER_ADDRESS').toLowerCase();
    const vault=contractAddress(this.config,'STASH_VAULT_ADDRESS').toLowerCase();
    const credit=contractAddress(this.config,'STASH_CREDIT_ADDRESS').toLowerCase();
    const liquidation=contractAddress(this.config,'STASH_LIQUIDATION_ADDRESS').toLowerCase();
    const matching=decoded.filter(item=>((item.event.eventName==='Deposited'||item.event.eventName==='Withdrawn')&&item.log.address.toLowerCase()===vault)||((item.event.eventName==='Borrowed'||item.event.eventName==='Repaid')&&item.log.address.toLowerCase()===credit)||(item.event.eventName==='TradeExecuted'&&item.log.address.toLowerCase()===route)||(item.event.eventName==='Liquidated'&&item.log.address.toLowerCase()===liquidation));
    const selected=matching.find(item=>item.event.eventName==='TradeExecuted')??matching[0]; if(!selected)return;
    const args=selected.event.args as Record<string,any>; const address=String(args.user).toLowerCase();
    let wallet=await this.db.getRepository(Wallet).findOne({where:{address}});
    if(!wallet) {
      wallet=await this.db.transaction(async manager=>{
        const wallets=manager.getRepository(Wallet);
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`wallet:${address}`]);
        const existing=await wallets.findOne({where:{address}});if(existing)return existing;
        const user=await manager.getRepository(User).save(manager.getRepository(User).create());
        return wallets.save(wallets.create({address,userId:user.id,chainId:Number(this.config.get<string>('CHAIN_ID','5042002')),isPrimary:true}));
      });
    }
    const types:Record<string,Transaction['type']>={Deposited:'deposit',Withdrawn:'withdraw',Borrowed:'borrow',Repaid:'repay',TradeExecuted:'trade',Liquidated:'liquidation'};
    const hash=selected.log.transactionHash!; const chain=Number(this.config.get<string>('CHAIN_ID','5042002'));
    await recordConfirmedAction(this.db.getRepository(Transaction),wallet.userId,hash,types[selected.event.eventName],chain,async manager=>{
      if(selected.event.eventName==='TradeExecuted') {
        const positions=manager.getRepository(TradePosition);
        const position=await positions.save(positions.create({userId:wallet!.userId,tokenIn:args.tokenIn,tokenOut:args.tokenOut,amountIn:String(args.amountIn),amountOut:String(args.amountOut),status:'confirmed'}));
        const executions=manager.getRepository(TradeExecution);await executions.save(executions.create({tradePositionId:position.id,txHash:hash,status:'confirmed',confirmedAt:new Date()}));
      }
      return {};
    });
    await this.db.getRepository(Transaction).update({txHash:hash.toLowerCase(),chainId:chain},{blockNumber:selected.log.blockNumber!.toString()});
  }
  private async recoverReorg(state:IndexerState) {
    const client=this.blockchain.getClient(); let ancestor:{number:string;hash:string}|undefined;
    for(const checkpoint of [...state.checkpoints].reverse()) {
      const block=await client.getBlock({blockNumber:BigInt(checkpoint.number)});
      if(block.hash===checkpoint.hash){ancestor=checkpoint;break;}
    }
    if(!ancestor)throw new Error('Reorg exceeds recorded checkpoints; operator recovery required');
    await this.db.transaction(async manager=>{
      const affected=await manager.getRepository(Transaction).createQueryBuilder('tx').where('tx."chainId"=:chain AND tx."blockNumber">:block',{chain:Number(this.config.get<string>('CHAIN_ID','5042002')),block:ancestor!.number}).getMany();
      for(const tx of affected){
        await manager.getRepository(Transaction).update(tx.id,{status:'orphaned'});
        await manager.getRepository(TransactionIntent).update({txHash:tx.txHash,chainId:tx.chainId},{status:'PENDING'});
        const executions=await manager.getRepository(TradeExecution).find({where:{txHash:tx.txHash}});
        for(const execution of executions){await manager.getRepository(TradeExecution).update(execution.id,{status:'orphaned'});await manager.getRepository(TradePosition).update(execution.tradePositionId,{status:'orphaned'});}
      }
      state.blockNumber=ancestor!.number;state.blockHash=ancestor!.hash;state.checkpoints=state.checkpoints.filter(item=>BigInt(item.number)<=BigInt(ancestor!.number));
      await manager.getRepository(IndexerState).save(state);
    });
  }
}
