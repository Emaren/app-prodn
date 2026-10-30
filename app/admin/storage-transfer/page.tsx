"use client";

import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Archive, ChevronRight,
  Database, HardDrive, Laptop2, LockKeyhole, Network,
  RefreshCw, Server, Waves, WifiOff
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TransferMissionPanels from "@/components/storage-transfer/TransferMissionPanels";
import { projectTransferPublication, type TransferPublication } from "@/lib/storageTransferPresentation";
import type { StorageCommandCenter, StorageReading } from "@/lib/storageCommandCenterProjection";

type TransferResponse = {
  schema: "aoe2war.storage-transfer.control-room.v1";
  polledAt: string;
  storage: StorageCommandCenter;
  transferReceipt: TransferPublication | null;
};
type NodeId = StorageReading["id"] | "intel";
const NAV: { id: NodeId; name: string; subtitle: string }[] = [
  { id: "mac", name: "M1 DEVELOPMENT", subtitle: "macOS · source" },
  { id: "hel1-root", name: "HEL1 ROOT", subtitle: "Ubuntu · system" },
  { id: "hel1-volume-105319120", name: "HEL1 VOLUME", subtitle: "Live data · protected" },
  { id: "intel", name: "INTEL ARCHIVE", subtitle: "macOS · receiver" },
];
const PANEL = "rounded-[1.5rem] border border-cyan-100/10 bg-slate-950/75 shadow-[0_24px_65px_rgba(0,0,0,.25)]";

