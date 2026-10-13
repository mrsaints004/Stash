/* Usage: node --env-file=.env scripts/check-launch-config.cjs
 * Checks configuration only; success is not an audit, deployment approval or proof of a live user journey.
 * Reports key names, never secrets.
 */
const {validateEnvironment}=require('../dist/config/environment');
const missing=[];let environmentValid=true;
try{validateEnvironment({...process.env,NODE_ENV:'production'});}catch{environmentValid=false;}
const keys=['CHAIN_ID','RPC_URL','DATABASE_HOST','DATABASE_USER','DATABASE_NAME','DATABASE_PASSWORD','JWT_SECRET','CORS_ORIGIN','SIWE_DOMAIN','SIWE_URI','STASH_VAULT_ADDRESS','STASH_CREDIT_ADDRESS','STASH_ROUTER_ADDRESS','STASH_LIQUIDATION_ADDRESS','STASH_TIMELOCK_ADDRESS','INDEXER_START_BLOCK','ADMIN_WALLETS','KEEPER_ADDRESS','KEEPER_SIGNER_URL','KEEPER_SIGNER_TOKEN','KEEPER_MAX_USDC_ATOMIC','KEEPER_MIN_PROFIT_USD6'];
for(const key of keys)if(!process.env[key])missing.push(key);
const providers=(process.env.ROUTING_PROVIDERS||'0x,lifi').split(',').map(value=>value.trim());
const routingConfigured=providers.some(provider=>provider==='0x'&&Boolean(process.env.ZEROX_API_KEY)||provider==='lifi');
const addressKeys=keys.filter(key=>key.endsWith('_ADDRESS'));const invalidAddresses=addressKeys.filter(key=>process.env[key]&&(!/^0x[0-9a-fA-F]{40}$/.test(process.env[key])||/^0x0{40}$/.test(process.env[key])));
const checks={environmentValid,missing,invalidAddresses,routingConfigured,workerReadinessRequired:process.env.WORKERS_REQUIRED==='true',keeperEnabled:process.env.KEEPER_ENABLED==='true',networkIsArc:[5042,5042002].includes(Number(process.env.CHAIN_ID))};
console.log(JSON.stringify({scope:'Configuration only. Audit, funded rehearsal, signer isolation, backups and deployed permissions require separate evidence.',checks},null,2));
if(!environmentValid||missing.length||invalidAddresses.length||!routingConfigured||!checks.workerReadinessRequired||!checks.keeperEnabled||!checks.networkIsArc)process.exitCode=1;
