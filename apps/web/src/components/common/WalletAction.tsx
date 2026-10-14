"use client";
import { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useReadContract, useSendTransaction, useSwitchChain } from 'wagmi';
import { parseUnits, encodeFunctionData, parseAbi, formatUnits, type Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { useProtocol } from '@/hooks/useProtocol';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';

type Action = 'deposit' | 'withdraw' | 'repay';
interface Prepared { intentId: string; to: `0x${string}`; data: `0x${string}`; approvalTo?: `0x${string}`; approvalData?: `0x${string}`; requiresApproval?: boolean; }
const erc20=parseAbi(['function allowance(address owner,address spender) view returns(uint256)','function approve(address spender,uint256 amount) returns(bool)']);
export function WalletAction({ action }: { action:Action }) {
  const protocol=useProtocol();const {address,isConnected,chainId}=useAccount();const auth=useAuth();const api=useApi(auth.token);
  const client=usePublicClient();const {sendTransactionAsync}=useSendTransaction();const {switchChainAsync}=useSwitchChain();const cache=useQueryClient();
  const [selected,setSelected]=useState('');const [amount,setAmount]=useState('');const [step,setStep]=useState('input');const [error,setError]=useState<string|null>(null);
  const [review,setReview]=useState<{prepared:Prepared;gas:bigint;fee:bigint}|null>(null);
  const [pending,setPending]=useState<{hash:`0x${string}`;intentId:string}|null>(null);
  const assets=protocol.data?(action==='repay'?[protocol.data.usdc]:protocol.data.assets.filter(asset=>action==='withdraw'||asset.depositsEnabled)):[];
  const asset=assets.find(item=>item.address===selected)??(action==='repay'?assets[0]:undefined);
  const balanceQuery=useReadContract({address:asset?.address as Address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address!],query:{enabled:!!asset&&!!address&&action==='deposit'}});
  const walletBalance=balanceQuery.data as bigint|undefined;
  const storageKey=address?`stash-pending:${chainId}:${address.toLowerCase()}:${action}`:null;
  useEffect(()=>{setPending(null);setStep('input');setError(null);setReview(null);if(!storageKey)return;const saved=localStorage.getItem(storageKey);if(saved){try{setPending(JSON.parse(saved));setStep('pending_recovery');}catch{localStorage.removeItem(storageKey);}}},[storageKey]);
  const busy=['preparing','approval_signature','approval_pending','simulating','awaiting_signature','pending','confirming'].includes(step);
  const button='min-h-11 rounded-lg border border-stash-border px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stash-gold disabled:opacity-50';
  async function recover(saved=pending) {
    if(!saved)return;
    try{
      setStep('confirming');await api.post(`/transactions/${saved.intentId}/submit`,{txHash:saved.hash});
      const response=await api.get<{data:{status:string}}>(`/transactions/${saved.intentId}`);
      if(response.data.data.status==='REVERTED'){if(storageKey)localStorage.removeItem(storageKey);setPending(null);setStep('input');setError('Transaction reverted. No action was committed.');return;}
      if(response.data.data.status!=='CONFIRMED'){setStep('pending_recovery');return;}
      if(storageKey)localStorage.removeItem(storageKey);setPending(null);setStep('confirmed');await cache.invalidateQueries();
    }catch(e){setError(e instanceof Error?e.message:'Confirmation unavailable');setStep('pending_recovery');}
  }
  async function execute(){
    let intentId:string|undefined;let sent:{hash:`0x${string}`;intentId:string}|null=null;
    setError(null);
    try{
      if(!address||!asset||!client||!protocol.data||chainId!==protocol.data.chainId)throw new Error('Connect on the supported network and select an asset');
      if(!/^\d+(\.\d+)?$/.test(amount)||amount.split('.')[1]?.length>asset.decimals)throw new Error('Enter a valid amount within the asset precision');
      const atomic=parseUnits(amount,asset.decimals);if(atomic<=0n)throw new Error('Amount must be greater than zero');
      if(review){
        intentId=review.prepared.intentId;
        await client.call({account:address,to:review.prepared.to,data:review.prepared.data,value:0n});
        await api.post(`/transactions/${intentId}/awaiting-signature`);setStep('awaiting_signature');
        const hash=await sendTransactionAsync({to:review.prepared.to,data:review.prepared.data,value:0n,gas:review.gas});
        sent={hash,intentId};setPending(sent);if(storageKey)localStorage.setItem(storageKey,JSON.stringify(sent));setStep('pending');
        try{await api.post(`/transactions/${intentId}/submit`,{txHash:hash});}catch{}
        await client.waitForTransactionReceipt({hash,confirmations:2,timeout:180000});await recover(sent);return;
      }
      setStep('preparing');const endpoint=action==='deposit'?'/collateral/prepare-deposit':action==='withdraw'?'/collateral/prepare-withdraw':'/credit/prepare-repay';
      const response=await api.post<{data:Prepared}>(endpoint,action==='repay'?{amount:atomic.toString()}:{assetAddress:asset.address,amount:atomic.toString()});
      const prepared=response.data.data;intentId=prepared.intentId;
      const expected=action==='repay'?protocol.data.creditAddress:protocol.data.vaultAddress;
      if(prepared.to.toLowerCase()!==expected.toLowerCase())throw new Error('Prepared transaction has an unexpected destination');
      if(prepared.requiresApproval){
        const allowance=await client.readContract({address:asset.address,abi:erc20,functionName:'allowance',args:[address,prepared.to]});
        if(allowance<atomic){
          const data=encodeFunctionData({abi:erc20,functionName:'approve',args:[prepared.to,atomic]});
          await client.call({account:address,to:asset.address,data});setStep('approval_signature');
          const approval=await sendTransactionAsync({to:asset.address,data,value:0n});setStep('approval_pending');
          const receipt=await client.waitForTransactionReceipt({hash:approval,confirmations:2,timeout:180000});
          if(receipt.status!=='success')throw new Error('Token approval reverted');
        }
      }
      setStep('simulating');const tx={account:address,to:prepared.to,data:prepared.data,value:0n};await client.call(tx);const gas=await client.estimateGas(tx);
      const gasPrice=await client.getGasPrice();setReview({prepared,gas:gas*120n/100n,fee:gas*120n/100n*gasPrice});setStep('review');

    }catch(e){const message=e instanceof Error?e.message:'Transaction unavailable';setError(message);
      if(sent)setStep('pending_recovery');else{setReview(null);setStep('input');if(intentId&&/reject|denied/i.test(message))try{await api.post(`/transactions/${intentId}/rejected`);}catch{}}
    }
  }
  return <><Header/><main className="mx-auto max-w-xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-semibold">{action==='deposit'?'Deposit collateral':action==='withdraw'?'Withdraw collateral':'Repay USDC debt'}</h1>
    <p>{action==='deposit'?'Supply crypto to your isolated lending account and unlock Stash Power.':action==='withdraw'?'Withdrawals must leave enough collateral to cover your debt.':'Repayment reduces your actual lending debt, including accrued interest.'}</p>
    {protocol.isLoading&&<div role="status" className="h-32 rounded-lg bg-stash-surface">Loading protocol configuration…</div>}
    {protocol.error&&<p role="alert">Protocol unavailable. <button className={button} onClick={()=>protocol.refetch()}>Retry</button></p>}
    {!isConnected&&<p>Connect your wallet using the button above.</p>}
    {isConnected&&protocol.data&&chainId!==protocol.data.chainId&&<button className={button} onClick={()=>switchChainAsync({chainId:protocol.data!.chainId})}>Switch to {protocol.data.chainName}</button>}
    {isConnected&&!auth.isAuthenticated&&<button className={button} disabled={auth.isLoading} onClick={auth.login}>Sign in with your wallet</button>}
    {auth.error&&<p role="alert">{auth.error}</p>}
    {protocol.data&&<form className="space-y-5" onSubmit={e=>{e.preventDefault();execute();}}>
      <div><label htmlFor="action-asset">Asset</label><select id="action-asset" value={asset?.address??''} disabled={busy||!!pending} onChange={e=>{setSelected(e.target.value);setReview(null);setStep('input');}} className="mt-2 w-full rounded-lg bg-stash-surface p-3 focus-visible:outline focus-visible:outline-stash-gold"><option value="">Select asset</option>{assets.map(item=><option key={item.address} value={item.address}>{item.symbol}</option>)}</select></div>
      <div><div className="flex items-center justify-between"><label htmlFor="action-amount">Amount</label>{action==='deposit'&&asset&&walletBalance!==undefined&&<span className="text-sm text-stash-muted">Balance: <button type="button" className="font-mono text-stash-gold hover:underline" onClick={()=>{setAmount(formatUnits(walletBalance,asset.decimals));setReview(null);setStep('input');}}>{formatUnits(walletBalance,asset.decimals)} {asset.symbol}</button></span>}</div><input id="action-amount" type="text" inputMode="decimal" autoComplete="off" value={amount} disabled={busy||!!pending} aria-describedby="action-error" onChange={e=>{setAmount(e.target.value);setReview(null);setStep('input');}} className="mt-2 w-full rounded-lg border border-stash-border bg-stash-surface p-3 font-mono tabular-nums focus-visible:outline focus-visible:outline-stash-gold"/></div>
      {asset&&action==='deposit'&&<p>Collateral factor: <span className="font-mono tabular-nums">{(asset.collateralFactorBps/100).toFixed(2)}%</span>. Final capacity comes from current validated prices and contract state.</p>}
      {review&&<section aria-label="Transaction review" className="space-y-2 rounded-lg border border-stash-border p-4"><h2 className="font-semibold">Review {action}</h2><p className="font-mono tabular-nums">{amount} {asset?.symbol}</p><p>Estimated network fee: <span className="font-mono tabular-nums">{formatUnits(review.fee,18)} USDC</span></p><p>The wallet provides the final network fee. A deposit or withdrawal has no Stash platform fee. Repayment includes the debt amount and accrued lending interest.</p></section>}
      <p>Your wallet shows the network fee before signing. A token approval may require a separate transaction.</p>
      <button className={`${button} bg-stash-gold text-stash-bg`} disabled={busy||!!pending||!auth.isAuthenticated||!asset||step==='confirmed'} aria-busy={busy}>{review?`Confirm ${action}`:'Review transaction'}</button>
    </form>}
    <p aria-live="polite">{step.replaceAll('_',' ')}</p>{error&&<p id="action-error" role="alert" className="text-stash-red">{error}</p>}
    {pending&&<p className="break-all">Transaction: {pending.hash}</p>}
    {step==='pending_recovery'&&pending&&<button className={button} onClick={()=>recover()}>Check confirmation</button>}
    {step==='confirmed'&&<p>Transaction confirmed. <a href="/dashboard" className="text-stash-gold underline">View your account</a></p>}
  </main></>;
}
