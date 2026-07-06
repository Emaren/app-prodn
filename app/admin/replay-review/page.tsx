import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  ExternalLink,
  FileSearch,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import {
  loadReplayReviewQueue,
  type ReplayReviewMarketSummary,
  type ReplayReviewQueueEntry,
} from "@/lib/replayReviewQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    gameId?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDuration(value: number | null) {
  if (!value || value <= 0) return "Duration unavailable";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function moneyTone(market: ReplayReviewMarketSummary | null) {
  if (!market) return "border-slate-300/10 bg-white/[0.035] text-slate-300";
  if (market.moneyState === "paid") {
    return "border-emerald-300/18 bg-emerald-400/[0.07] text-emerald-100";
  }
  if (market.moneyState === "refund_recorded") {
    return "border-sky-300/18 bg-sky-400/[0.07] text-sky-100";
  }
  if (["settlement_failed", "funding_issue"].includes(market.moneyState)) {
    return "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  }
  return "border-amber-300/18 bg-amber-400/[0.07] text-amber-100";
}

function StoragePendingButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      title="Storage pending — commissioner verdict persistence is not present in the current schema."
      className="min-h-10 cursor-not-allowed rounded-full border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-xs font-semibold text-slate-500"
    >
      {children}
    </button>
  );
}

