export const BET_AUTOMATION_CUSTODY_CAPABILITY = "bet-custody-v1";
export const BET_AUTOMATION_MAX_RESERVE_WOLO = 10_000;
export const BET_AUTOMATION_MAX_GAMES = 10_000;

export type BetAutomationMode = "disabled" | "shadow" | "live";
export type BetAutoDesyncSide = "none" | "no" | "yes";

export type BetAutoPresetDraft = {
  enabled: boolean;
  winnerStakeWolo: number;
  desyncSide: BetAutoDesyncSide;
  desyncStakeWolo: number;
  untilOut: boolean;
  gamesRemaining: number | null;
  selfOnly: true;
};

export type BetAutomationRuntime = {
  configuredMode: BetAutomationMode;
  mode: BetAutomationMode;
  previewOnly: boolean;
  executionReady: boolean;
  custodyCapabilityPresent: boolean;
  code:
    | "PREVIEW_READY"
    | "AUTOMATION_DISABLED"
    | "LIVE_CUSTODY_UNAVAILABLE"
    | "LIVE_EXECUTOR_UNAVAILABLE";
  detail: string;
};

export class BetAutomationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetAutomationInputError";
  }
}

export const DEFAULT_BET_AUTO_PRESET: BetAutoPresetDraft = {
  enabled: false,
  winnerStakeWolo: 10,
  desyncSide: "none",
  desyncStakeWolo: 0,
  untilOut: false,
  gamesRemaining: 1,
  selfOnly: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readRequiredBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new BetAutomationInputError(`${field} must be true or false.`);
  }
  return value;
}

function readRequiredInteger(
  value: unknown,
  field: string,
  options: { min: number; max: number }
) {
  if (!Number.isSafeInteger(value)) {
    throw new BetAutomationInputError(`${field} must be a whole number.`);
  }

  const amount = value as number;
  if (amount < options.min || amount > options.max) {
    throw new BetAutomationInputError(
      `${field} must be between ${options.min.toLocaleString("en-US")} and ${options.max.toLocaleString("en-US")}.`
    );
  }
  return amount;
}

export function estimateBetAutomationReserveWolo(
  preset: Pick<
    BetAutoPresetDraft,
    "winnerStakeWolo" | "desyncStakeWolo" | "untilOut" | "gamesRemaining"
  >
) {
  const perGameWolo = preset.winnerStakeWolo + preset.desyncStakeWolo;
  return preset.untilOut
    ? BET_AUTOMATION_MAX_RESERVE_WOLO
    : perGameWolo * (preset.gamesRemaining ?? 0);
}

export function parseBetAutoPresetDraft(value: unknown): BetAutoPresetDraft {
  if (!isRecord(value)) {
    throw new BetAutomationInputError("Auto-bet settings must be an object.");
  }

  const enabled = readRequiredBoolean(value.enabled, "enabled");
  const winnerStakeWolo = readRequiredInteger(
    value.winnerStakeWolo,
    "winnerStakeWolo",
    { min: 1, max: BET_AUTOMATION_MAX_RESERVE_WOLO }
  );

  const desyncSide = value.desyncSide;
  if (desyncSide !== "none" && desyncSide !== "no" && desyncSide !== "yes") {
    throw new BetAutomationInputError("desyncSide must be none, no, or yes.");
  }

  const desyncStakeWolo = readRequiredInteger(
    value.desyncStakeWolo,
    "desyncStakeWolo",
    { min: 0, max: BET_AUTOMATION_MAX_RESERVE_WOLO }
  );

  if (desyncSide === "none" && desyncStakeWolo !== 0) {
    throw new BetAutomationInputError(
      "desyncStakeWolo must be 0 when no desync pick is selected."
    );
  }

  if (desyncSide !== "none" && desyncStakeWolo < 1) {
    throw new BetAutomationInputError(
      "Choose at least 1 WOLO when a desync pick is selected."
    );
  }

  const perGameWolo = winnerStakeWolo + desyncStakeWolo;
  if (perGameWolo > BET_AUTOMATION_MAX_RESERVE_WOLO) {
    throw new BetAutomationInputError(
      `The combined per-game plan cannot exceed ${BET_AUTOMATION_MAX_RESERVE_WOLO.toLocaleString("en-US")} WOLO.`
    );
  }

  const untilOut = readRequiredBoolean(value.untilOut, "untilOut");
  let gamesRemaining: number | null;
  if (untilOut) {
    if (value.gamesRemaining !== null) {
      throw new BetAutomationInputError(
        "gamesRemaining must be null when Until Out is selected."
      );
    }
    gamesRemaining = null;
  } else {
    gamesRemaining = readRequiredInteger(
      value.gamesRemaining,
      "gamesRemaining",
      { min: 1, max: BET_AUTOMATION_MAX_GAMES }
    );
  }

  if (value.selfOnly !== true) {
    throw new BetAutomationInputError(
      "Auto-bet preview is self-only and requires selfOnly=true."
    );
  }

  const normalized: BetAutoPresetDraft = {
    enabled,
    winnerStakeWolo,
    desyncSide,
    desyncStakeWolo,
    untilOut,
    gamesRemaining,
    selfOnly: true,
  };

  const estimatedReserveWolo = estimateBetAutomationReserveWolo(normalized);
  if (estimatedReserveWolo > BET_AUTOMATION_MAX_RESERVE_WOLO) {
    throw new BetAutomationInputError(
      `This finite plan would require ${estimatedReserveWolo.toLocaleString("en-US")} WOLO. Keep the estimated plan at or below ${BET_AUTOMATION_MAX_RESERVE_WOLO.toLocaleString("en-US")} WOLO.`
    );
  }

  return normalized;
}

