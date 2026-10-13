/* Dedicated keeper process. Never load this module into the web/API process.
 * Bind only behind authenticated TLS on a private network. Mount KEEPER_KEY_FILE and
 * KEEPER_SIGNER_TOKEN_FILE only into this process; neither contains a user wallet key.
 * SIGNER_DATABASE_URL must point to a separately permissioned keeper database.
 */
const http=require('node:http');const fs=require('node:fs');const crypto=require('node:crypto');
const {Pool}=require('pg');const {privateKeyToAccount}=require('viem/accounts');
const {createPublicClient,createWalletClient,defineChain,http:transport,parseAbi,decodeFunctionData}=require('viem');
const required=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;};
const abi=parseAbi(['function liquidate(address user,address asset,uint256 debtToCover,uint256 minimumCollateral)']);
const vaultAbi=parseAbi(['function accounts(address user) view returns(address)','function priceUsd6(address asset) view returns(uint256)','function lendingHealth(address user) view returns(uint256,uint256,uint256,uint256,uint256,uint256)']);
function validateRequest(body,configuration){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.jobId||''))throw new Error('Invalid job');
 const tx=body.transaction;if(!tx||String(tx.chainId)!==String(configuration.chainId)||tx.from?.toLowerCase()!==configuration.keeper.toLowerCase()||tx.to?.toLowerCase()!==configuration.target.toLowerCase()||tx.value!=='0')throw new Error('Unauthorized transaction');
 const decoded=decodeFunctionData({abi,data:tx.data});if(decoded.functionName!=='liquidate')throw new Error('Unauthorized function');
 const [user,asset,amount,minimum]=decoded.args;
 if(!configuration.assets.includes(asset.toLowerCase())||amount<=0n||amount>configuration.maximumDebt||minimum<=0n)throw new Error('Liquidation exceeds policy');
 return {user,asset,amount,minimum,data:tx.data};
}
exports.validateRequest=validateRequest;
async function start(){
 const chainId=Number(required('CHAIN_ID'));if(![5042,5042002].includes(chainId))throw new Error('Arc only');
 const privateKey=fs.readFileSync(required('KEEPER_KEY_FILE'),'utf8').trim();
 const account=privateKeyToAccount(privateKey);const token=fs.readFileSync(required('KEEPER_SIGNER_TOKEN_FILE'),'utf8').trim();if(token.length<32)throw new Error('Signer token must have at least 32 characters');
 const configuration={chainId,keeper:account.address,target:required('STASH_LIQUIDATION_ADDRESS'),assets:required('KEEPER_ALLOWED_ASSETS').split(',').map(value=>value.trim().toLowerCase()),maximumDebt:BigInt(required('KEEPER_MAX_USDC_ATOMIC'))};
 const vault=required('STASH_VAULT_ADDRESS'),usdc=required('USDC_ADDRESS');
 const chain=defineChain({id:chainId,name:'Arc',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[required('RPC_URL')]}}});
 const rpc=createPublicClient({chain,transport:transport(required('RPC_URL'),{timeout:10000,retryCount:2})});
 const wallet=createWalletClient({chain,account,transport:transport(required('RPC_URL'),{timeout:10000,retryCount:2})});
 if(await rpc.getChainId()!==chainId)throw new Error('RPC chain mismatch');
 const db=new Pool({connectionString:required('SIGNER_DATABASE_URL'),max:2,connectionTimeoutMillis:5000});
 await db.query('CREATE TABLE IF NOT EXISTS keeper_requests (id uuid PRIMARY KEY, digest varchar NOT NULL, raw_transaction text NOT NULL, transaction_hash varchar NOT NULL, submitted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())');
 async function sign(body){
  const approved=validateRequest(body,configuration);const digest=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const connection=await db.connect();let saved;
  try{
   await connection.query('BEGIN');await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`keeper:${account.address.toLowerCase()}`]);
   saved=(await connection.query('SELECT * FROM keeper_requests WHERE id=$1',[body.jobId])).rows[0];
   if(saved&&saved.digest!==digest)throw new Error('Idempotency payload changed');
   if(!saved){
    const unresolved=(await connection.query('SELECT id FROM keeper_requests WHERE submitted=false LIMIT 1')).rows[0];if(unresolved)throw new Error('An earlier signed request needs recovery');
    const position=await rpc.readContract({address:vault,abi:vaultAbi,functionName:'accounts',args:[approved.user]});if(/^0x0{40}$/.test(position))throw new Error('No Stash account');
    const health=await rpc.readContract({address:vault,abi:vaultAbi,functionName:'lendingHealth',args:[approved.user]});if(health[5]>=10n**18n)throw new Error('Position is healthy');
    const [price,debtPrice,decimals]=await Promise.all([rpc.readContract({address:vault,abi:vaultAbi,functionName:'priceUsd6',args:[approved.asset]}),rpc.readContract({address:vault,abi:vaultAbi,functionName:'priceUsd6',args:[usdc]}),rpc.readContract({address:approved.asset,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals'})]);
    const call={account:account.address,to:configuration.target,data:approved.data,value:0n};await rpc.call(call);
    const gas=(await rpc.estimateGas(call))*120n/100n;const maxGas=BigInt(required('KEEPER_MAX_GAS'));if(gas>maxGas)throw new Error('Gas exceeds signer limit');
    const maxFeePerGas=(await rpc.getGasPrice())*2n;if(maxFeePerGas>BigInt(required('KEEPER_MAX_GAS_PRICE')))throw new Error('Gas price exceeds signer limit');
    // Arc native gas is USDC with 18 decimals. Price is validated by the vault.
    const costUsd6=approved.amount*debtPrice/1000000n+gas*maxFeePerGas*debtPrice/(10n**18n)+BigInt(required('KEEPER_MIN_PROFIT_USD6'));
    const minimumRequired=(costUsd6*10n**BigInt(decimals)+price-1n)/price;
    if(approved.minimum<minimumRequired)throw new Error('Minimum collateral does not cover signer cost and profit policy');
    const nonce=await rpc.getTransactionCount({address:account.address,blockTag:'pending'});
    const raw=await wallet.signTransaction({to:configuration.target,data:approved.data,value:0n,gas,maxFeePerGas,maxPriorityFeePerGas:0n,nonce,type:'eip1559'});
    const hash=require('viem').keccak256(raw);
    await connection.query('INSERT INTO keeper_requests (id,digest,raw_transaction,transaction_hash) VALUES ($1,$2,$3,$4)',[body.jobId,digest,raw,hash]);
    saved={raw_transaction:raw,transaction_hash:hash,submitted:false};
   }
   await connection.query('COMMIT');
  }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  if(!saved.submitted){
   try{await rpc.sendRawTransaction({serializedTransaction:saved.raw_transaction});}
   catch{await rpc.getTransaction({hash:saved.transaction_hash});}
   await db.query('UPDATE keeper_requests SET submitted=true WHERE id=$1',[body.jobId]);
  }
  return {txHash:saved.transaction_hash};
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  const provided=Buffer.from(String(req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(token);const valid=provided.length===expected.length&&crypto.timingSafeEqual(provided,expected);
  if(!valid){res.writeHead(401);res.end(JSON.stringify({error:'Unauthorized'}));return;}
  if(req.method!=='POST'||req.url!=='/sign'){res.writeHead(404);res.end('{}');return;}
  let size=0;const parts=[];
  try{for await(const part of req){size+=part.length;if(size>16384)throw new Error('Payload too large');parts.push(part);}const body=JSON.parse(Buffer.concat(parts).toString('utf8'));if(req.headers['idempotency-key']!==body.jobId)throw new Error('Invalid idempotency key');const result=await sign(body);res.end(JSON.stringify(result));}
  catch{res.writeHead(503);res.end(JSON.stringify({error:'Signing request rejected or unavailable'}));}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(Number(process.env.KEEPER_SIGNER_PORT||3002),process.env.KEEPER_SIGNER_HOST||'127.0.0.1');
 async function close(){server.close();await db.end();}process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
}
if(require.main===module)start().catch(()=>{console.error('Keeper signer startup failed; verify isolated configuration');process.exitCode=1;});
