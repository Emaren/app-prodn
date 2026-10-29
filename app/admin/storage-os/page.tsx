"use client";

import Link from "next/link";
import {
  Activity, ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Database,
  GitBranch, HardDrive, Layers3, Laptop2, LockKeyhole, Radar,
  RefreshCw, Server, ShieldAlert, ShieldCheck, Wifi, WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StorageCommandCenter, StorageReading } from "@/lib/storageCommandCenterProjection";
import StorageVisualExplorer from "@/components/storage-os/StorageVisualExplorer";
import StorageLevelPanels from "@/components/storage-os/StorageLevelPanels";

type PlaneId = StorageReading["id"];
const IDS: PlaneId[] = ["mac", "hel1-root", "hel1-volume-105319120"];
const FRAME = "rounded-[1.65rem] border border-white/10 bg-slate-950/65 shadow-[0_20px_70px_rgba(0,0,0,.22)]";

function humanBytes(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "0 B";
  const unit = value >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  return `${(value / unit).toFixed(2)} ${unit === 1024 ** 3 ? "GiB" : "MiB"}`;
}
function age(value: string | null): string {
  if (!value) return "NO RECEIPT";
  const n = Date.parse(value);
  if (!Number.isFinite(n)) return "INVALID DATE";
  const diff = Math.max(0, Math.floor((Date.now() - n) / 60000));
  return diff < 1 ? "<1m" : diff < 60 ? `${diff}m` : diff < 1440 ? `${Math.floor(diff / 60)}h` : `${Math.floor(diff / 1440)}d`;
}
function shortSha(value: string | null): string {
  return value ? value.slice(0, 9) : "—";
}
function stateLabel(value: StorageReading["status"]) {
  return value === "RECEIPT" ? "OBSERVED" : value === "STALE" ? "STALE" : "UNKNOWN";
}
function Gauge({ value, large = false }: { value: number | null; large?: boolean }) {
  const size = large ? 212 : 140;
  const r = large ? 84 : 54;
  const circumference = 2 * Math.PI * r;
  const pct = value !== null && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" role="img"
        aria-label={pct === null ? "Capacity unknown" : `${pct.toFixed(1)} percent used`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={large ? 13 : 10}/>
        {pct !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 90 ? "#fb7185" : pct >= 80 ? "#fbbf24" : "#22d3ee"}
          strokeWidth={large ? 13 : 10} strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}/>}
        <circle cx={size / 2} cy={size / 2} r={r - (large ? 15 : 11)}
          fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2 9"/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black tabular-nums tracking-tight text-white ${large ? "text-5xl" : "text-[27px]"}`}>
          {pct === null ? "—" : pct.toFixed(1)}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[.25em] text-slate-500">
          {pct === null ? "UNMEASURED" : "% USED"}
        </span>
      </div>
    </div>
  );
}
function DriveCard({
  plane, active, onSelect, topHogs,
}: { plane: StorageReading; active: boolean; onSelect: () => void; topHogs: {label:string;grossBytes:number}[] }) {
  const Icon = plane.id === "mac" ? Laptop2 : plane.id === "hel1-root" ? Server : Database;
  return (
    <button type="button" onClick={onSelect} aria-pressed={active}
      className={`${FRAME} group relative w-full overflow-hidden p-5 text-left transition-all hover:border-cyan-200/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300
        ${active ? "border-cyan-300/40 bg-cyan-300/[.055]" : ""}`}>
      <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-300/[.035] blur-3xl"/>
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[.18em] text-slate-300">
          <Icon className="h-4 w-4 text-cyan-300" /> {plane.label}
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold tracking-widest ${plane.status === "RECEIPT" ? "border-cyan-300/25 text-cyan-200" : plane.status === "STALE" ? "border-amber-300/25 text-amber-200" : "border-slate-600 text-slate-400"}`}>
          {stateLabel(plane.status)}
        </span>
      </div>
      <Gauge value={plane.usedPercent}/>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
        <div><div className="text-[10px] tracking-widest text-slate-500">FREE</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-white">{humanBytes(plane.freeBytes)}</div></div>
        <div><div className="text-[10px] tracking-widest text-slate-500">OBSERVED</div>
          <div className="mt-1 text-lg font-semibold text-slate-200">{age(plane.asOf)}</div></div>
      </div>
      <div className="mt-4 border-t border-white/[.07] pt-3">
        <div className="mb-2 text-[9px] font-bold tracking-[.2em] text-cyan-200/65">BIGGEST VERIFIED HOGS</div>
        {topHogs.length?topHogs.slice(0,2).map(h=><div key={h.label} className="flex items-center justify-between gap-2 py-1 text-[11px] text-slate-400">
          <span className="min-w-0 truncate">{h.label}</span>
          <span className="shrink-0 font-mono text-slate-100">{humanBytes(h.grossBytes)}</span>
        </div>):<div className="text-[10px] text-slate-600">NO VERIFIED HOG FEED</div>}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span>{plane.source.replaceAll("_", " ")}</span>
        <ArrowUpRight className="h-4 w-4 transition group-hover:text-cyan-200"/>
      </div>
    </button>
  );
}
function Parity({ label, value, code }: { label: string; value: boolean | null; code: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/[.06] py-3 last:border-0">
    <div><div className="text-xs font-semibold text-slate-200">{label}</div>
      <div className="mt-1 font-mono text-[11px] text-slate-500">{code}</div></div>
    <span className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold tracking-wider ${value === true ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : value === false ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-white/10 text-slate-400"}`}>
      {value === null ? "UNKNOWN" : value ? "MATCH" : "MISMATCH"}
    </span>
  </div>;
}

