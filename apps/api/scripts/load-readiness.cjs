/* Read-only load probe. Usage: LOAD_BASE_URL=https://... LOAD_REQUESTS=100 node scripts/load-readiness.cjs */
async function main(){
 const url=new URL(process.env.LOAD_BASE_URL||'http://localhost:3001');const total=Number(process.env.LOAD_REQUESTS||100),concurrency=Number(process.env.LOAD_CONCURRENCY||5);
 if(!Number.isInteger(total)||total<1||total>10000||!Number.isInteger(concurrency)||concurrency<1||concurrency>50)throw new Error('Invalid probe limits');
 let next=0;const times=[],statuses={};
 await Promise.all(Array.from({length:concurrency},async()=>{while(next++<total){const started=performance.now();try{const response=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(15000)});await response.text();statuses[response.status]=(statuses[response.status]||0)+1;}catch{statuses.networkErrors=(statuses.networkErrors||0)+1;}times.push(performance.now()-started);}}));
 times.sort((a,b)=>a-b);console.log(JSON.stringify({requests:times.length,concurrency,statuses,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],p99Ms:times[Math.min(times.length-1,Math.floor(times.length*.99))]},null,2));
 if(statuses.networkErrors||Object.keys(statuses).some(status=>status!=='200'))process.exitCode=1;
}
main().catch(()=>{console.error('Readiness probe failed');process.exitCode=1;});
