export const WARGRAPH_PUBLIC_SCHEMA_VERSION = "wargraph-public/v1" as const;

export const WARGRAPH_VIEW_MODES = ["basic", "advanced", "extreme"] as const;

export type WarGraphViewMode = (typeof WARGRAPH_VIEW_MODES)[number];

export type WarGraphPhase =
  | "prime"
  | "afterburn"
  | "static"
  | "maintenance";

export type WarGraphHealthState =
  | "healthy"
  | "degraded"
  | "maintenance";

export type WarGraphRingKind =
  | "crown"
  | "inner"
  | "middle"
  | "frontier";

export type WarGraphWarriorState =
  | "dormant"
  | "realm_active"
  | "wargraph_today"
  | "ready_now"
  | "under_siege"
  | "engaged"
  | "night_complete";

export type WarGraphWatcherState =
  | "healthy"
  | "connected"
  | "monitoring_required"
  | "folder_required"
  | "offline"
  | "not_applicable";

export type WarGraphEngagementState =
  | "offered"
  | "locked"
  | "watching"
  | "awaiting_final"
  | "resolving"
  | "void";

export type WarGraphWatcherProofState =
  | "not_started"
  | "collecting"
  | "double_watcher_live"
  | "awaiting_final"
  | "verified"
  | "uncertain";

export type WarGraphFossilizationStage =
  | "living"
  | "weathered"
  | "stone_touched"
  | "stone_spreading"
  | "mostly_statue"
  | "full_statue"
  | "cobwebbed";

export type WarGraphQualificationReasonCode =
  | "WARGRAPH_ELIGIBLE"
  | "INELIGIBLE_SAME_RING"
  | "INELIGIBLE_RING_GAP"
  | "INELIGIBLE_ACTION_CAP"
  | "INELIGIBLE_NOT_LIVE"
  | "INELIGIBLE_SINGLE_WATCHER"
  | "INELIGIBLE_OUTSIDE_PRIME_WINDOW"
  | "INELIGIBLE_CONFLICTING_ENGAGEMENT"
  | "INELIGIBLE_GRAPH_STATE_AT_START";

export type WarGraphHistoryReasonCode =
  | "VERIFIED_BATTLE"
  | "CROWN_CAPTURED"
  | "CROWN_DEFENDED"
  | "CATASTROPHIC_FALL"
  | "DEFENSE_DEFAULT"
  | "SEAT_CLAIMED"
  | "CHALLENGER_ABANDONMENT"
  | "GRAVITY_MOVE"
  | "TECHNICAL_VOID"
  | "SYSTEM_VOID"
  | "MUTUAL_NO_START"
  | "BOUNTY_QUEUED"
  | "FIRST_BLOOD";

export interface WarGraphPublicHealth {
  state: WarGraphHealthState;
  label: string;
  detail: string | null;
  checkedAt: string;
}

export interface WarGraphPublicNight {
  dayKey: string;
  label: string;
  primeHoursLabel: "5–11 PM";
  timeZone: "America/Edmonton";
  opensAt: string | null;
  closesAt: string | null;
  nextTransitionAt: string | null;
  nextTransitionLabel: string;
  actionLimit: number;
}

export interface WarGraphPublicTransition {
  stage: "locking" | "resolving" | "moving" | "complete";
  label: string;
  detail: string;
  startedAt: string | null;
  endsAt: string | null;
}

export interface WarGraphPublicRule {
  id: string;
  label: string;
  detail: string;
}

export interface WarGraphPublicRules {
  summary: string;
  winMovement: string;
  lossMovement: string;
  inactivity: string;
  proofRequirement: string;
  rewardNotice: string;
  entries: ReadonlyArray<WarGraphPublicRule>;
}

export interface WarGraphPublicRing {
  id: string;
  kind: WarGraphRingKind;
  label: string;
  shortLabel: string;
  order: number;
  capacity: number;
  movementSummary: string;
  nodeIds: ReadonlyArray<string>;
}

export interface WarGraphPublicWarriorRecord {
  wins: number;
  losses: number;
  defenses: number;
  streak: number;
}

export interface WarGraphPublicPresenceSignals {
  realmActive: boolean;
  warGraphToday: boolean;
  readyNow: boolean;
  watcherLive: boolean;
  underSiege: boolean;
  nightComplete: boolean;
}

export interface WarGraphPublicFossilization {
  stage: WarGraphFossilizationStage;
  dormantNights: number;
  label: string;
}

