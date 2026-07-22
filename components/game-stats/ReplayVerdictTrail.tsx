/* eslint-disable @next/next/no-img-element */
"use client";

import {
  UserRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TeamAssignment = {
  teamKey: string;
  players: Array<{
    stablePlayerKey: string;
    name: string;
  }>;
};

type HumanAdjudication = {
  id: number;
  decisionStatus: string;
  actorDisplayNameSnapshot: string;
  actorRole: string;
  teamAssignments: TeamAssignment[];
  winningTeamKey: string;
  reason: string;
  createdAt: string;
};

type Category = {
  key:
    | "team"
    | "winner"
    | "score"
    | "military"
    | "economy"
    | "technology"
    | "society"
    | "timeline";
  label: string;
  confidencePct: number | null;
  signals: number;
  state: string;
};

type ParserRun = {
  id: number;
  runIdentityHash: string;
  parserName: string;
  parserVersion: string;
  parserBuild: string | null;
  passName: string;
  passVersion: string;
  schemaVersion: string;
  status: string;
  failureSignature: string | null;
  observationCount: number;
  candidateOnly: boolean;
  affectsPublicAggregates: boolean;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  categories: Category[];
  benchmark: {
    humanVerdictId: number | null;
    winnerAgreement:
      | "match"
      | "conflict"
      | "not_comparable";
  };
};

type Trail = {
  baseline: {
    label: string;
    parseIteration: number;
    parseSource: string;
    parseReason: string;
    winner: string | null;
    rosterCount: number;
    capturedAt: string;
    categories: Category[];
  };
  runs: ParserRun[];
};

type EvidenceItem = {
  linkId: number;
  artifactId: number;
  sha256: string;
  mediaType: string;
  byteSize: number;
  originalFilename: string;
  createdAt: string;
};

type RunResponse = {
  outcome:
    | "created"
    | "already_latest";
  run: {
    id: number;
    parserName: string;
    parserVersion: string;
    parserBuild?: string | null;
    passName: string;
    passVersion: string;
    schemaVersion?: string;
    status: string;
    observationCount?: number;
    createdAt?: string;
  };
};

const MAX_SCREENSHOTS = 6;

const MAX_FILE_BYTES =
  8 * 1024 * 1024;

const MAX_TOTAL_BYTES =
  30 * 1024 * 1024;

const ACCEPTED_IMAGES =
  new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);

function messageFromPayload(
  payload: unknown,
  fallback: string
) {
  if (
    payload &&
    typeof payload ===
      "object" &&
    !Array.isArray(payload)
  ) {
    const detail = (
      payload as {
        detail?: unknown;
      }
    ).detail;

    if (
      typeof detail ===
        "string" &&
      detail.trim()
    ) {
      return detail;
    }
  }

  return fallback;
}

type EvidenceAnalysisPhase =
  | "storing"
  | "reading"
  | "finalizing";

function formatAnalysisElapsed(
  seconds: number
) {
  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainder =
    seconds % 60;

  return `${String(
    minutes
  ).padStart(
    2,
    "0"
  )}:${String(
    remainder
  ).padStart(
    2,
    "0"
  )}`;
}

