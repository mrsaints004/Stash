"use client";
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Header} from '@/components/layout/Header';
import {useAuth} from '@/hooks/useAuth';
import {useApi} from '@/hooks/useApi';
interface Alert {id:string;level:string;message:string;createdAt:string;readAt:string|null;}
export default function NotificationsPage(){
 const [error,setError]=useState<string|null>(null);
 const auth=useAuth();const api=useApi(auth.token);const cache=useQueryClient();
 const query=useQuery({queryKey:['risk-alerts',auth.token],enabled:auth.isAuthenticated,queryFn:async()=>(await api.get<{data:Alert[]}>('/risk/alerts')).data.data,refetchInterval:15000,retry:1});
 async function read(id:string){try{setError(null);await api.post(`/risk/alerts/${id}/read`);await cache.invalidateQueries({queryKey:['risk-alerts']});}catch(e){setError(e instanceof Error?e.message:'Could not mark alert read');}}
 return <><Header/><main className="mx-auto max-w-3xl space-y-6 p-6"><h1 className="text-3xl font-semibold">Risk notifications</h1><p className="text-stash-muted">The background worker monitors your position even when this page is closed. These alerts reflect risk at their recorded time; check your current position before acting.</p>{!auth.isAuthenticated&&<button onClick={auth.login} disabled={auth.isLoading} className="min-h-11 rounded-lg border border-stash-border px-4 py-2">Sign in with your wallet</button>}{error&&<p role="alert">{error}</p>}{query.isLoading&&<p role="status">Loading alerts…</p>}{query.error&&<p role="alert">{query.error.message}</p>}{query.data?.length===0&&<p>No recorded risk alerts.</p>}{query.data?.map(alert=><article key={alert.id} className="space-y-3 rounded-lg border border-stash-border bg-stash-surface p-5"><h2 className="font-semibold capitalize">{alert.level}</h2><p>{alert.message}</p><time className="text-sm text-stash-muted" dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleString()}</time>{!alert.readAt&&<button onClick={()=>read(alert.id)} className="ml-4 min-h-11 rounded-lg border border-stash-border px-4">Mark read</button>}</article>)}</main></>;
}
