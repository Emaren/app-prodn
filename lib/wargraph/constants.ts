import type {
  WarGraphEligibilityReason,
  WarGraphLayer,
  WarGraphRewardConfig,
} from "./types.ts";

export const WARGRAPH_TIME_ZONE =
  "America/Edmonton" as const;

export const WARGRAPH_PRIME_START_MINUTE =
  17 * 60;

export const WARGRAPH_PRIME_END_MINUTE =
  23 * 60;

export const WARGRAPH_RING_RESPONSE_MS =
  15 * 60 * 1000;

export const WARGRAPH_MATCH_LAUNCH_MS =
  30 * 60 * 1000;

export const WARGRAPH_MAX_RESOLVED_CONTESTS = 2;

export const WARGRAPH_LAYERS = Object.freeze({
  CROWN: 0,
  RING_I: 1,
  RING_II: 2,
  FRONTIER: 3,
} satisfies Record<string, WarGraphLayer>);

export const WARGRAPH_LAYER_SEQUENCE = Object.freeze([
  WARGRAPH_LAYERS.CROWN,
  WARGRAPH_LAYERS.RING_I,
  WARGRAPH_LAYERS.RING_II,
  WARGRAPH_LAYERS.FRONTIER,
] as const);

export const WARGRAPH_FIXED_INTERIOR_CAPACITY =
  Object.freeze({
    [WARGRAPH_LAYERS.CROWN]: 1,
    [WARGRAPH_LAYERS.RING_I]: 2,
    [WARGRAPH_LAYERS.RING_II]: 6,
  } as const);

export const WARGRAPH_ELIGIBILITY_REASONS =
  Object.freeze([
    "WARGRAPH_ELIGIBLE",
    "INELIGIBLE_SAME_RING",
    "INELIGIBLE_RING_GAP",
    "INELIGIBLE_ACTION_CAP",
    "INELIGIBLE_NOT_LIVE",
    "INELIGIBLE_SINGLE_WATCHER",
    "INELIGIBLE_OUTSIDE_PRIME_WINDOW",
    "INELIGIBLE_CONFLICTING_ENGAGEMENT",
    "INELIGIBLE_GRAPH_STATE_AT_START",
  ] as const satisfies readonly WarGraphEligibilityReason[]);

export const DEFAULT_WARGRAPH_REWARD_CONFIG =
  Object.freeze({
    frontierToRingII: 1,
    ringIIToRingI: 2,
    firstBlood: 3,
    crownBattleWinner: 50,
  } satisfies WarGraphRewardConfig);
