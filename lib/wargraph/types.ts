export type WarGraphLayer = 0 | 1 | 2 | 3;

export type WarGraphClockPhase =
  | "PRIME"
  | "LAST_CALL_PASSED"
  | "BEFORE_PRIME";

export type WarGraphOperationalPhase =
  | "PRIME"
  | "AFTERBURN"
  | "STATIC";

export interface EdmontonLocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateKey: string;
  minuteOfDay: number;
}

export type WarGraphClock =
  | {
      valid: true;
      phase: WarGraphClockPhase;
      isPrimeWindow: boolean;
      local: EdmontonLocalDateTime;
      nightKey: string;
    }
  | {
      valid: false;
      reason: "INVALID_TIMESTAMP";
    };

export type WarGraphGameProvenance =
  | "LIVE"
  | "BATCH"
  | "MANUAL"
  | "HISTORICAL";

export type WarGraphQualificationPath =
  | "ORGANIC"
  | "BOUND_PAIRING";

export type WarGraphEligibilityReason =
  | "WARGRAPH_ELIGIBLE"
  | "INELIGIBLE_SAME_RING"
  | "INELIGIBLE_RING_GAP"
  | "INELIGIBLE_ACTION_CAP"
  | "INELIGIBLE_NOT_LIVE"
  | "INELIGIBLE_SINGLE_WATCHER"
  | "INELIGIBLE_OUTSIDE_PRIME_WINDOW"
  | "INELIGIBLE_CONFLICTING_ENGAGEMENT"
  | "INELIGIBLE_GRAPH_STATE_AT_START";

export interface WarGraphParticipantAtStart {
  playerId: string;
  layer: WarGraphLayer;
  actionsUsed: number;
  hasConflictingEngagement: boolean;
}

export interface WarGraphDoubleWatcherProof {
  leftWatcherLive: boolean;
  rightWatcherLive: boolean;
  sameGame: boolean;
}

export interface WarGraphBoundPairingTiming {
  advanceCreatedAt: Date;
  acceptedAt: Date;
}

export interface WarGraphQualificationInput {
  commencedAt: Date;
  provenance: WarGraphGameProvenance;
  path: WarGraphQualificationPath;
  graphStateAtStartValid: boolean;
  left: WarGraphParticipantAtStart;
  right: WarGraphParticipantAtStart;
  watcherProof: WarGraphDoubleWatcherProof;
  pairingTiming?: WarGraphBoundPairingTiming;
}

export type WarGraphEligibilityDecision =
  | {
      eligible: true;
      reason: "WARGRAPH_ELIGIBLE";
      aggressor: WarGraphParticipantAtStart;
      defender: WarGraphParticipantAtStart;
      nightKey: string;
    }
  | {
      eligible: false;
      reason: Exclude<
        WarGraphEligibilityReason,
        "WARGRAPH_ELIGIBLE"
      >;
    };

export type WarGraphBattleOutcome =
  | "AGGRESSOR_WIN"
  | "DEFENDER_WIN";

export interface WarGraphMovementParticipant {
  playerId: string;
  layer: WarGraphLayer;
  actionsUsed: number;
}

export interface WarGraphRoleMovement {
  playerId: string;
  fromLayer: WarGraphLayer;
  toLayer: WarGraphLayer;
  actionCharge: 0 | 1;
  catastrophicFall: boolean;
}

export type WarGraphMovementDecision =
  | {
      ok: true;
      kind:
        | "VERIFIED_BATTLE"
        | "DEFENSE_DEFAULT"
        | "GRAVITY_MOVE";
      aggressor: WarGraphRoleMovement;
      defender?: WarGraphRoleMovement;
    }
  | {
      ok: false;
      reason:
        | "INELIGIBLE_ACTION_CAP"
        | "INELIGIBLE_GRAPH_STATE_AT_START";
    };

export type WarGraphResolutionKind =
  | "VERIFIED_BATTLE"
  | "DEFENSE_DEFAULT"
  | "DEFENDER_NO_START_DEFAULT"
  | "CHALLENGER_ABANDONMENT"
  | "TECHNICAL_VOID"
  | "SYSTEM_VOID"
  | "MUTUAL_NO_START"
  | "GRAVITY_MOVE";

export interface WarGraphActionCharges {
  aggressor: 0 | 1;
  defender: 0 | 1;
}

export interface WarGraphRewardConfig {
  frontierToRingII: number;
  ringIIToRingI: number;
  firstBlood: number;
  crownBattleWinner: number;
}

export type WarGraphRewardComponent =
  | "FRONTIER_TO_RING_II"
  | "RING_II_TO_RING_I"
  | "FIRST_BLOOD"
  | "CROWN_BATTLE_WINNER";

export interface WarGraphRewardAward {
  recipient: "AGGRESSOR" | "DEFENDER";
  component: WarGraphRewardComponent;
  amountWolo: number;
}

export type WarGraphRewardInput =
  | {
      kind: "VERIFIED_BATTLE";
      aggressorLayer: WarGraphLayer;
      defenderLayer: WarGraphLayer;
      outcome: WarGraphBattleOutcome;
      isFirstBlood: boolean;
    }
  | {
      kind: Exclude<
        WarGraphResolutionKind,
        "VERIFIED_BATTLE"
      >;
    };

export type WarGraphRewardDecision =
  | {
      ok: true;
      awards: ReadonlyArray<WarGraphRewardAward>;
      totalWolo: number;
    }
  | {
      ok: false;
      reason:
        | "INVALID_REWARD_CONFIGURATION"
        | "INELIGIBLE_GRAPH_STATE_AT_START";
      awards: readonly [];
      totalWolo: 0;
    };