export interface WarGraphPublicWatcher {
  state: WarGraphWatcherState;
  label: string;
  connected: boolean;
  monitorAttached: boolean;
  folderReady: boolean;
  lastSeenAt: string | null;
}

export interface WarGraphPublicNode {
  id: string;
  ringId: string;
  seat: number;
  displayName: string;
  avatarUrl: string | null;
  avatarAlt: string;
  subtitle: string | null;
  mapLabel: string | null;
  state: WarGraphWarriorState;
  stateLabel: string;
  isViewer: boolean;
  isCrownHolder: boolean;
  actionsUsed: number;
  actionLimit: number;
  presence: WarGraphPublicPresenceSignals;
  fossilization: WarGraphPublicFossilization;
  record: WarGraphPublicWarriorRecord;
  watcher: WarGraphPublicWatcher;
}

export interface WarGraphPublicCrown {
  title: string;
  holderNodeId: string | null;
  battleRewardWolo: number;
  firstBloodBonusWolo: number;
  firstBloodAvailable: boolean;
  defensesTonight: number;
  actionLimit: number;
  subtitle: string;
}

export interface WarGraphPublicViewerActionState {
  authenticated: boolean;
  participating: boolean;
  nodeId: string | null;
  actionsUsed: number;
  actionLimit: number;
  canAdvance: boolean;
  advanceDisabledReason: string | null;
  canTakeFight: boolean;
  takeFightDisabledReason: string | null;
  eligibleAdvanceIds: ReadonlyArray<string>;
  activeEngagementId: string | null;
  watcher: WarGraphPublicWatcher;
}

export interface WarGraphPublicAdvance {
  id: string;
  requesterNodeId: string;
  fromRingId: string;
  targetRingId: string;
  createdAt: string;
  expiresAt: string;
  eligibleResponderNodeIds: ReadonlyArray<string>;
  winnerRewardWolo: number;
  firstBloodBonusWolo: number;
  label: string;
}

export interface WarGraphPublicEngagement {
  id: string;
  aggressorNodeId: string;
  defenderNodeId: string;
  state: WarGraphEngagementState;
  watcherProof: WarGraphWatcherProofState;
  label: string;
  detail: string;
  createdAt: string;
  expiresAt: string | null;
  isViewerParticipant: boolean;
  viewerRole: "aggressor" | "defender" | null;
  aggressorReady: boolean;
  defenderReady: boolean;
  viewerReady: boolean;
  viewerCanReady: boolean;
  readyDisabledReason: string | null;
  winnerRewardWolo: number;
  firstBloodBonusWolo: number;
  roomHref: string | null;
}

export interface WarGraphPublicHistoryEvent {
  id: string;
  at: string;
  kind:
    | "battle"
    | "movement"
    | "engagement"
    | "default"
    | "gravity"
    | "reward"
    | "void";
  reasonCode: WarGraphHistoryReasonCode;
  reasonLabel: string;
  headline: string;
  detail: string;
  nodeIds: ReadonlyArray<string>;
  woloDelta: number | null;
}

/**
 * The complete, bounded, public read model consumed by the WarGraph UI.
 *
 * All dates are ISO-8601 instants. Ring order is center-out. `recentHistory`
 * must remain server-bounded; this contract is not an event-log export.
 */
export interface WarGraphPublicSnapshot {
  schemaVersion: typeof WARGRAPH_PUBLIC_SCHEMA_VERSION;
  revision: string;
  generatedAt: string;
  phase: WarGraphPhase;
  phaseLabel: string;
  phaseDetail: string;
  night: WarGraphPublicNight;
  transition: WarGraphPublicTransition | null;
  health: WarGraphPublicHealth;
  spectatorCount: number;
  crown: WarGraphPublicCrown;
  rules: WarGraphPublicRules;
  rings: ReadonlyArray<WarGraphPublicRing>;
  nodes: ReadonlyArray<WarGraphPublicNode>;
  viewer: WarGraphPublicViewerActionState;
  openAdvances: ReadonlyArray<WarGraphPublicAdvance>;
  engagements: ReadonlyArray<WarGraphPublicEngagement>;
  recentHistory: ReadonlyArray<WarGraphPublicHistoryEvent>;
}

export interface WarGraphAdvanceResponse {
  ok: boolean;
  message: string;
  snapshot?: WarGraphPublicSnapshot;
}

export type WarGraphActionKind = "advance" | "take_fight" | "ready";

export interface WarGraphPresenceResponse {
  ok: boolean;
  spectatorCount?: number;
  projectionVersion?: number;
  acknowledgedAdvanceIds?: ReadonlyArray<string>;
}
