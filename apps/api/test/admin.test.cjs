const {test}=require('node:test');const assert=require('node:assert/strict');
const {AdminGuard}=require('../dist/admin/admin.guard');
const wallet='0x1111111111111111111111111111111111111111';
const context=address=>({switchToHttp:()=>({getRequest:()=>({user:{address}})})});
test('admin access fails closed unless the signed wallet is explicitly configured',()=>{
 assert.throws(()=>new AdminGuard({get:()=>''}).canActivate(context(wallet)),/Administrator/);
 assert.throws(()=>new AdminGuard({get:()=>wallet}).canActivate(context(undefined)),/Administrator/);
 assert.equal(new AdminGuard({get:()=>wallet.toUpperCase()}).canActivate(context(wallet)),true);
 assert.throws(()=>new AdminGuard({get:()=>wallet}).canActivate(context('0x2222222222222222222222222222222222222222')),/Administrator/);
});
const {validateRequest}=require('../scripts/keeper-signer.cjs');const {encodeFunctionData,parseAbi}=require('viem');
const target='0x2222222222222222222222222222222222222222';const asset='0x3333333333333333333333333333333333333333';
const configuration={chainId:5042,keeper:wallet,target,assets:[asset],maximumDebt:1000000n};
function request(change={}){return{jobId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',transaction:{chainId:'5042',from:wallet,to:target,value:'0',data:encodeFunctionData({abi:parseAbi(['function liquidate(address user,address asset,uint256 debtToCover,uint256 minimumCollateral)']),functionName:'liquidate',args:[wallet,asset,1000000n,1n]}),...change}};}
test('isolated signer admits only bounded Arc liquidation calldata',()=>{
 assert.equal(validateRequest(request(),configuration).amount,1000000n);
 for(const changed of [{chainId:'8453'},{to:wallet},{from:asset},{value:'1'},{data:'0x12345678'}])assert.throws(()=>validateRequest(request(changed),configuration));
 assert.throws(()=>validateRequest(request(),{...configuration,maximumDebt:1n}));
 assert.throws(()=>validateRequest(request(),{...configuration,assets:[]}));
});