function humanizeEvidenceError(
  payload: unknown,
  fallback: string
) {
  let code = "";

  let detail =
    messageFromPayload(
      payload,
      fallback
    ).trim();

  if (
    payload &&
    typeof payload ===
      "object" &&
    !Array.isArray(
      payload
    )
  ) {
    const rawCode =
      (
        payload as {
          code?: unknown;
        }
      ).code;

    if (
      typeof rawCode ===
        "string"
    ) {
      code =
        rawCode;
    }
  }

  /*
   * Some downstream parser failures arrive as a JSON string
   * inside the API detail string. Unwrap those instead of
   * ever showing raw JSON to the operator.
   */
  for (
    let depth = 0;
    depth < 4;
    depth += 1
  ) {
    if (
      !detail.startsWith(
        "{"
      )
    ) {
      break;
    }

    try {
      const parsed =
        JSON.parse(
          detail
        ) as {
          detail?: unknown;
          error?: unknown;
          message?: unknown;
          code?: unknown;
        };

      if (
        typeof parsed.code ===
          "string"
      ) {
        code =
          parsed.code;
      }

      const nested =
        [
          parsed.detail,
          parsed.error,
          parsed.message,
        ].find(
          (value) =>
            typeof value ===
              "string" &&
            value.trim()
        );

      if (
        typeof nested !==
          "string"
      ) {
        break;
      }

      detail =
        nested.trim();
    } catch {
      break;
    }
  }

  const signal =
    `${code} ${detail}`
      .toLowerCase();

  if (
    signal.includes(
      "mounted replay volume"
    ) ||
    signal.includes(
      "minimum free"
    ) ||
    signal.includes(
      "free bytes"
    ) ||
    signal.includes(
      "disk reserve"
    ) ||
    signal.includes(
      "no space left"
    ) ||
    signal.includes(
      "enospc"
    )
  ) {
    return (
      "Analysis paused safely. " +
      "The Evidence Lab needs more server workspace before this pass can begin. " +
      "Your screenshots remain safe, and no existing battle result was changed."
    );
  }

  if (
    signal.includes(
      "too large"
    ) ||
    signal.includes(
      "file_too_large"
    )
  ) {
    return (
      detail ||
      "Screenshot too large. Images can be up to 8 MB each."
    );
  }

  if (
    signal.includes(
      "batch too large"
    ) ||
    signal.includes(
      "total bytes"
    ) ||
    signal.includes(
      "batch_too_large"
    )
  ) {
    return (
      "Screenshot set too large. " +
      "Keep each upload under 30 MB total."
    );
  }

  if (
    signal.includes(
      "timeout"
    ) ||
    signal.includes(
      "timed out"
    )
  ) {
    return (
      "The evidence reader took longer than expected. " +
      "Your screenshots remain saved. Try the analysis again."
    );
  }

  if (
    signal.includes(
      "openai"
    ) ||
    signal.includes(
      "vision request"
    ) ||
    signal.includes(
      "vision response"
    ) ||
    signal.includes(
      "ai response"
    )
  ) {
    return (
      "The AI evidence reader could not finish this pass. " +
      "Your screenshots remain saved and the existing Verdict Trail was not changed."
    );
  }

  if (
    detail.startsWith(
      "{"
    )
  ) {
    return fallback;
  }

  return (
    detail ||
    fallback
  );
}

