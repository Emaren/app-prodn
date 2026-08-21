import type { LivingKingdomRealmId } from "./realms.ts";
import { isLivingKingdomRealmId } from "./realms.ts";

export const LIVING_KINGDOM_PROTOCOL_VERSION = 1 as const;
export const LIVING_KINGDOM_PRESENCE_TTL_MS = 30_000;
export const LIVING_KINGDOM_SSE_HEARTBEAT_MS = 15_000;
export const LIVING_KINGDOM_MAX_BODY_BYTES = 2_048;
export const LIVING_KINGDOM_DEPTH_BANDS = 21;

export const LIVING_KINGDOM_MOTIONS = ["up", "down", "idle"] as const;
export type LivingKingdomMotion = (typeof LIVING_KINGDOM_MOTIONS)[number];

export type LivingKingdomStateMutation = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  kind: "state";
  tabId: string;
  seq: number;
  realmId: LivingKingdomRealmId;
  depthBand: number;
  motion: LivingKingdomMotion;
  visibility: "visible" | "hidden";
};

export type LivingKingdomDoorMutation = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  kind: "door";
  tabId: string;
  seq: number;
  realmId: LivingKingdomRealmId;
  destinationRealmId: LivingKingdomRealmId;
};

export type LivingKingdomPostMutation =
  | LivingKingdomStateMutation
  | LivingKingdomDoorMutation;

export type LivingKingdomDeleteMutation = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  tabId: string;
  seq: number;
};

export type LivingKingdomPublicActor = {
  id: string;
  displayName: string;
  avatarUrl: string;
  realmId: LivingKingdomRealmId;
  href: string;
  depthBand: number;
  motion: LivingKingdomMotion;
};

export type LivingKingdomSnapshotEvent = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  realmId: LivingKingdomRealmId;
  actors: LivingKingdomPublicActor[];
  overflowCount: number;
  selfId?: string;
};

export type LivingKingdomDeltaEvent = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  realmId: LivingKingdomRealmId;
  upserts: LivingKingdomPublicActor[];
  removals: string[];
  overflowCount: number;
};

export type LivingKingdomDoorEvent = {
  protocol: typeof LIVING_KINGDOM_PROTOCOL_VERSION;
  actor: LivingKingdomPublicActor;
  fromRealmId: LivingKingdomRealmId;
  toRealmId: LivingKingdomRealmId;
};

export type LivingKingdomRoomEvent =
  | { kind: "delta"; data: LivingKingdomDeltaEvent }
  | { kind: "door"; data: LivingKingdomDoorEvent };

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const TAB_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MOTION_SET = new Set<string>(LIVING_KINGDOM_MOTIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isTabId(value: unknown): value is string {
  return typeof value === "string" && TAB_ID_PATTERN.test(value);
}

export function parseLivingKingdomPostMutation(
  input: unknown,
): ParseResult<LivingKingdomPostMutation> {
  if (!isRecord(input)) return { ok: false, error: "Body must be an object" };
  if (input.protocol !== LIVING_KINGDOM_PROTOCOL_VERSION) {
    return { ok: false, error: "Unsupported protocol" };
  }
  if (!isTabId(input.tabId)) return { ok: false, error: "Invalid tabId" };
  if (!isSequence(input.seq)) return { ok: false, error: "Invalid seq" };
  if (!isLivingKingdomRealmId(input.realmId)) {
    return { ok: false, error: "Invalid realmId" };
  }

  if (input.kind === "state") {
    const allowed = [
      "protocol",
      "kind",
      "tabId",
      "seq",
      "realmId",
      "depthBand",
      "motion",
      "visibility",
    ] as const;
    if (!hasOnlyKeys(input, allowed)) return { ok: false, error: "Unexpected state field" };
    if (
      !Number.isInteger(input.depthBand) ||
      Number(input.depthBand) < 0 ||
      Number(input.depthBand) >= LIVING_KINGDOM_DEPTH_BANDS
    ) {
      return { ok: false, error: "Invalid depthBand" };
    }
    if (typeof input.motion !== "string" || !MOTION_SET.has(input.motion)) {
      return { ok: false, error: "Invalid motion" };
    }
    if (input.visibility !== "visible" && input.visibility !== "hidden") {
      return { ok: false, error: "Invalid visibility" };
    }
    return { ok: true, value: input as LivingKingdomStateMutation };
  }

  if (input.kind === "door") {
    const allowed = [
      "protocol",
      "kind",
      "tabId",
      "seq",
      "realmId",
      "destinationRealmId",
    ] as const;
    if (!hasOnlyKeys(input, allowed)) return { ok: false, error: "Unexpected door field" };
    if (!isLivingKingdomRealmId(input.destinationRealmId)) {
      return { ok: false, error: "Invalid destinationRealmId" };
    }
    if (input.destinationRealmId === input.realmId) {
      return { ok: false, error: "Door must change realms" };
    }
    return { ok: true, value: input as LivingKingdomDoorMutation };
  }

  return { ok: false, error: "Invalid mutation kind" };
}

export function parseLivingKingdomDeleteMutation(
  input: unknown,
): ParseResult<LivingKingdomDeleteMutation> {
  if (!isRecord(input)) return { ok: false, error: "Body must be an object" };
  if (!hasOnlyKeys(input, ["protocol", "tabId", "seq"])) {
    return { ok: false, error: "Unexpected delete field" };
  }
  if (input.protocol !== LIVING_KINGDOM_PROTOCOL_VERSION) {
    return { ok: false, error: "Unsupported protocol" };
  }
  if (!isTabId(input.tabId)) return { ok: false, error: "Invalid tabId" };
  if (!isSequence(input.seq)) return { ok: false, error: "Invalid seq" };
  return { ok: true, value: input as LivingKingdomDeleteMutation };
}
