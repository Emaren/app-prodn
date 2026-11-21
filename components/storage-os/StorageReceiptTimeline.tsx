"use client";

import type {TeachingEvent} from "@/lib/storageHogTeachingLedger";

/** No separate scanner, event writer or fabricated client-side operations.
 * The parent gets this data only from the authenticated ledger GET, whose
 * HMAC and independent tip verification must succeed before status=VERIFIED.
 */
const PRODUCERS=[
  ["Factory / Retention","Factory source-owned release and retirement receipts"],
  ["Housekeeping","M1 daily signed observation and maintenance receipts"],
  ["VPSSentry","HEL1 source health, drift and incident receipts"],
  ["Intel Cold Storage","Encrypted copy, restoration and archive receipts"],
] as const;
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-f0-9-]{36}$/;
export default function StorageReceiptTimeline({
 events,ledgerStatus,ownerBinding,
}:{
 events:readonly TeachingEvent[];ledgerStatus:string;ownerBinding:string|null;
}){
 const admitted=ledgerStatus==="VERIFIED" && !!ownerBinding;
 const seen=new Set<string>();
 const persisted=admitted?events.filter(e=>
   e.ownerBinding===ownerBinding && ID.test(e.id) && SHA.test(e.digestSha256) &&
   Number.isFinite(Date.parse(e.at))
 ).map(e=>{
   const key=e.plane+":"+e.category;
   const correction=seen.has(key);seen.add(key);
   return {event:e,correction};
 }).slice(-15).reverse():[];
 return <section aria-label="Storage OS persisted operations timeline"
   className="rounded-[24px] border border-white/[.09] bg-[#0c1624]/90 p-5 sm:p-7">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div>
       <p className="text-[10px] font-black tracking-[.26em] text-cyan-300">SOURCE-OWNED EVENT RECEIPTS</p>
       <h2 className="mt-2 text-2xl font-bold text-white">Storage operations history</h2>
       <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">
         Persisted source receipts only. Polling never generates an operation. A classification is owner
         feedback, never a prune, archive transfer or physical reclaim.
       </p>
     </div>
     <span className="rounded-full border border-white/20 px-3 py-2 text-xs text-slate-200">
       {admitted?"OWNER LEDGER VERIFIED":"OWNER LEDGER "+ledgerStatus}
     </span>
   </div>
   {persisted.length===0?<div className="mt-4 rounded-xl border border-dashed border-amber-300/20 p-4 text-sm text-amber-100">
     No authenticated owner teaching receipt is currently available to this browser.
     No event or recovered-byte amount has been inferred.
   </div>:
   <ol className="mt-5 max-h-96 space-y-3 overflow-y-auto" aria-label="Verified owner events">
     {persisted.map(({event,correction})=><li key={event.id}
       className="rounded-xl border border-cyan-300/15 bg-black/20 p-4">
       <div className="flex flex-wrap items-center justify-between gap-2">
         <strong className="text-sm text-white">{correction?"Classification correction":"Owner classification recorded"}</strong>
         <time dateTime={event.at} className="font-mono text-xs text-slate-300">{event.at}</time>
       </div>
       <div className="mt-2 text-xs text-slate-300">
         <strong>Producer:</strong> Storage OS teaching ledger · <strong>Owning executor:</strong>
         {" "}enrolled owner account · <strong>Status:</strong> COMMITTED / NO DELETE
       </div>
       <div className="mt-1 text-xs text-slate-300">
         {event.plane} / {event.category} · {event.domain?.replaceAll("_"," ")??"legacy domain not recorded"}
         {" · "}{event.lifecycle?.replaceAll("_"," ")??"legacy lifecycle not recorded"}
         {" · "}L{event.effectiveLevel}
       </div>
       <div className="mt-2 break-all font-mono text-[11px] text-slate-400">
         Receipt ID: {event.id} · SHA-256: {event.digestSha256}
       </div>
     </li>)}
   </ol>}
   <div className="mt-5 grid gap-2 sm:grid-cols-2">
     {PRODUCERS.map(([name,why])=><div key={name}
       className="rounded-xl border border-white/10 bg-black/20 p-3">
       <div className="text-sm font-semibold text-slate-100">{name}</div>
       <div className="mt-1 text-[11px] text-amber-100">NOT ADMITTED · no verified timeline event</div>
       <div className="mt-1 text-[11px] leading-5 text-slate-400">{why}</div>
     </div>)}
   </div>
 </section>;
}
