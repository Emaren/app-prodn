import type { Prisma } from "@/lib/generated/prisma";

export const WAR_ENGINE_TIER_LABELS = {
  1: "Header Scan",
  2: "Event Parse",
  3: "Fast Verdict Replay",
  4: "Full Battle Reconstruction",
  5: "Visual Forensic Playback",
  6: "Human Adjudication",
} as const;

export type WarEngineTier = keyof typeof WAR_ENGINE_TIER_LABELS;

export type WarEngineClassification =
  | "verified_result"
  | "reconstructed_result"
  | "likely_outcome"
  | "inconclusive_recording"
  | "aborted_battle"
  | "human_adjudication_required";

export type WarEngineEventView = {
  id: number;
  sequence: number;
  eventType: string;
  tier: number;
  status: string;
  classification: string | null;
  publicLabel: string;
  publicDetail: string;
  confidenceBps: number | null;
  winningTeamKey: string | null;
  winningPlayerKeys: unknown;
  createdAt: Date | string;
};

export type WarEngineRunView = {
  id: number;
  tier: number;
  status: string;
  resultClassification: string | null;
  resultTrusted: boolean;
  confidenceBps: number | null;
  completedAt: Date | string | null;
};

export type WarEngineCaseView = {
  id: number;
  initialTier: number;
  initialReasonCode: string;
  sourceReplayHashes: unknown;
  financialHistoryLocked: boolean;
  financialLockReason: string;
  createdAt: Date | string;
  events: WarEngineEventView[];
  runs: WarEngineRunView[];
};

export type WarEngineCaseCarrier = {
  warEngineCase?: WarEngineCaseView | null;
};

export type PublicWarEngineStatus = {
  caseId: number;
  tier: WarEngineTier;
  tierLabel: string;
  status: string;
  classification: WarEngineClassification | null;
  badge: string;
  detail: string;
  confidenceBps: number | null;
  financialHistoryLocked: boolean;
  financialLockReason: string;
  href: string;
};

export const WAR_ENGINE_CASE_PUBLIC_SELECT = {
  id: true,
  initialTier: true,
  initialReasonCode: true,
  sourceReplayHashes: true,
  financialHistoryLocked: true,
  financialLockReason: true,
  createdAt: true,
  events: {
    orderBy: [
      { sequence: "desc" },
      { id: "desc" },
    ],
    take: 1,
    select: {
      id: true,
      sequence: true,
      eventType: true,
      tier: true,
      status: true,
      classification: true,
      publicLabel: true,
      publicDetail: true,
      confidenceBps: true,
      winningTeamKey: true,
      winningPlayerKeys: true,
      createdAt: true,
    },
  },
  runs: {
    orderBy: [
      { completedAt: "desc" },
      { id: "desc" },
    ],
    take: 1,
    select: {
      id: true,
      tier: true,
      status: true,
      resultClassification: true,
      resultTrusted: true,
      confidenceBps: true,
      completedAt: true,
    },
  },
} satisfies Prisma.WarEngineCaseSelect;

export const WAR_ENGINE_CASE_RELATION = {
  select: WAR_ENGINE_CASE_PUBLIC_SELECT,
} satisfies Prisma.GameStats$warEngineCaseArgs;

function normalizeTier(value: number): WarEngineTier {
  if (value >= 1 && value <= 6) {
    return value as WarEngineTier;
  }

  return 3;
}

function normalizeClassification(
  value: string | null | undefined
): WarEngineClassification | null {
  switch (value) {
    case "verified_result":
    case "reconstructed_result":
    case "likely_outcome":
    case "inconclusive_recording":
    case "aborted_battle":
    case "human_adjudication_required":
      return value;
    default:
      return null;
  }
}

function fallbackPublicCopy(
  status: string,
  classification: WarEngineClassification | null
) {
  switch (classification) {
    case "verified_result":
    case "reconstructed_result":
      return {
        badge: "WAR ENGINE VERIFIED",
        detail: "Winner recovered through deterministic battle reconstruction.",
      };

    case "likely_outcome":
      return {
        badge: "LIKELY OUTCOME",
        detail: "Final battlefield state strongly favors one side, but no official result was encoded.",
      };

    case "inconclusive_recording":
      return {
        badge: "BATTLE INCONCLUSIVE",
        detail: "Recording ended before a competitive result was preserved.",
      };

    case "aborted_battle":
      return {
        badge: "ABORTED BATTLE",
        detail: "The recording ended before a meaningful competitive battle developed.",
      };

    case "human_adjudication_required":
      return {
        badge: "HUMAN ADJUDICATION REQUIRED",
        detail: "Machine reconstruction is exhausted and independent human evidence is required.",
      };

    default:
      if (status === "running") {
        return {
          badge: "WAR ENGINE ANALYZING",
          detail: "Deterministic battle reconstruction is in progress.",
        };
      }

      if (status === "failed") {
        return {
          badge: "WAR ENGINE RETRY REQUIRED",
          detail: "The reconstruction run stopped safely and remains queued for another pass.",
        };
      }

      return {
        badge: "WAR ENGINE REQUIRED",
        detail: "Result not encoded · Full battle reconstruction queued.",
      };
  }
}

export function resolvePublicWarEngineStatus(
  carrier: WarEngineCaseCarrier
): PublicWarEngineStatus | null {
  const warEngineCase = carrier.warEngineCase;

  if (!warEngineCase) {
    return null;
  }

  const latestEvent = warEngineCase.events[0] ?? null;
  const latestRun = warEngineCase.runs[0] ?? null;
  const tier = normalizeTier(
    latestEvent?.tier ??
      latestRun?.tier ??
      warEngineCase.initialTier
  );
  const status = latestEvent?.status ?? "required";
  const classification = normalizeClassification(
    latestEvent?.classification ??
      latestRun?.resultClassification
  );
  const fallback = fallbackPublicCopy(status, classification);
  const badge = latestEvent?.publicLabel.trim() || fallback.badge;
  const detail = latestEvent?.publicDetail.trim() || fallback.detail;

  return {
    caseId: warEngineCase.id,
    tier,
    tierLabel: WAR_ENGINE_TIER_LABELS[tier],
    status,
    classification,
    badge,
    detail,
    confidenceBps:
      latestEvent?.confidenceBps ??
      latestRun?.confidenceBps ??
      null,
    financialHistoryLocked:
      warEngineCase.financialHistoryLocked,
    financialLockReason:
      warEngineCase.financialLockReason,
    href: `/war-engine#case-${warEngineCase.id}`,
  };
}
