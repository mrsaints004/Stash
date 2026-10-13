const {test}=require('node:test');const assert=require('node:assert/strict');
const {ZeroXProvider}=require('../dist/trade/providers/zero-x.provider');
const {LifiProvider}=require('../dist/trade/providers/lifi.provider');
const {transactionValue}=require('../dist/trade/providers/quote-provider');
const a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222',c='0x3333333333333333333333333333333333333333';
const request={chainId:5042,sellToken:a,buyToken:b,sellAmount:'1000000',taker:c,origin:a,slippageBps:50};
const quote={liquidityAvailable:true,sellToken:a,buyToken:b,sellAmount:'1000000',buyAmount:'10000',minBuyAmount:'9950',transaction:{to:c,data:'0x12345678',value:'0x0'},issues:{allowance:{spender:c}},route:{fills:[{source:'Aggregator route'}]}};
const http=value=>async()=>({ok:true,json:async()=>value});
test('0x requests Arc, isolated router recipient and wallet origin, accepts hexadecimal zero value',async()=>{
 let url,options;const provider=new ZeroXProvider('test-only',async(u,o)=>{url=new URL(u);options=o;return {ok:true,json:async()=>quote};});
 const result=await provider.getQuote(request);assert.equal(url.searchParams.get('chainId'),'5042');assert.equal(url.searchParams.get('recipient'),c);assert.equal(url.searchParams.get('txOrigin'),a);assert.equal(options.headers['0x-version'],'v2');assert.equal(result.value,'0');assert.equal(result.minimumBuyAmount,'9950');
});
test('0x rejects substituted tokens, excessive slippage, absent liquidity and malformed calldata',async()=>{
 for(const change of [{buyToken:a},{sellAmount:'999'},{minBuyAmount:'9900'},{liquidityAvailable:false},{transaction:{...quote.transaction,data:'0x123'}}]) await assert.rejects(new ZeroXProvider('test-only',http({...quote,...change})).getQuote(request));
});
test('LI.FI rejects a bridge or changed destination before transaction preparation',async()=>{
 const data={action:{fromChainId:5042,toChainId:8453,fromToken:{address:a},toToken:{address:b},fromAmount:'1000000',fromAddress:c,toAddress:c}};
 await assert.rejects(new LifiProvider('',http(data)).getQuote(request),/cross-chain/);
});
test('native values reject negative, unbounded and nonnumeric payloads',()=>{assert.equal(transactionValue('0x10'),'16');for(const value of ['-1','0x','Infinity',{},'0x'+'f'.repeat(65)])assert.throws(()=>transactionValue(value));});
const {providerFees}=require('../dist/trade/provider-fees');
test('provider fee amounts retain token precision and do not invent missing decimals',()=>{
 const fees=providerFees('0x',{zeroExFee:{amount:'12345',token:a},gasFee:{amount:'100',token:b}},[{address:a,symbol:'USDC',decimals:6}]);
 assert.equal(fees[0].decimals,6);assert.equal(fees[0].amountAtomic,'12345');assert.equal(fees[1].decimals,null);
 assert.deepEqual(providerFees('0x',{zeroExFee:{amount:'-1',token:a}},[]),[]);
});