function configuredModeFromEnv(raw: string | undefined): BetAutomationMode {
  if (!raw) return "shadow";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "disabled" || normalized === "shadow" || normalized === "live") {
    return normalized;
  }
  return "disabled";
}

function isHTTPURL(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Live execution intentionally remains unavailable in this app revision.
 *
 * A future revision may flip this only after it owns a durable worker that
 * consumes BetAutoExecution rows and a versioned Wolo custody contract. Merely
 * setting an environment variable must never turn preview rows into wagers.
 */
const LIVE_EXECUTOR_IMPLEMENTED = false;

export function readBetAutomationRuntime(
  env: Record<string, string | undefined> = process.env
): BetAutomationRuntime {
  const configuredMode = configuredModeFromEnv(env.BET_AUTOMATION_MODE);
  const custodyCapabilityPresent =
    env.WOLO_BET_CUSTODY_CAPABILITY?.trim() ===
      BET_AUTOMATION_CUSTODY_CAPABILITY &&
    isHTTPURL(env.WOLO_BET_CUSTODY_URL) &&
    Boolean(env.WOLO_SETTLEMENT_AUTH_TOKEN?.trim());

  if (configuredMode === "disabled") {
    return {
      configuredMode,
      mode: "disabled",
      previewOnly: true,
      executionReady: false,
      custodyCapabilityPresent,
      code: "AUTOMATION_DISABLED",
      detail:
        "Auto-bet automation is disabled server-side. You may save a plan, but it will not be evaluated or placed.",
    };
  }

  if (configuredMode === "live" && !custodyCapabilityPresent) {
    return {
      configuredMode,
      mode: "disabled",
      previewOnly: true,
      executionReady: false,
      custodyCapabilityPresent: false,
      code: "LIVE_CUSTODY_UNAVAILABLE",
      detail:
        "Live mode was requested, but the versioned Wolo custody capability is unavailable. Automation failed closed and no wager can be placed.",
    };
  }

  if (configuredMode === "live" && !LIVE_EXECUTOR_IMPLEMENTED) {
    return {
      configuredMode,
      mode: "shadow",
      previewOnly: true,
      executionReady: false,
      custodyCapabilityPresent,
      code: "LIVE_EXECUTOR_UNAVAILABLE",
      detail:
        "Wolo custody is advertised, but the durable app executor is not installed. The plan remains preview-only and no wager can be placed.",
    };
  }

  return {
    configuredMode,
    mode: configuredMode,
    previewOnly: true,
    executionReady: false,
    custodyCapabilityPresent,
    code: "PREVIEW_READY",
    detail:
      "Preview mode stores your self-bet rules only. No WOLO moves and no wager is placed.",
  };
}
