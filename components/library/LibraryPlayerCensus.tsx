"use client";

import Link from "next/link";
import { Activity, Archive, Database, HelpCircle, PackageOpen, RadioTower, RefreshCw, UsersRound, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryOrigin } from "@/lib/libraryLedger";

type Counts = { count: number; unknown: number; checkpoints: number; inferred: number };
type Origins = Record<LibraryOrigin, Counts>;
type PlayerRow = { uid: string; name: string; href: string; total: number; unknown: number; byOrigin: Origins };
type CensusResponse = {
  ok: boolean;
  generatedAt: string;
  totalFinalRecords: number;
  totals: Origins;
  players: PlayerRow[];
};

const channels = [
  { key: "watcher-live", label: "Watcher live", short: "LIVE", tint: "text-emerald-200", bar: "bg-emerald-400", icon: RadioTower },
  { key: "watcher-batch", label: "Watcher batch", short: "BATCH", tint: "text-rose-200", bar: "bg-rose-400", icon: PackageOpen },
  { key: "manual", label: "Manual single", short: "SINGLE", tint: "text-cyan-200", bar: "bg-cyan-400", icon: UploadCloud },
  { key: "manual-zip", label: "Manual ZIP", short: "ZIP", tint: "text-amber-200", bar: "bg-amber-400", icon: PackageOpen },
  { key: "watcher-legacy", label: "Watcher legacy", short: "LEGACY", tint: "text-sky-200", bar: "bg-sky-400", icon: RadioTower },
  { key: "unclassified", label: "Unclassified", short: "OTHER", tint: "text-slate-300", bar: "bg-slate-500", icon: Archive },
] as const;

function countsLabel(row: Counts) {
  return row.count.toLocaleString("en-US");
}

function ChannelCell({ value, color }: { value: Counts; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-2">
      <span className={`font-mono text-sm font-black tabular-nums ${value.count ? color : "text-slate-700"}`}>
        {countsLabel(value)}
      </span>
      {value.unknown ? (
        <span className="rounded-full border border-amber-300/14 bg-amber-300/[.07] px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200"
          title="Final replays without a statistics-eligible trusted outcome">
          {value.unknown} unknown
        </span>
      ) : (
        <span className="font-mono text-[10px] text-slate-700">0 unknown</span>
      )}
      {value.inferred > 0 ? (
        <span className="font-mono text-[9px] text-amber-200/70" title="Matched historical ZIP filename + uploader + timing; not exact provenance">
          {value.inferred} inferred
        </span>
      ) : null}
    </div>
  );
}

