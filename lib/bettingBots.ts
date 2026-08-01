import { createHash } from "node:crypto";

export const BETTING_BOT_MODES = ["disabled", "shadow", "live"] as const;
export type BettingBotMode = (typeof BETTING_BOT_MODES)[number];

export const BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO = 10;
export const BETTING_BOT_MAX_MARKET_EXPOSURE_WOLO = 10_000;
export const BETTING_BOT_MAX_DAILY_EXPOSURE_WOLO = 100_000;
export const BETTING_BOT_MAX_BALANCE_FLOOR_WOLO = 100_000_000;
export const BETTING_BOT_POLICY_ID = "opposite-counter";
export const BETTING_BOT_POLICY_VERSION = 1;
export const BETTING_BOT_CUSTODY_CAPABILITY =
  "operator-counter-bet-custody-v1";

export type BettingBotConfigDraft = {
  displayName: string;
  avatarUrl: string | null;
  mode: BettingBotMode;
  commentaryEnabled: boolean;
  commentaryPrompt: string;
  oppositeOnly: true;
  defaultCounterstakeWolo: number;
  maxCounterstakeWolo: number;
  perMarketExposureWolo: number;
  dailyExposureWolo: number;
  balanceFloorWolo: number;
};

export type BettingBotPolicyConfig = BettingBotConfigDraft & {
  id: number;
  slug: string;
  reservedUid: string;
  policyId: string;
  policyVersion: number;
};

export type BettingBotCustodyVerification = {
  capability: string;
  verificationId: string;
  operatorFunded: true;
  accountAddress: string;
  availableBalanceWolo: number;
  verifiedAt: string;
};

export type BettingBotRuntime = {
  configuredMode: BettingBotMode;
  serverMode: BettingBotMode;
  effectiveMode: BettingBotMode;
  previewOnly: true;
  canPropose: boolean;
  canExecuteMoney: false;
  custodyAdvertised: boolean;
  custodyVerified: boolean;
  executorImplemented: false;
  code:
    | "BOT_DISABLED"
    | "SERVER_DISABLED"
    | "SHADOW_READY"
    | "SERVER_SHADOW_CEILING"
    | "LIVE_CUSTODY_NOT_ADVERTISED"
    | "LIVE_CUSTODY_UNVERIFIED"
    | "LIVE_BALANCE_FLOOR_BLOCKED"
    | "LIVE_EXECUTOR_UNAVAILABLE";
  detail: string;
};

export class BettingBotInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BettingBotInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new BettingBotInputError(`${field} must be text.`);
  }
  const normalized = value.replace(/\0/g, "").trim().slice(0, maxLength);
  if (!normalized) {
    throw new BettingBotInputError(`${field} is required.`);
  }
  return normalized;
}

function readOptionalAvatarUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new BettingBotInputError("avatarUrl must be a URL or empty.");
  }

  const normalized = value.trim().slice(0, 500);
  if (normalized.startsWith("/")) return normalized;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return normalized;
    }
  } catch {
    // Fall through to the bounded validation error.
  }

  throw new BettingBotInputError(
    "avatarUrl must be an http(s) URL, an app-relative path, or empty."
  );
}

function readInteger(
  value: unknown,
  field: string,
  options: { min: number; max: number }
) {
  if (!Number.isSafeInteger(value)) {
    throw new BettingBotInputError(`${field} must be a whole number.`);
  }
  const amount = value as number;
  if (amount < options.min || amount > options.max) {
    throw new BettingBotInputError(
      `${field} must be between ${options.min.toLocaleString("en-US")} and ${options.max.toLocaleString("en-US")} WOLO.`
    );
  }
  return amount;
}

