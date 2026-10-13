import {BadRequestException,Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {DataSource} from 'typeorm';
import {randomBytes} from 'node:crypto';
import {encodeFunctionData,parseAbi,type Address} from 'viem';
import {Wallet,Transaction,TradeExecution,IndexerState,LiquidationJob} from '../database/entities';
import {CreditService} from '../credit/credit.service';
import {ProtocolService} from '../protocol/protocol.service';
import {BlockchainService} from '../blockchain/blockchain.service';
import {contractAddress,VAULT_V2_ABI,CREDIT_V2_ABI} from '../config/protocol.config';
import {ProposalDto} from './proposal.dto';
@Injectable()
export class AdminService {
 constructor(private readonly db:DataSource,private readonly config:ConfigService,private readonly credit:CreditService,private readonly protocol:ProtocolService,private readonly blockchain:BlockchainService){}
 async overview(){
  const configuration=await this.protocol.configuration();
  const wallets=await this.db.getRepository(Wallet).find({where:{isPrimary:true},order:{id:'ASC'}});
  let collateralUsd=0,debtUsdc=0,powerUsdc=0,activePositions=0;const unavailable:string[]=[];const atRisk:unknown[]=[];
  const distribution={safe:0,warning:0,danger:0,liquidation:0};
  // Bound request work. Incomplete totals are explicitly identified, never presented as protocol totals.
  for(const wallet of wallets.slice(0,100)){
   try{const state=await this.credit.calculateStashPower(wallet.userId);collateralUsd+=state.totalCollateralUsd;debtUsdc+=state.debtAmount;powerUsdc+=state.stashPower;
    if(state.totalCollateralUsd>0||state.debtAmount>0)activePositions++;
    const health=Number(state.healthFactor)/1e18;const level=state.debtAmount===0?'safe':health<=1?'liquidation':health<=1.1?'danger':health<=1.25?'warning':'safe';distribution[level]++;
    if(level!=='safe')atRisk.push({wallet:wallet.address,level,ltv:state.ltv,healthFactor:state.healthFactor,debtUsdc:state.debtAmount});
   }catch{unavailable.push(wallet.address);}
  }
  const client=this.blockchain.getClient();
  const prices=await Promise.all(configuration.assets.map(async asset=>{try{return{symbol:asset.symbol,address:asset.address,status:'valid',priceUsd6:(await client.readContract({address:configuration.vaultAddress,abi:VAULT_V2_ABI,functionName:'priceUsd6',args:[asset.address]})).toString()};}catch{return{symbol:asset.symbol,address:asset.address,status:'unavailable',priceUsd6:null};}}));
  const executions=await this.db.getRepository(TradeExecution).find({where:{status:'confirmed'},relations:{tradePosition:true}});
  const tradingVolumeUsdc=executions.reduce((total,execution)=>total+BigInt(execution.tradePosition.amountIn),0n);
  return{configuration,lending:await this.protocol.lendingTerms(),computedAt:new Date().toISOString(),totals:{collateralUsd:collateralUsd.toFixed(2),debtUsdc:debtUsdc.toFixed(6),powerUsdc:powerUsdc.toFixed(6),activePositions,tradingVolumeUsdcAtomic:tradingVolumeUsdc.toString(),liquidations:await this.db.getRepository(Transaction).count({where:{type:'liquidation',status:'confirmed'}})},coverage:{totalWallets:wallets.length,evaluatedWallets:Math.min(wallets.length,100),unavailableWallets:unavailable,complete:wallets.length<=100&&unavailable.length===0},distribution,atRisk,prices,indexers:await this.db.getRepository(IndexerState).find(),keeper:{enabled:this.config.get<string>('KEEPER_ENABLED','false')==='true',failedJobs:await this.db.getRepository(LiquidationJob).count({where:{status:'FAILED'}})},maximumCreditAtomic:(await client.readContract({address:configuration.creditAddress,abi:CREDIT_V2_ABI,functionName:'maximumCredit'})).toString()};
 }
 async proposal(input:ProposalDto){
  const protocol=await this.protocol.configuration();const client=this.blockchain.getClient();const timelock=contractAddress(this.config,'STASH_TIMELOCK_ADDRESS');
  const modules=[protocol.vaultAddress,protocol.creditAddress,protocol.routerAddress,contractAddress(this.config,'STASH_LIQUIDATION_ADDRESS')];
  let target:Address,data:`0x${string}`;
  const fail=()=>{throw new BadRequestException('Missing or invalid proposal parameters');};
  switch(input.action){
   case 'maximum-credit':if(!input.amount||BigInt(input.amount)<=0n)fail();target=protocol.creditAddress;data=encodeFunctionData({abi:parseAbi(['function setMaximumCredit(uint256 amount)']),functionName:'setMaximumCredit',args:[BigInt(input.amount!)]});break;
   case 'route':if(!input.target||!input.spender||typeof input.enabled!=='boolean')fail();if(input.enabled&&!await client.getBytecode({address:input.target!}))fail();target=protocol.routerAddress;data=encodeFunctionData({abi:parseAbi(['function configureRoute(address target,address spender,bool enabled)']),functionName:'configureRoute',args:[input.target!,input.spender!,input.enabled!]});break;
   case 'output':if(!input.asset||typeof input.enabled!=='boolean')fail();target=protocol.routerAddress;data=encodeFunctionData({abi:parseAbi(['function configureOutput(address token,bool enabled)']),functionName:'configureOutput',args:[input.asset!,input.enabled!]});break;
   case 'pause':case 'unpause':if(!input.target||!modules.some(module=>module.toLowerCase()===input.target!.toLowerCase()))fail();target=input.target!;data=encodeFunctionData({abi:parseAbi(['function pause()','function unpause()']),functionName:input.action});break;
   case 'asset-risk':{const asset=protocol.assets.find(asset=>asset.address.toLowerCase()===input.asset?.toLowerCase());if(!asset||!input.feed||!input.factorBps||!input.maxAgeSeconds||typeof input.enabled!=='boolean')fail();const reserve=await client.readContract({address:protocol.vaultAddress,abi:VAULT_V2_ABI,functionName:'assetRisk',args:[asset!.address]});target=protocol.vaultAddress;data=encodeFunctionData({abi:parseAbi(['function configureAsset(address asset,uint256 reserveId,address feed,uint16 factor,uint32 maxAge,bool enabled)']),functionName:'configureAsset',args:[asset!.address,reserve[0],input.feed!,input.factorBps!,input.maxAgeSeconds!,input.enabled!]});break;}
   default:return fail();
  }
  const abi=parseAbi(['function administrator() view returns(address)','function delay() view returns(uint256)','function operationId(address target,bytes data,bytes32 salt) view returns(bytes32)','function schedule(address target,bytes data,bytes32 salt)','function execute(address target,bytes data,bytes32 salt)']);
  const administrator=await client.readContract({address:timelock,abi,functionName:'administrator'});
  const owner=await client.readContract({address:target,abi:parseAbi(['function owner() view returns(address)']),functionName:'owner'});if(owner.toLowerCase()!==timelock.toLowerCase())throw new BadRequestException('Protocol ownership must be accepted by the timelock');
  // Validate the proposed change as the timelock owner, then validate scheduling as the administrator Safe.
  await client.call({account:timelock,to:target,data});
  const salt=`0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const scheduleData=encodeFunctionData({abi,functionName:'schedule',args:[target,data,salt]});await client.call({account:administrator,to:timelock,data:scheduleData});
  return{chainId:protocol.chainId,administrator,delaySeconds:Number(await client.readContract({address:timelock,abi,functionName:'delay'})),operationId:await client.readContract({address:timelock,abi,functionName:'operationId',args:[target,data,salt]}),schedule:{to:timelock,data:scheduleData,value:'0'},execute:{to:timelock,data:encodeFunctionData({abi,functionName:'execute',args:[target,data,salt]}),value:'0'},target,changeData:data,salt};
 }
}
