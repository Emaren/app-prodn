export const STAKING_ACTIVITY_PREFERENCES_VERSION = 2 as const;
export const STAKING_ACTIVITY_PREFS_KEY =
  "aoe2war:staking-activity-prefs:grouped-default-v2";
export const LEGACY_STAKING_ACTIVITY_PREFS_KEY =
  "aoe2war:staking-activity-prefs:ledger-all-v1";

export type StakingActivityMode = "ledger" | "grouped";
export type StakingActivityFilterMode =
  | "all"
  | "belts"
  | "staking"
  | "compounded"
  | "bounties"
  | "bets"
  | "transfers"
  | "reserve";
export type StakingBeltPayoutFilterMode = "all" | "tributes" | "bounties";

export type StakingActivityPreferences = {
  version: typeof STAKING_ACTIVITY_PREFERENCES_VERSION;
  mode: StakingActivityMode;
  filterMode: StakingActivityFilterMode;
  beltPayoutFilterMode: StakingBeltPayoutFilterMode;
};

export type StakingActivityPreferenceResolution = {
  preferences: StakingActivityPreferences;
  source: "stored-v2" | "legacy-filter-migration" | "default";
};

const MAX_STORED_PREFERENCE_LENGTH = 4_096;

function parseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || raw.length > MAX_STORED_PREFERENCE_LENGTH) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validFilter(
  value: unknown,
  isAdmin: boolean,
): StakingActivityFilterMode | null {
  if (
    value === "all" ||
    value === "belts" ||
    value === "staking" ||
    value === "compounded" ||
    value === "bounties" ||
    value === "bets" ||
    value === "transfers" ||
    (isAdmin && value === "reserve")
  ) {
    return value;
  }
  return null;
}

function validBeltPayoutFilter(value: unknown): StakingBeltPayoutFilterMode | null {
  return value === "all" || value === "tributes" || value === "bounties"
    ? value
    : null;
}

function filterRequiresLedger(filterMode: StakingActivityFilterMode) {
  return filterMode !== "all" && filterMode !== "bets";
}

function preferencesFor(input: {
  mode?: unknown;
  filterMode?: unknown;
  beltPayoutFilterMode?: unknown;
  isAdmin: boolean;
}): StakingActivityPreferences {
  const filterMode = validFilter(input.filterMode, input.isAdmin) ?? "all";
  const requestedMode =
    input.mode === "ledger" || input.mode === "grouped" ? input.mode : "grouped";

  return {
    version: STAKING_ACTIVITY_PREFERENCES_VERSION,
    mode: filterRequiresLedger(filterMode) ? "ledger" : requestedMode,
    filterMode,
    beltPayoutFilterMode:
      validBeltPayoutFilter(input.beltPayoutFilterMode) ?? "all",
  };
}

/**
 * Resolves the v2 preference contract without pretending the auto-written v1
 * `ledger` value was an intentional user choice. A legacy filter can be
 * migrated once; the component immediately persists the resulting v2 value.
 */
export function resolveStakingActivityPreferences(input: {
  storedV2: string | null | undefined;
  storedLegacy?: string | null | undefined;
  isAdmin: boolean;
}): StakingActivityPreferenceResolution {
  const storedV2 = parseObject(input.storedV2);
  if (storedV2?.version === STAKING_ACTIVITY_PREFERENCES_VERSION) {
    return {
      preferences: preferencesFor({ ...storedV2, isAdmin: input.isAdmin }),
      source: "stored-v2",
    };
  }

  const legacy = parseObject(input.storedLegacy);
  const legacyFilter = legacy
    ? validFilter(legacy.filterMode, input.isAdmin)
    : null;
  const legacyBeltFilter = legacy
    ? validBeltPayoutFilter(legacy.beltPayoutFilterMode)
    : null;

  if (legacyFilter || legacyBeltFilter) {
    return {
      preferences: preferencesFor({
        // v1 wrote ledger on mount, so only its explicit filter controls are
        // safe to carry across the grouped-default rollout.
        mode: "grouped",
        filterMode: legacyFilter,
        beltPayoutFilterMode: legacyBeltFilter,
        isAdmin: input.isAdmin,
      }),
      source: "legacy-filter-migration",
    };
  }

  return {
    preferences: preferencesFor({ isAdmin: input.isAdmin }),
    source: "default",
  };
}

export function serializeStakingActivityPreferences(
  preferences: Omit<StakingActivityPreferences, "version">,
) {
  return JSON.stringify({
    version: STAKING_ACTIVITY_PREFERENCES_VERSION,
    ...preferences,
  } satisfies StakingActivityPreferences);
}
