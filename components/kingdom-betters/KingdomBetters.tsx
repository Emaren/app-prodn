"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {ArrowLeft,ArrowRight,ArrowUpRight,Bot,ChevronDown,Crown,Grid2X2,History,List,Swords,Target,Trophy,RefreshCcw} from "lucide-react";
import type {KingdomBettor,KingdomBelt,KingdomBettersSnapshot} from "@/lib/kingdomBetters";
import {useUserAuth} from "@/context/UserAuthContext";
import styles from "./KingdomBetters.module.css";

const W = new Intl.NumberFormat("en-US",{maximumFractionDigits:0});
function num(v:number|null|undefined){return v===null||v===undefined?"—":W.format(v);}
function stamp(v:string|null){return v?new Date(v).toLocaleDateString():"—";}
function shortHash(v:string|null){return v?`${v.slice(0,11)}…${v.slice(-7)}`:"—";}
function Portrait({bettor,large=false}:{bettor:KingdomBettor;large?:boolean}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[bettor.avatar]);
 return <div className={large?styles.portraitLarge:styles.portrait} data-house={bettor.role==="house"}>
   {bettor.avatar&&!failed?<Image src={bettor.avatar} width={large?390:170} height={large?500:200} unoptimized alt="" onError={()=>setFailed(true)} loading="lazy"/>:
   <div className={styles.avatarGlyph} aria-hidden="true">{bettor.role==="house"?<Bot size={large?42:23}/>:bettor.name.slice(0,1).toUpperCase()}</div>}
   {bettor.role==="house"&&<span className={styles.aiMark}>AI</span>}
 </div>;
}
function SkeletalPalm({flip=false}:{flip?:boolean}){
 return <svg className={styles.palm} data-flip={flip} viewBox="0 0 490 320" fill="none" aria-hidden="true">
   <defs><linearGradient id={flip?"boneB":"boneA"} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#155b86"/><stop offset=".48" stopColor="#86c9e4"/><stop offset="1" stopColor="#12304e"/></linearGradient></defs>
   <g stroke={flip?"url(#boneB)":"url(#boneA)"} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" opacity=".85">
     <path d="M232 306L213 269 199 229 190 197 201 163 228 144 276 152 311 187 317 228 303 271 280 314"/>
     <path d="M210 174L145 127 116 63 109 24M230 149L192 105 179 38 181 10M263 153L262 99 269 47 274 14M292 173L330 125 352 77 359 35M307 205L374 191 420 155 458 127"/>
     <path d="M192 211L133 189 83 145 43 127M222 237L174 226 129 214"/>
   </g>
   <g fill="#041c2b" stroke="#7bc0de" strokeWidth="4" opacity=".9">
     <circle cx="109" cy="24" r="12"/><circle cx="181" cy="10" r="10"/><circle cx="274" cy="14" r="10"/>
     <circle cx="359" cy="35" r="10"/><circle cx="458" cy="127" r="11"/><circle cx="43" cy="127" r="12"/>
     <ellipse cx="252" cy="211" rx="48" ry="59"/><ellipse cx="253" cy="307" rx="31" ry="12"/>
   </g>
 </svg>;
}
function BettorCard({bettor,selected,onClick}:{bettor:KingdomBettor;selected:boolean;onClick:()=>void}){
 return <button type="button" className={styles.rosterCard} data-selected={selected||undefined} onClick={onClick} aria-pressed={selected} title={bettor.name}>
   <Portrait bettor={bettor}/>
   <span className={styles.rosterName}>{bettor.name}</span>
   <span className={styles.rosterMeta}>{bettor.role==="house"?bettor.mode.toUpperCase():`${bettor.wins}–${bettor.losses} · ${bettor.totalBets} BETS`}</span>
 </button>;
}
type Side="left"|"right";
function Comparison({bettor,side,choose,receipts,selectedKeys,remove,add,active}:{bettor:KingdomBettor|null;side:Side;choose:()=>void;receipts:KingdomBettersSnapshot["receipts"];selectedKeys:string[];remove:(key:string)=>void;add:()=>void;active:boolean}){
 const own=receipts.filter(row=>row.bettorKey===bettor?.key);
 return <div className={styles.duelist} data-side={side}>
   <div className={styles.duelistHeading}><span>{side==="left"?"I · CHALLENGERS":"II · DEFENDERS"}</span><button onClick={choose} aria-pressed={active} type="button">{active?"SELECTING":"SELECT"} <Target size={13}/></button></div>
   <div className={styles.stageArt}><SkeletalPalm flip={side==="right"}/><div className={styles.heroPortrait}>{bettor?<Portrait bettor={bettor} large/>:<span className={styles.emptyPortrait}>?</span>}</div></div>
   <div className={styles.fighterMeta}>
     <h3>{bettor?.name??"Choose a warrior"}</h3><span className={styles.fighterRole}>{bettor?.role==="house"?"HOUSE AI":"KINGDOM CITIZEN"}</span>
   </div>
   <div className={styles.versusStats}>
     <div><b>{bettor?`${bettor.wins}–${bettor.losses}`:"—"}</b><span>BET RECORD</span></div>
     <div><b>{num(bettor?.totalBets)}</b><span>WAGERS</span></div>
     <div><b>{num(bettor?.stakedWolo)}</b><span>STAKED WOLO</span></div>
   </div>
   <div className={styles.stylisticRows}>
     <div><span>LAST WAGER</span><b>{stamp(bettor?.lastBetAt??null)}</b></div>
     <div><span>CHAIN PAYOUT REFS</span><b>{num(bettor?.verifiedTxCount)}</b></div>
     <div><span>RECORDED RETURN</span><b>{num(bettor?.recordedPayoutWolo)}</b></div>
     <div><span>FAVORITE MAP</span><b>—</b></div>
     <div><span>STYLE / COMPOSITION</span><b>—</b></div>
   </div>
   <div className={styles.teamStack} aria-label={`${side} roster`}>{selectedKeys.map(key=><button key={key} type="button" onClick={()=>remove(key)} title="Remove from team">{key.replace(/^human:/,"").slice(0,13)} ×</button>)}<button type="button" onClick={add} disabled={selectedKeys.length>=4}>+ WARRIOR</button></div>
   {bettor?.role==="house"&&<p className={styles.botNote}>House preview only · no live financial executor.</p>}
   {bettor?.role==="human"&&own.length>0&&<div className={styles.recentProof}><span>LATEST RECEIPT</span><span>{own[0].outcome} · #{own[0].id}</span></div>}
 </div>;
}
function BeltColumn({belts,index,setIndex}:{belts:KingdomBelt[];index:number;setIndex:(n:number)=>void}){
 const count=belts.length;
 const current=belts[index]??null;
 const shift=(delta:number)=>{if(count)setIndex((index+delta+count)%count);};
 return <div className={styles.beltTower}>
   <div className={styles.towerTop}><Crown size={15}/><span>TITLE ARCHIVE</span></div>
   <button type="button" className={styles.beltNav} onClick={()=>shift(-1)} disabled={count<2} aria-label="Previous championship"><ArrowLeft size={19}/></button>
   <div className={styles.beltVisual}>
    {count>1&&<Image className={styles.neighborBelt} src={belts[(index-1+count)%count].image} width={200} height={80} alt="" loading="lazy"/>}
    {current?<Image className={styles.activeBelt} src={current.image} width={350} height={180} alt={current.name} loading="lazy"/>:<Trophy size={82}/>}
    {count>1&&<Image className={styles.neighborBelt} src={belts[(index+1)%count].image} width={200} height={80} alt="" loading="lazy"/>}
   </div>
   <button type="button" className={styles.beltNav} onClick={()=>shift(1)} disabled={count<2} aria-label="Next championship"><ArrowRight size={19}/></button>
   <div className={styles.beltLedger}>
    <h3>{current?.name??"No active title"}</h3>
    <div><span>HOLDER</span><b>{current?.holder??"VACANT"}</b></div>
    <div><span>DAYS HELD</span><b>{num(current?.daysHeld)}</b></div>
    <div><span>BOUNTY</span><b>{current?num(current.bounty)+" WOLO":"—"}</b></div>
    <div><span>TRIBUTE</span><b>{current?num(current.tribute)+" WOLO":"—"}</b></div>
    <Link href="/champions">OPEN TITLE HISTORY <ArrowUpRight size={13}/></Link>
   </div>
  </div>;
}
export default function KingdomBetters({initial}:{initial:KingdomBettersSnapshot}){
  const {isAdmin}=useUserAuth();
  const [snapshot,setSnapshot]=useState(initial);
  const [view,setView]=useState<"arena"|"ledger">("arena");
  const [left,setLeft]=useState<string[]>(()=>initial.bettors.filter(x=>x.role==="human").slice(0,1).map(x=>x.key));
  const [right,setRight]=useState<string[]>(()=>initial.bettors.filter(x=>x.role==="human").slice(1,2).map(x=>x.key));
  const [side,setSide]=useState<Side>("left");
  const [beltIndex,setBeltIndex]=useState(0);
  const [notice,setNotice]=useState("");const [submitting,setSubmitting]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const scrollRef=useRef<HTMLDivElement>(null);
  const byKey=useMemo(()=>new Map(snapshot.bettors.map(b=>[b.key,b])),[snapshot.bettors]);
  const leftBettor=byKey.get(left[0]??"")??null;
  const rightBettor=byKey.get(right[0]??"")??null;
  const humans=snapshot.bettors.filter(x=>x.role==="human");
  const currentBelt=snapshot.belts[beltIndex]??null;
  function choose(key:string){
   const clicked=byKey.get(key);
   if(!clicked)return;
   const chosen=side==="left"?left:right;const other=side==="left"?right:left;
   if(other.includes(key)){setNotice("The same warrior cannot face themselves.");return;}
   if(clicked.role==="house"){
      if(side==="left")setLeft([key]);else setRight([key]);
   }else{
      const next=chosen.filter(x=>x!==key);
      if(next.length>=4){setNotice("Four warriors maximum per side.");return;}
      if(side==="left")setLeft([...next,key]);else setRight([...next,key]);
   }
   setNotice("");
  }
  function remove(key:string,s:Side){
    const update=(curr:string[])=>curr.filter(x=>x!==key);
    if(s==="left")setLeft(update);else setRight(update);
  }
  function changeTeamSize(size:number){
    const available=humans.map(x=>x.key);
    const first=left.filter(k=>available.includes(k)).slice(0,size);
    const second=right.filter(k=>available.includes(k)&&!first.includes(k)).slice(0,size);
    for(const k of available){
      if(first.length<size && !first.includes(k)&&!second.includes(k))first.push(k);
    }
    for(const k of available){
      if(second.length<size && !first.includes(k)&&!second.includes(k))second.push(k);
    }
    setLeft(first);setRight(second);setNotice("");
  }
  async function submit(){
   if(submitting)return;
   const a=left.map(x=>byKey.get(x)?.uid),b=right.map(x=>byKey.get(x)?.uid);
   if(!a.length||!b.length||a.some(x=>!x)||b.some(x=>!x)){setNotice("Choose registered human warriors on both sides to nominate a match.");return;}
   setSubmitting(true);setNotice("");
   try{
     const response=await fetch("/api/kingdom-betters/nominations",{method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({left:a,right:b,trophyId:currentBelt?.id??null,requestId:crypto.randomUUID()})});
     const data=await response.json() as {detail?:string;id?:number};
     if(!response.ok)throw new Error(data.detail||"Unable to issue the request.");
     setNotice(`Matchup request #${data.id} recorded for commissioner review. No WOLO moved.`);
   }catch(e){setNotice(e instanceof Error?e.message:"Could not record this request.");}
   finally{setSubmitting(false);}
  }
  async function refresh(){
   try{const r=await fetch("/api/kingdom-betters",{cache:"no-store"});
    if(r.ok){const v=await r.json() as KingdomBettersSnapshot;setSnapshot(v);setBeltIndex(i=>Math.min(i,Math.max(0,v.belts.length-1)));setNotice("Fresh public evidence loaded.");}
    else setNotice("Unable to refresh right now.");}
   catch{setNotice("Unable to refresh right now.");}
  }
  return <main className={styles.root}>
    <div className={styles.skyline} aria-hidden="true"/>
    <div className={styles.shell}>
      <header className={styles.pageHeader}>
       <div className={styles.titleBlock}><div className={styles.overline}><Swords size={13}/> AOE2WAR / THE WAGER KINGDOM</div><h1>KINGDOM <em>BETTERS</em></h1><p>THE HOUSE · THE WARRIORS · THE TITLES</p></div>
       <div className={styles.headerActions}>
        <button type="button" onClick={()=>void refresh()} aria-label="Refresh bettor records" title="Refresh records"><RefreshCcw size={17}/></button>
        {isAdmin&&<Link href="/admin/kingdom-betters" title="House bettor controls"><Bot size={18}/></Link>}
        <div className={styles.viewToggle} role="group" aria-label="Bettor presentation">
          <button type="button" title="Arena" aria-label="Arena view" aria-pressed={view==="arena"} data-active={view==="arena"} onClick={()=>setView("arena")}><Grid2X2 size={18}/></button>
          <button type="button" title="Bettor ledger" aria-label="Ledger view" aria-pressed={view==="ledger"} data-active={view==="ledger"} onClick={()=>setView("ledger")}><List size={19}/></button>
        </div>
       </div>
      </header>
      <section className={styles.rosterRail} aria-label="All kingdom bettors">
       <div className={styles.rosterLabel}><span>HOUSE & KINGDOM</span><div><b>{snapshot.bettors.filter(x=>x.role==="house").length.toString().padStart(2,"0")}</b> HOUSE <b>{humans.length.toString().padStart(2,"0")}</b> CITIZENS</div></div>
       <div className={styles.scrollerGroup}>
        <button className={styles.scrollArrow} type="button" aria-label="Scroll bettors left" onClick={()=>scrollRef.current?.scrollBy({left:-380,behavior:"smooth"})}><ArrowLeft size={18}/></button>
        <div className={styles.rosterScroller} ref={scrollRef}>
          {snapshot.bettors.map((bettor,index)=><div className={styles.rosterSlot} key={bettor.key}>
           {index===0||index===4?<span className={styles.groupMarker}>{index===0?"HOUSE AI":"KINGDOM CITIZENS"}</span>:null}
           <BettorCard bettor={bettor} selected={[...left,...right].includes(bettor.key)} onClick={()=>choose(bettor.key)}/>
          </div>)}
        </div>
        <button className={styles.scrollArrow} type="button" aria-label="Scroll bettors right" onClick={()=>scrollRef.current?.scrollBy({left:380,behavior:"smooth"})}><ArrowRight size={18}/></button>
       </div>
      </section>
      {view==="arena"?<>
        <section className={styles.arena} aria-label="Warrior matchmaker">
         <Comparison side="left" bettor={leftBettor} choose={()=>setSide("left")} active={side==="left"} receipts={snapshot.receipts} selectedKeys={left} remove={key=>remove(key,"left")} add={()=>setSide("left")}/>
         <BeltColumn belts={snapshot.belts} index={beltIndex} setIndex={setBeltIndex}/>
         <Comparison side="right" bettor={rightBettor} choose={()=>setSide("right")} active={side==="right"} receipts={snapshot.receipts} selectedKeys={right} remove={key=>remove(key,"right")} add={()=>setSide("right")}/>
        </section>
        <section className={styles.challengeBar} aria-label="Matchup nomination">
         <div className={styles.matchFormats}>{[1,2,3,4].map(size=><button key={size} type="button" onClick={()=>changeTeamSize(size)} aria-label={`Select up to ${size} versus ${size} warriors`}>{size}v{size}</button>)}<span>ANY FORMAT · UP TO 8</span></div>
         <button type="button" onClick={()=>void submit()} disabled={submitting} className={styles.sendChallenge}><Swords size={18}/>{submitting?"RECORDING…":"REQUEST THIS MATCHUP"}</button>
         <div className={styles.challengeFoot}><span>COMMUNITY NOMINATION · COMMISSIONER REVIEW · NO AUTOMATIC WAGER</span><Link href="/challenge">CHALLENGE HALL <ArrowUpRight size={13}/></Link></div>
        </section>
      </>:<section className={styles.ledgerView} aria-label="Bettor records">
        <div className={styles.tableHeader}><span>BETTOR</span><span>W / L</span><span>BET COUNT</span><span>STAKED</span><span>RECORDED RETURN</span><span>CHAIN REFS</span></div>
        {snapshot.bettors.map(b=><div className={styles.tableRow} key={b.key}>
           <div className={styles.tablePerson}><Portrait bettor={b}/><span><b>{b.name}</b><small>{b.role==="house"?"HOUSE · "+b.mode:"HUMAN BETTOR"}</small></span></div>
           <div>{b.wins} / {b.losses}</div><div>{num(b.totalBets)}</div><div>{num(b.stakedWolo)}</div><div>{num(b.recordedPayoutWolo)}</div><div>{num(b.verifiedTxCount)}</div>
          </div>)}
        </section>}
       <section className={styles.proofSection}>
        <header><div><span>ACCOUNTING / CHAIN EVIDENCE</span><h2>The wager record</h2></div><button type="button" aria-expanded={showHistory} onClick={()=>setShowHistory(v=>!v)}>{showHistory?"CLOSE":"OPEN"} RECENT HISTORY <ChevronDown size={15}/></button></header>
        {showHistory?<div className={styles.historyRows}>
          {snapshot.receipts.length?snapshot.receipts.slice(0,70).map(item=><div key={item.id}>
            <span>#{item.id}</span><b>{byKey.get(item.bettorKey)?.name||"Warrior"}</b><span>{item.marketTitle}</span><span>{item.outcome}</span>
            <span>{num(item.stake)} → {num(item.payout)} WOLO</span><span title={item.payoutTxHash||"Recorded without chain payout reference"}>{item.payoutTxHash?shortHash(item.payoutTxHash):"RECORD ONLY"}</span>
          </div>):<p className={styles.empty}>No recorded wager history.</p>}
        </div>:<div className={styles.proofCollapsed}><History size={22}/><span>RECORDED WAGERS ARE NOT AUTOMATICALLY CHAIN-PAID. EXPAND FOR AVAILABLE TRANSACTION REFERENCES.</span></div>}
       </section>
       {notice&&<div className={styles.notice} role="status">{notice}</div>}
       <footer className={styles.foot}><span>HOUSE COUNTER-BET ENGINE / PREVIEW ONLY</span><span>NO REAL WOLO COUNTER-WAGERS BY AI · {stamp(snapshot.generatedAt)}</span></footer>
    </div>
  </main>;
}