function EvidenceAnalysisStatus({
  phase,
  imageCount,
}: {
  phase:
    EvidenceAnalysisPhase;
  imageCount:
    number;
}) {
  const [
    elapsedSeconds,
    setElapsedSeconds,
  ] =
    useState(0);

  useEffect(() => {
    const startedAt =
      Date.now();

    const update = () => {
      setElapsedSeconds(
        Math.floor(
          (
            Date.now() -
            startedAt
          ) /
            1000
        )
      );
    };

    update();

    const interval =
      window.setInterval(
        update,
        250
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, []);

  const phaseIndex =
    phase === "storing"
      ? 0
      : phase ===
          "reading"
        ? 1
        : 2;

  const headline =
    phase === "storing"
      ? "Securing Evidence"
      : phase ===
          "reading"
        ? "Reading Battle Screens"
        : "Finalizing Assessment";

  const description =
    phase === "storing"
      ? "Saving the screenshots privately before analysis begins."
      : phase ===
          "reading"
        ? `AI is examining ${imageCount} postgame screenshot${imageCount === 1 ? "" : "s"} and building an independent battle assessment.`
        : "The completed evidence pass is being added to the immutable Verdict Trail.";

  const steps = [
    "Secure Evidence",
    "Read Battle Screens",
    "Build Assessment",
  ];

  return (
    <div
      aria-live="polite"
      className="mt-4 overflow-hidden rounded-2xl border border-cyan-200/20 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.10),transparent_45%),linear-gradient(145deg,rgba(8,47,73,0.18),rgba(2,6,23,0.76))] shadow-[0_18px_55px_rgba(0,0,0,0.28)]"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />

      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-100/65">
            Analyzing Battle Evidence
          </div>

          <div className="font-mono text-[12px] tabular-nums tracking-[0.14em] text-cyan-50/90">
            {formatAnalysisElapsed(
              elapsedSeconds
            )}
          </div>
        </div>

        <div className="mt-3 text-sm font-semibold text-slate-100">
          {headline}
        </div>

        <p className="mt-1 max-w-xl text-[10px] leading-5 text-slate-400">
          {description}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {steps.map(
            (
              step,
              index
            ) => {
              const active =
                index ===
                phaseIndex;

              const complete =
                index <
                phaseIndex;

              return (
                <div
                  key={
                    step
                  }
                  className={`rounded-xl border px-2 py-2 text-center text-[8px] uppercase tracking-[0.10em] transition ${
                    active
                      ? "border-cyan-200/25 bg-cyan-300/[0.08] text-cyan-50"
                      : complete
                        ? "border-emerald-200/15 bg-emerald-300/[0.04] text-emerald-100/60"
                        : "border-white/[0.06] bg-white/[0.015] text-slate-600"
                  }`}
                >
                  {complete
                    ? "✓ "
                    : ""}
                  {step}
                </div>
              );
            }
          )}
        </div>

        <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
        </div>

        <div className="mt-2 text-[8px] leading-4 text-slate-600">
          Keep this panel open while the evidence pass completes.
        </div>
      </div>
    </div>
  );
}

function formatDate(
  value: string
) {
  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? value
    : parsed.toLocaleString();
}

function formatBytes(
  bytes: number
) {
  if (
    bytes >=
    1024 * 1024
  ) {
    return `${(
      bytes /
      1024 /
      1024
    ).toFixed(1)} MB`;
  }

  return `${Math.max(
    1,
    Math.round(
      bytes / 1024
    )
  )} KB`;
}

function confidenceLabel(
  category: Category
) {
  if (
    typeof
      category.confidencePct ===
    "number"
  ) {
    const value =
      Number.isInteger(
        category.confidencePct
      )
        ? category.confidencePct.toFixed(
            0
          )
        : category.confidencePct.toFixed(
            1
          );

    return `${value}%`;
  }

  if (
    category.signals > 0
  ) {
    return `${category.signals} ${
      category.signals === 1
        ? "signal"
        : "signals"
    }`;
  }

  return (
    category.state ||
    "—"
  );
}

function CategoryMatrix({
  categories,
  compact = false,
}: {
  categories: Category[];
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "mt-3 grid grid-cols-2 gap-1.5"
          : "mt-4 grid grid-cols-2 gap-2"
      }
    >
      {categories.map(
        (category) => {
          const pct =
            typeof
              category.confidencePct ===
            "number"
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    category.confidencePct
                  )
                )
              : null;

          return (
            <div
              key={
                category.key
              }
              className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[8px] uppercase tracking-[0.16em] text-slate-500">
                  {
                    category.label
                  }
                </div>

                <div className="shrink-0 text-[9px] font-semibold text-slate-300">
                  {confidenceLabel(
                    category
                  )}
                </div>
              </div>

              {pct !== null ? (
                <div className="mt-2 h-px overflow-hidden bg-white/[0.06]">
                  <div
                    className="h-full bg-cyan-200/60"
                    style={{
                      width:
                        `${pct}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        }
      )}
    </div>
  );
}

function humanWinnerLabel(
  entry: HumanAdjudication
) {
  const winningTeam =
    entry.teamAssignments.find(
      (team) =>
        team.teamKey ===
        entry.winningTeamKey
    );

  if (!winningTeam) {
    return "Winner locked";
  }

  const names =
    winningTeam.players
      .map(
        (player) =>
          player.name
      )
      .filter(Boolean);

  return names.length > 0
    ? `${names.join(
        " · "
      )} victorious`
    : "Winner locked";
}

function parserRunTitle(
  run: ParserRun
) {
  return run.parserName ===
    "aoe2war.screenshot_vision"
    ? `Evidence Pass #${run.id}`
    : `Replay Parser · Pass ${run.passVersion}`;
}

function benchmarkLabel(
  run: ParserRun
) {
  if (
    run.benchmark
      .winnerAgreement ===
    "match"
  ) {
    return `Agrees with human verdict #${run.benchmark.humanVerdictId}`;
  }

  if (
    run.benchmark
      .winnerAgreement ===
    "conflict"
  ) {
    return `Conflicts with human verdict #${run.benchmark.humanVerdictId}`;
  }

  if (
    run.parserName ===
    "aoe2war.screenshot_vision"
  ) {
    return "Screenshot evidence · replay-only confidence remains independent";
  }

  return run.benchmark
    .humanVerdictId
    ? `Human verdict #${run.benchmark.humanVerdictId} available as ground truth`
    : "No human ground truth filed";
}

export default function ReplayVerdictTrail({
  gameStatsId,
  isAdmin,
  adjudications,
}: {
  gameStatsId: number;
  isAdmin: boolean;
  adjudications: HumanAdjudication[];
}) {
  const detailsRef =
    useRef<HTMLDetailsElement>(
      null
    );

  const inputRef =
    useRef<HTMLInputElement>(
      null
    );

  const [
    trail,
    setTrail,
  ] =
    useState<Trail | null>(
      null
    );

  const [
    evidence,
    setEvidence,
  ] =
    useState<EvidenceItem[]>(
      []
    );

  const [
    stagedFiles,
    setStagedFiles,
  ] =
    useState<File[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    running,
    setRunning,
  ] =
    useState(false);

  const [
    analyzing,
    setAnalyzing,
  ] =
    useState(false);

  const [
    analysisPhase,
    setAnalysisPhase,
  ] =
    useState<EvidenceAnalysisPhase>(
      "storing"
    );

  const [
    dragging,
    setDragging,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    notice,
    setNotice,
  ] =
    useState<string | null>(
      null
    );

  const loadTrail =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/replay-results/${gameStatsId}/parser-trail`,
            {
              cache:
                "no-store",
            }
          );

        const payload =
          (await response
            .json()
            .catch(
              () => null
            )) as
            | Trail
            | {
                detail?: string;
              }
            | null;

        if (!response.ok) {
          throw new Error(
            messageFromPayload(
              payload,
              "Parser history could not be loaded."
            )
          );
        }

        setTrail(
          payload as Trail
        );
      },
      [gameStatsId]
    );

  const loadEvidence =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/replay-results/${gameStatsId}/evidence`,
            {
              cache:
                "no-store",
            }
          );

        const payload =
          (await response
            .json()
            .catch(
              () => null
            )) as
            | {
                evidence?: EvidenceItem[];
                detail?: string;
              }
            | null;

        if (!response.ok) {
          throw new Error(
            messageFromPayload(
              payload,
              "Screenshot evidence could not be loaded."
            )
          );
        }

        setEvidence(
          payload?.evidence ||
            []
        );
      },
      [gameStatsId]
    );

  const reload =
    useCallback(
      async () => {
        setError(null);

        try {
          await Promise.all([
            loadTrail(),
            loadEvidence(),
          ]);
        } catch (
          nextError
        ) {
          setError(
            nextError instanceof
              Error
              ? nextError.message
              : "Verdict Trail could not be loaded."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        loadEvidence,
        loadTrail,
      ]
    );

  useEffect(() => {
    void reload();
  }, [reload]);

  const stagedPreviews =
    useMemo(
      () =>
        stagedFiles.map(
          (file) => ({
            file,
            url:
              URL.createObjectURL(
                file
              ),
          })
        ),
      [stagedFiles]
    );

  useEffect(
    () => () => {
      stagedPreviews.forEach(
        (preview) =>
          URL.revokeObjectURL(
            preview.url
          )
      );
    },
    [stagedPreviews]
  );

  const events =
    useMemo(() => {
      const parserEvents =
        trail?.runs.map(
          (run) => ({
            kind:
              "parser" as const,
            createdAt:
              run.createdAt,
            run,
          })
        ) ?? [];

      const humanEvents =
        adjudications.map(
          (entry) => ({
            kind:
              "human" as const,
            createdAt:
              entry.createdAt,
            entry,
          })
        );

      return [
        ...parserEvents,
        ...humanEvents,
      ].sort(
        (
          left,
          right
        ) =>
          new Date(
            left.createdAt
          ).getTime() -
          new Date(
            right.createdAt
          ).getTime()
      );
    }, [
      adjudications,
      trail,
    ]);

  const latestEvent =
    events.length > 0
      ? events[
          events.length - 1
        ]
      : null;

  const latestLabel =
    latestEvent?.kind ===
    "parser"
      ? parserRunTitle(
          latestEvent.run
        )
      : latestEvent?.kind ===
          "human"
        ? `Human Verdict #${latestEvent.entry.id}`
        : "Original Parser State";

  const latestCategories =
    latestEvent?.kind ===
    "parser"
      ? latestEvent.run
          .categories
      : trail?.baseline
          .categories ?? [];

  const latestSignalCount =
    latestCategories.filter(
      (category) =>
        category.signals >
        0
    ).length;

  function stage(
    incoming:
      | FileList
      | File[]
  ) {
    const files =
      Array.from(
        incoming
      ).filter((file) =>
        ACCEPTED_IMAGES.has(
          file.type
        )
      );

    if (
      files.length === 0
    ) {
      setError(
        "Unsupported image type. Drop PNG, JPEG, or WebP postgame screenshots."
      );
      return;
    }

    const existingKeys =
      new Set(
        stagedFiles.map(
          (file) =>
            `${file.name}:${file.size}:${file.lastModified}`
        )
      );

    const next =
      files.filter(
        (file) =>
          !existingKeys.has(
            `${file.name}:${file.size}:${file.lastModified}`
          )
      );

    if (
      next.length ===
      0
    ) {
      setNotice(
        "Those screenshots are already staged."
      );
      setError(null);
      return;
    }

    const available =
      MAX_SCREENSHOTS -
      evidence.length -
      stagedFiles.length;

    if (
      next.length >
      available
    ) {
      setError(
        `Only ${available} screenshot ${
          available === 1
            ? "slot is"
            : "slots are"
        } available. Maximum 6 per battle.`
      );
      return;
    }

    const oversized =
      next.find(
        (file) =>
          file.size >
          MAX_FILE_BYTES
      );

    if (oversized) {
      setError(
        `Screenshot too large. ${oversized.name} is ${formatBytes(oversized.size)}. Images can be up to 8 MB each.`
      );
      return;
    }

    const stagedBytes =
      stagedFiles.reduce(
        (
          total,
          file
        ) =>
          total +
          file.size,
        0
      );

    const incomingBytes =
      next.reduce(
        (
          total,
          file
        ) =>
          total +
          file.size,
        0
      );

    if (
      stagedBytes +
        incomingBytes >
      MAX_TOTAL_BYTES
    ) {
      setError(
        `Screenshot set too large. This upload would be ${formatBytes(stagedBytes + incomingBytes)}. Keep each upload under 30 MB total.`
      );
      return;
    }

    setStagedFiles(
      (current) => [
        ...current,
        ...next,
      ]
    );

    setError(null);
    setNotice(null);

    if (
      detailsRef.current
    ) {
      detailsRef.current.open =
        true;
    }
  }

  function removeStaged(
    index: number
  ) {
    setStagedFiles(
      (current) =>
        current.filter(
          (
            _,
            fileIndex
          ) =>
            fileIndex !==
            index
        )
    );
  }

  async function runLatestParser() {
    if (running) {
      return;
    }

    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const response =
        await fetch(
          `/api/replay-results/${gameStatsId}/reparse`,
          {
            method:
              "POST",
          }
        );

      const payload =
        (await response
          .json()
          .catch(
            () => null
          )) as
          | RunResponse
          | {
              detail?: string;
            }
          | null;

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            payload,
            "The replay parser could not run."
          )
        );
      }

      const result =
        payload as RunResponse;

      setNotice(
        result.outcome ===
          "already_latest"
          ? "This replay already has the latest replay-only parser pass. No duplicate was created."
          : `Replay parser pass ${result.run.passVersion} was added to the immutable trail.`
      );

      await loadTrail();
    } catch (
      nextError
    ) {
      setError(
        nextError instanceof
          Error
          ? nextError.message
          : "The replay parser could not run."
      );
    } finally {
      setRunning(false);
    }
  }

  async function analyzeEvidence() {
    if (!isAdmin) {
      return;
    }

    if (analyzing) {
      return;
    }

    setAnalyzing(true);

    setAnalysisPhase(
      stagedFiles.length >
        0
        ? "storing"
        : "reading"
    );

    setError(null);
    setNotice(null);

    try {
      let savedEvidence =
        evidence;

      if (
        stagedFiles.length >
        0
      ) {
        const form =
          new FormData();

        stagedFiles.forEach(
          (file) =>
            form.append(
              "images",
              file
            )
        );

        const uploadResponse =
          await fetch(
            `/api/replay-results/${gameStatsId}/evidence`,
            {
              method:
                "POST",
              body:
                form,
            }
          );

        const uploadPayload =
          (await uploadResponse
            .json()
            .catch(
              () => null
            )) as
            | {
                evidence?: EvidenceItem[];
                detail?: string;
                code?: string;
              }
            | null;

        if (
          !uploadResponse.ok
        ) {
          throw new Error(
            humanizeEvidenceError(
              uploadPayload,
              "The screenshots could not be stored."
            )
          );
        }

        savedEvidence =
          uploadPayload?.evidence ||
          [];

        setEvidence(
          savedEvidence
        );

        setStagedFiles(
          []
        );

        setAnalysisPhase(
          "reading"
        );
      }

      if (
        savedEvidence.length ===
        0
      ) {
        throw new Error(
          "Add at least one postgame screenshot first."
        );
      }

      setAnalysisPhase(
        "reading"
      );

      const response =
        await fetch(
          `/api/replay-results/${gameStatsId}/evidence/analyze`,
          {
            method:
              "POST",
          }
        );

      const payload =
        (await response
          .json()
          .catch(
            () => null
          )) as
          | RunResponse
          | {
              detail?: string;
              code?: string;
            }
          | null;

      if (!response.ok) {
        throw new Error(
          humanizeEvidenceError(
            payload,
            "The screenshot evidence pass could not complete."
          )
        );
      }

      const result =
        payload as RunResponse;

      setAnalysisPhase(
        "finalizing"
      );

      setNotice(
        result.outcome ===
          "already_latest"
          ? "This exact screenshot set has already been analyzed against the current replay parser pass. No duplicate evidence pass was created."
          : `Evidence Pass #${result.run.id} completed. It is now the newest immutable parser assessment.`
      );

      await Promise.all([
        loadTrail(),
        loadEvidence(),
      ]);
    } catch (
      nextError
    ) {
      setError(
        humanizeEvidenceError(
          {
            detail:
              nextError instanceof
                Error
                ? nextError.message
                : "Screenshot analysis failed.",
          },
          "Screenshot analysis failed."
        )
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function renderRun(
    run: ParserRun,
    current = false
  ) {
    const assisted =
      run.parserName ===
      "aoe2war.screenshot_vision";

    return (
      <div
        className={
          current
            ? "rounded-2xl border border-cyan-200/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.08),rgba(15,23,42,0.18))] p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
            : "rounded-xl border border-white/[0.08] bg-black/15 p-3"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">
              {parserRunTitle(
                run
              )}
            </div>

            <div className="mt-1 text-[10px] leading-4 text-slate-500">
              {assisted
                ? "AI screenshot evidence"
                : `${run.parserName} · ${run.parserVersion}`}
            </div>
          </div>

          <div className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-slate-500">
            {run.status}
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          {benchmarkLabel(
            run
          )}
        </p>

        <CategoryMatrix
          categories={
            run.categories
          }
          compact={
            !current
          }
        />

        <div className="mt-3 text-[9px] text-slate-600">
          {formatDate(
            run.createdAt
          )}
          {" · "}
          {
            run.observationCount
          }{" "}
          material signals
        </div>
      </div>
    );
  }

  function renderHuman(
    entry: HumanAdjudication,
    current = false
  ) {
    return (
      <div
        className={
          current
            ? "rounded-2xl border border-amber-200/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.08),rgba(15,23,42,0.18))] p-3.5"
            : "rounded-xl border border-amber-200/10 bg-amber-300/[0.025] p-3"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-amber-50">
            Human Verdict #
            {entry.id}
          </div>

          <div className="text-[8px] uppercase tracking-[0.16em] text-amber-100/45">
            {entry.decisionStatus ===
            "accepted"
              ? "locked"
              : "admin desk"}
          </div>
        </div>

        <div className="mt-2 text-xs font-medium leading-5 text-amber-100/85">
          {humanWinnerLabel(
            entry
          )}
        </div>

        <div className="mt-1 text-[10px] leading-4 text-slate-500">
          {
            entry.actorDisplayNameSnapshot
          }
          {" · "}
          {entry.reason}
        </div>

        <div className="mt-2 text-[9px] text-slate-600">
          {formatDate(
            entry.createdAt
          )}
        </div>
      </div>
    );
  }

  return (
    <details
      ref={
        detailsRef
      }
      onDragEnter={(
        event
      ) => {
        event.preventDefault();
        setDragging(true);

        if (
          detailsRef.current
        ) {
          detailsRef.current.open =
            true;
        }
      }}
      onDragOver={(
        event
      ) => {
        event.preventDefault();
        event.dataTransfer.dropEffect =
          "copy";
        setDragging(true);
      }}
      onDragLeave={() =>
        setDragging(false)
      }
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);

        if (
          event.dataTransfer.files
            .length
        ) {
          stage(
            event.dataTransfer
              .files
          );
        }
      }}
      className={`group overflow-hidden rounded-[1.5rem] border bg-[radial-gradient(circle_at_90%_0%,rgba(34,211,238,0.055),transparent_34%),rgba(2,6,23,0.82)] shadow-[0_24px_70px_rgba(0,0,0,0.22)] transition ${
        dragging
          ? "border-cyan-200/40 ring-1 ring-cyan-200/20"
          : "border-white/10"
      } [&>summary::-webkit-details-marker]:hidden`}
    >
      <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 select-none">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/35">
            Verdict Trail
          </div>

          <div className="mt-1 truncate text-xs font-semibold text-slate-200">
            {latestLabel}
          </div>

          <div className="mt-1 text-[9px] text-slate-600">
            Replay · Human · Evidence
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {adjudications.length > 0 ||
          evidence.length > 0 ? (
            <span
              className="inline-flex text-slate-400/45"
              title={
                adjudications.length > 0 &&
                evidence.length > 0
                  ? "Human verdict and human-supplied evidence"
                  : adjudications.length > 0
                    ? "Human verdict"
                    : "Human-supplied evidence"
              }
              aria-label={
                adjudications.length > 0 &&
                evidence.length > 0
                  ? "Human verdict and human-supplied evidence"
                  : adjudications.length > 0
                    ? "Human verdict"
                    : "Human-supplied evidence"
              }
            >
              <UserRound
                aria-hidden="true"
                className="h-[10px] w-[10px]"
                strokeWidth={1.5}
              />
            </span>
          ) : null}

          <div className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-slate-500">
            {evidence.length}/6 images
          </div>

          {latestSignalCount >
          0 ? (
            <div className="rounded-full border border-cyan-200/10 bg-cyan-300/[0.035] px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-cyan-100/55">
              {
                latestSignalCount
              }
              /8 areas
            </div>
          ) : null}

          <span className="ml-1 text-sm text-slate-600 transition-transform duration-200 group-open:rotate-90">
            ›
          </span>
        </div>
      </summary>

      <div className="border-t border-white/[0.07] p-4">
        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.26em] text-cyan-100/45">
                Evidence Lab
              </div>

              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                Drop up to six AoE2 HD postgame screens.
                The Evidence Lab reads what is visible in the images and creates a separate evidence-assisted assessment.
              </p>
            </div>

            <div className="shrink-0 text-[9px] text-slate-600">
              {evidence.length +
                stagedFiles.length}
              /6
            </div>
          </div>

          <input
            ref={
              inputRef
            }
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(event) => {
              if (
                event.target.files
              ) {
                stage(
                  event.target.files
                );
              }

              event.target.value =
                "";
            }}
          />

          <button
            type="button"
            onClick={() =>
              inputRef.current?.click()
            }
            className={`${isAdmin ? "" : "hidden "}mt-3 flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-3 py-5 text-center transition ${
              dragging
                ? "border-cyan-200/50 bg-cyan-300/[0.08]"
                : "border-white/10 bg-white/[0.018] hover:border-cyan-200/25 hover:bg-cyan-300/[0.035]"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Drop screenshots here
            </span>

            <span className="mt-1 text-[9px] text-slate-600">
              Score · Military · Economy · Technology · Society · Timeline
            </span>

            <span className="mt-1 text-[8px] text-slate-700">
              PNG · JPEG · WebP · up to 8 MB each · 30 MB per upload
            </span>
          </button>

          {evidence.length >
            0 ||
          stagedPreviews.length >
            0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {evidence.map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={
                      item.artifactId
                    }
                    className="group/image relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/25"
                  >
                    <img
                      src={`/api/replay-results/${gameStatsId}/evidence/${item.artifactId}`}
                      alt={
                        item.originalFilename
                      }
                      className="aspect-video w-full object-cover opacity-75"
                    />

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-5">
                      <div className="truncate text-[8px] text-slate-300">
                        {index +
                          1}
                        .{" "}
                        {
                          item.originalFilename
                        }
                      </div>
                    </div>
                  </div>
                )
              )}

              {stagedPreviews.map(
                (
                  preview,
                  index
                ) => (
                  <div
                    key={`${preview.file.name}:${preview.file.lastModified}`}
                    className="relative overflow-hidden rounded-xl border border-cyan-200/20 bg-cyan-300/[0.04]"
                  >
                    <img
                      src={
                        preview.url
                      }
                      alt={
                        preview.file
                          .name
                      }
                      className="aspect-video w-full object-cover opacity-75"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        removeStaged(
                          index
                        )
                      }
                      className="absolute right-1.5 top-1.5 cursor-pointer rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[8px] text-white/70 hover:text-white"
                    >
                      ×
                    </button>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-5">
                      <div className="truncate text-[8px] text-cyan-100">
                        Staged ·{" "}
                        {
                          preview.file
                            .name
                        }
                      </div>

                      <div className="text-[7px] text-slate-600">
                        {formatBytes(
                          preview.file
                            .size
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          {isAdmin ? (
            <div className={isAdmin ? "mt-3 grid grid-cols-2 gap-2" : "hidden"}>
              <button
                type="button"
                disabled={
                  analyzing ||
                  evidence.length +
                    stagedFiles.length ===
                    0
                }
                onClick={() =>
                  void analyzeEvidence()
                }
                className="cursor-pointer rounded-xl border border-cyan-200/20 bg-cyan-300/[0.08] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-300/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {analyzing
                  ? "Analyzing Evidence…"
                  : stagedFiles.length >
                      0
                    ? `Analyze ${stagedFiles.length} Screenshot${stagedFiles.length === 1 ? "" : "s"}`
                    : "Analyze Evidence"}
              </button>

              <button
                type="button"
                disabled={
                  running
                }
                onClick={() =>
                  void runLatestParser()
                }
                className="cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running
                  ? "Running…"
                  : "Run Replay Parser"}
              </button>
            </div>
          ) : null}
        </section>

        {analyzing ? (
          <EvidenceAnalysisStatus
            phase={
              analysisPhase
            }
            imageCount={
              evidence.length +
              stagedFiles.length
            }
          />
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-xl border border-emerald-200/12 bg-emerald-300/[0.045] px-3 py-2 text-[10px] leading-4 text-emerald-100/80">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div
            aria-live="polite"
            className="mt-4 rounded-2xl border border-rose-200/15 bg-[linear-gradient(145deg,rgba(244,63,94,0.07),rgba(15,23,42,0.34))] px-3.5 py-3 shadow-[0_14px_38px_rgba(0,0,0,0.18)]"
          >
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-100/65">
              {error.startsWith(
                "Analysis paused safely."
              )
                ? "Analysis Paused Safely"
                : error.startsWith(
                      "Screenshot too large."
                    )
                  ? "Screenshot Too Large"
                  : "Evidence Lab"}
            </div>

            <div className="mt-1.5 text-[10px] leading-5 text-rose-50/80">
              {error}
            </div>
          </div>
        ) : null}

        <section className="mt-5 border-t border-white/[0.07] pt-4">
          <div className="text-[9px] uppercase tracking-[0.26em] text-white/35">
            Current Assessment
          </div>

          <div className="mt-3">
            {loading &&
            !trail ? (
              <div className="text-xs text-slate-600">
                Loading assessment…
              </div>
            ) : latestEvent?.kind ===
              "parser" ? (
              renderRun(
                latestEvent.run,
                true
              )
            ) : latestEvent?.kind ===
              "human" ? (
              renderHuman(
                latestEvent.entry,
                true
              )
            ) : trail ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">
                    Original Parser State
                  </div>

                  <div className="text-[8px] uppercase tracking-[0.16em] text-slate-600">
                    Before Review
                  </div>
                </div>

                <div className="mt-2 text-[10px] leading-4 text-slate-500">
                  {
                    trail.baseline
                      .parseSource
                  }
                  {" · "}
                  {
                    trail.baseline
                      .parseReason
                  }
                  {" · iteration "}
                  {
                    trail.baseline
                      .parseIteration
                  }
                </div>

                <CategoryMatrix
                  categories={
                    trail.baseline
                      .categories
                  }
                />
              </div>
            ) : null}
          </div>
        </section>

        {trail ? (
          <details className="group/history mt-4 overflow-hidden rounded-xl border border-white/[0.07] bg-black/10 [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 select-none">
              <div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  Full Provenance History
                </div>

                <div className="mt-1 text-[9px] text-slate-600">
                  Original state ·{" "}
                  {
                    events.length
                  }{" "}
                  later{" "}
                  {events.length ===
                  1
                    ? "entry"
                    : "entries"}
                </div>
              </div>

              <span className="text-sm text-slate-600 transition-transform duration-200 group-open/history:rotate-90">
                ›
              </span>
            </summary>

            <div className="space-y-2 border-t border-white/[0.06] p-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Original Parser State
                  </div>

                  <div className="text-[8px] uppercase tracking-[0.14em] text-slate-600">
                    Baseline
                  </div>
                </div>

                <div className="mt-1 text-[9px] leading-4 text-slate-600">
                  {
                    trail.baseline
                      .parseSource
                  }
                  {" · "}
                  {
                    trail.baseline
                      .parseReason
                  }
                  {" · iteration "}
                  {
                    trail.baseline
                      .parseIteration
                  }
                </div>

                <CategoryMatrix
                  categories={
                    trail.baseline
                      .categories
                  }
                  compact
                />
              </div>

              {events.length ===
              0 ? (
                <div className="rounded-xl border border-white/[0.06] p-3 text-[10px] text-slate-600">
                  No later passes or human verdicts filed.
                </div>
              ) : (
                events.map(
                  (event) =>
                    event.kind ===
                    "parser" ? (
                      <div
                        key={`parser-${event.run.id}`}
                      >
                        {renderRun(
                          event.run
                        )}
                      </div>
                    ) : (
                      <div
                        key={`human-${event.entry.id}`}
                      >
                        {renderHuman(
                          event.entry
                        )}
                      </div>
                    )
                )
              )}
            </div>
          </details>
        ) : null}

        <div className="mt-4 text-[8px] leading-4 text-slate-700">
          Screenshot evidence is private and candidate-only.
          It never rewrites bets, payouts, chain history, or replay-only parser confidence.
        </div>
      </div>
    </details>
  );
}