export function parseBettingBotConfigDraft(
  value: unknown
): BettingBotConfigDraft {
  if (!isRecord(value)) {
    throw new BettingBotInputError("Betting bot settings must be an object.");
  }

  const mode = value.mode;
  if (mode !== "disabled" && mode !== "shadow" && mode !== "live") {
    throw new BettingBotInputError("mode must be disabled, shadow, or live.");
  }

  if (typeof value.commentaryEnabled !== "boolean") {
    throw new BettingBotInputError("commentaryEnabled must be true or false.");
  }
  if (value.oppositeOnly !== true) {
    throw new BettingBotInputError(
      "Counter-bettors are opposite-only and require oppositeOnly=true."
    );
  }

  const defaultCounterstakeWolo = readInteger(
    value.defaultCounterstakeWolo,
    "defaultCounterstakeWolo",
    { min: 1, max: BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO }
  );
  const maxCounterstakeWolo = readInteger(
    value.maxCounterstakeWolo,
    "maxCounterstakeWolo",
    { min: 1, max: BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO }
  );
  if (defaultCounterstakeWolo > maxCounterstakeWolo) {
    throw new BettingBotInputError(
      "defaultCounterstakeWolo cannot exceed maxCounterstakeWolo."
    );
  }

  const perMarketExposureWolo = readInteger(
    value.perMarketExposureWolo,
    "perMarketExposureWolo",
    { min: 1, max: BETTING_BOT_MAX_MARKET_EXPOSURE_WOLO }
  );
  if (perMarketExposureWolo < maxCounterstakeWolo) {
    throw new BettingBotInputError(
      "perMarketExposureWolo must cover at least one maximum counterstake."
    );
  }

  const dailyExposureWolo = readInteger(
    value.dailyExposureWolo,
    "dailyExposureWolo",
    { min: 1, max: BETTING_BOT_MAX_DAILY_EXPOSURE_WOLO }
  );
  if (dailyExposureWolo < perMarketExposureWolo) {
    throw new BettingBotInputError(
      "dailyExposureWolo cannot be lower than perMarketExposureWolo."
    );
  }

  const balanceFloorWolo = readInteger(
    value.balanceFloorWolo,
    "balanceFloorWolo",
    { min: 0, max: BETTING_BOT_MAX_BALANCE_FLOOR_WOLO }
  );

  const commentaryPrompt =
    typeof value.commentaryPrompt === "string"
      ? value.commentaryPrompt.replace(/\0/g, "").trim().slice(0, 8_000)
      : "";

  return {
    displayName: readText(value.displayName, "displayName", 100),
    avatarUrl: readOptionalAvatarUrl(value.avatarUrl),
    mode,
    commentaryEnabled: value.commentaryEnabled,
    commentaryPrompt,
    oppositeOnly: true,
    defaultCounterstakeWolo,
    maxCounterstakeWolo,
    perMarketExposureWolo,
    dailyExposureWolo,
    balanceFloorWolo,
  };
}

function readMode(value: string | undefined): BettingBotMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "disabled" ||
    normalized === "shadow" ||
    normalized === "live"
    ? normalized
    : "disabled";
}

function isHttpUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isFreshVerification(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= -60_000 && ageMs <= 5 * 60_000;
}

function isWoloAddress(value: string) {
  return /^wolo1[0-9a-z]{30,80}$/.test(value.trim());
}

function custodyProofIsVerified(
  verification: BettingBotCustodyVerification | null
) {
  if (!verification) return false;
  return (
    verification.capability === BETTING_BOT_CUSTODY_CAPABILITY &&
    verification.operatorFunded === true &&
    Boolean(verification.verificationId.trim()) &&
    isWoloAddress(verification.accountAddress) &&
    Number.isSafeInteger(verification.availableBalanceWolo) &&
    verification.availableBalanceWolo >= 0 &&
    isFreshVerification(verification.verifiedAt)
  );
}

/**
 * Server and custody gates are ceilings, not switches that execute money.
 * This revision deliberately has no durable counter-bet executor.
 */
export function readBettingBotRuntime(
  config: Pick<
    BettingBotPolicyConfig,
    "mode" | "maxCounterstakeWolo" | "balanceFloorWolo"
  >,
  env: Record<string, string | undefined> = process.env,
  verification: BettingBotCustodyVerification | null = null
): BettingBotRuntime {
  const serverMode = readMode(env.BETTING_BOTS_MODE);
  const custodyAdvertised =
    env.WOLO_BET_COUNTER_CUSTODY_CAPABILITY?.trim() ===
      BETTING_BOT_CUSTODY_CAPABILITY &&
    isHttpUrl(env.WOLO_BET_COUNTER_CUSTODY_URL) &&
    Boolean(env.WOLO_BET_COUNTER_CUSTODY_AUTH_TOKEN?.trim());
  const custodyProofVerified =
    custodyAdvertised && custodyProofIsVerified(verification);
  const custodyVerified = Boolean(
    custodyProofVerified &&
      verification &&
      verification.availableBalanceWolo >=
        config.balanceFloorWolo + config.maxCounterstakeWolo
  );

  const result = (
    effectiveMode: BettingBotMode,
    code: BettingBotRuntime["code"],
    detail: string
  ): BettingBotRuntime => ({
    configuredMode: config.mode,
    serverMode,
    effectiveMode,
    previewOnly: true,
    canPropose: effectiveMode === "shadow",
    canExecuteMoney: false,
    custodyAdvertised,
    custodyVerified,
    executorImplemented: false,
    code,
    detail,
  });

  if (config.mode === "disabled") {
    return result(
      "disabled",
      "BOT_DISABLED",
      "This counter-bettor is disabled. It cannot evaluate or place a wager."
    );
  }
  if (serverMode === "disabled") {
    return result(
      "disabled",
      "SERVER_DISABLED",
      "Counter-betting is disabled by the server safety ceiling. No proposal or wager can be created."
    );
  }
  if (config.mode === "shadow") {
    return result(
      "shadow",
      "SHADOW_READY",
      "Shadow mode may compute deterministic opposite-side previews. It cannot reserve WOLO or create a wager."
    );
  }
  if (serverMode === "shadow") {
    return result(
      "shadow",
      "SERVER_SHADOW_CEILING",
      "This bot requests Live, but the server ceiling permits Shadow only. No money can move."
    );
  }
  if (!custodyAdvertised) {
    return result(
      "disabled",
      "LIVE_CUSTODY_NOT_ADVERTISED",
      "Live was requested, but the exact operator-funded custody capability is not advertised. The bot failed closed."
    );
  }
  if (!custodyProofVerified) {
    return result(
      "disabled",
      "LIVE_CUSTODY_UNVERIFIED",
      "Live was requested, but no fresh operator-funded custody verification was supplied. The bot failed closed."
    );
  }
  if (!custodyVerified) {
    return result(
      "disabled",
      "LIVE_BALANCE_FLOOR_BLOCKED",
      "Custody verification did not prove a fresh funded account above the configured balance floor. The bot failed closed."
    );
  }

  return result(
    "shadow",
    "LIVE_EXECUTOR_UNAVAILABLE",
    "Custody was verified, but no durable counter-bet executor exists in this release. The bot remains preview-only."
  );
}

