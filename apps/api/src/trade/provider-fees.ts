interface Token {address:string;symbol:string;decimals:number;}
export interface FeeItem {label:string;amountAtomic:string;symbol:string;decimals:number|null;}
export function providerFees(provider:string,fees:unknown,tokens:Token[]):FeeItem[]{
 const result:FeeItem[]=[];
 const add=(label:string,amount:unknown,token:unknown,metadata?:{symbol?:string;decimals?:number})=>{
  if(typeof amount!=='string'||!/^\d{1,78}$/.test(amount)||typeof token!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(token))return;
  const known=tokens.find(item=>item.address.toLowerCase()===token.toLowerCase());
  const decimals=known?.decimals??metadata?.decimals;
  result.push({label,amountAtomic:amount,symbol:known?.symbol??metadata?.symbol??token,decimals:Number.isInteger(decimals)&&decimals!>=0&&decimals!<=18?decimals!:null});
 };
 const input=fees as any;
 if(provider==='0x'&&input){for(const [key,label] of [['zeroExFee','0x fee'],['integratorFee','Aggregator integrator fee'],['gasFee','Provider gas fee']]){const fee=input[key];if(fee)add(label,fee.amount,fee.token);}}
 if(provider==='LI.FI'&&Array.isArray(input?.router)){for(const fee of input.router)add(String(fee.name??'Routing fee'),fee.amount,fee.token?.address,fee.token);}
 return result;
}
