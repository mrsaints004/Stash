"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useSendTransaction, usePublicClient, useSwitchChain } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { useProtocol } from '@/hooks/useProtocol';
import { useAuth } from '@/hooks/useAuth';
import { useTrade } from '@/hooks/useTrade';
import { useApi } from '@/hooks/useApi';
import { useStashPower } from '@/hooks/useStashPower';
import { formatUsd } from '@stash/common';

export default function TradePage() {
  const protocol = useProtocol(); const { address, chainId, isConnected } = useAccount();
  const auth = useAuth(); const api = useApi(auth.token); const power = useStashPower(); const trades = useTrade();
  const { sendTransactionAsync } = useSendTransaction(); const client = usePublicClient();
  const { switchChainAsync } = useSwitchChain(); const cache = useQueryClient();
  const [tokenOut, setTokenOut] = useState(''); const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5'); const [step, setStep] = useState('input');
  const [error, setError] = useState<string | null>(null); const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [estimatedNetworkFee,setEstimatedNetworkFee] = useState<string|null>(null);
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(null);
  const storageKey = address ? `stash-pending:${chainId}:${address.toLowerCase()}:trade` : null;
  useEffect(() => { setHash(null); setPendingIntentId(null); setStep('input'); if (!storageKey) return; const saved = localStorage.getItem(storageKey); if (saved) { try { const pending = JSON.parse(saved); setHash(pending.hash); setPendingIntentId(pending.intentId); setStep('pending_recovery'); } catch { localStorage.removeItem(storageKey); } } }, [storageKey]);
  const [reviewedQuoteId, setReviewedQuoteId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const selected = protocol.data?.assets.find(asset => asset.address === tokenOut);
  const quote = trades.quote; const expired = !quote || Date.parse(quote.expiresAt) <= now;
  const busy = ['pending_recovery','quoting','simulating','awaiting_signature','pending','confirming'].includes(step);
  const button = 'min-h-11 rounded-lg border border-stash-border px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stash-gold disabled:opacity-50';
  async function requestQuote() {
    setError(null); setHash(null); setReviewedQuoteId(null); setEstimatedNetworkFee(null);
    try {
      if (!protocol.data || !address || !selected) throw new Error('Select an output asset');
      if (!/^\d+(\.\d{1,6})?$/.test(amount) || parseUnits(amount,6) <= 0n) throw new Error('Enter a positive USDC amount with at most six decimals');
      const bps = Number(slippage)*100;
      if (!Number.isInteger(bps) || bps < 1 || bps > 500) throw new Error('Slippage must be between 0.01% and 5%');
      setStep('quoting'); const result=await trades.getQuote(protocol.data.usdc.address, selected.address, parseUnits(amount,6).toString(), bps); const preview=await trades.prepareTrade(result.quoteId);setEstimatedNetworkFee(preview.fees.network?.amount??null);setStep('review');
    } catch (e) { setError(e instanceof Error ? e.message : 'Quote unavailable'); setStep('input'); }
  }
  async function execute() {
    let submittedHash = hash;
    let preparedIntentId: string | undefined;
    setError(null);
    try {
      if (!quote || quote.quoteId !== reviewedQuoteId || expired || !address || !client || !protocol.data) throw new Error('Review a current quote before confirming');
      setStep('simulating'); const prepared = await trades.prepareTrade(quote.quoteId);
      if (prepared.chainId !== chainId || prepared.to.toLowerCase() !== protocol.data.routerAddress.toLowerCase()) throw new Error('Transaction network or destination mismatch');
      preparedIntentId = prepared.intentId;
      await api.post(`/transactions/${prepared.intentId}/awaiting-signature`);
      setStep('awaiting_signature'); const txHash = await sendTransactionAsync({ to: prepared.to, data: prepared.data, value: BigInt(prepared.value), gas: BigInt(prepared.gas) });
      submittedHash = txHash;
      setHash(txHash); setPendingIntentId(prepared.intentId); if (storageKey) localStorage.setItem(storageKey, JSON.stringify({hash:txHash,intentId:prepared.intentId})); setStep('pending');
      try { await api.post(`/transactions/${prepared.intentId}/submit`, { txHash }); } catch { /* Keep the submitted hash for recovery. */ }
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 2, timeout: 180000 });
      if (receipt.status !== 'success') { if (storageKey) localStorage.removeItem(storageKey); setHash(null); setPendingIntentId(null); submittedHash=null; throw new Error('Transaction reverted; no borrowing or trade was committed'); }
      setStep('confirming'); await trades.confirmTrade(txHash, quote.tokenIn, quote.tokenOut, quote.amountIn, '0');
      if (storageKey) localStorage.removeItem(storageKey);
      await cache.invalidateQueries(); setStep('confirmed');
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Trade could not complete';
      if (!submittedHash && preparedIntentId && /reject|denied/i.test(detail)) try { await api.post(`/transactions/${preparedIntentId}/rejected`); } catch {}
      setError(detail); setStep(submittedHash ? 'pending_recovery' : 'review');
    }
  }
  async function retryConfirmation() {
    if (!hash || !pendingIntentId) return;
    try {
      setStep('confirming');
      const response = await api.post<{data:{status:string}}>(`/transactions/${pendingIntentId}/submit`, {txHash:hash});
      const status = response.data.data.status;
      if (status === 'REVERTED') { if(storageKey)localStorage.removeItem(storageKey); setHash(null);setPendingIntentId(null);setError('Trade reverted; no borrowing or trade was committed.');setStep('input');return; }
      if (status !== 'CONFIRMED') { setStep('pending_recovery');return; }
      if(storageKey)localStorage.removeItem(storageKey);
      await cache.invalidateQueries();setStep('confirmed');
    } catch (e) { setError(e instanceof Error ? e.message : 'Still awaiting confirmation');setStep('pending_recovery'); }
  }
  return <><Header/><main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-semibold">Trade with Stash Power</h1>
    <p className="text-stash-text">Borrow USDC against your collateral and trade in one transaction. Interest accrues until you repay.</p>
    {protocol.isLoading && <div role="status" className="h-40 rounded-lg bg-stash-surface">Loading supported assets…</div>}
    {protocol.error && <div role="alert">Protocol configuration unavailable. <button className={button} onClick={() => protocol.refetch()}>Retry</button></div>}
    {!isConnected && <p>Connect your wallet using the button above.</p>}
    {protocol.data && isConnected && chainId !== protocol.data.chainId && <button className={button} onClick={() => switchChainAsync({chainId:protocol.data!.chainId})}>Switch to {protocol.data.chainName}</button>}
    {isConnected && !auth.isAuthenticated && <button className={button} disabled={auth.isLoading} onClick={auth.login}>Sign in with your wallet</button>}
    {auth.error && <p role="alert">{auth.error}</p>}
    {power.error && <p role="alert">Your available credit could not be verified. <button className={button} onClick={() => power.refetch()}>Retry balances</button></p>}
    {auth.isAuthenticated && !power.error && <div className="rounded-lg bg-stash-surface p-5">Available Stash Power <span className="font-mono tabular-nums">{power.isLoading ? '--' : formatUsd(power.availableCredit)}</span></div>}
    {protocol.data && <form className="space-y-5" onSubmit={e => { e.preventDefault(); requestQuote(); }}>
      <div><label htmlFor="trade-amount" className="block">You pay - USDC</label><input id="trade-amount" type="text" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} aria-describedby="trade-error" onChange={e => {setAmount(e.target.value); setReviewedQuoteId(null); setStep('input');}} className="mt-2 w-full rounded-lg border border-stash-border bg-stash-surface p-3 font-mono focus-visible:outline focus-visible:outline-stash-gold"/></div>
      <div><label htmlFor="trade-output" className="block">You receive</label><select id="trade-output" value={tokenOut} disabled={busy} onChange={e => {setTokenOut(e.target.value); setReviewedQuoteId(null); setStep('input');}} className="mt-2 w-full rounded-lg bg-stash-surface p-3 focus-visible:outline focus-visible:outline-stash-gold"><option value="">Select asset</option>{protocol.data.assets.filter(asset => asset.address.toLowerCase()!==protocol.data!.usdc.address.toLowerCase()).map(asset => <option key={asset.address} value={asset.address}>{asset.symbol}</option>)}</select></div>
      <div><label htmlFor="trade-slippage">Slippage tolerance (%)</label><input id="trade-slippage" type="text" inputMode="decimal" autoComplete="off" value={slippage} disabled={busy} onChange={e => {setSlippage(e.target.value); setReviewedQuoteId(null); setStep('input');}} className="ml-3 rounded-lg bg-stash-surface p-3 font-mono focus-visible:outline focus-visible:outline-stash-gold"/></div>
      <button className={button} disabled={busy || !auth.isAuthenticated || !!power.error || power.isLoading} aria-busy={busy}>Get quote</button>
    </form>}
    {quote && step !== 'input' && selected && <section aria-label="Trade review" className="space-y-3 rounded-lg border border-stash-border bg-stash-surface p-5">
      <h2 className="font-semibold">Review trade</h2>
      <dl className="space-y-2 font-mono tabular-nums">
        <div><dt>New USDC debt</dt><dd>{formatUnits(BigInt(quote.amountIn),6)} USDC</dd></div>
        <div><dt>Estimated output</dt><dd>{formatUnits(BigInt(quote.expectedAmountOut),selected.decimals)} {selected.symbol}</dd></div>
        <div><dt>Minimum received</dt><dd>{formatUnits(BigInt(quote.amountOutMin),selected.decimals)} {selected.symbol}</dd></div>
        <div><dt>Platform fee</dt><dd>{formatUnits(BigInt(quote.fees.platform.amount),6)} USDC</dd></div>
        <div><dt>Estimated network fee</dt><dd>{estimatedNetworkFee===null?'Unavailable':`${formatUnits(BigInt(estimatedNetworkFee),18)} USDC`}</dd></div>
        <div><dt>Variable base borrowing APR</dt><dd>{quote.fees.borrowing.baseApr===undefined?'Unavailable':`${(quote.fees.borrowing.baseApr*100).toFixed(2)}%`} + account risk premium</dd></div>
        {quote.fees.providerItems?.map((fee,index)=><div key={`${fee.label}:${index}`}><dt>{fee.label}</dt><dd>{fee.decimals===null?`${fee.amountAtomic} atomic units`:formatUnits(BigInt(fee.amountAtomic),fee.decimals)} {fee.symbol}</dd></div>)}
        <div><dt>Price impact</dt><dd>{quote.priceImpact === null ? 'Not supplied by provider' : `${(quote.priceImpact*100).toFixed(2)}%`}</dd></div>
        <div><dt>Route</dt><dd>{quote.provider}: {quote.route.join(' → ')}</dd></div>
      </dl>
      <p>Reported provider fees are listed above. DEX pool fees and spreads are reflected in the executable rate; separate amounts may not be supplied. Variable borrowing interest applies. Your wallet displays the network fee before signing.</p>
      <p role="status">{expired ? 'Quote expired. Request a new quote.' : `Quote valid for ${Math.max(0,Math.floor((Date.parse(quote.expiresAt)-now)/1000))} seconds.`}</p>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={reviewedQuoteId===quote.quoteId} disabled={busy} onChange={e => setReviewedQuoteId(e.target.checked?quote.quoteId:null)}/>I reviewed the debt, output and fees.</label>
      <button className={`${button} bg-stash-gold text-stash-bg`} disabled={busy || expired || reviewedQuoteId!==quote.quoteId || step==='confirmed' || !!hash} onClick={execute}>Confirm borrow and trade</button>
    </section>}
    <p aria-live="polite">{step.replaceAll('_',' ')}</p>
    {error && <p id="trade-error" role="alert" className="text-stash-red">{error}</p>}
    {hash && <p className="break-all">Transaction: {hash}</p>}
    {step==='pending_recovery' && <button className={button} onClick={retryConfirmation}>Check transaction confirmation</button>}
    {step==='confirmed' && <p>Trade confirmed. <Link href="/positions" className="text-stash-gold underline">View positions</Link> · <Link href="/repay" className="text-stash-gold underline">Repay debt</Link></p>}
  </main></>;
}