export default function PrivateStorageOsPage() {
  const [data, setData] = useState<StorageCommandCenter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<PlaneId>("mac");
  const [loading, setLoading] = useState(true);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current) return; // never overlap bounded read-side GETs
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch("/api/admin/storage-os", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("STORAGE TELEMETRY UNAVAILABLE");
      const payload = await response.json() as StorageCommandCenter;
      if (controller.signal.aborted || pending.current !== controller) return;
      if (payload.schema !== "aoe2war.private-storage-command-center.v1")
        throw new Error("UNRECOGNIZED STORAGE EVIDENCE");
      setData(payload);
      setError(null);
    } catch (exc) {
      if (pending.current === controller && document.visibilityState === "visible") {
        setData(null); // no stale success masquerading as live capacity
        setError(exc instanceof Error ? exc.message : "READ FAILURE");
      }
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
      else { pending.current?.abort(); pending.current = null; setData(null); }
    };
    visibility();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      pending.current?.abort(); pending.current = null;
    };
  }, [refresh]);
  const plane = data?.planes.find(item => item.id === activeId) ?? null;
  const release = data?.release;
  const observed = data?.planes.filter(item => item.status === "RECEIPT").length ?? 0;

  return <main className="min-h-screen bg-[#050b14] text-white">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_at_22%_15%,rgba(14,165,233,.14),transparent_45%),radial-gradient(ellipse_at_82%_15%,rgba(52,211,153,.09),transparent_45%)]"/>
    <div className="relative mx-auto max-w-[1530px] space-y-5 px-4 py-7 sm:px-7 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/admin/aoe2war-os" className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-slate-400 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4"/> AoE2WAR OS
          </Link>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10">
              <Radar className="h-6 w-6 text-cyan-200"/>
            </div>
            <div><div className="text-[10px] font-bold tracking-[.37em] text-cyan-200/70">KINGDOM INFRASTRUCTURE</div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">STORAGE <span className="text-cyan-200">/ OS</span></h1></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/[.07] px-3 py-2 text-[10px] font-bold tracking-widest text-amber-200">
            <LockKeyhole className="h-3.5 w-3.5"/> READ ONLY
          </span>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold tracking-widest ${data?.bridgeOnline ? "border-cyan-300/20 text-cyan-200" : "border-slate-700 text-slate-400"}`}>
            {data?.bridgeOnline ? <Wifi className="h-3.5 w-3.5"/> : <WifiOff className="h-3.5 w-3.5"/>}
            BRIDGE {data?.bridgeOnline ? "ONLINE" : "OFFLINE"}
          </span>
          <button type="button" onClick={() => void refresh()} className="rounded-full border border-white/10 p-2.5 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100" aria-label="Refresh stored receipts">
            <RefreshCw className="h-4 w-4"/>
          </button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error} — READINGS WITHHELD</div>}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Storage planes">
        {IDS.map(id => {
          const p = data?.planes.find(item => item.id === id) ?? {
            id, label: id === "mac" ? "DEVELOPMENT MAC" : id === "hel1-root" ? "HEL1 ROOT" : "HEL1 EVIDENCE VOLUME",
            freeBytes: null, usedPercent: null, reclaimedBytes: null, status: "UNKNOWN" as const,
            source: "NONE" as const, asOf: null, classes: [],
          };
          return <DriveCard key={id} plane={p} active={id === activeId} onSelect={() => setActiveId(id)}
            topHogs={(data?.visual?.planes.find(v=>v.id===id)?.hogs??[]).slice(0,2)}/>;
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <div className={`${FRAME} overflow-hidden p-5 sm:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-[10px] font-bold tracking-[.3em] text-cyan-200/65">SELECTED PLANE / EVIDENCE</div>
              <h2 className="mt-1 text-2xl font-bold">{plane?.label ?? "AWAITING EVIDENCE"}</h2></div>
            <span className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-4 w-4"/> {age(plane?.asOf ?? null)}</span>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
            <Gauge value={plane?.usedPercent ?? null} large/>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="text-[10px] font-bold tracking-widest text-slate-500">ORDINARY FREE</div>
                  <div className="mt-2 text-2xl font-black tabular-nums">{humanBytes(plane?.freeBytes ?? null)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                  <div className="text-[10px] font-bold tracking-widest text-slate-500">PHYSICAL RECLAIM</div>
                  <div className="mt-2 text-2xl font-black tabular-nums">{humanBytes(plane?.reclaimedBytes ?? null)}</div>
                </div>
              </div>
              <div className="border-l-2 border-cyan-300/30 pl-4 text-xs leading-6 text-slate-400">
                {plane?.source === "SIGNED_THREE_PLANE_RECEIPT" ? "Three-plane signed operator evidence; admission remains HOLD, never live-certified." :
                 plane?.source === "OPERATOR_ESTATE_SNAPSHOT" ? "Cached operator estate snapshot; not signed real-time host telemetry." :
                 "No authenticated measurement is connected to this plane."}
              </div>
              <div className="flex flex-wrap gap-2">
                {plane?.classes.length ? plane.classes.map((c) => <span key={c} className="rounded-md bg-cyan-300/[.065] px-2 py-1 font-mono text-[10px] text-cyan-100/85">{c.replaceAll("_"," ")}</span>) :
                  <span className="text-[11px] text-slate-600">CONSUMER CLASS DATA UNAVAILABLE</span>}
              </div>
            </div>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4 text-[10px] tracking-wider text-slate-500">
            PROVENANCE · {plane?.source ?? "NONE"} · OBSERVED {plane?.asOf ?? "UNKNOWN"}
          </div>
        </div>

        <div className={`${FRAME} p-5 sm:p-7`}>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.28em] text-cyan-200/70">
            <ShieldCheck className="h-4 w-4"/> MAC / LEVEL 1 CLOSURE
          </div>
          <div className="mt-5 flex items-end gap-3">
            <div className="text-6xl font-black tabular-nums text-white">—</div>
            <span className="pb-2 text-xs font-bold tracking-widest text-slate-400">/ 100%</span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-slate-900">
            <div className="h-full w-0 bg-cyan-400"/>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-300/[.04] px-4 py-3 text-xs leading-5 text-amber-100/80">
            NO CERTIFIED MAC PROGRESS FEED. Browser polling does not run the Mac census or establish a cleanup seal.
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[.025] p-3"><div className="text-[10px] text-slate-500">CERTIFIED L1 RECOVERY</div>
              <div className="mt-2 text-xl font-bold">—</div></div>
            <div className="rounded-xl bg-white/[.025] p-3"><div className="text-[10px] text-slate-500">SIGNED ATLAS</div>
              <div className="mt-2 text-sm font-bold text-amber-200">{data?.signedAdmission === "HOLD" ? "HOLD" : "NOT CONNECTED"}</div></div>
          </div>
        </div>
      </section>

      <StorageVisualExplorer visual={data?.visual} activeId={activeId}/>
      <StorageLevelPanels visual={data?.visual} activeId={activeId}/>

      <section className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <div className={`${FRAME} p-5 sm:p-7`}>
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.28em] text-cyan-200/70"><GitBranch className="h-4 w-4"/> SOURCE / RUNTIME PARITY</div>
          <div className="mt-4">
            <Parity label="Local source ↔ remote" value={release?.sourceRemoteParity ?? null}
              code={`${shortSha(release?.sourceSha ?? null)} / ${shortSha(release?.remoteSha ?? null)}`}/>
            <Parity label="Local source ↔ deployed" value={release?.sourceProductionParity ?? null}
              code={`${shortSha(release?.sourceSha ?? null)} / ${shortSha(release?.productionSha ?? null)}`}/>
            <Parity label="Internal ↔ public build" value={release?.runtimeVersionParity ?? null}
              code={`${release?.internalVersion ?? "—"} / ${release?.publicVersion ?? "—"}`}/>
          </div>
          <div className="mt-4 text-[10px] tracking-wider text-slate-500">RELEASE SNAPSHOT · {age(release?.receiptAt ?? null)} AGO</div>
        </div>
        <div className={`${FRAME} p-5 sm:p-7`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.28em] text-cyan-200/70"><Activity className="h-4 w-4"/> EVIDENCE TOPOLOGY</div>
            <span className="text-[10px] text-slate-500">{observed}/3 RECEIPTS CURRENT</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {data?.planes.map(p => <div key={p.id} className="min-w-0 rounded-2xl border border-white/[.07] bg-white/[.025] px-3 py-4 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900">
                {p.status === "RECEIPT" ? <CheckCircle2 className="h-5 w-5 text-cyan-300"/> :
                 p.status === "STALE" ? <Clock3 className="h-5 w-5 text-amber-300"/> : <ShieldAlert className="h-5 w-5 text-slate-500"/>}
              </div>
              <div className="mt-3 truncate text-[10px] font-bold text-slate-200">{p.label}</div>
              <div className="mt-1 text-[9px] font-semibold tracking-widest text-slate-500">{stateLabel(p.status)}</div>
            </div>) ?? IDS.map(id => <div key={id} className="rounded-xl border border-white/10 p-5 text-center text-xs text-slate-500">UNKNOWN</div>)}
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Layers3 className="h-4 w-4"/>
            Polling reads existing receipts only · 15s foreground cadence · 0 host scans
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pb-7 pt-4 text-[10px] font-semibold tracking-wider text-slate-500">
        <div className="flex items-center gap-2"><HardDrive className="h-4 w-4"/> AOE2WAR / PRIVATE STORAGE CONTROL</div>
        <div>{loading ? "LOADING STORED RECEIPTS" : `LAST FETCH ${data?.polledAt ?? "UNKNOWN"}`}</div>
        <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4"/> NO AUTO-DELETE OR RELEASE AUTHORITY</div>
      </footer>
    </div>
  </main>;
}
