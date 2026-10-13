const {test}=require('node:test');const assert=require('node:assert/strict');const Redis=require('ioredis');
const {AuthService}=require('../dist/auth/auth.service');const {privateKeyToAccount,generatePrivateKey}=require('viem/accounts');
test('SIWE nonce can be consumed only once across two API instances',{skip:!process.env.TEST_REDIS_URL},async()=>{
 const redis=new Redis(process.env.TEST_REDIS_URL,{maxRetriesPerRequest:1});
 const account=privateKeyToAccount(generatePrivateKey());const repository={findOne:async()=>({user:{id:'test-user'}})};
 const jwt={sign:()=> 'test-token',decode:()=>({exp:Math.floor(Date.now()/1000)+60})};
 const first=new AuthService(jwt,{client:redis},{},repository),second=new AuthService(jwt,{client:redis},{},repository);
 try{const challenge=await first.generateChallenge(account.address);const signature=await account.signMessage({message:challenge.message});
 const results=await Promise.allSettled([first.verifySignature(challenge.message,signature),second.verifySignature(challenge.message,signature)]);
 assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(results.filter(value=>value.status==='rejected').length,1);
 await assert.rejects(first.verifySignature(challenge.message,signature),/nonce|used/);
 }finally{redis.disconnect();}
});
