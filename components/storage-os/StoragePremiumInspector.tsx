"use client";

/**
 * Premium read-only inventory. Exactly three selected source-owned planes.
 * Never browse browser-supplied paths or infer individual files from hog buckets.
 */
import {useMemo,useState} from "react";
import StorageArchivePreference from "./StorageArchivePreference";
import {Archive,ChevronRight,Clock3,FileSearch,HardDrive,LockKeyhole,ShieldAlert,ShieldCheck} from "lucide-react";
import {INDIVIDUAL_TRANSPORT_ADOPTED} from "@/lib/storageReviewTransportPolicy";
import type {PlaneId,VisualReviewItem,VisualCapacitySample} from "@/lib/storageVisualPrivate";
import type {signedHogInventory} from "@/lib/storageSignedFreshness";

type Sort = "largest"|"smallest"|"name"|"protection";
const FLOW = [
  "DISCOVER","VERIFY IDENTITY","OWNER CLASSIFIES","EXACT MANIFEST",
  "RECHECK DEPENDENCIES","CHECK RECOVERY","DRY RUN",
  "OWNER APPROVES","EXECUTE","VERIFY PHYSICAL RECLAIM","AUDIT",
] as const;
const LABELS:Record<PlaneId,string>={
  mac:"M1 / APFS Data","hel1-root":"HEL1 / OS root",
  "hel1-volume-105319120":"HEL1 / Data volume 105319120",
};
function size(n:number|null|undefined){
  if(n===null||n===undefined||!Number.isSafeInteger(n)||n<0)return "UNKNOWN";
  return n>=1073741824?(n/1073741824).toFixed(2)+" GiB":n>=1048576?(n/1048576).toFixed(1)+" MiB":n+" B";
}
function badge(t:string){
  const c=t==="VERIFIED"?"text-emerald-200 border-emerald-300/30":
    t==="PARTIAL"?"text-amber-200 border-amber-300/30":
    t==="STALE"?"text-orange-200 border-orange-300/30":"text-slate-300 border-slate-500/40";
  return "rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wider "+c;
}
function trendPoints(samples:VisualCapacitySample[]) {
  if(samples.length<2)return "";
  const vals=samples.map(s=>s.ordinaryFreeBytes),min=Math.min(...vals),max=Math.max(...vals);
  const span=max-min||1;
  return vals.map((v,i)=>String(8+i*284/(vals.length-1))+","+
    String(60-48*(v-min)/span)).join(" ");
}
export default function StoragePremiumInspector({inventorySource,activeId}:{
  inventorySource:ReturnType<typeof signedHogInventory>;activeId:PlaneId;
}){
  const [sort,setSort]=useState<Sort>("largest");
  const [chosen,setChosen]=useState<string|null>(null);
  const [openLevel,setOpenLevel]=useState<1|2|3|4|5>(2);
  const [dryRun,setDryRun]=useState<string|null>(null);
  const {plane,status:confidence}=inventorySource;
  const items=INDIVIDUAL_TRANSPORT_ADOPTED&&confidence==="PARTIAL"?plane?.reviewItems:undefined;
  const inventory=useMemo(()=>{
    const a=[...(items??[])];
    a.sort((x,y)=>sort==="largest"?y.grossBytes-x.grossBytes:
      sort==="smallest"?x.grossBytes-y.grossBytes:
      sort==="name"?x.alias.localeCompare(y.alias):y.level-x.level);
    return a;
  },[items,sort]);
  const focused=inventory.find(x=>x.alias===chosen)??null;
  const samples=INDIVIDUAL_TRANSPORT_ADOPTED?(plane?.capacitySamples??[]):[];
  const stages=FLOW.map((name,i)=>({
    name,verdict:i===0&&confidence==="PARTIAL"?"PARTIAL":"HOLD",
  }));
  const preview=async(item:VisualReviewItem)=>{
    setDryRun("Verifying signed source-bound preflight…");
    try{
      const response=await fetch("/api/admin/storage-os/dry-run",{
        method:"POST",cache:"no-store",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({plane:activeId,alias:item.alias,
          observedAt:plane?.observedAt,sourceDigest:item.sourceDigest}),
      });
      const body=await response.json() as {status?:string;reason?:string;manifestDigest?:string};
      setDryRun(response.ok?
        "Manifest draft "+(body.manifestDigest??"UNKNOWN")+
          " · identity, dependencies, recovery and physical reclaim remain HOLD":
        "HOLD / "+(body.reason??"NO CERTIFIED EXACT-FILE SOURCE"));
    }catch{setDryRun("HOLD / source-bound dry-run unavailable");}
  };
  return <section aria-label="Premium storage file inspection" className="space-y-4">
    <div className="rounded-[26px] border border-white/10 bg-[#0c1624]/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,.2)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[.3em] text-cyan-300">DEEP INSPECTOR / SIGNED INVENTORY</p>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Exact-file review chamber</h2>
          <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-400">
            <span>Storage OS</span><ChevronRight className="h-3.5 w-3.5"/>
            <span>{LABELS[activeId]}</span>{focused&&<><ChevronRight className="h-3.5 w-3.5"/>
              <span className="font-mono text-cyan-200">{focused.alias}</span></>}
          </div>
        </div>
        <span className={badge(confidence)}>{confidence} · BOUNDED COLLECTOR</span>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400"><FileSearch className="h-4 w-4"/> Admitted individual files</div>
          <div className="mt-2 text-3xl font-black tabular-nums text-white">{items ? inventory.length : "UNKNOWN"}</div>
          <div className="mt-1 text-[11px] text-slate-400">No category is an individual file</div>
        </div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.025] p-4">
          <div className="flex items-center gap-2 text-xs text-cyan-200"><ShieldCheck className="h-4 w-4"/> Level 1 certified</div>
          <div className="mt-2 text-2xl font-black text-white">ZERO CERTIFIED ITEMS</div>
          <div className="mt-1 text-[11px] text-slate-400">Whole-disk scan/dependency proof not accepted</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-4 w-4"/> Last host observation</div>
          <div className="mt-3 break-all font-mono text-xs font-bold text-white">{plane?.observedAt??"UNKNOWN"}</div>
          <div className="mt-1 text-[11px] text-slate-400">Browser refresh is not a host scan</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400"><HardDrive className="h-4 w-4"/> Allocated / logical</div>
          <div className="mt-2 text-xl font-black text-white">{confidence} / UNKNOWN</div>
          <div className="mt-1 text-[11px] text-slate-400">Gross categories can overlap on disk</div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-white">Sortable individual-file inventory</h3>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Sort
              <select aria-label="Sort exact-file inventory" value={sort}
                onChange={e=>setSort(e.target.value as Sort)}
                className="rounded-lg border border-white/20 bg-slate-900 p-2 text-slate-100">
                <option value="largest">Largest allocated</option>
                <option value="smallest">Smallest allocated</option>
                <option value="name">Alias A–Z</option>
                <option value="protection">Protection level</option>
              </select>
            </label>
          </div>
          {inventory.length===0?
            <div className="mt-4 flex min-h-[190px] flex-col justify-center gap-3 rounded-xl border border-dashed border-amber-300/20 bg-amber-400/[.025] p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-100"><ShieldAlert className="h-5 w-5"/> Exact-file inventory not admitted</div>
              <p className="max-w-xl text-xs leading-6 text-slate-400">Current C/G signed transport authenticates gross buckets only. The bounded V2 collector is partial; until its individual identity, mount, source and proof schema passes independent admission, no filename, inode, file-size ranking or cleanup target will be invented.</p>
            </div>:
            <div className="mt-4 max-h-[330px] space-y-2 overflow-auto">{inventory.map(item=>
              <button type="button" key={item.alias} onClick={()=>{setChosen(item.alias);setDryRun(null);}}
                className={"flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left "+
                  (chosen===item.alias?"border-cyan-300/50 bg-cyan-300/[.06]":"border-white/10 hover:border-white/30")}>
                <span className="min-w-0 truncate font-mono text-xs text-slate-200">{item.alias}</span>
                <span className="shrink-0 text-xs text-slate-400">L{item.level} · {size(item.grossBytes)}</span>
              </button>)}</div>}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <h3 className="font-bold text-white">Free-space trend</h3>
          <div className="mt-3 text-[11px] text-slate-400">Native ordinary-available bytes · signed observations only</div>
          {samples.length>=2?
            <svg role="img" aria-label="Signed native free-space samples" viewBox="0 0 300 74" className="mt-4 w-full">
              <path d="M 8 66 H 292" fill="none" stroke="#334155"/>
              <polyline points={trendPoints(samples)} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round"/>
            </svg>:
            <div className="mt-5 flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400">UNKNOWN — no admitted signed history series</div>}
          <div className="mt-3 text-xs text-slate-400">Latest signed sample: <strong className="text-white">{samples.length?size(samples[samples.length-1].ordinaryFreeBytes):"UNKNOWN"}</strong></div>
          <div className="mt-3 rounded-lg border border-amber-300/15 p-3 text-[11px] leading-5 text-amber-100">
            Physical reclaimed space requires before/after native filesystem readings. Logical or gross bytes never qualify.
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 p-4">
        <h3 className="font-bold text-white">Granite protection & owner teaching</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {([1,2,3,4,5] as const).map(level=>
            <button key={level} type="button" onClick={()=>setOpenLevel(level)} aria-pressed={openLevel===level}
              className={"min-h-[90px] rounded-xl border p-3 text-left text-xs transition "+
                (level===5?"border-stone-400/45 bg-[repeating-linear-gradient(135deg,#252525,#252525_7px,#404040_8px,#292929_12px)] text-stone-100":
                  openLevel===level?"border-cyan-300/50 bg-cyan-300/[.07] text-cyan-100":"border-white/10 bg-white/[.025] text-slate-300")}>
              <div className="flex items-center gap-2 font-black">{level===5?<LockKeyhole className="h-4 w-4"/>:<Archive className="h-4 w-4"/>} LEVEL {level}</div>
              <div className="mt-2 text-[10px]">{level===1?"Proven disposable":level===2?"Owner-taught candidate":level===3?"Protected":level===4?"High-value retention":"PERMANENTLY UNTOUCHABLE"}</div>
            </button>)}
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-400">{openLevel===5?
          "GRANITE LOCK: no delete capability, override endpoint or bulk-selection authority exists.":openLevel===4?
          "High-value material remains visible for preservation and recovery review; software deletion is unavailable.":openLevel===3?
          "Protected means review and inspection only. No execution is admitted.":openLevel===2?
          "Classification is owner feedback, not an execution permit. Every future individual file must preserve its original identity.":
          "L1 certification requires complete accepted coverage, nondependency and retention evidence. Current count is zero."}</p>
      </div>
      <StorageArchivePreference plane={activeId}/>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-bold text-white">Exact-manifest dry-run rail</h3><p className="mt-1 text-xs text-slate-400">Source-bound inspection only; never an execution shortcut</p></div>
          <button type="button" disabled={!focused||focused.level>2||confidence!=="PARTIAL"}
            onClick={()=>focused&&void preview(focused)}
            className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-35">
            Inspect manifest draft
          </button>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{stages.map((s,i)=>
          <li key={s.name} className="rounded-lg border border-white/10 px-3 py-3">
            <div className="text-[10px] text-slate-400">{String(i+1).padStart(2,"0")} / 11</div>
            <div className="mt-1 text-[11px] font-bold text-slate-100">{s.name}</div>
            <div className="mt-2 text-[10px] font-black text-amber-200">{s.verdict}</div>
          </li>)}</ol>
        <div aria-live="polite" className="mt-4 text-xs text-amber-100">{dryRun??"HOLD · no authorized native executor, owner single-use delete permit or accepted independent restore."}</div>
      </div>
    </div>
  </section>;
}
