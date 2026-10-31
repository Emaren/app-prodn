"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";

type View="backup"|"code-health"|"transfer";
type Json=Record<string,unknown>;
const obj=(v:unknown):Json=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
const str=(v:unknown):string=>typeof v==="string"&&v.trim()?v:"UNKNOWN";
const when=(v:unknown):string=>typeof v==="string"&&Number.isFinite(Date.parse(v))?v:"UNKNOWN";
const finite=(v:unknown):string=>typeof v==="number"&&Number.isFinite(v)&&v>=0?String(v):"UNKNOWN";
const labels:Record<View,string>={backup:"Backup OS · Evidence", "code-health":"Code Health · Evidence",transfer:"Storage Transfer · Evidence"};
const endpoints:Record<View,string>={backup:"/api/admin/storage-os","code-health":"/api/admin/aoe2war-os",transfer:"/api/admin/storage-os"};
const links:[View,string][]=[["backup","/admin/backup-os"],["code-health","/admin/code-health"],["transfer","/admin/storage-transfer"]];
export default function OperatorEvidence({mode}:{mode:View}){
 const [data,setData]=useState<Json|null>(null);
 const [status,setStatus]=useState<"LOADING"|"SOURCE_RESPONSE"|"UNKNOWN">("LOADING");
 const [error,setError]=useState<string|null>(null);
 const active=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
   active.current?.abort();
   const ctl=new AbortController();active.current=ctl;
   setData(null);setStatus("LOADING");setError(null);
   try{
     const response=await fetch(endpoints[mode],{method:"GET",credentials:"same-origin",cache:"no-store",signal:ctl.signal});
     if(!response.ok)throw Error("AUTH_OR_EVIDENCE_HTTP_"+response.status);
     const raw:unknown=await response.json();
     const candidate=obj(raw);
     const expected=mode==="code-health"?"snapshot":"planes";
     if(!(expected in candidate))throw Error("EVIDENCE_SCHEMA_MISSING_"+expected);
     if(!ctl.signal.aborted){setData(candidate);setStatus("SOURCE_RESPONSE");}
   }catch(e){if(!ctl.signal.aborted){setStatus("UNKNOWN");setError(e instanceof Error?e.message:"EVIDENCE_UNAVAILABLE");}}
 },[mode]);
 useEffect(()=>{void load();return()=>{active.current?.abort();};},[load]);
 const planes=Array.isArray(data?.planes)?data.planes.map(obj).slice(0,3):[];
 const snap=obj(data?.snapshot),payload=obj(snap.payload),info=obj(payload.info);
 const recent=Array.isArray(data?.recentRuns)?data.recentRuns.map(obj).filter(r=>["status","audit","doctor"].includes(str(r.action))).slice(0,8):[];
 const actualHealth=obj(info.code_health??info.codeHealth);
 return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8 text-slate-100">
   <nav aria-label="Operator evidence pages" className="flex flex-wrap gap-4 text-sm text-cyan-300">
     <Link href="/admin/aoe2war-os">Admin OS</Link><Link href="/admin/storage-os">Storage OS</Link><Link href="/admin/documents-os">Documents OS</Link>
     {links.map(([key,url])=><Link key={url} href={url} aria-current={key===mode?"page":undefined}>{labels[key]}</Link>)}
   </nav>
   <h1 className="text-3xl font-bold">{labels[mode]}</h1>
   <p className="text-sm text-amber-200">Read-only authenticated projection. A browser refresh is NOT a host probe, a restore certificate, a code-scanner execution, or an approved transfer. Missing evidence stays UNKNOWN.</p>
   <button type="button" onClick={()=>void load()} className="rounded-lg border border-cyan-500/50 px-4 py-2 text-cyan-200">Refresh existing signed-source data (GET only)</button>
   <p role="status">Evidence response: {status} {error?"· "+error:""}</p>
   {mode!=="code-health" ? <section className="space-y-3" aria-label="Storage evidence">
     <h2 className="text-xl font-semibold">Three measured planes (signed receipt distinct from operator snapshot)</h2>
     <p>Original source: <code>/api/admin/storage-os</code>; signed admission: <strong>{str(data?.signedAdmission)}</strong>; bridge online: {data?.bridgeOnline===true?"SOURCE_REPORTED_ONLINE":data?.bridgeOnline===false?"SOURCE_REPORTED_OFFLINE":"UNKNOWN"}</p>
     <ul className="grid gap-3 md:grid-cols-3">{planes.map((p,i)=><li key={str(p.id)+i} className="rounded-xl border border-white/20 p-4"><h3 className="font-bold">{str(p.label)}</h3><p>Status: {str(p.status)}</p><p>Origin: {str(p.source)}</p><p>Observed: {when(p.asOf)}</p><p>Free bytes: {finite(p.freeBytes)}</p><p>Used percentage: {finite(p.usedPercent)}</p></li>)}</ul>
     {planes.length===0&&<p>UNKNOWN: no verified storage evidence connected.</p>}
     {mode==="backup"?<p className="rounded border border-amber-500/40 p-3">Independent off-host restore count and encrypted-custody acceptance are NOT certified by this Storage OS API. Verify original E signed restore receipts before any positive backup claim. Certified restores: UNKNOWN.</p>:<p className="rounded border border-amber-500/40 p-3">No transfer run is authorized here. Zero staging, decrypt, copy, deletion, HTTP POST or file movement. Reviewed owner decisions in the Storage OS are not transport permits. Transfer execution: NOT ENABLED.</p>}
   </section>:<section className="space-y-4" aria-label="Code Health evidence">
     <p>Source: <code>/api/admin/aoe2war-os</code> authenticated dashboard. Published bridge snapshot: {when(snap.generatedAt)}. Distinct scanner receipt and source SHA required for actual Code Health PASS.</p>
     <p>Code Health scanner evidence: <strong>{Object.keys(actualHealth).length?"SOURCE_PRESENT_UNCERTIFIED":"UNKNOWN"}</strong></p>
     <ul>{Object.entries(actualHealth).filter(([key,value])=>typeof value==="string"||typeof value==="boolean"||typeof value==="number").slice(0,8).map(([key,value])=><li key={key}>{key}: {String(value).slice(0,120)}</li>)}</ul>
     <h2 className="text-xl font-semibold">Bounded OS inspection runs (not Code Health certifications)</h2>
     <ul>{recent.map((entry,i)=><li className="rounded border border-white/15 px-3 py-2" key={i}>{str(entry.action)} — {str(entry.status)} — {when(entry.updatedAt)}</li>)}</ul>
     {!recent.length&&<p>UNKNOWN: no recent bounded read-only OS inspection run.</p>}
   </section>}
 </main>;
}