function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return String(Math.round(n)) + " B";
  const power = n >= 1024 ** 3 ? 3 : n >= 1024 ** 2 ? 2 : 1;
  return (n / 1024 ** power).toFixed(2) + [" B"," KiB"," MiB"," GiB"][power];
}
function observed(value: string | null | undefined): string {
  if (!value) return "NOT REPORTED";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "INVALID RECEIPT";
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (minutes < 1) return "LESS THAN A MINUTE";
  if (minutes < 60) return String(minutes) + " MIN AGO";
  return String(Math.floor(minutes / 60)) + " HOURS AGO";
}
function NodeSymbol({ id }: { id: NodeId }) {
  if (id === "mac") return <Laptop2 className="h-6 w-6"/>;
  if (id === "hel1-root") return <Server className="h-6 w-6"/>;
  if (id === "hel1-volume-105319120") return <Database className="h-6 w-6"/>;
  return <HardDrive className="h-6 w-6"/>;
}
function NodeTile({
  id, label, subtitle, selected, onSelect, reading
}: {
  id: NodeId; label: string; subtitle: string; selected: boolean;
  onSelect: () => void; reading: StorageReading | null;
}) {
  const accurate = reading?.status === "RECEIPT" && reading?.source === "SIGNED_THREE_PLANE_RECEIPT";
  const observedPct = accurate && reading?.usedPercent !== null ? reading?.usedPercent : null;
  const gauge = observedPct === null || observedPct === undefined
    ? "conic-gradient(#334155 0 100%)"
    : "conic-gradient(#22d3ee 0 " + String(observedPct) + "%, #243244 " + String(observedPct) + "% 100%)";
  return <button type="button" onClick={onSelect} aria-pressed={selected}
    className={"group relative min-w-0 rounded-[1.35rem] border p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 " +
      (selected ? "border-cyan-300/55 bg-cyan-200/[.08]" : "border-white/10 bg-white/[.025] hover:border-cyan-100/25")}>
    <div className="flex items-start justify-between gap-2">
      <div className="rounded-xl border border-cyan-300/15 bg-cyan-200/[.065] p-2.5 text-cyan-200">
        <NodeSymbol id={id}/>
      </div>
      <div className="h-12 w-12 shrink-0 rounded-full p-[5px]" style={{background:gauge}}>
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0b1524] text-[10px] font-bold tabular-nums text-cyan-100">
          {observedPct === null || observedPct === undefined ? "?" : String(Math.round(observedPct)) + "%"}
        </div>
      </div>
    </div>
    <div className="mt-4 truncate text-[12px] font-black tracking-[.14em] text-slate-50">{label}</div>
    <div className="mt-1 text-[11px] text-slate-400">{subtitle}</div>
    <div className="mt-4 border-t border-white/[.07] pt-3">
      <div className="text-[9px] font-bold tracking-[.2em] text-slate-400">ORDINARY FREE SPACE</div>
      <div className="mt-1 text-xl font-black tabular-nums text-slate-100">{bytes(reading?.freeBytes)}</div>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className={"rounded-lg px-2 py-1 text-[9px] font-bold tracking-wider " +
        (reading?.status === "RECEIPT" ? "bg-cyan-400/10 text-cyan-200" :
        reading?.status === "STALE" ? "bg-amber-400/10 text-amber-200" :
        "bg-white/[.05] text-slate-400")}>
        {reading?.status === "RECEIPT" && reading.source === "SIGNED_THREE_PLANE_RECEIPT" ? "SIGNED" :
          reading?.status === "RECEIPT" ? "ESTATE" : reading?.status === "STALE" ? "STALE" : "UNKNOWN"}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-cyan-200"/>
    </div>
  </button>;
}
export default function StorageTransferControlRoomPage() {
  const [data, setData] = useState<TransferResponse | null>(null);
  const [selected, setSelected] = useState<NodeId>("mac");
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch("/api/admin/storage-transfer", {cache:"no-store", signal:controller.signal});
      if (!response.ok) throw new Error("UNAVAILABLE");
      const payload = await response.json() as TransferResponse;
      if (payload.schema !== "aoe2war.storage-transfer.control-room.v1"
        || payload.storage?.schema !== "aoe2war.private-storage-command-center.v1") {
        throw new Error("UNRECOGNIZED EVIDENCE");
      }
      if (pending.current !== controller || controller.signal.aborted) return;
      setData(payload);
      setFailure(null);
    } catch (error) {
      if (pending.current === controller && document.visibilityState === "visible") {
        setData(null);
        setFailure(error instanceof Error ? error.message : "UNKNOWN READ ERROR");
      }
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  },[]);
  useEffect(()=>{
    const onVisibility = ()=>{
      if (document.visibilityState !== "visible") {
        pending.current?.abort();
        pending.current = null;
        setData(null);
      } else void refresh();
    };
    onVisibility();
    const timer = window.setInterval(()=>{
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisibility);
      pending.current?.abort();
      pending.current = null;
    };
  },[refresh]);
  const transfer = useMemo(()=>projectTransferPublication(data?.transferReceipt??null),[data?.transferReceipt]);
  const candidates = data?.storage.visual?.planes.find(p=>p.id===selected)?.hogs ?? [];
  return <main className="relative min-h-screen overflow-hidden bg-[#050b14] text-slate-50">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[750px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(6,182,212,.14),transparent_60%),radial-gradient(ellipse_at_90%_25%,rgba(16,185,129,.06),transparent_50%)]"/>
    <div className="relative mx-auto max-w-[1530px] space-y-5 px-4 py-7 sm:px-7 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/storage-os" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4"/> STORAGE OS
          </Link>
          <div className="mt-5 flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200"><Network className="h-7 w-7"/></div>
            <div>
              <div className="text-[10px] font-bold tracking-[.32em] text-cyan-200/70">RENAISSANCE / OPERATOR MISSIONS</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-5xl">STORAGE <span className="text-cyan-200">TRANSFER</span></h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <div className="rounded-full border border-amber-200/25 bg-amber-400/[.06] px-3 py-2 text-[10px] font-bold tracking-wider text-amber-100">
            <LockKeyhole className="mr-1 inline h-3.5 w-3.5"/> READ-ONLY
          </div>
          <Link href="/admin/aoe2war-os" className="rounded-full border border-cyan-200/20 px-3 py-2 text-[11px] font-bold text-cyan-100 hover:border-cyan-200/50">WAROS</Link>
          <button type="button" aria-label="Refresh authenticated receipts" onClick={()=>void refresh()} className="rounded-full border border-white/10 p-2.5 hover:text-cyan-200">
            <RefreshCw className="h-4 w-4"/>
          </button>
        </div>
      </header>
      {failure && <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/[.05] p-3 text-xs text-rose-200">
        {failure}. Stored measurements withheld.
      </div>}
      <section aria-label="Storage transfer host topology" className={PANEL+" space-y-4 p-4 sm:p-6"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-black tracking-[.21em] text-cyan-100"><Waves className="h-4 w-4"/> TRANSFER TOPOLOGY</div>
          <div className="text-[10px] tracking-wider text-slate-400">RECEIPT AGE · {observed(data?.storage.planes[0]?.asOf)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {NAV.map(node=><NodeTile key={node.id} id={node.id} label={node.name} subtitle={node.subtitle}
            selected={selected===node.id} onSelect={()=>setSelected(node.id)}
            reading={data?.storage.planes.find(p=>p.id===node.id)??null}/>)}
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-200/15 bg-cyan-300/[.025] px-4 py-3 text-center sm:flex-row">
          <span className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-slate-300">M1 <ArrowRight className="h-3 w-3"/> INTEL</span>
          <span className="hidden text-slate-400 sm:inline">·</span>
          <span className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-slate-300">HEL1 ROOT <ArrowRight className="h-3 w-3"/> INTEL</span>
          <span className="hidden text-slate-400 sm:inline">·</span>
          <span className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-slate-300">HEL1 VOLUME <ArrowRight className="h-3 w-3"/> INTEL</span>
          <span className="ml-0 flex items-center gap-1 text-[10px] text-amber-200 sm:ml-auto"><WifiOff className="h-3.5 w-3.5"/> TRANSFER RECEIPT NOT CONNECTED</span>
        </div>
      </section>
      <TransferMissionPanels model={transfer}/>
      <section aria-label="Verified source inventory" className={PANEL+" p-5 sm:p-7"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="text-[10px] font-bold tracking-[.25em] text-cyan-200/70">SOURCE INVENTORY</div>
            <h2 className="mt-1 text-2xl font-bold">Potential cargo</h2></div>
          <span className="text-[10px] font-bold tracking-wider text-slate-400">NOT AUTHORIZED FOR TRANSFER OR DELETION</span>
        </div>
        {candidates.length ?
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {candidates.slice(0,9).map(item=><div key={item.key} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
              <div className="truncate text-[12px] font-semibold text-slate-100">{item.label}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xl font-black tabular-nums">{bytes(item.grossBytes)}</div>
                <div className="text-[10px] text-slate-400">L{item.level}</div>
              </div>
              <div className="mt-3 text-[10px] text-amber-200">REVIEW BEFORE ARCHIVE</div>
            </div>)}
          </div> :
          <div className="mt-5 flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-slate-400">
            <Archive className="h-6 w-6"/>
            <div className="text-xs font-medium">No authenticated source cohort inventory connected</div>
          </div>}
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pb-6 pt-3 text-[10px] font-semibold tracking-wider text-slate-400">
        <span>VISUAL OPERATOR CONTROL · NO TRANSFER OR DELETE AUTHORITY</span>
        <span>{loading ? "LOADING RECEIPTS" : "LAST API POLL " + (data?.polledAt ?? "UNKNOWN")}</span>
        <Link className="hover:text-cyan-200" href="/admin/aoe2war-os">AOE2WAR OS <ArrowRight className="ml-1 inline h-3 w-3"/></Link>
      </footer>
    </div>
  </main>;
}