function Signal({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        active
          ? "border-cyan-300/18 bg-cyan-400/[0.08] text-cyan-100"
          : "border-white/[0.06] bg-white/[0.025] text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function ReviewCard({
  entry,
  focused,
}: {
  entry: ReplayReviewQueueEntry;
  focused: boolean;
}) {
  const proof = entry.replayProof;
  const market = entry.market;

  return (
    <article
      id={`game-${entry.id}`}
      data-review-game-id={entry.id}
      className={`scroll-mt-24 overflow-hidden rounded-[1.8rem] border bg-[radial-gradient(circle_at_92%_0%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(145deg,rgba(9,16,30,0.98),rgba(2,6,23,0.96))] shadow-[0_24px_80px_rgba(2,6,23,0.28)] ${
        focused
          ? "border-amber-200/35 ring-2 ring-amber-300/10"
          : "border-white/[0.08]"
      }`}
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.85fr)]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-amber-100/70">
                <ShieldAlert className="h-4 w-4" />
                Game #{entry.id}
                <span className="text-slate-600">·</span>
                {entry.unresolvedResult.label}
              </div>
              <h2 className="mt-3 break-words text-2xl font-semibold leading-tight tracking-[-0.025em] text-white">
                {entry.title}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-slate-200">
                  {entry.format}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-slate-200">
                  {entry.mapName}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-slate-300">
                  {formatDuration(entry.durationSeconds)}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs text-slate-300">
                  {formatDate(entry.playedOn)}
                </span>
              </div>
            </div>

            {entry.adjudication ? (
              <div className="rounded-2xl border border-emerald-300/18 bg-emerald-400/[0.07] px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" />
                  Overlay exists
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {entry.adjudication.winner}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-300/18 bg-amber-400/[0.07] px-4 py-3 text-right">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                  Needs commissioner
                </div>
                <div className="mt-1 text-sm text-slate-300">
                  {entry.unresolvedResult.code.replaceAll("_", " ")}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                Parser result
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {entry.rawWinner
                  ? `Candidate: ${entry.rawWinner}`
                  : "No reliable winner field"}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {entry.winnerTruth.diagnosticSummary}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  {entry.parseSource}
                </span>
                <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  {entry.parseReason}
                </span>
                <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  parse #{entry.parseIteration}
                </span>
              </div>
            </div>

            <div className={`rounded-2xl border px-4 py-4 ${moneyTone(market)}`}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] opacity-70">
                <CircleDollarSign className="h-4 w-4" />
                Settlement result
              </div>
              <div className="mt-2 text-base font-semibold text-white">
                {market?.moneyLabel ?? "No market attached"}
              </div>
              <div className="mt-2 text-sm leading-6 opacity-80">
                {market?.moneyDetail ?? "No betting money state is attached to this replay."}
              </div>
              {market ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.13em] opacity-75">
                  <span>{market.slipCount} slip{market.slipCount === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{market.totalStakedWolo} WOLO</span>
                  <span>·</span>
                  <span>{market.status}</span>
                  {market.settlementStatus ? (
                    <>
                      <span>·</span>
                      <span>{market.settlementStatus.replaceAll("_", " ")}</span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-slate-950/45 px-4 py-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
              <UsersRound className="h-4 w-4" />
              Roster candidates
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Left side</div>
                <div className="mt-1 break-words text-sm font-semibold text-white">
                  {entry.leftCandidates.join(" + ") || "Roster unresolved"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Right side</div>
                <div className="mt-1 break-words text-sm font-semibold text-white">
                  {entry.rightCandidates.join(" + ") || "Roster unresolved"}
                </div>
              </div>
            </div>
          </div>

          {entry.adjudication ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.05] px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/70">
                Commissioner verdict · public/stats overlay only
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-200">
                {entry.adjudication.reason}
              </div>
              {entry.adjudication.settlementNote ? (
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {entry.adjudication.settlementNote}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/[0.07] bg-black/15 p-5 sm:p-6 xl:border-l xl:border-t-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-100/60">
            <FileSearch className="h-4 w-4" />
            Finality evidence
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
              <div className="text-2xl font-semibold text-white">{proof.parseAttempts}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">parse attempts</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
              <div className="text-2xl font-semibold text-white">{proof.stableCopies}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">stable signals</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Signal label="accepted" active={proof.finalCandidateAccepted} />
            <Signal label="deferred" active={proof.finalCandidateDeferred} />
            <Signal label="parse pending" active={proof.parsePending} />
            <Signal label="unknown fields" active={proof.unknownFields} />
            <Signal label="duplicate ignored" active={proof.duplicateCandidateIgnored} />
          </div>

          <div className="mt-4 space-y-3 text-xs leading-5 text-slate-400">
            <div>
              <span className="text-slate-600">Uploader:</span>{" "}
              {entry.uploaderName ?? "Watcher identity unavailable"}
            </div>
            <div className="break-all">
              <span className="text-slate-600">Replay:</span>{" "}
              {entry.originalFilename ?? entry.replayFile}
            </div>
            <div>
              <span className="text-slate-600">Latest parse:</span>{" "}
              {proof.latestAttemptStatus ?? "No attempt row"}
              {proof.latestAttemptDetail ? ` · ${proof.latestAttemptDetail}` : ""}
            </div>
            {proof.keyEventSignals.length ? (
              <div>
                <span className="text-slate-600">Key signals:</span>{" "}
                {proof.keyEventSignals.join(", ")}
              </div>
            ) : null}
            {proof.watcherEventTypes.length ? (
              <div>
                <span className="text-slate-600">Watcher events:</span>{" "}
                {proof.watcherEventTypes.join(", ")}
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/[0.07] pt-5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
              <DatabaseZap className="h-4 w-4" />
              Commissioner actions
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Storage pending. These controls intentionally cannot write parser,
              market, wager, claim, or settlement rows.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StoragePendingButton>Approve left side</StoragePendingButton>
              <StoragePendingButton>Approve right side</StoragePendingButton>
              {entry.players.map((player) => (
                <StoragePendingButton key={player.name}>
                  {`Approve ${player.name}`}
                </StoragePendingButton>
              ))}
              <StoragePendingButton>Void / Refund</StoragePendingButton>
              <StoragePendingButton>Keep under review</StoragePendingButton>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
            <Link
              href={entry.links.theatre}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-sky-200 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-100"
            >
              Watch Theatre
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href={entry.links.finalStats}
              className="inline-flex min-h-9 items-center rounded-full border border-white/[0.1] bg-white/[0.045] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Open Final Stats
            </Link>
            {entry.links.betRail ? (
              <Link
                href={entry.links.betRail}
                className="inline-flex min-h-9 items-center rounded-full border border-amber-200/15 bg-amber-300/[0.07] px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/[0.12]"
              >
                Bet Rail
              </Link>
            ) : null}
            <Link
              href={entry.links.lobby}
              className="inline-flex min-h-9 items-center rounded-full border border-white/[0.08] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
            >
              Open Lobby
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}

export default async function AdminReplayReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const focusedGameId = Number(firstParam(params.gameId));
  const data = await loadReplayReviewQueue(getPrisma());

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.10),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.11),transparent_28%),#050914] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/user-list"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Command Tower
          </Link>
          <Link
            href="/admin/watcher-funnel"
            className="inline-flex min-h-9 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
          >
            Watcher Funnel
          </Link>
        </div>

        <header className="mt-5 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_82%_0%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(145deg,rgba(13,22,40,0.98),rgba(2,6,23,0.96))] p-6 shadow-[0_30px_100px_rgba(2,6,23,0.35)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-100/70">
                <FileSearch className="h-4 w-4" />
                Commissioner Review Queue
              </div>
              <h1 className="mt-3 max-w-4xl font-serif text-4xl leading-none tracking-[-0.03em] text-white sm:text-5xl">
                Final proof deserves a verdict, not a guess.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Parser truth, commissioner truth, public truth, and money truth stay
                visible as separate layers. This queue never rewrites the raw replay.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] px-4 py-3">
                <div className="text-2xl font-semibold text-white">{data.pendingCount}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-amber-100/70">pending</div>
              </div>
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-3">
                <div className="text-2xl font-semibold text-white">{data.adjudicatedCount}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">overlayed</div>
              </div>
              <div className="col-span-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 sm:col-span-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Clock3 className="h-4 w-4 text-cyan-200" />
                  Read only
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">safe mode</div>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/16 bg-amber-400/[0.06] px-4 py-4 text-sm leading-6 text-amber-50">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Verdict storage pending</div>
            <div className="text-amber-100/75">{data.storageNotice}</div>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {data.entries.length ? (
            data.entries.map((entry) => (
              <ReviewCard
                key={entry.id}
                entry={entry}
                focused={Number.isSafeInteger(focusedGameId) && focusedGameId === entry.id}
              />
            ))
          ) : (
            <div className="rounded-[1.8rem] border border-emerald-300/15 bg-emerald-400/[0.05] px-6 py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-200" />
              <h2 className="mt-3 text-xl font-semibold text-white">Review queue clear</h2>
              <p className="mt-2 text-sm text-slate-400">
                No final replay currently lacks reliable winner proof.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
