import Link from "next/link";
import { Flame, Trophy } from "lucide-react";

import { formatDurationLabel } from "@/lib/gameStatsView";
import type { OgBoardEntry, OgBoardPlayer } from "@/lib/ogBoard";
import { normalizePublicReplayText } from "@/lib/unresolvedWatcherResult";

function formatPlayedAt(value: string | null) {
  if (!value) return "Historic archive";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Historic archive";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-950/12 py-1.5 last:border-b-0">
      <dt className="font-semibold text-slate-950/72">{label}</dt>
      <dd className="break-words text-right font-bold tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}

function OgPlayerBlock({ player }: { player: OgBoardPlayer }) {
  const civilization = normalizePublicReplayText(player.civilization) ?? "HD warrior";
  const hasPrimaryMetrics = [
    player.score,
    player.eapm,
    player.position,
    player.teamId,
    player.rmRating,
    player.dmRating,
  ].some((value) => value !== null);

  return (
    <section
      className={`border px-4 py-4 text-sm shadow-sm ${
        player.winner
          ? "border-slate-300 bg-slate-300 text-slate-950"
          : "border-slate-500/30 bg-slate-400 text-slate-950"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={player.href} className="break-words text-lg font-black underline decoration-slate-900/30 underline-offset-4 transition hover:decoration-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/60">
            {player.name}
          </Link>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-800/70">{civilization}</div>
        </div>
        {player.winner ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 border border-slate-900/15 bg-white/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Winner
          </span>
        ) : null}
      </div>

      {hasPrimaryMetrics ? (
        <dl className="mt-4 border-y border-slate-950/15 py-1">
          {player.score !== null ? <Metric label="Total Score" value={player.score.toLocaleString()} /> : null}
          {player.eapm !== null ? <Metric label="EAPM" value={player.eapm} /> : null}
          {player.position ? <Metric label="Starting Position" value={player.position} /> : null}
          {player.teamId ? <Metric label="Team" value={player.teamId} /> : null}
          {player.rmRating !== null ? <Metric label="RM Rating" value={player.rmRating} /> : null}
          {player.dmRating !== null ? <Metric label="DM Rating" value={player.dmRating} /> : null}
        </dl>
      ) : null}

      {player.achievements.map((group) => (
        <div key={group.key} className="mt-4">
          <div className="border-b border-slate-950/25 pb-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-900/75">{group.label}</div>
          <dl className="pt-1">
            {group.metrics.map((metric) => <Metric key={metric.key} label={metric.label} value={String(metric.value)} />)}
          </dl>
        </div>
      ))}
    </section>
  );
}

export function OgBattleCard({ entry, latest }: { entry: OgBoardEntry; latest: boolean }) {
  const gameVersion = normalizePublicReplayText(entry.gameVersion) ?? "AoE2HD";
  const mapName = normalizePublicReplayText(entry.mapName) ?? "HD Battlefield";
  const gameType = normalizePublicReplayText(entry.gameType) ?? "Recorded Match";
  const hasDuration = typeof entry.durationSeconds === "number" && entry.durationSeconds > 0;

  return (
    <article
      className={`px-4 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:px-6 sm:py-6 ${
        latest
          ? "border border-amber-300/80 bg-[#081426] text-amber-300 shadow-[0_0_35px_rgba(245,158,11,0.08),0_24px_70px_rgba(0,0,0,0.3)]"
          : "border border-slate-500/20 bg-[#263244] text-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={`flex items-center gap-2 text-xl font-black sm:text-2xl ${latest ? "text-amber-300" : "text-white"}`}>
            {latest ? <Flame className="h-5 w-5" aria-hidden="true" /> : null}
            {latest ? "Latest Match" : "Previous Match"}
          </div>
          <div className={`mt-1 text-xs font-semibold uppercase tracking-[0.18em] ${latest ? "text-amber-200/55" : "text-slate-400"}`}>Battle #{entry.id}</div>
        </div>
        <Link href={entry.href} className={`border-b pb-1 text-xs font-bold uppercase tracking-[0.16em] transition focus-visible:outline-none focus-visible:ring-2 ${latest ? "border-amber-200/40 text-amber-100 hover:border-amber-100" : "border-slate-300/30 text-slate-200 hover:border-white"}`}>
          Open battle record
        </Link>
      </div>

      <dl className={`mt-5 grid gap-x-7 gap-y-2 border-y py-4 text-sm sm:grid-cols-2 ${latest ? "border-amber-200/18" : "border-slate-300/15"}`}>
        <div><dt className="inline font-bold">Game Version:</dt> <dd className="inline">{gameVersion}</dd></div>
        <div><dt className="inline font-bold">Map:</dt> <dd className="inline">{mapName}{entry.mapSize ? ` · ${entry.mapSize}` : ""}</dd></div>
        <div><dt className="inline font-bold">Game Type:</dt> <dd className="inline">{gameType}</dd></div>
        {hasDuration ? <div><dt className="inline font-bold">Duration:</dt> <dd className="inline">{formatDurationLabel(entry.durationSeconds)}</dd></div> : null}
        <div><dt className="inline font-bold">Played:</dt> <dd className="inline"><time dateTime={entry.playedAt || undefined} suppressHydrationWarning>{formatPlayedAt(entry.playedAt)}</time></dd></div>
        {entry.winnerName ? (
          <div><dt className="inline font-bold">Winner:</dt> <dd className="inline">{entry.winnerName}</dd></div>
        ) : (
          <div><dt className="inline font-bold">Archive Status:</dt> <dd className="inline">Battle preserved</dd></div>
        )}
      </dl>

      <h2 className={`mt-5 text-base font-black uppercase tracking-[0.15em] ${latest ? "text-amber-300" : "text-white"}`}>Players</h2>
      {entry.players.length > 0 ? (
        <div className="mt-3 space-y-2">
          {entry.players.map((player, index) => <OgPlayerBlock key={`${entry.id}:${player.name}:${index}`} player={player} />)}
        </div>
      ) : (
        <div className="mt-3 border border-white/10 bg-black/15 px-4 py-4 text-sm text-slate-300">Replay preserved in the HD War Vault.</div>
      )}

      {entry.parseCompleteness !== "full" ? (
        <div className={`mt-4 border px-4 py-3 text-sm ${latest ? "border-amber-200/15 bg-amber-300/[0.045] text-amber-100/70" : "border-slate-300/15 bg-black/10 text-slate-300"}`}>
          Replay command record preserved in the HD War Vault.
        </div>
      ) : null}
    </article>
  );
}
