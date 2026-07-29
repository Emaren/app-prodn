"use client";

import Link from "next/link";
import {
  Archive,
  ClipboardCheck,
  FileSearch,
  LoaderCircle,
  PlayCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type {
  ReplayCandidateExecutionReport,
  ReplayCandidatePlan,
  ReplayCandidatePlanCohort,
  ReplayJobReceipts,
  ReplayOperationsInventory,
  ReplayReviewOperationsQueue,
} from "@/lib/replayOperationsContracts";
import {
  REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
  REPLAY_OPERATIONS_MAX_EXECUTION_GAMES,
} from "@/lib/replayOperationsContracts";

type BusyKey =
  | "inventory"
  | "plan"
  | "run"
  | "review"
  | "receipts";

const numberFormat = new Intl.NumberFormat("en-US");

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function toneForStatus(value: string) {
  if (["completed", "accepted", "paid"].includes(value)) {
    return "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100";
  }
  if (["failed", "funding_issue", "settlement_failed"].includes(value)) {
    return "border-rose-300/20 bg-rose-400/[0.08] text-rose-100";
  }
  if (["running", "leased", "batch_started"].includes(value)) {
    return "border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100";
  }
  return "border-amber-300/20 bg-amber-400/[0.08] text-amber-100";
}

async function loadJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    detail?: string;
  } & Partial<T>;
  if (!response.ok) {
    throw new Error(payload.detail || "Replay operation failed.");
  }
  return payload as T;
}

function PanelError({ children }: { children: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-100">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </div>
  );
}