export function buildBetCounterIdempotencyKey(input: {
  botConfigId: number;
  policyId: string;
  policyVersion: number;
  marketId: number;
  sourceWagerId: number;
  propositionHash: string;
}) {
  const canonical = [
    input.policyId,
    input.policyVersion,
    input.botConfigId,
    input.marketId,
    input.sourceWagerId,
    input.propositionHash.trim().toLowerCase(),
  ].join(":");
  return `counter:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function buildBetCounterProposal(input: {
  config: BettingBotPolicyConfig;
  runtime: BettingBotRuntime;
  marketId: number;
  sourceWagerId: number;
  propositionHash: string;
  sourceSide: "left" | "right";
  sourceAmountWolo: number;
  marketExposureWolo: number;
  dailyExposureWolo: number;
  availableBalanceWolo: number;
}) {
  const idempotencyKey = buildBetCounterIdempotencyKey({
    botConfigId: input.config.id,
    policyId: input.config.policyId,
    policyVersion: input.config.policyVersion,
    marketId: input.marketId,
    sourceWagerId: input.sourceWagerId,
    propositionHash: input.propositionHash,
  });
  const counterSide = input.sourceSide === "left" ? "right" : "left";

  if (!input.runtime.canPropose) {
    return {
      decision: "evaluation_skipped" as const,
      idempotencyKey,
      counterSide,
      amountWolo: 0,
      canExecuteMoney: false as const,
      reasonCode: input.runtime.code,
    };
  }

  const nonNegativeInteger = (value: number) =>
    Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const candidates = [
    nonNegativeInteger(input.sourceAmountWolo),
    nonNegativeInteger(input.config.defaultCounterstakeWolo),
    nonNegativeInteger(input.config.maxCounterstakeWolo),
    BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO,
    nonNegativeInteger(input.config.perMarketExposureWolo) -
      nonNegativeInteger(input.marketExposureWolo),
    nonNegativeInteger(input.config.dailyExposureWolo) -
      nonNegativeInteger(input.dailyExposureWolo),
    nonNegativeInteger(input.availableBalanceWolo) -
      nonNegativeInteger(input.config.balanceFloorWolo),
  ];
  const amountWolo = Math.max(0, Math.min(...candidates));

  return {
    decision:
      amountWolo > 0
        ? ("shadow_proposed" as const)
        : ("evaluation_skipped" as const),
    idempotencyKey,
    counterSide,
    amountWolo,
    canExecuteMoney: false as const,
    reasonCode: amountWolo > 0 ? "OPPOSITE_PREVIEW_READY" : "EXPOSURE_OR_BALANCE_GUARD",
  };
}

export function buildBettingBotCommentaryPrompt(
  config: Pick<BettingBotPolicyConfig, "displayName" | "commentaryPrompt">
) {
  return [
    `You write optional betting-room flavour for ${config.displayName}.`,
    "A deterministic server policy has already chosen whether to say anything and has already fixed the side, amount, and audit identity.",
    "You may write one short public line only. You cannot choose a side, amount, market, exposure, custody action, transaction, or wager.",
    "Never claim WOLO moved unless verified chain proof is supplied after execution.",
    config.commentaryPrompt
      ? `Operator-approved commentary style:\n${config.commentaryPrompt}`
      : "Operator-approved commentary style: none supplied.",
  ].join("\n\n");
}
