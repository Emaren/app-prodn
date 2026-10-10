"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {Activity, Radio, RefreshCcw, ShieldAlert} from "lucide-react";

type Camera = {
  playerName:string;team:string;identity:string;status:string;
  streamId:number|null;lastSeenSeconds:number|null;
};
type Battle = {
  sessionKey:string;format:string;teamsProven:boolean;battleState:string;
  playerCount:number;streamCount:number;liveCameras:number;cameras:Camera[];
  unassignedStreams:Array<{id:number;sourceType:string;status:string}>;
  message:string;
};
type RetentionCandidate={
  battleKey:string;completedAt:string;gameId:number;rosterSize:number;
  recordedPlayers:number;missingPlayers:string[];cameraStreamIds:number[];
  recordingCount:number;teamsProven:boolean;strongBattleIdentity:boolean;
  candidateStatus:"complete_candidate"|"incomplete_candidate"|"unverified_identity";
  warning:string;
};
type Payload = {checkedAt:string;activeBattleCount:number;examinedBattles:number;
  battles:Battle[];notes:string[];
  retentionPreview:{games:RetentionCandidate[];examined:number;unverified:number;retentionEnabled:false};
};

export default function TelevisionReadinessPanel() {
  const [value,setValue]=useState<Payload|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const reload=useCallback(async()=>{
    if(document.visibilityState==="hidden") return;
    setPending(true);
    try{
      const res=await fetch("/api/admin/television-readiness",{cache:"no-store"});
      if(!res.ok)throw new Error("Could not read broadcast readiness (HTTP "+res.status+").");
      const payload=await res.json() as Payload;
      setValue(payload);setError(null);
    }catch(e){setError(e instanceof Error?e.message:"Readiness unavailable")}
    finally{setPending(false)}
  },[]);
  useEffect(()=>{
    void reload();
    const timer=window.setInterval(()=>void reload(),20_000);
    const onVisible=()=>{if(document.visibilityState==="visible")void reload()};
    document.addEventListener("visibilitychange",onVisible);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)};
  },[reload]);
  return <section className="overflow-hidden rounded-[1.75rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.12),transparent_50%),linear-gradient(130deg,#07121e,#100e25)] p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-cyan-300">
          <Activity className="h-4 w-4"/> Director operations · read only
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Battle & Camera Readiness</h2>
        <p className="mt-2 text-sm text-slate-300">
          Current games, proven participants, camera assignments and the reason a position is waiting.
        </p>
      </div>
      <button type="button" disabled={pending} onClick={()=>void reload()}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">
        <RefreshCcw className="h-3.5 w-3.5"/>{pending?"Checking…":"Refresh"}
      </button>
    </div>
    {error?<p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>:null}
    <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
      <span className="rounded-full border border-white/15 px-3 py-1">{value?.activeBattleCount??"—"} active battles</span>
      <span className="rounded-full border border-white/15 px-3 py-1">{value?.examinedBattles??"—"} inspected</span>
      <span className="rounded-full border border-white/15 px-3 py-1">Updated {value?.checkedAt?new Date(value.checkedAt).toLocaleTimeString():"—"}</span>
    </div>
    <div className="mt-5 space-y-3">
      {value?.battles.map(battle=><div key={battle.sessionKey} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">{battle.format} · {battle.cameras.map(c=>c.playerName).join(" vs ")||"Waiting for roster"}</div>
          <span className={"rounded-full border px-3 py-1 text-[10px] font-bold " + (battle.liveCameras>=2?"border-emerald-300/30 text-emerald-200":"border-amber-300/25 text-amber-200")}>{battle.liveCameras} video live</span>
        </div>
        <div className="mt-1 break-all text-[10px] text-slate-500">{battle.sessionKey}</div>
        <p className="mt-2 text-xs text-slate-400">{battle.message}</p>
        {!battle.teamsProven?<div className="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
          <ShieldAlert className="h-3.5 w-3.5"/> Team alignment unverified—no side assumptions
        </div>:null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {battle.cameras.map((camera,i)=><div key={camera.team+camera.playerName+i} className="rounded-lg border border-white/10 bg-white/[.025] px-3 py-2.5">
            <div className="truncate text-xs font-bold text-white">{camera.playerName}</div>
            <div className="mt-1 text-[10px] text-slate-500">{camera.team}</div>
            <div className={"mt-2 flex items-center gap-1.5 text-[10px] font-bold " + (camera.status==="VIDEO LIVE"?"text-emerald-300":"text-amber-200")}>
              <Radio className="h-3 w-3"/>{camera.status}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {camera.streamId?"Stream #"+camera.streamId:"No registered POV"}
              {camera.lastSeenSeconds!==null?" · "+camera.lastSeenSeconds+"s ago":""}
            </div>
          </div>)}
        </div>
        {battle.unassignedStreams.length>0?<p className="mt-3 text-xs text-amber-200">{battle.unassignedStreams.length} video feed(s) not attributable to a proven player position; available as observer/unassigned</p>:null}
      </div>)}
      {value && value.battles.length===0?<div className="rounded-xl border border-white/10 p-6 text-sm text-slate-400">No active games currently recorded. The detector will refresh when new games appear.</div>:null}
    </div>
    <div className="mt-7 border-t border-cyan-100/10 pt-6">
      <div className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">Storage governance · preview only</div>
      <h3 className="mt-2 text-xl font-bold text-white">Latest Recorded Battles · Multi-Camera Candidates</h3>
      <p className="mt-2 text-xs leading-6 text-slate-400">
        Shows up to two recent completed battles with authenticated, ended Watcher footage—never a guess from game titles.
        It does not protect or delete recordings yet. The existing six-hour cleanup remains authoritative.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(value?.retentionPreview.games??[]).map(game=><div key={game.battleKey}
          className="rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="text-sm font-semibold text-white">Battle #{game.gameId}</div>
            <span className={"text-[10px] font-bold " + (game.candidateStatus==="complete_candidate"?"text-emerald-200":"text-amber-200")}>
              {game.candidateStatus.replaceAll("_"," ").toUpperCase()}
            </span>
          </div>
          <div className="mt-1 break-all text-[10px] text-slate-500">{game.battleKey}</div>
          <div className="mt-3 text-xs text-cyan-100">{game.recordedPlayers}/{game.rosterSize} player POVs · {game.recordingCount} recordings</div>
          <div className="mt-2 text-xs text-slate-400">Stream IDs: {game.cameraStreamIds.length?game.cameraStreamIds.join(", "):"None"}</div>
          {game.missingPlayers.length?<div className="mt-2 text-xs text-amber-200">
            Missing: {game.missingPlayers.join(", ")}
          </div>:null}
          <p className="mt-3 text-[11px] leading-5 text-slate-400">{game.warning}</p>
        </div>)}
        {value && !value.retentionPreview.games.length?<div className="rounded-xl border border-white/10 p-4 text-xs text-slate-400">
          No eligible completed battle snapshots yet; no retention recommendation has been made.
        </div>:null}
      </div>
      <p className="mt-3 text-[11px] text-amber-200">Retention automation: DISABLED. Preview candidates do not prove files still exist on disk or decode in a browser.</p>
    </div>
    <p className="mt-4 text-xs leading-6 text-slate-500">Recent chunk + heartbeat proof is not a guarantee of successful browser playback. This panel cannot remotely control, view or change a player’s desktop. See the Video Vault inventory below for recording fault codes.</p>
    <Link href="/television-wolo" className="mt-4 inline-flex rounded-full border border-cyan-200/30 px-4 py-2 text-xs font-semibold text-cyan-100">Open Television WOLO →</Link>
  </section>;
}