function ActionButton({
  children,
  busy,
  onClick,
}: {
  children: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/[0.08] px-3.5 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/[0.13] disabled:cursor-wait disabled:opacity-55"
    >
      {busy ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {children}
    </button>
  );
}

export default function ReplayOperationsCommandCenter() {
  const [inventory, setInventory] =
    useState<ReplayOperationsInventory | null>(null);
  const [plan, setPlan] =
    useState<ReplayCandidatePlan | null>(null);
  const [execution, setExecution] =
    useState<ReplayCandidateExecutionReport | null>(null);
  const [review, setReview] =
    useState<ReplayReviewOperationsQueue | null>(null);
  const [receipts, setReceipts] =
    useState<ReplayJobReceipts | null>(null);
  const [cohort, setCohort] =
    useState<ReplayCandidatePlanCohort>("missing_current_pass");
  const [planLimit, setPlanLimit] = useState(25);
  const [candidateConfirmation, setCandidateConfirmation] =
    useState("");
  const [financialOnly, setFinancialOnly] = useState(true);
  const [busy, setBusy] = useState<Record<BusyKey, boolean>>({
    inventory: false,
    plan: false,
    run: false,
    review: false,
    receipts: false,
  });
  const [errors, setErrors] = useState<
    Partial<Record<BusyKey, string>>
  >({});

  function start(key: BusyKey) {
    setBusy((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function finish(key: BusyKey) {
    setBusy((current) => ({ ...current, [key]: false }));
  }

  async function refreshInventory() {
    start("inventory");
    try {
      setInventory(
        await loadJson<ReplayOperationsInventory>(
          "/api/admin/replay-operations/inventory"
        )
      );
    } catch (error) {
      setErrors((current) => ({
        ...current,
        inventory:
          error instanceof Error
            ? error.message
            : "Inventory unavailable.",
      }));
    } finally {
      finish("inventory");
    }
  }

  async function refreshReview(
    nextFinancialOnly = financialOnly
  ) {
    start("review");
    try {
      const query = new URLSearchParams({
        limit: "20",
        financialOnly: nextFinancialOnly ? "1" : "0",
      });
      setReview(
        await loadJson<ReplayReviewOperationsQueue>(
          `/api/admin/replay-operations/review-queue?${query}`
        )
      );
    } catch (error) {
      setErrors((current) => ({
        ...current,
        review:
          error instanceof Error
            ? error.message
            : "Review exposure unavailable.",
      }));
    } finally {
      finish("review");
    }
  }

  async function refreshReceipts() {
    start("receipts");
    try {
      setReceipts(
        await loadJson<ReplayJobReceipts>(
          "/api/admin/replay-operations/job-receipts?limit=12"
        )
      );
    } catch (error) {
      setErrors((current) => ({
        ...current,
        receipts:
          error instanceof Error
            ? error.message
            : "Job receipts unavailable.",
      }));
    } finally {
      finish("receipts");
    }
  }

  async function buildCandidatePlan() {
    start("plan");
    try {
      const nextPlan =
        await loadJson<ReplayCandidatePlan>(
          "/api/admin/replay-operations/candidate-plan",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dryRun: true,
              cohort,
              limit: planLimit,
            }),
          }
        );
      setPlan(nextPlan);
      setCandidateConfirmation("");
      setExecution(null);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        plan:
          error instanceof Error
            ? error.message
            : "Candidate plan unavailable.",
      }));
    } finally {
      finish("plan");
    }
  }

  async function runCandidatePlan() {
    const gameStatsIds = [
      ...new Set(
        (plan?.artifacts ?? [])
          .map((artifact) => artifact.linkedGameStatsId)
          .filter((value): value is number => typeof value === "number")
      ),
    ].slice(0, REPLAY_OPERATIONS_MAX_EXECUTION_GAMES);
    if (gameStatsIds.length === 0) {
      setErrors((current) => ({
        ...current,
        run: "The preview has no game-linked archive objects to run.",
      }));
      return;
    }

    start("run");
    try {
      const report = await loadJson<ReplayCandidateExecutionReport>(
        "/api/admin/replay-operations/run-candidates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameStatsIds,
            cohort: plan?.cohort,
            limit: plan?.limit,
            expectedPlanFingerprint:
              plan?.planFingerprint,
            candidateOnly: true,
            confirmation:
              candidateConfirmation,
          }),
        }
      );
      setExecution(report);
      await Promise.all([
        refreshInventory(),
        refreshReview(),
        refreshReceipts(),
      ]);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        run:
          error instanceof Error
            ? error.message
            : "Candidate execution unavailable.",
      }));
    } finally {
      finish("run");
    }
  }

  useEffect(() => {
    void refreshInventory();
    void refreshReview();
    void refreshReceipts();
    // The initial snapshot intentionally uses the safe defaults only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-cyan-200/[0.12] bg-[radial-gradient(circle_at_4%_0%,rgba(34,211,238,0.11),transparent_31%),linear-gradient(145deg,rgba(9,18,35,0.98),rgba(2,6,23,0.97))] shadow-[0_28px_90px_rgba(2,6,23,0.34)]">
      <div className="border-b border-white/[0.07] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-100/70">
              <ShieldCheck className="h-4 w-4" />
              Replay Operations Command Center
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
              Inspect, plan, run candidates, then review.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              These controls read indexed receipts, build bounded dry-run plans, and can run
              one private parser candidate from canonical archive bytes. Candidate
              runs never publish a winner, change public statistics, settle a wager, or submit
              a chain transaction.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-[0.15em] sm:grid-cols-4">
            {[
              "No public writes",
              "No verdict writes",
              "No money writes",
              "No chain calls",
            ].map((label) => (
              <span
                key={label}
                className="rounded-full border border-emerald-300/16 bg-emerald-400/[0.06] px-3 py-2 text-center text-emerald-100"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-white/[0.06] xl:grid-cols-2">
        <article className="bg-slate-950/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-100/65">
                <Archive className="h-4 w-4" />
                Step 1 · Read-only
              </div>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Database inventory
              </h3>
            </div>
            <ActionButton
              busy={busy.inventory}
              onClick={() => void refreshInventory()}
            >
              Refresh
            </ActionButton>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Indexed catalog counts only. The mounted archive is deliberately not scanned
            from this web request.
          </p>

          {inventory ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Final rows", inventory.gameVault.finalRows],
                  ["Artifacts", inventory.artifactCatalog.artifacts],
                  [
                    "No current pass",
                    inventory.artifactCatalog.artifactsWithoutCurrentPass,
                  ],
                  [
                    "Review markets",
                    inventory.financialReview.underReviewMarkets,
                  ],
                  [
                    "Stats accepted",
                    inventory.normalizedStats.acceptedGames,
                  ],
                  [
                    "Exact metrics",
                    inventory.normalizedStats.exactPlayerMetrics +
                      inventory.normalizedStats.exactGameMetrics,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <div className="text-xl font-semibold text-white">
                      {formatNumber(Number(value))}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-emerald-300/12 bg-emerald-400/[0.045] px-3 py-3 text-xs leading-5 text-emerald-50/80">
                Normalized coverage{" "}
                <strong className="text-emerald-100">
                  {(inventory.normalizedStats.finalCoverageBps / 100).toFixed(1)}%
                </strong>{" "}
                of final rows ·{" "}
                {formatNumber(inventory.normalizedStats.candidateProjections)} private
                candidate projection
                {inventory.normalizedStats.candidateProjections === 1 ? "" : "s"}.
              </div>
              <div className="mt-3 rounded-xl border border-amber-300/12 bg-amber-400/[0.045] px-3 py-3 text-xs leading-5 text-amber-50/80">
                <strong className="text-amber-100">
                  {formatNumber(inventory.financialReview.activeStakeWolo)} WOLO
                </strong>{" "}
                active across{" "}
                {formatNumber(inventory.financialReview.activeWagers)} under-review
                wagers. Inventory does not authorize settlement.
              </div>
              <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-500">
                  Full corpus handoff
                </div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap text-[11px] text-cyan-100/75">
                  {inventory.nextStep.command}
                </code>
              </div>
            </>
          ) : (
            <div className="mt-5 text-sm text-slate-500">
              {busy.inventory ? "Reading indexed receipts…" : "Inventory not loaded."}
            </div>
          )}
          {errors.inventory ? <PanelError>{errors.inventory}</PanelError> : null}
        </article>

        <article className="bg-slate-950/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/65">
                <PlayCircle className="h-4 w-4" />
                Step 2 · Dry-run
              </div>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Candidate batch plan
              </h3>
            </div>
            <button
              type="button"
              disabled={busy.plan}
              onClick={() => void buildCandidatePlan()}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/[0.08] px-3.5 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-400/[0.13] disabled:cursor-wait disabled:opacity-55"
            >
              {busy.plan ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ClipboardCheck className="h-3.5 w-3.5" />
              )}
              Build plan
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Selects a bounded cohort from the immutable artifact catalog. It does not
            create a job receipt or invoke Python.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_7rem]">
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Cohort
              <select
                value={cohort}
                onChange={(event) => {
                  setCohort(event.target.value as ReplayCandidatePlanCohort);
                  setPlan(null);
                  setCandidateConfirmation("");
                  setExecution(null);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-white/[0.09] bg-slate-950 px-3 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-300/35"
              >
                <option value="missing_current_pass">
                  Missing current pass
                </option>
                <option value="failed_current_pass">
                  Failed current pass, no success
                </option>
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Limit
              <input
                type="number"
                min={1}
                max={100}
                value={planLimit}
                onChange={(event) => {
                  setPlanLimit(
                    Math.max(
                      1,
                      Math.min(100, Number(event.target.value) || 1)
                    )
                  );
                  setPlan(null);
                  setCandidateConfirmation("");
                  setExecution(null);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-white/[0.09] bg-slate-950 px-3 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-300/35"
              />
            </label>
          </div>
          {plan ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/13 bg-cyan-400/[0.045] px-3 py-3 text-xs">
                <span className="text-slate-300">
                  {formatNumber(plan.matchedArtifacts)} match ·{" "}
                  {formatNumber(plan.returnedArtifacts)} previewed
                </span>
                <span className="rounded-full border border-emerald-300/16 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-100">
                  writes false
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {plan.artifacts.slice(0, 5).map((artifact) => (
                  <div
                    key={artifact.artifactId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]"
                  >
                    <span className="font-mono text-cyan-100/75">
                      #{artifact.artifactId} · {artifact.hashPrefix}
                    </span>
                    <span className="text-slate-500">
                      {artifact.extension ?? "unknown"} ·{" "}
                      {formatBytes(artifact.byteSize)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] leading-5 text-slate-500">
                Worker boundary: {plan.executionBoundary.label}. Each button run creates a
                frozen one-replay manifest on the API host and remains candidate-only.
              </div>
              {plan.artifacts.some(
                (artifact) => artifact.linkedGameStatsId !== null
              ) ? (
                <>
                  <label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Confirm exact reviewed plan
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={candidateConfirmation}
                      onChange={(event) =>
                        setCandidateConfirmation(event.target.value)
                      }
                      placeholder={REPLAY_OPERATIONS_EXECUTION_CONFIRMATION}
                      className="mt-2 h-10 w-full rounded-xl border border-white/[0.09] bg-slate-950 px-3 font-mono text-xs normal-case tracking-normal text-white outline-none placeholder:text-slate-700 focus:border-emerald-300/35"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy.run ||
                      candidateConfirmation !==
                        REPLAY_OPERATIONS_EXECUTION_CONFIRMATION
                    }
                    onClick={() => void runCandidatePlan()}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.09] px-4 py-2.5 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {busy.run ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5" />
                    )}
                    Run {REPLAY_OPERATIONS_MAX_EXECUTION_GAMES} linked candidate
                  </button>
                </>
              ) : null}
              {execution ? (
                <div className="mt-3 rounded-xl border border-emerald-300/14 bg-emerald-400/[0.05] px-3 py-3 text-xs leading-5 text-emerald-50/85">
                  <div>
                    Candidate receipt: {execution.succeededCount} succeeded ·{" "}
                    {execution.failedCount} failed. Public stats, results, bets, and
                    chain authority remained off.
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {execution.results.map((result) => (
                      <div
                        key={result.gameStatsId}
                        className={`rounded-lg border px-2.5 py-2 ${
                          result.ok
                            ? "border-emerald-300/12 bg-emerald-400/[0.035]"
                            : "border-rose-300/18 bg-rose-400/[0.06] text-rose-100"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono">
                            game #{result.gameStatsId}
                            {result.runId ? ` · run #${result.runId}` : ""}
                          </span>
                          <span className="font-semibold uppercase tracking-[0.12em]">
                            {result.ok
                              ? "completed"
                              : result.runStatus || "failed"}
                          </span>
                        </div>
                        {result.detail ? (
                          <div className="mt-1 break-words text-[10px] leading-4 opacity-85">
                            {result.detail}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {errors.plan ? <PanelError>{errors.plan}</PanelError> : null}
          {errors.run ? <PanelError>{errors.run}</PanelError> : null}
        </article>

        <article className="bg-slate-950/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100/65">
                <FileSearch className="h-4 w-4" />
                Step 3 · Review only
              </div>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Verdict and exposure queue
              </h3>
            </div>
            <ActionButton
              busy={busy.review}
              onClick={() => void refreshReview()}
            >
              Refresh
            </ActionButton>
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={financialOnly}
              disabled={busy.review}
              onChange={(event) => {
                const nextFinancialOnly =
                  event.target.checked;
                setFinancialOnly(
                  nextFinancialOnly
                );
                setReview(null);
                void refreshReview(
                  nextFinancialOnly
                );
              }}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-cyan-400"
            />
            Show finance-linked cases only
          </label>
          {review ? (
            <>
              {review.summary.scanTruncated ? (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/18 bg-amber-400/[0.07] px-3 py-3 text-xs leading-5 text-amber-50/85">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Partial review totals: the newest{" "}
                    {formatNumber(
                      review.summary
                        .queueRowsScanned
                    )}{" "}
                    matching source rows were scanned, and older unresolved or finance-linked cases may still exist.
                  </span>
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ["Needs verdict", review.summary.unresolvedWithoutVerdict],
                  ["Financial cases", review.summary.financialCases],
                  ["WOLO exposed", review.summary.financialExposureWolo],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <div className="text-lg font-semibold text-white">
                      {formatNumber(Number(value))}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.13em] text-slate-500">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {review.entries.slice(0, 5).map((entry) => (
                  <Link
                    key={entry.gameStatsId}
                    href={entry.reviewHref}
                    className="block rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 transition hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-white">
                          #{entry.gameStatsId} · {entry.title}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {entry.unresolvedLabel} · {entry.mapName}
                        </div>
                      </div>
                      {entry.market ? (
                        <div className="shrink-0 text-right text-[10px] text-amber-100">
                          {formatNumber(entry.market.totalStakedWolo)} WOLO
                          <div className="mt-1 text-slate-500">
                            {entry.market.moneyLabel}
                          </div>
                        </div>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-600">
                          no market
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>
                  Opening a case does not settle it. Review and financial actions remain
                  separate.
                </span>
                <Link
                  href="/admin/replay-review"
                  className="shrink-0 font-semibold text-cyan-100 hover:text-white"
                >
                  Full queue →
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-5 text-sm text-slate-500">
              {busy.review ? "Calculating review exposure…" : "Queue not loaded."}
            </div>
          )}
          {errors.review ? <PanelError>{errors.review}</PanelError> : null}
        </article>

        <article className="bg-slate-950/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-100/65">
                <ReceiptText className="h-4 w-4" />
                Step 4 · Receipt ledger
              </div>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Recent bounded jobs
              </h3>
            </div>
            <ActionButton
              busy={busy.receipts}
              onClick={() => void refreshReceipts()}
            >
              Refresh
            </ActionButton>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Reads immutable job identities and latest checkpoints. Refreshing cannot
            pause, resume, retry, or cancel a worker.
          </p>
          {receipts ? (
            <div className="mt-4 space-y-2">
              {receipts.receipts.length ? (
                receipts.receipts.slice(0, 6).map((receipt) => (
                  <div
                    key={receipt.jobId}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-[11px] font-semibold text-white">
                          job #{receipt.jobId} · {receipt.identityPrefix}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          <TimeDisplayText
                            value={receipt.latestEventAt ?? receipt.createdAt}
                            includeYear
                            emptyValue="No event yet"
                          />{" · "}
                          {receipt.requestedBy}
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${toneForStatus(
                          receipt.status
                        )}`}
                      >
                        {humanize(receipt.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                      <span>{formatNumber(receipt.processedCount)} processed</span>
                      <span>{formatNumber(receipt.succeededCount)} succeeded</span>
                      <span>{formatNumber(receipt.failedCount)} failed</span>
                      <span>{formatNumber(receipt.remainingArtifacts)} remaining</span>
                    </div>
                    {!receipt.invariantValid ? (
                      <div className="mt-2 text-[10px] font-semibold text-rose-200">
                        Receipt counter invariant needs inspection.
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
                  No bounded replay job receipts recorded.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 text-sm text-slate-500">
              {busy.receipts ? "Reading job receipts…" : "Receipts not loaded."}
            </div>
          )}
          {errors.receipts ? <PanelError>{errors.receipts}</PanelError> : null}
        </article>
      </div>
    </section>
  );
}