export default function LibraryPlayerCensus() {
  const [data, setData] = useState<CensusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/library/census", { cache: "no-store" });
      if (!response.ok) throw new Error("Census unavailable");
      const next = await response.json() as CensusResponse;
      if (!next.ok || !Array.isArray(next.players)) throw new Error("Census invalid");
      setData(next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const claimedTotal = useMemo(
    () => (data?.players ?? []).reduce((sum, row) => sum + row.total, 0),
    [data],
  );
  const unknownTotal = useMemo(
    () => (data?.players ?? []).reduce((sum, row) => sum + row.unknown, 0),
    [data],
  );

  return (
    <section className="relative overflow-hidden rounded-[25px] border border-white/[0.10] bg-[linear-gradient(135deg,#0c121c,#070b14_62%,#0b0c15)]" data-library-player-census>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-200/50 via-amber-200/10 to-transparent" />
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-6 sm:px-7">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.27em] text-amber-200/70">
            <UsersRound className="h-4 w-4" /> KINGDOM INTELLIGENCE // UPLOADER CENSUS
          </div>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            WHO BUILT THE LIBRARY?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Every claimed warrior&apos;s uploads, separated by their actual intake channel.
            The smaller number beneath each count reveals games still missing a trusted result.
          </p>
        </div>
        <button type="button" onClick={() => void load()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-white/[0.065] p-4 sm:grid-cols-4 sm:p-6">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500"><UsersRound className="h-3 w-3" /> Claimed profiles</div>
              <div className="mt-1.5 font-mono text-2xl font-black text-white">{data.players.length.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500"><Database className="h-3 w-3" /> Their replay records</div>
              <div className="mt-1.5 font-mono text-2xl font-black text-amber-200">{claimedTotal.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500"><Activity className="h-3 w-3" /> Outcome unknown</div>
              <div className="mt-1.5 font-mono text-2xl font-black text-orange-200">{unknownTotal.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-slate-500"><Archive className="h-3 w-3" /> Entire ledger</div>
              <div className="mt-1.5 font-mono text-2xl font-black text-slate-200">{data.totalFinalRecords.toLocaleString()}</div>
            </div>
          </div>

          <div className="overflow-x-auto [scrollbar-color:rgba(165,175,195,.36)_transparent]">
            <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-left" aria-label="Claimed players by upload source and unresolved outcomes">
              <thead>
                <tr className="border-b border-white/[.07]">
                  <th scope="col" className="sticky left-0 z-10 w-56 border-b border-white/10 bg-[#0a1019] px-4 py-4 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 sm:px-6">
                    Claimed warrior
                  </th>
                  {channels.map(({key,label,tint,icon:Icon}) => (
                    <th key={key} scope="col" className="min-w-[128px] border-b border-white/10 px-2 py-4 text-center">
                      <span className={`inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.08em] ${tint}`}>
                        <Icon className="h-3.5 w-3.5" />{label}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="border-b border-white/10 px-4 py-4 text-center font-mono text-[10px] uppercase tracking-widest text-white">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((player) => (
                  <tr key={player.uid} className="group hover:bg-white/[0.025]">
                    <th scope="row" className="sticky left-0 z-10 border-b border-white/[.055] bg-[#0a1019] px-4 py-3 text-left sm:px-6">
                      <Link href={player.href} className="block max-w-52 truncate text-sm font-black text-slate-100 transition group-hover:text-amber-200 hover:underline" title={player.name}>
                        {player.name}
                      </Link>
                      <div className="mt-1 font-mono text-[10px] text-slate-600">Claimed profile ↗</div>
                    </th>
                    {channels.map(({key,tint}) => (
                      <td key={key} className="border-b border-white/[.055] text-center">
                        <ChannelCell value={player.byOrigin[key]} color={tint} />
                      </td>
                    ))}
                    <td className="border-b border-white/[.055] px-4 text-center">
                      <div className="font-mono text-lg font-black tabular-nums text-white">{player.total.toLocaleString()}</div>
                      <div className="mt-1 font-mono text-[10px] text-amber-200/80">{player.unknown.toLocaleString()} unknown</div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-amber-100/[0.035]">
                  <th scope="row" className="sticky left-0 z-10 bg-[#161510] px-4 py-4 font-mono text-[10px] font-black uppercase tracking-widest text-amber-100 sm:px-6">All final records</th>
                  {channels.map(({key,tint}) => (
                    <td key={key} className="text-center">
                      <ChannelCell value={data.totals[key]} color={tint} />
                    </td>
                  ))}
                  <td className="px-4 text-center font-mono text-lg font-black text-amber-100">
                    {data.totalFinalRecords.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/[0.065] px-5 py-5 sm:px-7">
            <div className="flex flex-wrap gap-2">
              {channels.map(({key,bar,short}) => {
                const source = data.totals[key];
                if (!source.count) return null;
                const proportion = data.totalFinalRecords > 0 ? 100 * source.count / data.totalFinalRecords : 0;
                return (
                  <div key={key} className="min-w-[130px] flex-1 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-semibold text-slate-400">
                      <span>{short}</span><span>{Math.round(proportion)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${proportion}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs leading-6 text-slate-500">
              <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-amber-200/55" />
              <p>
                Counts are stored <strong className="font-semibold text-slate-300">final upload records owned by site accounts</strong>, not games played by someone else and not unique deduplicated battles.
                “Unknown” means no statistics-eligible trusted result; saved checkpoints are excluded from that unknown count.
                Historical ZIP matches marked <strong className="font-semibold text-amber-200/80">inferred</strong> use unique uploader + exact filename + close receipt timing, not signed or exact game-ID proof.
                Ambiguous legacy uploads remain in Manual / Legacy rather than being guessed into ZIP.
                These source counts never change ratings, betting eligibility, or settlement.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="px-6 py-14 text-center text-sm text-slate-500">
          {loading ? "Reconstructing historical uploader provenance…" : "Player source census is temporarily unavailable."}
        </div>
      )}
      {failed && data ? <div className="border-t border-rose-300/15 bg-rose-300/[.04] px-6 py-3 text-xs text-rose-200">Unable to refresh the latest census; prior figures remain visible.</div> : null}
    </section>
  );
}
