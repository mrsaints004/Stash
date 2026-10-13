/* Read-only deployment evidence. Run with environment variables already loaded; never outputs secrets. */
const {createPublicClient,http,defineChain,parseAbi}=require('viem');
async function main(){
 const id=Number(process.env.CHAIN_ID||5042002);if(![5042,5042002].includes(id))throw new Error('Arc only');
 const endpoint=process.env.RPC_URL;if(!endpoint)throw new Error('RPC_URL is required');
 const chain=defineChain({id,name:id===5042?'Arc':'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[endpoint]}}});
 const client=createPublicClient({chain,transport:http(endpoint,{timeout:10000,retryCount:2})});
 if(await client.getChainId()!==id)throw new Error('RPC chain mismatch');
 const spoke=process.env.AAVE_V4_SPOKE;if(!/^0x[0-9a-fA-F]{40}$/.test(spoke||''))throw new Error('AAVE_V4_SPOKE is required');
 if(!await client.getBytecode({address:spoke}))throw new Error('Spoke has no bytecode');
 const abi=parseAbi(['function getReserveCount() view returns(uint256)','function getReserve(uint256 id) view returns((address underlying,address hub,uint16 assetId,uint8 decimals,uint24 collateralRisk,uint8 flags,uint32 dynamicConfigKey))','function getReserveConfig(uint256 id) view returns((uint24 collateralRisk,bool paused,bool frozen,bool borrowable,bool receiveSharesEnabled))','function getDynamicReserveConfig(uint256 id,uint32 key) view returns((uint16 collateralFactor,uint32 maxLiquidationBonus,uint16 liquidationFee))']);
 const count=await client.readContract({address:spoke,abi,functionName:'getReserveCount'});if(count>64n)throw new Error('Unexpected reserve count');
 const block=await client.getBlock({blockTag:'latest'});const reserves=[];
 for(let i=0n;i<count;i++){
  const reserve=await client.readContract({address:spoke,abi,functionName:'getReserve',args:[i],blockNumber:block.number});
  const config=await client.readContract({address:spoke,abi,functionName:'getReserveConfig',args:[i],blockNumber:block.number});
  const risk=await client.readContract({address:spoke,abi,functionName:'getDynamicReserveConfig',args:[i,reserve.dynamicConfigKey],blockNumber:block.number});
  reserves.push({reserveId:i.toString(),...reserve,config,risk});
 }
 console.log(JSON.stringify({chainId:id,blockNumber:block.number.toString(),blockHash:block.hash,spoke,reserves},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
