import { createHash } from "node:crypto";

export type BetBookPhase =
  | "legacy"
  | "pre_game"
  | "opening_minute"
  | "late";

export type ActiveBetBookPhase = Exclude<BetBookPhase, "legacy">;

export const BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS = 60_000;

export type BetPhaseBooksV2Runtime = {
  requestedMode: "disabled" | "shadow" | "live";
  mode: "disabled" | "shadow";
  activationReady: false;
  detail: string;
};

function normalizeMode(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "shadow" || normalized === "live") return normalized;
  return "disabled";
}

/**
 * Phase Books V2 foundation is intentionally non-financial.
 *
 * "shadow" permits projection/tests only. A requested "live" mode fails
 * closed until a separately reviewed activation connects phase identity to
 * market creation, write fences, settlement, recovery and UI.
 */
export function readBetPhaseBooksV2Runtime(
  env: Record<string, string | undefined> = process.env
): BetPhaseBooksV2Runtime {
  const requestedMode = normalizeMode(env.BET_PHASE_BOOKS_V2_MODE);

  if (requestedMode === "shadow") {
    return {
      requestedMode,
      mode: "shadow",
      activationReady: false,
      detail:
        "Phase Books V2 shadow planning is available. Production wager admission remains on the legacy compatibility bridge.",
    };
  }

  if (requestedMode === "live") {
    return {
      requestedMode,
      mode: "disabled",
      activationReady: false,
      detail:
        "Phase Books V2 live activation is not installed. The server fails closed to legacy production behavior.",
    };
  }

  return {
    requestedMode: "disabled",
    mode: "disabled",
    activationReady: false,
    detail:
      "Phase Books V2 is disabled. Production wager admission remains unchanged.",
  };
}

export function buildBetPhaseBookKey(input: {
  authorityIdentityKey: string;
  marketType: string;
  phase: ActiveBetBookPhase;
}) {
  const authorityIdentityKey = input.authorityIdentityKey.trim();
  const marketType = input.marketType.trim().toLowerCase();

  if (!authorityIdentityKey) {
    throw new Error("Phase book authority identity is required.");
  }
  if (!marketType) {
    throw new Error("Phase book market type is required.");
  }

  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        contract: "aoe2war-bet-phase-book/v2",
        authorityIdentityKey,
        marketType,
        phase: input.phase,
      })
    )
    .digest("hex");

  return `phase-v2:${input.phase}:${digest.slice(0, 48)}`;
}

export type BetPhaseBookWindow = {
  phase: ActiveBetBookPhase;
  opensAt: Date | null;
  closesAt: Date | null;
};

function validDate(value: Date | null | undefined) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function planBetPhaseBookWindows(input: {
  battleStartAt: Date;
  preGameOpensAt?: Date | null;
  battleTerminalAt?: Date | null;
}): BetPhaseBookWindow[] {
  if (!validDate(input.battleStartAt)) {
    throw new Error("Authoritative battle start is required.");
  }

  const start = new Date(input.battleStartAt);
  const openingClose = new Date(
    start.getTime() + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS
  );

  const preGameOpensAt =
    input.preGameOpensAt && validDate(input.preGameOpensAt)
      ? new Date(input.preGameOpensAt)
      : null;
  if (preGameOpensAt && preGameOpensAt.getTime() >= start.getTime()) {
    throw new Error("Pre-Game must open before the authoritative battle start.");
  }

  const terminalAt =
    input.battleTerminalAt && validDate(input.battleTerminalAt)
      ? new Date(input.battleTerminalAt)
      : null;
  if (terminalAt && terminalAt.getTime() <= start.getTime()) {
    throw new Error("Battle terminal time must follow authoritative start.");
  }

  return [
    {
      phase: "pre_game",
      opensAt: preGameOpensAt,
      closesAt: start,
    },
    {
      phase: "opening_minute",
      opensAt: start,
      closesAt: openingClose,
    },
    {
      phase: "late",
      opensAt: openingClose,
      closesAt: terminalAt,
    },
  ];
}

export function authoritativeBetBookPhase(input: {
  now: Date;
  battleStartAt: Date;
  battleActive: boolean;
}): ActiveBetBookPhase | null {
  if (!validDate(input.now) || !validDate(input.battleStartAt)) {
    throw new Error("Valid server time and authoritative battle start are required.");
  }

  const nowMs = input.now.getTime();
  const startMs = input.battleStartAt.getTime();

  if (nowMs < startMs) return "pre_game";
  if (!input.battleActive) return null;

  if (nowMs < startMs + BET_PHASE_BOOKS_V2_OPENING_WINDOW_MS) {
    return "opening_minute";
  }

  return "late";
}

export function phaseBookWindowContains(
  window: BetPhaseBookWindow,
  now: Date
) {
  if (!validDate(now)) return false;

  const nowMs = now.getTime();
  if (window.opensAt && nowMs < window.opensAt.getTime()) return false;
  if (window.closesAt && nowMs >= window.closesAt.getTime()) return false;
  return true;
}
