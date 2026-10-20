"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {ArrowUpRight,Archive,BookOpen,Boxes,ChevronRight,CircleDot,ClipboardCheck,Cpu,Database,GitBranch,GitMerge,Layers,Map,Network,Radio,ScanSearch,Search,Shield,ShieldCheck,Workflow,Zap} from "lucide-react";
import type {RenaissanceSnapshot,RenaissanceRoute,RenaissanceMode} from "@/lib/renaissance/registry";

const VIEWS=[
 {id:"command",href:"/renaissance",title:"RENAISSANCE OS",sub:"Command",icon:Layers},
 {id:"atlas",href:"/renaissance/atlas",title:"THE ATLAS",sub:"Cartography",icon:Map},
 {id:"circuit",href:"/renaissance/circuit",title:"THE CIRCUIT",sub:"Dependencies",icon:Network},
 {id:"marshal",href:"/renaissance/marshal",title:"THE MARSHAL",sub:"Coordination",icon:Shield},
 {id:"doctor",href:"/renaissance/doctor",title:"THE DOCTOR",sub:"Diagnostics",icon:ScanSearch},
 {id:"vault",href:"/renaissance/vault",title:"THE VAULT",sub:"Evidence",icon:Archive},
 {id:"arbiter",href:"/renaissance/arbiter",title:"THE ARBITER",sub:"Certification",icon:ShieldCheck},
 {id:"forge",href:"/renaissance/forge",title:"TEST FORGE",sub:"Browser laboratory",icon:Cpu},
 {id:"architect",href:"/renaissance/architect",title:"THE ARCHITECT",sub:"Planning",icon:Boxes},
 {id:"train",href:"/renaissance/train",title:"INTEGRATION TRAIN",sub:"Protected delivery",icon:GitMerge},
 {id:"sentinel",href:"/renaissance/sentinel",title:"THE SENTINEL",sub:"Regression patrol",icon:Radio},
 {id:"chronicles",href:"/renaissance/chronicles",title:"THE CHRONICLES",sub:"Engineering memory",icon:BookOpen},
] as const;
const AUTHORITIES=[
 {name:"GIT",detail:"SOURCE",type:"origin"},
 {name:"INTELLIGENCE",detail:"OPERATIONS",type:"observation"},
 {name:"STEAM",detail:"RATINGS",type:"domain"},
 {name:"REPLAY",detail:"OUTCOME",type:"domain"},
 {name:"WOLO",detail:"CHAIN / LEDGER",type:"domain"},
 {name:"INDEX",detail:"QUALITY",type:"assurance"},
 {name:"RELEASE",detail:"DEPLOYMENT",type:"production"},
];
const TRAIN=["SOURCE","DEPENDENCIES","TESTS","REVIEW","BUILD","PRODUCTION","CERTIFICATE"] as const;
const DOCS=[
 {name:"Intelligence",path:"docs/KINGDOM_INTELLIGENCE.md",tag:"OBSERVATION"},
 {name:"Brain & Progress",path:"docs/KINGDOM_BRAIN_PROGRESS.md",tag:"DEPENDENCIES"},
 {name:"Instruments",path:"docs/KINGDOM_TRANSPARENT_MACHINERY.md",tag:"SURFACES"},
 {name:"Performance",path:"docs/PERFORMANCE_OS.md",tag:"SPEED"},
 {name:"Inspections",path:"docs/GENERAL_INSPECTIONS.md",tag:"TESTS"},
 {name:"Renaissance OS",path:"docs/RENAISSANCE_OS.md",tag:"CANDIDATE"},
];
const PHASE_NUMBERS=["01","02","03","04","05","06","07"];
type Props={mode:RenaissanceMode;snapshot:RenaissanceSnapshot};
function nodeArc(i:number,total:number,rx:number,ry:number,cx:number,cy:number){const a=-Math.PI/2+2*Math.PI*i/total;return {x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry};}
function PhaseEngine({snapshot,mode}:{snapshot:RenaissanceSnapshot;mode:RenaissanceMode}){
 const total=snapshot.totalTemplates;
 const max=Math.max(...snapshot.phases.map(p=>p.total));
 return <div className="rx-engine" aria-label="Campaign route distribution by phase">
   <div className="rx-engine-glow" aria-hidden="true"/>
   <svg className="rx-engine-svg" viewBox="0 0 820 400" role="img" aria-label={"Seven priority phases containing "+total+" baseline source templates"}>
     <defs>
      <radialGradient id="rx-core"><stop stopColor="#d9ebff" stopOpacity=".7"/><stop offset=".14" stopColor="currentColor" stopOpacity=".5"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient>
      <pattern id="rx-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="currentColor" opacity=".22"/></pattern>
     </defs>
     <rect width="820" height="400" fill="url(#rx-dots)"/>
     <circle cx="410" cy="200" r="133" fill="none" stroke="currentColor" strokeOpacity=".14" strokeDasharray="2 9" strokeWidth="2"/>
     <circle cx="410" cy="200" r="98" fill="none" stroke="currentColor" strokeOpacity=".22"/>
     <circle cx="410" cy="200" r="70" fill="url(#rx-core)" opacity=".27"/>
     {snapshot.phases.map((p,i)=>{
       const inner=nodeArc(i,7,98,98,410,200),outer=nodeArc(i,7,210,168,410,200);
       const radius=11+15*p.total/max;
       return <g key={p.id}>
         <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" strokeOpacity=".40" strokeWidth="1.5"/>
         <circle cx={outer.x} cy={outer.y} r={radius+8} stroke="currentColor" strokeOpacity=".28" strokeDasharray="3 6" fill="none"/>
         <circle cx={outer.x} cy={outer.y} r={radius} stroke="currentColor" strokeOpacity=".65" fill="#081321"/>
         <text x={outer.x} y={outer.y+5} fill="#f2f8ff" fontWeight="800" fontSize="16" textAnchor="middle">{p.total}</text>
         <text x={outer.x} y={outer.y-radius-16} fill="currentColor" fontSize="11" fontWeight="800" textAnchor="middle" letterSpacing="2">{p.code}</text>
       </g>;
     })}
     <circle cx="410" cy="200" r="54" stroke="currentColor" strokeOpacity=".7" fill="#060d19" strokeWidth="2"/>
     <text x="410" y="198" textAnchor="middle" fontSize="35" fontWeight="900" fill="#ffffff">{total}</text>
     <text x="410" y="220" textAnchor="middle" fontSize="9" letterSpacing="2.7" fill="currentColor">BASELINE</text>
   </svg>
   <div className="rx-engine-mode" aria-hidden="true">{mode==="command"?"KINGDOM / 07 PHASES":"SOURCE GRAPH / STATIC"}</div>
 </div>;
}
function ScoreRing({value,label}:{value:number;label:string}){
 return <div className="rx-score-ring" style={{background:`conic-gradient(var(--rx-ink) 0 ${value}%,rgba(255,255,255,.055) ${value}% 100%)`}}>
  <div className="rx-ring-core"><b>{value}</b><span>{label.replaceAll("_"," ")}</span><small>MAX / NOT AWARDED</small></div>
 </div>;
}
function MiniStat({big,label,foot}:{big:string|number;label:string;foot?:string}){
 return <div className="rx-ministat"><div className="rx-ministat-big">{big}</div><span>{label}</span>{foot&&<small>{foot}</small>}</div>;
}
function RouteRows({routes,limit=24}:{routes:RenaissanceRoute[];limit?:number}){
 return <div className="rx-route-table" role="list" aria-label="Public route campaign queue">
  {routes.slice(0,limit).map(r=><Link role="listitem" key={r.href} href={r.href} className="rx-route-row">
    <span className="rx-rank">{String(r.rank).padStart(3,"0")}</span>
    <span className="rx-route-url">{r.href}</span>
    <span className="rx-route-kind">{r.phaseCode}</span>
    <span className="rx-route-status">{r.indexed?r.status.toUpperCase():"NOT INDEXED"}</span>
    <ArrowUpRight size={13} aria-hidden="true"/>
  </Link>)}
  {routes.length>limit&&<div className="rx-route-overflow">+ {routes.length-limit} further public-visible entries · narrow the filter to inspect them</div>}
 </div>;
}
function PhaseBars({snapshot}:{snapshot:RenaissanceSnapshot}){
 const m=Math.max(...snapshot.phases.map(x=>x.total));
 return <div className="rx-phase-bars">
  {snapshot.phases.map((p,i)=><div className="rx-phase-bar-row" key={p.id}>
   <span>{PHASE_NUMBERS[i]}</span><div className="rx-bar-groove"><div className="rx-bar-fill" style={{width:(p.total/m*100)+"%"}}/></div>
   <strong>{p.total}</strong><small>{p.code}</small>
  </div>)}
 </div>;
}
function Circuit(){
 return <div className="rx-circuit-scene">
  <div className="rx-circuit-hub"><span className="rx-circuit-halo"/><Database size={32}/><strong>SOURCE</strong><small>TRUTH BOUNDARY</small></div>
  <div className="rx-circuit-spokes" aria-label="Declared cross-system authority nodes">
   {AUTHORITIES.map((a,i)=><div className="rx-authority" key={a.name}><span>{String(i+1).padStart(2,"0")}</span><b>{a.name}</b><small>{a.detail}</small></div>)}
  </div>
  <div className="rx-scene-note">DECLARED AUTHORITY GRAPH · NOT RUNTIME HEALTH</div>
 </div>;
}
function ForgeGates({snapshot}:{snapshot:RenaissanceSnapshot}){
 const [profile,setProfile]=useState("rankings");
 const choice=snapshot.profiles.find(x=>x.id===profile)??snapshot.profiles[0];
 return <div className="rx-stack">
  <div className="rx-catalog-strip">
   <label htmlFor="rx-profile">ASSURANCE PROFILE</label>
   <select id="rx-profile" value={profile} onChange={e=>setProfile(e.target.value)}>
    {snapshot.profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
   </select>
  </div>
  <div className="rx-proving-field" role="list">
   {choice?.gates.length?choice.gates.map((g,i)=><div role="listitem" key={g.id} className="rx-proof-gate">
    <span>{String(i+1).padStart(2,"0")}</span><span><b>{g.id.replaceAll("-"," ").toUpperCase()}</b><small>{g.dimension.toUpperCase()} · {g.requirement}</small></span><i>UNVERIFIED</i>
   </div>):<div className="rx-null">GENERAL PROFILE · STANDARD FIVE-DIMENSION RUBRIC APPLIES</div>}
  </div>
  <div className="rx-circuit-caption"><ClipboardCheck size={15}/> Profile requirements are real source contracts. No browser execution is asserted.</div>
 </div>;
}
function TrainField(){return <div className="rx-train-field"><div className="rx-track-glow"/>
  <div className="rx-train-track" role="list" aria-label="Protected release qualification stages">
  {TRAIN.map((s,i)=><div role="listitem" className="rx-train-station" key={s}>
   <div className="rx-train-marker"><span>{String(i+1).padStart(2,"0")}</span></div>
   <b>{s}</b><small>{i===0?"GIT AUTHORITY":i===1?"CLOSURE":i===2?"CI EVIDENCE":i===3?"OWNER REVIEW":i===4?"ARTIFACT":i===5?"PROTECTED FINISH":"LIVE PROOF"}</small>
   <i>NOT ATTESTED HERE</i>
  </div>)}
  </div>
  <div className="rx-train-warning"><Shield size={18}/> WOLO FINANCIAL RELEASE HOLD IS INDEPENDENT · NO DEPLOYMENT AUTHORIZED</div>
 </div>;}
function SentinelField({snapshot}:{snapshot:RenaissanceSnapshot}){
 const indexed=snapshot.routes.filter(r=>r.indexed);
 const states=["current","provisional","drifted","stale","unmeasured"] as const;
 return <div className="rx-sentinel">
   <div className="rx-radar-field"><div className="rx-radar-line"/><div className="rx-radar-dot rx-dot-a"/><div className="rx-radar-dot rx-dot-b"/><div className="rx-radar-core"><Radio size={28}/><span>SOURCE READ</span></div></div>
   <div className="rx-signal-list">{states.map(s=><div key={s} className="rx-signal"><span>{s.toUpperCase()}</span><strong>{indexed.filter(r=>r.status===s).length}</strong><div className="rx-signal-bar" style={{width:(indexed.length?indexed.filter(r=>r.status===s).length/indexed.length*100:0)+"%"}}/></div>)}
   <div className="rx-signal-foot">Existing Index classifications only · not continuous patrol execution</div></div>
 </div>;
}
export default function RenaissanceCanvas({mode,snapshot}:Props){
 const [phase,setPhase]=useState("ALL");
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState("/kingdom-intelligence");
 const current=VIEWS.find(x=>x.id===mode)??VIEWS[0];
 const Icon=current.icon;
 const routes=useMemo(()=>snapshot.routes.filter(r=>(phase==="ALL"||r.phase===phase)&&(!query.trim()||r.href.toLowerCase().includes(query.toLowerCase()))),[snapshot.routes,phase,query]);
 const focus=snapshot.routes.find(r=>r.href===selected)??snapshot.routes[0];
 const visibleIndexed=snapshot.routes.filter(r=>r.indexed);
 const statusCounts=visibleIndexed.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{} as Record<string,number>);
 const hasRouteBrowser=mode==="atlas"||mode==="doctor"||mode==="architect"||mode==="command";
 return <main className="rx-canvas" data-mode={mode}>
  <div className="rx-noise" aria-hidden="true"/>
  <div className="rx-frame">
   <nav className="rx-global-breadcrumb" aria-label="Engineering hierarchy"><Link href="/aoe2war-os">AOE2WAR OS</Link><ChevronRight size={12}/><Link href="/renaissance">RENAISSANCE</Link><ChevronRight size={12}/><strong>{current.sub.toUpperCase()}</strong></nav>
   <div className="rx-head">
    <div className="rx-head-text">
      <div className="rx-kicker"><span className="rx-kicker-line"/><span>THE ENGINEERING RENAISSANCE</span><span className="rx-kicker-code">/ {current.sub.toUpperCase()}</span></div>
      <h1><Icon aria-hidden="true" size={32}/>{current.title}</h1>
      <p>{mode==="command"?"ONE KINGDOM. ONE STANDARD. EVERY PAGE ACCOUNTED FOR.":mode==="atlas"?"SEVEN PHASES. ONE HUNDRED THIRTY-TWO ORIGINAL TARGETS.":mode==="circuit"?"TRACE THE ORIGIN. EXPOSE THE DEPENDENCY. PROTECT THE TRUTH.":mode==="marshal"?"ISOLATE THE WORK. PROTECT THE SHARED SOURCE.":mode==="doctor"?"EXAMINE THE SOURCE BEFORE THE FIRST INCISION.":mode==="vault"?"RECEIPTS ARE THE ONLY CURRENCY OF PROOF.":mode==="arbiter"?"ONE RUBRIC. INDEPENDENT EVIDENCE. NO GREENWASH.":mode==="forge"?"TEST THE INVARIANT. BREAK THE ASSUMPTION.":mode==="architect"?"THE RIGHT FIX. THE RIGHT OWNER. THE RIGHT ORDER.":mode==="train"?"SHARED SOURCE IN. VERIFIED PRODUCTION OUT.":mode==="sentinel"?"NO FALSE ALL-CLEAR. WATCH WHAT ACTUALLY CHANGED.":"EVERY HARD-WON LESSON BECOMES INFRASTRUCTURE."}</p>
    </div>
    <div className="rx-head-seal"><span>RX</span><small>ENGINEERING<br/>STANDARD</small></div>
   </div>
   <nav className="rx-nav" aria-label="Renaissance instruments">
    {VIEWS.map(v=>{const I=v.icon;return <Link key={v.id} href={v.href} aria-current={v.id===mode?"page":undefined} className={v.id===mode?"rx-nav-link rx-selected":"rx-nav-link"}><I size={15} aria-hidden="true"/><span>{v.sub}</span></Link>;})}
   </nav>
   <div className="rx-stamp"><span><CircleDot size={12}/> SOURCE REGISTRY · {snapshot.campaignVersion}</span><span>BASE SHA · {snapshot.sourceBaselineSha.slice(0,12)}</span><span>NOT A DEPLOYMENT CERTIFICATE</span></div>
   <section className="rx-hero" aria-label="Campaign overview">
    <div className="rx-hero-main">
      {mode==="command"||mode==="atlas"?<PhaseEngine snapshot={snapshot} mode={mode}/>:
      mode==="circuit"?<Circuit/>:
      mode==="marshal"?<div className="rx-marshal-field"><div className="rx-marshal-grid">{[1,2,3,4,5,6,7,8].map(n=><div key={n} className="rx-worker-bay"><span>0{n}</span><Shield size={24}/><strong>UNASSIGNED</strong><small>POLICY SLOT</small></div>)}</div><div className="rx-scene-note">4–8 IS A RECOMMENDED WRITER LIMIT · NO LIVE CLAIM/LEASE FEED CONNECTED</div></div>:
      mode==="doctor"?<div className="rx-doctor-field"><div className="rx-doctor-iris"><div className="rx-doctor-eye"><ScanSearch size={58}/></div></div><div className="rx-doctor-summary"><div className="rx-doctor-label">NEXT DIAGNOSTIC TARGET</div><b>{focus.href}</b><span>RANK {focus.rank} / PHASE {focus.phase} / {focus.profile.toUpperCase()}</span><div className="rx-doctor-divider"/><div>STATIC SOURCE DOSSIER AVAILABLE</div><small>Runtime and browser tests require independent evidence</small></div></div>:
      mode==="vault"?<div className="rx-vault-field"><div className="rx-vault-lock"><Archive size={42}/><div className="rx-vault-ring rx-vault-ring-a"/><div className="rx-vault-ring rx-vault-ring-b"/></div><div className="rx-vault-seals">{snapshot.rubric.map(d=><div key={d.id}><b>{d.max}</b><span>{d.id.toUpperCase()}</span><small>RECEIPT REQUIREMENT</small></div>)}</div><div className="rx-scene-note">NO INDEPENDENT CRITERION RECEIPT FEED ATTACHED TO THIS VIEW</div></div>:
      mode==="arbiter"?<div className="rx-arbiter-field">{snapshot.rubric.map(d=><ScoreRing key={d.id} label={d.id} value={d.max}/>)}</div>:
      mode==="forge"?<div className="rx-forge-field"><div className="rx-forge-machine"><div className="rx-forge-arc"/><Zap size={52}/><strong>PROVE</strong><small>DOMAIN GATES + REAL BROWSER</small></div><div className="rx-forge-slots">{["UNIT","CONTRACT","INTEGRATION","BROWSER","LOAD","PRODUCTION"].map((s,i)=><div key={s} className="rx-forge-slot"><span>0{i+1}</span><b>{s}</b><small>NO RUN RECEIPT</small></div>)}</div></div>:
      mode==="architect"?<div className="rx-architect-field"><div className="rx-blueprint-grid"><div className="rx-blueprint-node"><GitBranch size={28}/><b>FINDING</b><small>EXACT SOURCE</small></div><div className="rx-blueprint-arrow">━━━━━━▶</div><div className="rx-blueprint-node"><Workflow size={28}/><b>SCOPE</b><small>OWNED FILES</small></div><div className="rx-blueprint-arrow">━━━━━━▶</div><div className="rx-blueprint-node"><ShieldCheck size={28}/><b>PROOF</b><small>REVIEWED PR</small></div></div><div className="rx-scene-note">AUTOMATED RECOMMENDATIONS AND CODE CHANGES NOT ACTIVE · CONTROLLED WORKFLOW DEFINED</div></div>:
      mode==="train"?<TrainField/>:
      mode==="sentinel"?<SentinelField snapshot={snapshot}/>:
      <div className="rx-chronicle-field">{snapshot.phases.map((p,i)=><div key={p.id} className="rx-chronicle-spine"><span>CHAPTER {PHASE_NUMBERS[i]}</span><b>{p.code}</b><small>{p.total} TARGETS</small></div>)}<div className="rx-scene-note">HISTORICAL SOURCE MATERIAL ≠ PRESENT-DAY CERTIFICATION</div></div>}
    </div>
   </section>
   <section className="rx-readout" aria-label="Source-bound measurements">
    <MiniStat big={snapshot.totalTemplates} label="BASELINE TARGETS" foot="PRE-RENAISSANCE CENSUS"/>
    <MiniStat big={snapshot.phases.length} label="CAMPAIGN PHASES" foot="FIXED PLANNING ORDER"/>
    <MiniStat big={snapshot.indexedTemplates} label="PUBLIC INDEX ENTRIES" foot="EXISTING INDEX SNAPSHOT"/>
    <MiniStat big={snapshot.adminTemplates} label="ADMIN TEMPLATES" foot="COUNTS ONLY · PRIVATE"/>
    <MiniStat big={snapshot.dynamicTemplates} label="DYNAMIC TEMPLATES" foot="REQUIRE TEST FIXTURES"/>
   </section>
   {mode==="command"&&<section className="rx-content-grid">
    <div className="rx-section rx-section-wide"><div className="rx-section-header"><div><small>OPERATION 01 / SEVEN FRONTS</small><h2>THE CAMPAIGN ORDER</h2></div><Link href="/renaissance/atlas">OPEN THE ATLAS <ArrowUpRight size={16}/></Link></div><PhaseBars snapshot={snapshot}/></div>
    <div className="rx-section"><div className="rx-section-header"><div><small>OPERATION 02 / QUEUE HEAD</small><h2>FIRST TARGET</h2></div></div><div className="rx-prime-target"><b>/kingdom-intelligence</b><span>RANK 001 · CONTROL PLANE</span><Link href="/renaissance/doctor">OPEN DIAGNOSTICS <ArrowUpRight size={13}/></Link></div><div className="rx-caution">Worker ownership and readiness require GitHub preflight.</div></div>
   </section>}
   {mode==="atlas"&&<section className="rx-section"><div className="rx-section-header"><div><small>CANONICAL PLANNING ORDER / PUBLIC-REDACTED VIEW</small><h2>THE 132-TARGET ATLAS</h2></div></div><PhaseBars snapshot={snapshot}/></section>}
   {mode==="circuit"&&<section className="rx-content-grid"><div className="rx-section rx-section-wide"><div className="rx-section-header"><div><small>AUTHORITY OWNERS</small><h2>NO DUPLICATE TRUTH</h2></div></div><div className="rx-authority-map">{AUTHORITIES.map(a=><div key={a.name}><b>{a.name}</b><span>{a.detail}</span><small>{a.type.toUpperCase()}</small></div>)}</div></div><div className="rx-section"><h2>STATIC DEPENDENCY OBSERVER</h2><div className="rx-terminal">python3 scripts/renaissance.py doctor /kingdom-intelligence --json</div><p>Uses the existing source-only module graph. Unresolved imports and runtime edges remain incomplete.</p></div></section>}
   {mode==="marshal"&&<section className="rx-content-grid"><div className="rx-section rx-section-wide"><div className="rx-section-header"><div><small>FILE OWNERSHIP POLICY</small><h2>THE EXCLUSION ZONE</h2></div></div><div className="rx-policy-grid">{["PAGE-LOCAL OWNERSHIP","SHARED INTEGRATION STEWARD","PR COLLISION SCREEN","DRAFT BRANCH / NO AUTO MERGE"].map((x,i)=><div key={x}><span>0{i+1}</span><strong>{x}</strong><small>RULE DEFINED · LIVE ENFORCEMENT NOT VERIFIED</small></div>)}</div></div><div className="rx-section"><h2>LEASE AUTHORITY</h2><div className="rx-null">NOT CONNECTED</div><p>Issue claims are advisory. An actual atomic lock requires central durable ownership.</p></div></section>}
   {mode==="doctor"&&<section className="rx-content-grid"><div className="rx-section rx-section-wide"><div className="rx-section-header"><div><small>READ-ONLY ROUTE EXAMINATION</small><h2>SOURCE DOSSIER</h2></div></div><label className="rx-field-label" htmlFor="rx-route-select">SELECT PUBLIC-VISIBLE ROUTE</label><select className="rx-select" id="rx-route-select" value={focus.href} onChange={e=>setSelected(e.target.value)}>{snapshot.routes.map(r=><option key={r.href} value={r.href}>{String(r.rank).padStart(3,"0")} · {r.href}</option>)}</select><div className="rx-dossier">{[["RANK",String(focus.rank)],["PHASE",focus.phaseCode],["CLASS",focus.kind],["ASSURANCE",focus.profile],["GATES",String(focus.gates)],["INDEX",focus.indexed?"REGISTERED":"OUTSIDE PUBLIC INDEX"],["AUDIT",focus.status.toUpperCase()]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><div className="rx-terminal">python3 scripts/renaissance.py doctor {focus.href} --json</div></div><div className="rx-section"><h2>EXAMINATION SEQUENCE</h2>{["DEPENDENCY CLOSURE","AUTHORITY CHECK","OWNER COLLISION","REGRESSION TESTS","BROWSER MATRIX","RELEASE PROOF"].map((x,i)=><div className="rx-check-line" key={x}><b>{String(i+1).padStart(2,"0")}</b><span>{x}</span><i>NOT VERIFIED</i></div>)}</div></section>}
   {mode==="vault"&&<section className="rx-section"><div className="rx-section-header"><div><small>EXACT-SOURCE PROOF MODEL</small><h2>RECEIPT LOCKERS</h2></div></div><div className="rx-criterion-grid">{snapshot.rubric.flatMap(d=>d.criteria.map(c=><div key={c.id} className="rx-criterion"><span>{d.id.toUpperCase()}</span><strong>{c.id.replaceAll("_"," ").toUpperCase()}</strong><small>MAX {c.max} · RECEIPT REQUIRED</small></div>))}</div><div className="rx-caution">A URL or self-declared certificate is not independent attestation. No points are granted by this view.</div></section>}
   {mode==="arbiter"&&<section className="rx-section"><div className="rx-section-header"><div><small>STANDARD v2026-10-18-v1</small><h2>THE FIVE WEIGHTS</h2></div></div><div className="rx-weights">{snapshot.rubric.map(d=><div key={d.id}><span>{d.id.toUpperCase()}</span><b>{d.max}</b><div className="rx-weight-meter"><i style={{width:d.max*100/30+"%"}}/></div><small>{d.criteria.length} CRITERIA</small></div>)}</div><div className="rx-caution">A maximum weight is not an earned score. A certified 100/100 requires independent source, browser and live production receipts.</div></section>}
   {mode==="forge"&&<section className="rx-section"><div className="rx-section-header"><div><small>PROFILE-DRIVEN PROVING GROUNDS</small><h2>DOMAIN GATES</h2></div></div><ForgeGates snapshot={snapshot}/></section>}
   {mode==="architect"&&<section className="rx-content-grid"><div className="rx-section rx-section-wide"><div className="rx-section-header"><div><small>WORK PACKAGE GENERATOR / PLANNING</small><h2>BUILD FROM AUTHORITY</h2></div></div><label className="rx-field-label" htmlFor="rx-architect-select">INSPECT A TARGET&apos;S SOURCE CONTEXT</label><select className="rx-select" id="rx-architect-select" value={focus.href} onChange={e=>setSelected(e.target.value)}>{snapshot.routes.map(r=><option value={r.href} key={r.href}>{String(r.rank).padStart(3,"0")} · {r.href}</option>)}</select><div className="rx-dossier">{[["ROUTE",focus.href],["ORDER",String(focus.rank)],["PHASE",focus.phaseCode],["PROFILE",focus.profile],["CURRENT EVIDENCE",focus.status]].map(([x,y])=><div key={x}><span>{x}</span><strong>{y}</strong></div>)}</div><div className="rx-terminal">python3 scripts/renaissance.py doctor {focus.href} --json</div></div><div className="rx-section"><h2>WORKSHOP GUARDRAILS</h2>{["READ ALL / WRITE OWNED FILES","REVIEWED DOMAIN CONTRACT","POSITIVE + NEGATIVE TESTS","UNIQUE FEATURE BRANCH","DRAFT PR TO STEWARD","NO FINANCIAL UNLOCK"].map((x,i)=><div className="rx-check-line" key={x}><b>{String(i+1).padStart(2,"0")}</b><span>{x}</span></div>)}</div></section>}
   {mode==="train"&&<section className="rx-section"><div className="rx-section-header"><div><small>PROTECTED RELEASE CHOREOGRAPHY</small><h2>NO SILENT ARRIVALS</h2></div></div><div className="rx-policy-grid">{["GIT SHA EXACT","BUILD ASSET IDENTITY","DOWNSTREAM VERSION","INDEPENDENT BROWSER"].map((x,i)=><div key={x}><span>0{i+1}</span><strong>{x}</strong><small>PROOF REQUIRED</small></div>)}</div><div className="rx-terminal">./bin/aoe2war status<br/>./bin/aoe2war update --json</div><div className="rx-caution">The protected finish command is NOT authorized by a page PR or this interface.</div></section>}
   {mode==="sentinel"&&<section className="rx-section"><div className="rx-section-header"><div><small>EXISTING KINGDOM INDEX OBSERVATIONS</small><h2>THE REQUALIFICATION FRONTIER</h2></div></div><div className="rx-sentinel-stats">{Object.entries(statusCounts).map(([k,v])=><MiniStat key={k} big={v} label={k.toUpperCase()} foot="PUBLIC INDEX OBSERVATION"/>)}</div><div className="rx-terminal">python3 scripts/renaissance.py impact lib/kingdomIndex.ts --json</div><div className="rx-caution">Dependency invalidation is a design target, not proof of an active recurring agent or completed inspection.</div></section>}
   {mode==="chronicles"&&<section className="rx-section"><div className="rx-section-header"><div><small>FEDERATED ORIGINAL DOCUMENTS</small><h2>THE SOURCE LIBRARY</h2></div></div><div className="rx-doc-grid">{DOCS.map(d=><a key={d.path} href={"https://github.com/Emaren/app-prodn/blob/"+(d.path==="docs/RENAISSANCE_OS.md"?"main":snapshot.sourceBaselineSha)+"/"+d.path} target="_blank" rel="noopener noreferrer"><BookOpen size={21}/><span>{d.tag}</span><strong>{d.name}</strong><ArrowUpRight size={16}/></a>)}</div><div className="rx-caution">Existing authority links are baseline-pinned; the Renaissance contract becomes available on main after reviewed integration.</div></section>}
   {hasRouteBrowser&&<section className="rx-section rx-browser"><div className="rx-section-header"><div><small>PHASE SEARCH / SOURCE-BOUND REGISTER</small><h2>THE PAGE QUEUE</h2></div><span className="rx-count">{routes.length} VISIBLE MATCHES</span></div><div className="rx-filters"><label className="rx-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search the Kingdom..." aria-label="Search public campaign routes"/></label><div className="rx-phase-options" role="group" aria-label="Filter by campaign phase"><button className={phase==="ALL"?"on":""} onClick={()=>setPhase("ALL")}>ALL</button>{snapshot.phases.map(p=><button key={p.id} className={phase===p.id?"on":""} onClick={()=>setPhase(p.id)}>{p.id}</button>)}</div></div><RouteRows routes={routes} limit={mode==="atlas"?150:18}/><div className="rx-caution">Admin and sensitive route paths are redacted from this public view; the baseline count includes them. The queue is not evidence of completed reviews.</div></section>}
   <footer className="rx-footer"><span>AOE2WAR · RENAISSANCE OS</span><span>NO AUTONOMOUS EXECUTION / NO CERTIFICATION BY PRESENTATION</span><Link href="/kingdom-index">KINGDOM INDEX <ArrowUpRight size={13}/></Link></footer>
  </div>
 </main>;
}
