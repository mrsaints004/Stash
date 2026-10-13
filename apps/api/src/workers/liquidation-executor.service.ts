import { Injectable } from '@nestjs/common';
import { DataSource,In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { encodeFunctionData,parseAbi,type Address,type Hash } from 'viem';
import { LiquidationJob } from '../database/entities/liquidation-job.entity';
import { BlockchainService } from '../blockchain/blockchain.service';
import { ProtocolService } from '../protocol/protocol.service';
import { contractAddress,VAULT_V2_ABI } from '../config/protocol.config';
@Injectable()
export class LiquidationExecutorService{
  constructor(private readonly db:DataSource,private readonly config:ConfigService,private readonly blockchain:BlockchainService,private readonly protocol:ProtocolService){}
  async enqueue(userId:string,wallet:string,asset:string){
    const repo=this.db.getRepository(LiquidationJob);
    const existing=await repo.findOne({where:{userId,status:In(['QUEUED','PREPARED','SUBMITTED','SIGNING'])}});if(existing)return;
    await repo.save(repo.create({userId,walletAddress:wallet,assetAddress:asset,status:'QUEUED'}));
  }
  async tick(){
    if(this.config.get<string>('KEEPER_ENABLED','false')!=='true')return;
    const repo=this.db.getRepository(LiquidationJob);const client=this.blockchain.getClient();
    const keeper=contractAddress(this.config,'KEEPER_ADDRESS');const target=contractAddress(this.config,'STASH_LIQUIDATION_ADDRESS');
    const signerUrl=new URL(this.config.getOrThrow<string>('KEEPER_SIGNER_URL'));
    if(signerUrl.protocol!=='https:')throw new Error('Remote keeper signer must use authenticated HTTPS');
    const jobs=await repo.find({where:[{status:'QUEUED'},{status:'PREPARED'},{status:'SIGNING'},{status:'SUBMITTED'}],order:{createdAt:'ASC'},take:20});
    for(const job of jobs){try{
      if(job.status==='SUBMITTED'&&job.txHash){
        let receipt;try{receipt=await client.getTransactionReceipt({hash:job.txHash as Hash});}catch{continue;}
        const head=await client.getBlockNumber();if(head<receipt.blockNumber+BigInt(Number(this.config.get<string>('TX_CONFIRMATIONS','2'))-1))continue;
        job.status=receipt.status==='success'?'CONFIRMED':'REVERTED';await repo.save(job);continue;
      }
      if(job.status==='SIGNING'&&job.transaction){await this.sign(job,keeper,target);await repo.save(job);continue;}
      const protocol=await this.protocol.configuration();const asset=protocol.assets.find(a=>a.address.toLowerCase()===job.assetAddress.toLowerCase());if(!asset)throw new Error('Unapproved collateral');
      const vault=protocol.vaultAddress;
      const health=await client.readContract({address:vault,abi:VAULT_V2_ABI,functionName:'lendingHealth',args:[job.walletAddress as Address]});
      if(health[5]>=10n**18n){job.status='CANCELLED';await repo.save(job);continue;}
      const creditAbi=parseAbi(['function debtOf(address user) view returns(uint256)']);
      const debt=await client.readContract({address:protocol.creditAddress,abi:creditAbi,functionName:'debtOf',args:[job.walletAddress as Address]});
      const cap=BigInt(this.config.getOrThrow<string>('KEEPER_MAX_USDC_ATOMIC'));const desired = debt <= 2000_000000n ? debt : debt / 2n; const amount=desired<cap?desired:cap;if(amount<=0n)throw new Error('Liquidation amount is zero');
      const price=await client.readContract({address:vault,abi:VAULT_V2_ABI,functionName:'priceUsd6',args:[asset.address]});
      const usdcPrice=await client.readContract({address:vault,abi:VAULT_V2_ABI,functionName:'priceUsd6',args:[protocol.usdc.address]});
      const nativeAsset=protocol.usdc.address;
      const nativePrice=await client.readContract({address:vault,abi:VAULT_V2_ABI,functionName:'priceUsd6',args:[nativeAsset]});
      const principalUsd6=amount*usdcPrice/1000000n;const minimumProfit=BigInt(this.config.getOrThrow<string>('KEEPER_MIN_PROFIT_USD6'));
      const abi=parseAbi(['function liquidate(address user,address asset,uint256 debtToCover,uint256 minimumCollateral)']);
      const firstMinimum=(principalUsd6+minimumProfit)*10n**BigInt(asset.decimals)/price;
      const firstData=encodeFunctionData({abi,functionName:'liquidate',args:[job.walletAddress as Address,asset.address,amount,firstMinimum]});
      const estimatedGas=await client.estimateGas({account:keeper,to:target,data:firstData});const gas=estimatedGas*130n/100n;const gasPrice=await client.getGasPrice();
      const feeUsd6=gas*(gasPrice*2n)*nativePrice/(10n**18n);
      const minimum=((principalUsd6+minimumProfit+feeUsd6)*10n**BigInt(asset.decimals)+price-1n)/price;
      const data=encodeFunctionData({abi,functionName:'liquidate',args:[job.walletAddress as Address,asset.address,amount,minimum]});
      await client.call({account:keeper,to:target,data});
      job.transaction={chainId:String(protocol.chainId),from:keeper,to:target,data,value:'0',gas:gas.toString(),maxFeePerGas:(gasPrice*2n).toString()};job.status='SIGNING';await repo.save(job);
      await this.sign(job,keeper,target);await repo.save(job);
    }catch(error){job.error=error instanceof Error?error.message:'Liquidation unavailable';
      // Uncertain signer outcomes stay SIGNING and retry using the same idempotency key.
      if(job.status!=='SIGNING')job.status='FAILED';await repo.save(job);
    }}
  }
  private async sign(job:LiquidationJob,keeper:Address,target:Address){
    const signerUrl=new URL(this.config.getOrThrow<string>('KEEPER_SIGNER_URL'));
    if(signerUrl.protocol!=='https:')throw new Error('Remote signer must use HTTPS');
    const response=await fetch(signerUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.getOrThrow<string>('KEEPER_SIGNER_TOKEN')}`,'Idempotency-Key':job.id},body:JSON.stringify({jobId:job.id,transaction:job.transaction}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Remote keeper signer unavailable');const result:any=await response.json();
    if(!/^0x[0-9a-fA-F]{64}$/.test(result.txHash))throw new Error('Signer returned invalid transaction hash');
    const tx=await this.blockchain.getClient().getTransaction({hash:result.txHash});
    if(tx.from.toLowerCase()!==keeper.toLowerCase()||tx.to?.toLowerCase()!==target.toLowerCase()||tx.input.toLowerCase()!==job.transaction!.data.toLowerCase()||tx.value!==0n)throw new Error('Signer transaction did not match authorized liquidation');
    job.txHash=result.txHash.toLowerCase();job.status='SUBMITTED';job.error=null;
  }

}
