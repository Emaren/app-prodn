"use client";

/** The Explorer's in-place queue of owner-review suggestions. No auto-action. */
import {ArrowUpRight,ShieldAlert} from "lucide-react";
import type {TeachingEvent} from "@/lib/storageHogTeachingLedger";
import type {TeachingPlane} from "@/lib/storageHogTeachingPolicy";
import type {VisualHog} from "@/lib/storageVisualPrivate";
import {buildStorageReviewQueue} from "@/lib/storageLevel2ReviewQueue";

const formatBytes=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+" GiB":
  n>=1024**2?(n/1024**2).toFixed(1)+" MiB":n+" B";
export default function StorageReviewQueue({plane,observedAt,hogs,events,ownerBinding,admitted,onInspect,now}:{
  plane:TeachingPlane;observedAt:string|null;hogs:readonly VisualHog[];
  events:readonly TeachingEvent[];ownerBinding:string|null;admitted:boolean;
  onInspect:(category:string)=>void;now:number;
}){
  const queue=buildStorageReviewQueue({
    plane,observedAt,hogs,events,ownerBinding,signedCurrent:admitted,now,
  });
  const candidates=queue.items.filter(x=>x.suggestion.finding==="REVIEW_SUGGESTED").length;
  return <section aria-label="Owner Level 2 review queue"
    className="rounded-[24px] border border-white/[.09] bg-[#0c1624]/90 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black tracking-[.26em] text-cyan-300">SOURCE-BOUND OWNER REVIEW QUEUE</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Level 2 recommendations</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
          Classification asks what an object is. Recommendation invites a closer look.
          Execution always requires a separate exact-file permit and independent restore.
          All entries here are gross categories, never signed file objects.</p>
      </div>
      <span className="rounded-full border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-200">
        {queue.admitted?candidates+" suggested / "+queue.items.length+" observed":"UNKNOWN · awaiting signed owner evidence"}
      </span>
    </div>
    {!queue.admitted?<p className="mt-5 rounded-xl border border-dashed border-amber-300/25 p-5 text-sm text-amber-100">
      Queue withheld. Requires current signed category evidence and an enrolled, verified owner
      learning ledger. No historical or estimated file sizes are substituted.</p>:
    queue.items.length===0?<p className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
      This authenticated observation contains no categories. No cleanup target was inferred.</p>:
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      {queue.items.map(({hog,suggestion,sourceObservedAt})=><article key={hog.key}
        className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-bold text-white">{hog.label}</h3>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{hog.key}</p></div>
          <span className={"shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold "+
            (suggestion.finding==="REVIEW_SUGGESTED"?"border-cyan-300/30 text-cyan-200":"border-amber-300/20 text-amber-200")}>
            {suggestion.finding.replaceAll("_"," ")}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          <span>Gross {formatBytes(hog.grossBytes)}</span>
          <span>Source floor L{hog.level}</span>
          <span>{hog.overlaps?"Overlap possible":"No reported overlap · not independently deduplicated"}</span>
          <span>Confidence {suggestion.confidence}</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          {plane} · observed <time dateTime={sourceObservedAt} title={sourceObservedAt}>{sourceObservedAt}</time>
          {" · "}Prior owner examples {suggestion.exampleCount}
          {" · "}Valid until {suggestion.validUntilUtc??"UNKNOWN"}</div>
        <p className="mt-3 text-xs leading-5 text-slate-300">{suggestion.explanation}</p>
        <p className="mt-2 text-xs text-amber-100">
          <ShieldAlert className="mr-1 inline h-3 w-3"/> Required: verify precise identity,
          active dependencies, snapshots, clones/hardlinks, recovery and current policy.</p>
        <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
          {suggestion.exceptions.map(exception=><li key={exception}>• {exception}</li>)}
        </ul>
        <button type="button" onClick={()=>onInspect(hog.key)}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-300/10">
          Inspect category · owner chooses <ArrowUpRight className="h-3 w-3"/>
        </button>
        <p className="mt-2 text-[10px] font-bold text-slate-400">REVIEW ONLY · NO FILE IDENTITY · NO DELETION AUTHORITY</p>
      </article>)}
    </div>}
  </section>;
}
