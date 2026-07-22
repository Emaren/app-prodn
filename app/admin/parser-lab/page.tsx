import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  FileArchive,
  FileSearch,
  FlaskConical,
  Gauge,
  History,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { loadAdminParserLab, type ParserLabJobState } from "@/lib/adminParserLab";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "No checkpoint recorded";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function percentFromBps(value: number) {
  return `${(Math.max(0, value) / 100).toFixed(value % 100 === 0 ? 0 : 1)}%`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (["completed", "accepted"].includes(status)) {
    return "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100";
  }
  if (["running", "leased", "batch started", "checkpointed"].includes(status)) {
    return "border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100";
  }
  if (["queued", "created", "paused", "skipped", "pending admin approval"].includes(status)) {
    return "border-amber-300/20 bg-amber-400/[0.08] text-amber-100";
  }
  if (["failed", "cancelled"].includes(status)) {
    return "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  }
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function jobTone(state: ParserLabJobState) {
  return statusTone(state.status);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof DatabaseZap;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
          {label}
        </div>
        <Icon className="h-4 w-4 text-cyan-200/70" />
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function EmptyLedger({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-8 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

export default async function AdminParserLabPage() {
  const data = await loadAdminParserLab(getPrisma());
  const catalogBarWidth = `${Math.min(100, data.legacy.catalogCoverageBps / 100)}%`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_26%),#050914] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[96rem] space-y-6">
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Admin
          </Link>
          <Link
            href="/admin/replay-review"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Replay Review
          </Link>
          <Link
            href="/admin/watcher-funnel"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-slate-300 transition hover:text-white"
          >
            <Activity className="h-3.5 w-3.5" />
            Watcher Funnel
          </Link>
        </nav>

        <header className="overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(145deg,rgba(13,22,40,0.98),rgba(2,6,23,0.97))] p-6 shadow-[0_30px_100px_rgba(2,6,23,0.4)] sm:p-8">
          <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.31em] text-cyan-100/70">
                <FlaskConical className="h-4 w-4" />
                Private parser operations
              </div>
              <h1 className="mt-3 max-w-4xl font-serif text-4xl leading-none tracking-[-0.035em] text-white sm:text-5xl">
                HD Replay Engine Room
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Immutable source artifacts, deterministic parser passes, failure signatures,
                private candidates, and bounded reprocessing in one operator cockpit.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/18 bg-amber-400/[0.07] px-3 py-1.5 text-amber-100">
                  <LockKeyhole className="h-3.5 w-3.5" /> Admin only
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/18 bg-cyan-400/[0.07] px-3 py-1.5 text-cyan-100">
                  <Layers3 className="h-3.5 w-3.5" /> Candidate only
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/18 bg-emerald-400/[0.07] px-3 py-1.5 text-emerald-100">
                  <ShieldCheck className="h-3.5 w-3.5" /> Public aggregates protected
                </span>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/[0.08] bg-slate-950/55 p-5 xl:min-w-[25rem]">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                Active parser contract
              </div>
              <div className="mt-3 text-lg font-semibold text-white">
                {data.contract.parserName} · v{data.contract.parserVersion}
              </div>
              <div className="mt-2 text-sm text-cyan-100/80">
                {data.contract.passName} · pass {data.contract.passVersion}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                schema {data.contract.schemaVersion}
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
                <RefreshCw className="h-3.5 w-3.5" /> Snapshot {formatDate(data.generatedAt)}
              </div>
            </div>
          </div>
        </header>

        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm leading-6 ${
            data.storageReady
              ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50"
              : "border-amber-300/18 bg-amber-400/[0.07] text-amber-50"
          }`}
        >
          {data.storageReady ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {data.storageReady ? "Engine Room ledger readable" : "Foundation storage requires operator action"}
            </div>
            <div className={data.storageReady ? "text-emerald-100/75" : "text-amber-100/75"}>
              {data.storageNotice}
            </div>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Vault games"
            value={formatNumber(data.legacy.games)}
            detail={`${formatNumber(data.legacy.finalGames)} final game rows`}
            icon={FileArchive}
          />
          <MetricCard
            label="Raw artifacts"
            value={formatNumber(data.overview.artifacts)}
            detail={`${formatNumber(data.overview.submissions)} immutable receipts`}
            icon={DatabaseZap}
          />
          <MetricCard
            label="Candidate runs"
            value={formatNumber(data.overview.parseRuns)}
            detail={`${formatNumber(data.overview.gameLinkedRuns)} linked to game rows`}
            icon={FlaskConical}
          />
          <MetricCard
            label="Completed"
            value={formatNumber(data.overview.completedRuns)}
            detail={`${formatNumber(data.overview.failedRuns)} failed · ${formatNumber(data.overview.skippedRuns)} skipped`}
            icon={CheckCircle2}
          />
          <MetricCard
            label="Observations"
            value={formatNumber(data.overview.observations)}
            detail={`${formatNumber(data.overview.promotions)} private catalog promotions`}
            icon={Layers3}
          />
          <MetricCard
            label="Review proposals"
            value={formatNumber(data.review.pendingProposalRows)}
            detail={`${formatNumber(data.review.acceptedVerdictRows)} accepted ledger rows`}
            icon={History}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-100/65">
                  Vault catalog coverage
                </div>
                <h2 className="mt-2 text-2xl font-semibold">Legacy evidence → immutable receipts</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  This compares current replay parse-attempt rows with receipts explicitly linked
                  into the Engine Room. Duplicate bytes may share one raw artifact.
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold text-white">
                  {percentFromBps(data.legacy.catalogCoverageBps)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  attempts cataloged
                </div>
              </div>
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full border border-white/[0.07] bg-slate-950">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-300"
                style={{ width: catalogBarWidth }}
              />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
              <span>{formatNumber(data.legacy.attemptsCataloged)} linked receipts</span>
              <span>{formatNumber(data.legacy.parseAttempts)} legacy attempts</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {data.legacy.attemptStatuses.length ? (
                data.legacy.attemptStatuses.map((entry) => (
                  <span
                    key={entry.status}
                    className={`rounded-full border px-3 py-1.5 text-xs ${statusTone(humanize(entry.status))}`}
                  >
                    {humanize(entry.status)} · {formatNumber(entry.count)}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No legacy attempt statuses recorded.</span>
              )}
            </div>
            {!data.legacyReady ? (
              <div className="mt-4 text-xs text-rose-200">{data.legacyNotice}</div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-100/65">
              Private result review
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Commissioner ledger pressure</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Review telemetry stays separate from raw parser evidence. Ledger rows are append-only;
              these are operator counts, not public labels.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ["Parser-flagged finals", data.review.parserFlaggedFinals],
                ["Pending proposals", data.review.pendingProposalRows],
                ["Accepted verdict rows", data.review.acceptedVerdictRows],
                ["Stats-affecting rows", data.review.statsAffectingRows],
                ["Bet-affecting rows", data.review.betsAffectingRows],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="text-2xl font-semibold text-white">{formatNumber(Number(value))}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.17em] text-slate-500">
                    {label}
                  </div>
                </div>
              ))}
              <Link
                href="/admin/replay-review"
                className="flex min-h-24 items-center justify-center rounded-2xl border border-amber-300/18 bg-amber-400/[0.06] p-4 text-center text-sm font-semibold text-amber-100 transition hover:bg-amber-400/[0.10]"
              >
                Open verdict queue
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-sky-100/65">
                Ingestion coverage slices
              </div>
              <h2 className="mt-2 text-2xl font-semibold">What has actually reached the candidate ledger</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Extension and source counts cover the immutable ledger. Uploader coverage is calculated from the latest {formatNumber(data.limits.uploaderGameSample)} GameStats rows that have linked parse runs.
              </p>
            </div>
            <DatabaseZap className="h-6 w-6 text-sky-200/70" />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Artifact extensions
              </div>
              <div className="mt-4 space-y-2">
                {data.coverageSlices.artifactExtensions.length ? (
                  data.coverageSlices.artifactExtensions.map((entry) => (
                    <div key={entry.extension ?? "not-recorded"} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5 text-xs">
                      <span className="font-mono text-slate-300">{entry.extension ?? "not recorded"}</span>
                      <strong className="text-white">{formatNumber(entry.count)}</strong>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No artifact extension rows recorded.</div>
                )}
              </div>
              <div className="mt-3 text-[11px] leading-5 text-slate-600">
                Missing extension values stay uncategorized; the cockpit does not infer a format from filenames.
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Submission sources
              </div>
              <div className="mt-4 space-y-2">
                {data.coverageSlices.submissionSources.length ? (
                  data.coverageSlices.submissionSources.map((entry) => (
                    <div key={entry.source} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5 text-xs">
                      <span className="text-slate-300">{humanize(entry.source)}</span>
                      <strong className="text-white">{formatNumber(entry.count)}</strong>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No submission receipts recorded.</div>
                )}
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Linked uploader / player coverage
                </div>
                <span className="text-[10px] text-slate-600">
                  {formatNumber(data.coverageSlices.uploaderGameSampleSize)} games sampled
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {data.coverageSlices.uploaderPlayers.length ? (
                  data.coverageSlices.uploaderPlayers.map((entry) => (
                    <div key={entry.key} className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">{entry.displayName}</div>
                          {entry.userUid ? (
                            <div className="mt-1 truncate font-mono text-[10px] text-slate-600">{entry.userUid}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-slate-500">
                          <strong className="block text-sm text-cyan-100">{formatNumber(entry.parseRunCount)} runs</strong>
                          {formatNumber(entry.gameCount)} games
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No uploader-linked candidate runs recorded.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-100/65">
                Parser-version / pass coverage
              </div>
              <h2 className="mt-2 text-2xl font-semibold">Deterministic run matrix</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Aggregated from immutable candidate run rows; output is capped at {data.limits.coverageBuckets} contract buckets.
              </p>
            </div>
            <BarChart3 className="h-6 w-6 text-cyan-200/70" />
          </div>
          {data.coverage.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-[0.19em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-5">Parser</th>
                    <th className="pb-3 pr-5">Pass</th>
                    <th className="pb-3 pr-5">Schema</th>
                    <th className="pb-3 pr-5 text-right">Runs</th>
                    <th className="pb-3 pr-5 text-right">Completed</th>
                    <th className="pb-3 pr-5 text-right">Failed</th>
                    <th className="pb-3 text-right">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coverage.map((bucket) => (
                    <tr key={bucket.key} className="border-t border-white/[0.06] text-slate-300">
                      <td className="py-4 pr-5">
                        <div className="font-semibold text-white">{bucket.parserName}</div>
                        <div className="mt-1 text-xs text-slate-500">v{bucket.parserVersion}</div>
                      </td>
                      <td className="py-4 pr-5">
                        <div>{bucket.passName}</div>
                        <div className="mt-1 text-xs text-slate-500">v{bucket.passVersion}</div>
                      </td>
                      <td className="py-4 pr-5 font-mono text-xs text-slate-400">{bucket.schemaVersion}</td>
                      <td className="py-4 pr-5 text-right font-semibold text-white">{formatNumber(bucket.total)}</td>
                      <td className="py-4 pr-5 text-right text-emerald-200">{formatNumber(bucket.completed)}</td>
                      <td className="py-4 pr-5 text-right text-rose-200">{formatNumber(bucket.failed)}</td>
                      <td className="py-4 text-right text-amber-200">{formatNumber(bucket.skipped)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.coverageTruncated ? (
                <div className="mt-3 text-xs text-amber-200">
                  Coverage output reached the operator cap; narrow the underlying contracts before deeper inspection.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyLedger>
                Parser contract is registered. Candidate run coverage will populate with the first bounded pass.
              </EmptyLedger>
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-rose-100/65">
                  Failure signatures
                </div>
                <h2 className="mt-2 text-2xl font-semibold">Repeatable miss buckets</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Latest {formatNumber(data.failureSampleSize)} failed runs sampled from an indexed status/time window.
                </p>
              </div>
              <CircleAlert className="h-6 w-6 text-rose-200/70" />
            </div>
            <div className="mt-5 space-y-3">
              {data.failures.length ? (
                data.failures.map((failure) => (
                  <article key={failure.signature} className="rounded-2xl border border-rose-300/12 bg-rose-400/[0.035] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="break-all font-mono text-xs font-semibold text-rose-100">
                        {failure.signature}
                      </div>
                      <span className="rounded-full border border-rose-300/16 px-2.5 py-1 text-xs text-rose-100">
                        {formatNumber(failure.count)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {failure.parserName} {failure.parserVersion} · {failure.passName} {failure.passVersion}
                    </div>
                    {failure.latestDetail ? (
                      <div className="mt-2 text-xs leading-5 text-slate-300">{failure.latestDetail}</div>
                    ) : null}
                    <div className="mt-2 text-[11px] text-slate-500">latest {formatDate(failure.latestAt)}</div>
                  </article>
                ))
              ) : (
                <EmptyLedger>No failed candidate runs recorded in the sampled window.</EmptyLedger>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-100/65">
                  Recent bounded jobs
                </div>
                <h2 className="mt-2 text-2xl font-semibold">Reprocessing checkpoint rail</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  State and progress derive from each job&apos;s latest append-only checkpoint. Candidate action streams are not loaded here.
                </p>
              </div>
              <Gauge className="h-6 w-6 text-cyan-200/70" />
            </div>
            <div className="mt-5 space-y-4">
              {data.jobs.length ? (
                data.jobs.map((job) => (
                  <article key={job.id} className="rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Job #{job.id} · {humanize(job.scopeKind)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{job.scopeSummary}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${jobTone(job.state)}`}>
                        {humanize(job.state.status)}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300"
                        style={{ width: `${job.state.progressBps / 100}%` }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-5">
                      <div><strong className="block text-white">{formatNumber(job.state.processedCount)}</strong>processed</div>
                      <div><strong className="block text-emerald-200">{formatNumber(job.state.succeededCount)}</strong>succeeded</div>
                      <div><strong className="block text-rose-200">{formatNumber(job.state.failedCount)}</strong>failed</div>
                      <div><strong className="block text-amber-200">{formatNumber(job.state.skippedCount)}</strong>skipped</div>
                      <div><strong className="block text-white">{formatNumber(job.state.remainingArtifacts)}</strong>remaining cap</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>{job.parserName} {job.parserVersion}</span>
                      <span>{job.passName} {job.passVersion}</span>
                      <span>batch {formatNumber(job.batchSize)}</span>
                      <span>max {formatNumber(job.maxArtifacts)}</span>
                      <span>{job.dryRun ? "dry run" : "write candidates"}</span>
                      <span>requested by {job.requestedBy}</span>
                      <span>checkpoint {formatDate(job.latestEventAt)}</span>
                    </div>
                    {!job.state.invariantValid ? (
                      <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-100">
                        Latest checkpoint violates the job counter contract; inspect the append-only event ledger before resuming.
                      </div>
                    ) : null}
                    {job.affectsPublicAggregates || !job.candidateOnly ? (
                      <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-100">
                        Safety flag: this manifest does not match the candidate-only public-isolation contract.
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <EmptyLedger>No reprocessing jobs recorded. The rail is ready for the first bounded manifest.</EmptyLedger>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/[0.08] bg-slate-950/65 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-emerald-100/65">
                Recent per-game candidates
              </div>
              <h2 className="mt-2 text-2xl font-semibold">Game-linked pass history</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Latest {data.limits.recentGames} game rows with Engine Room runs; up to {data.limits.runsPerGame} immutable candidates per game.
              </p>
            </div>
            <Layers3 className="h-6 w-6 text-emerald-200/70" />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {data.recentGames.length ? (
              data.recentGames.map((game) => (
                <article key={game.id} className="rounded-[1.5rem] border border-white/[0.07] bg-white/[0.025] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/game-stats/${game.id}`} className="text-lg font-semibold text-white hover:text-cyan-100">
                        #{game.id} · {game.title}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {game.mapName ?? "Map field empty"} · {formatDate(game.playedOn)}
                      </div>
                    </div>
                    <Link
                      href={`/game-stats/${game.id}/review`}
                      className="rounded-full border border-fuchsia-300/20 bg-[linear-gradient(90deg,rgba(190,24,93,0.12),rgba(234,88,12,0.08))] px-3 py-1.5 text-xs font-semibold text-fuchsia-100 transition hover:border-fuchsia-200/35 hover:bg-fuchsia-400/[0.12]"
                    >
                      Result / Desync Desk
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-600">Parser verdict</span>
                      <strong className="mt-1 block text-slate-200">{game.rawWinner ?? "No parser verdict"}</strong>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-600">Review ledger</span>
                      <strong className="mt-1 block text-slate-200">{humanize(game.latestAdjudicationStatus ?? "no verdict row")}</strong>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-3">
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-600">Source</span>
                      <strong className="mt-1 block text-slate-200">{humanize(game.parseSource)}</strong>
                    </div>
                  </div>
                  {game.latestDesyncIncident?.desyncOccurred ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fuchsia-200/22 bg-[linear-gradient(90deg,rgba(190,24,93,0.13),rgba(234,88,12,0.08))] px-3 py-2.5">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100">
                          ⚡ Human · Desync Confirmed
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          Incident #{game.latestDesyncIncident.id} · competitive result unresolved
                        </div>
                      </div>
                      <span className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-amber-100/80">
                        {humanize(game.latestDesyncIncident.settlementDisposition)}
                      </span>
                    </div>
                  ) : game.latestDesyncIncident ? (
                    <div className="mt-3 rounded-xl border border-cyan-200/12 bg-cyan-300/[0.035] px-3 py-2 text-[10px] text-cyan-100/65">
                      Desync correction #{game.latestDesyncIncident.id} is the current human provenance entry.
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {game.runs.map((run) => (
                      <div key={run.id} className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white">
                            Run #{run.id} · {run.parserName} {run.parserVersion}
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] ${statusTone(run.status)}`}>
                            {humanize(run.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span>{run.passName} {run.passVersion}</span>
                          <span>schema {run.schemaVersion}</span>
                          <span>{formatNumber(run.observationCount)} observations</span>
                          <span>{formatNumber(run.actionCount)} actions cataloged</span>
                          <span>{formatDate(run.completedAt)}</span>
                        </div>
                        {run.failureSignature ? (
                          <div className="mt-2 break-all font-mono text-[11px] text-rose-200">{run.failureSignature}</div>
                        ) : null}
                        {run.affectsPublicAggregates || !run.candidateOnly ? (
                          <div className="mt-2 text-xs font-semibold text-rose-200">Public-isolation safety flag</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-600">
                    {game.uploader ? `uploader ${game.uploader} · ` : ""}{humanize(game.parseReason)}
                  </div>
                </article>
              ))
            ) : (
              <div className="xl:col-span-2">
                <EmptyLedger>Game-linked candidate history will populate as bounded parser passes complete.</EmptyLedger>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
