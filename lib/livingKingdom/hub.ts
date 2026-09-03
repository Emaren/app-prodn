import {
  LIVING_KINGDOM_PRESENCE_TTL_MS,
  LIVING_KINGDOM_PROTOCOL_VERSION,
  type LivingKingdomDoorEvent,
  type LivingKingdomDoorMutation,
  type LivingKingdomPublicActor,
  type LivingKingdomRoomEvent,
  type LivingKingdomStateMutation,
} from "./protocol.ts";
import {
  livingKingdomActorIdIsAnonymous,
  LIVING_KINGDOM_ANONYMOUS_UID_PREFIX,
} from "./anonymous.ts";
import {
  LIVING_KINGDOM_REALMS,
  livingKingdomRealmHref,
  type LivingKingdomRealmId,
} from "./realms.ts";

export const LIVING_KINGDOM_MAX_ACTORS = 500;
export const LIVING_KINGDOM_MAX_ANONYMOUS_ACTORS = 400;
export const LIVING_KINGDOM_MAX_TABS_PER_ACTOR = 3;
export const LIVING_KINGDOM_MAX_SEQUENCE_FENCES_PER_ACTOR = 12;
export const LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM = 64;
export const LIVING_KINGDOM_DELTA_COALESCE_MS = 150;
export const LIVING_KINGDOM_DEFAULT_MAX_SUBSCRIBERS = 250;
export const LIVING_KINGDOM_ABSOLUTE_MAX_SUBSCRIBERS = 1_000;

export function livingKingdomSubscriberCap(raw = process.env.LIVING_KINGDOM_MAX_SUBSCRIBERS) {
  if (!raw || !/^\d+$/.test(raw.trim())) return LIVING_KINGDOM_DEFAULT_MAX_SUBSCRIBERS;
  return Math.max(1, Math.min(LIVING_KINGDOM_ABSOLUTE_MAX_SUBSCRIBERS, Number(raw)));
}

export type LivingKingdomHubIdentity = {
  uid: string;
  publicId: string;
  displayName: string;
  avatarUrl: string;
};

type TabEntry = {
  tabId: string;
  seq: number;
  realmId: LivingKingdomRealmId;
  depthBand: number;
  motion: LivingKingdomStateMutation["motion"];
  visibility: LivingKingdomStateMutation["visibility"];
  activityAtMs: number;
  lastSeenMs: number;
  identity: LivingKingdomHubIdentity;
};

type SequenceFence = {
  seq: number;
  touchedAtMs: number;
};

type ActorEntry = {
  tabs: Map<string, TabEntry>;
  sequences: Map<string, SequenceFence>;
  touchedAtMs: number;
};

type LivingKingdomMetrics = {
  accepted: number;
  rateLimited: number;
  invalid: number;
  expired: number;
  dropped: number;
};

type HubOptions = {
  ttlMs?: number;
  maxActors?: number;
  maxTabsPerActor?: number;
  maxSequenceFencesPerActor?: number;
  maxSubscribers?: number;
  deltaCoalesceMs?: number;
};

type PendingDelta = {
  upserts: Map<string, LivingKingdomPublicActor>;
  removals: Set<string>;
};

export type LivingKingdomMutationResult =
  | { accepted: true; selfId: string | null }
  | { accepted: false; reason: "stale" | "missing" | "capacity" };

export type LivingKingdomHubStats = LivingKingdomMetrics & {
  activeActors: number;
  tabs: number;
  realms: Record<string, number>;
  subscribers: number;
  caps: {
    actors: number;
    tabsPerActor: number;
    sequenceFencesPerActor: number;
    publicActorsPerRealm: number;
    subscribers: number;
    ttlMs: number;
  };
};

export type LivingKingdomRoomFanoutSnapshot = {
  actors: LivingKingdomPublicActor[];
  overflowCount: number;
  selfId?: string;
};

export type LivingKingdomRoomFanoutView = {
  snapshotForUid: (uid?: string | null) => LivingKingdomRoomFanoutSnapshot;
};

type RoomListener = (event: LivingKingdomRoomEvent) => void;

function publicActorsEqual(
  left: LivingKingdomPublicActor | null,
  right: LivingKingdomPublicActor | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.displayName === right.displayName &&
    left.avatarUrl === right.avatarUrl &&
    left.realmId === right.realmId &&
    left.href === right.href &&
    left.depthBand === right.depthBand &&
    left.motion === right.motion
  );
}

function publicActorOrder(
  left: LivingKingdomPublicActor,
  right: LivingKingdomPublicActor,
) {
  const anonymousDelta =
    Number(livingKingdomActorIdIsAnonymous(left.id)) -
    Number(livingKingdomActorIdIsAnonymous(right.id));
  if (anonymousDelta !== 0) return anonymousDelta;
  return left.id.localeCompare(right.id);
}


export class LivingKingdomHub {
  private readonly actors = new Map<string, ActorEntry>();
  private readonly subscribers = new Map<LivingKingdomRealmId, Set<RoomListener>>();
  private readonly pendingDeltas = new Map<LivingKingdomRealmId, PendingDelta>();
  private readonly deltaTimers = new Map<LivingKingdomRealmId, ReturnType<typeof setTimeout>>();
  private readonly metrics: LivingKingdomMetrics = {
    accepted: 0,
    rateLimited: 0,
    invalid: 0,
    expired: 0,
    dropped: 0,
  };
  private lastPruneMs = Number.NEGATIVE_INFINITY;
  private readonly ttlMs: number;
  private readonly maxActors: number;
  private readonly maxTabsPerActor: number;
  private readonly maxSequenceFencesPerActor: number;
  private readonly maxSubscribers: number;
  private readonly deltaCoalesceMs: number;

  constructor(options: HubOptions = {}) {
    this.ttlMs = options.ttlMs ?? LIVING_KINGDOM_PRESENCE_TTL_MS;
    this.maxActors = options.maxActors ?? LIVING_KINGDOM_MAX_ACTORS;
    this.maxTabsPerActor = options.maxTabsPerActor ?? LIVING_KINGDOM_MAX_TABS_PER_ACTOR;
    this.maxSequenceFencesPerActor =
      options.maxSequenceFencesPerActor ?? LIVING_KINGDOM_MAX_SEQUENCE_FENCES_PER_ACTOR;
    this.maxSubscribers = options.maxSubscribers ?? livingKingdomSubscriberCap();
    this.deltaCoalesceMs = options.deltaCoalesceMs ?? LIVING_KINGDOM_DELTA_COALESCE_MS;
  }

  upsert(
    identity: LivingKingdomHubIdentity,
    mutation: LivingKingdomStateMutation,
    nowMs = Date.now(),
  ): LivingKingdomMutationResult {
    this.pruneMaybe(nowMs);
    let actor = this.actors.get(identity.uid);

    if (!actor) {
      const anonymous = identity.uid.startsWith(LIVING_KINGDOM_ANONYMOUS_UID_PREFIX);
      if (anonymous && this.anonymousActorCount() >= LIVING_KINGDOM_MAX_ANONYMOUS_ACTORS) {
        this.evictOldestAnonymousActor(nowMs);
      }
      if (this.actors.size >= this.maxActors) {
        const evictedAnonymous = this.evictOldestAnonymousActor(nowMs);
        if (!evictedAnonymous && anonymous) {
          this.metrics.dropped += 1;
          return { accepted: false, reason: "capacity" };
        }
        if (!evictedAnonymous) this.evictOldestActor(nowMs);
      }
      actor = { tabs: new Map(), sequences: new Map(), touchedAtMs: nowMs };
      this.actors.set(identity.uid, actor);
    }

    const fence = actor.sequences.get(mutation.tabId);
    if (fence && mutation.seq <= fence.seq) return { accepted: false, reason: "stale" };

    const previousTab = actor.tabs.get(mutation.tabId);
    if (
      !previousTab &&
      actor.tabs.size >= this.maxTabsPerActor &&
      mutation.renewOnly === true
    ) {
      // A lease-only tick from an already-evicted background tab must not
      // evict another static tab or steal the actor's active realm. A real
      // mount/focus/pageshow update may still reclaim a bounded slot.
      return { accepted: false, reason: "missing" };
    }

    const previous = this.project(actor, nowMs);
    if (!actor.tabs.has(mutation.tabId) && actor.tabs.size >= this.maxTabsPerActor) {
      this.evictOldestTab(actor);
    }

    actor.tabs.set(mutation.tabId, {
      tabId: mutation.tabId,
      seq: mutation.seq,
      realmId: mutation.realmId,
      depthBand: mutation.depthBand,
      motion: mutation.motion,
      visibility: mutation.visibility,
      // Interval heartbeats may normalize an old motion sample back to idle,
      // but they renew only the lease. Mount, focus, pageshow, and scroll send
      // ordinary state and therefore reclaim the actor's active projection.
      activityAtMs:
        previousTab && mutation.renewOnly === true
          ? previousTab.activityAtMs
          : nowMs,
      lastSeenMs: nowMs,
      identity,
    });
    this.setSequenceFence(actor, mutation.tabId, mutation.seq, nowMs);
    actor.touchedAtMs = nowMs;

    const next = this.project(actor, nowMs);
    this.publishProjectionChange(previous, next);
    this.metrics.accepted += 1;
    return { accepted: true, selfId: next?.id ?? null };
  }

  door(
    identity: LivingKingdomHubIdentity,
    mutation: LivingKingdomDoorMutation,
    nowMs = Date.now(),
  ): LivingKingdomMutationResult {
    this.pruneMaybe(nowMs);
    const actor = this.actors.get(identity.uid);
    if (!actor) return { accepted: false, reason: "missing" };

    const fence = actor.sequences.get(mutation.tabId);
    if (fence && mutation.seq <= fence.seq) return { accepted: false, reason: "stale" };
    const tab = actor.tabs.get(mutation.tabId);
    if (!tab || tab.realmId !== mutation.realmId) return { accepted: false, reason: "missing" };

    const previous = this.project(actor, nowMs);
    actor.tabs.delete(mutation.tabId);
    this.setSequenceFence(actor, mutation.tabId, mutation.seq, nowMs);
    actor.touchedAtMs = nowMs;
    const next = this.project(actor, nowMs);
    this.publishProjectionChange(previous, next);

    const travelingActor: LivingKingdomPublicActor = {
      id: identity.publicId,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      realmId: mutation.destinationRealmId,
      href: livingKingdomRealmHref(mutation.destinationRealmId),
      depthBand: 0,
      motion: "idle",
    };
    const doorEvent: LivingKingdomDoorEvent = {
      protocol: LIVING_KINGDOM_PROTOCOL_VERSION,
      actor: travelingActor,
      fromRealmId: mutation.realmId,
      toRealmId: mutation.destinationRealmId,
    };
    this.publish(mutation.realmId, { kind: "door", data: doorEvent });

    this.metrics.accepted += 1;
    return { accepted: true, selfId: next?.id ?? identity.publicId };
  }

  removeTab(
    uid: string,
    tabId: string,
    seq: number,
    nowMs = Date.now(),
  ): LivingKingdomMutationResult {
    this.pruneMaybe(nowMs);
    let actor = this.actors.get(uid);
    if (!actor) {
      // pagehide can beat the initial state POST while that POST is awaiting
      // identity. Keep a bounded, expiring sequence tombstone so the older
      // publish cannot create a 90-second ghost after the document is gone.
      // Anonymous cleanup is never allowed to evict a signed-in warrior merely
      // to create that tombstone, and anonymous tombstones share the same cap
      // as live anonymous actors.
      const anonymous = uid.startsWith(LIVING_KINGDOM_ANONYMOUS_UID_PREFIX);
      if (
        anonymous &&
        this.anonymousActorCount() >= LIVING_KINGDOM_MAX_ANONYMOUS_ACTORS
      ) {
        this.evictOldestAnonymousActor(nowMs);
      }
      if (this.actors.size >= this.maxActors) {
        const evictedAnonymous = this.evictOldestAnonymousActor(nowMs);
        if (!evictedAnonymous && anonymous) {
          this.metrics.dropped += 1;
          return { accepted: false, reason: "capacity" };
        }
        if (!evictedAnonymous) this.evictOldestActor(nowMs);
      }
      actor = { tabs: new Map(), sequences: new Map(), touchedAtMs: nowMs };
      this.actors.set(uid, actor);
    }

    const fence = actor.sequences.get(tabId);
    if (fence && seq <= fence.seq) return { accepted: false, reason: "stale" };

    const previous = this.project(actor, nowMs);
    actor.tabs.delete(tabId);
    this.setSequenceFence(actor, tabId, seq, nowMs);
    actor.touchedAtMs = nowMs;
    const next = this.project(actor, nowMs);
    this.publishProjectionChange(previous, next);
    this.metrics.accepted += 1;
    return { accepted: true, selfId: next?.id ?? null };
  }

  removeUser(uid: string, nowMs = Date.now()) {
    this.pruneMaybe(nowMs);
    const actor = this.actors.get(uid);
    if (!actor) return;
    const previous = this.project(actor, nowMs);
    this.actors.delete(uid);
    this.publishProjectionChange(previous, null);
  }

  roomSnapshot(
    realmId: LivingKingdomRealmId,
    nowMs = Date.now(),
    preferredId?: string | null,
  ) {
    this.prune(nowMs);
    const allActors = this.collectRoomActors(realmId, nowMs);
    const actors = allActors.slice(0, LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM);

    if (preferredId && !actors.some((actor) => actor.id === preferredId)) {
      const preferred = allActors.find((actor) => actor.id === preferredId);
      if (preferred) {
        if (actors.length >= LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM) actors.pop();
        actors.push(preferred);
        actors.sort(publicActorOrder);
      }
    }

    return {
      actors,
      overflowCount: Math.max(0, allActors.length - actors.length),
    };
  }

  /**
   * Materialize one immutable public room view for a synchronous SSE fanout.
   * Every listener receives the same hub event object, so the route can share
   * this view while still deriving its signed viewer's optional self marker.
   */
  createRoomFanoutView(
    realmId: LivingKingdomRealmId,
    nowMs = Date.now(),
  ): LivingKingdomRoomFanoutView {
    this.prune(nowMs);
    const allActors: LivingKingdomPublicActor[] = [];
    const actorsByUid = new Map<string, LivingKingdomPublicActor>();

    for (const [uid, actor] of this.actors) {
      const projection = this.project(actor, nowMs, false);
      if (projection?.realmId !== realmId) continue;
      allActors.push(projection);
      actorsByUid.set(uid, projection);
    }
    allActors.sort(publicActorOrder);

    const baseActors = allActors.slice(0, LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM);
    const overflowCount = Math.max(0, allActors.length - baseActors.length);

    return {
      snapshotForUid: (uid?: string | null) => {
        const self = uid ? actorsByUid.get(uid) : null;
        if (!self) return { actors: baseActors, overflowCount };
        if (baseActors.some((actor) => actor.id === self.id)) {
          return { actors: baseActors, overflowCount, selfId: self.id };
        }

        const actors =
          baseActors.length >= LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM
            ? [...baseActors.slice(0, -1), self]
            : [...baseActors, self];
        return { actors, overflowCount, selfId: self.id };
      },
    };
  }

  snapshot(realmId: LivingKingdomRealmId, nowMs = Date.now(), preferredId?: string | null) {
    return this.roomSnapshot(realmId, nowMs, preferredId).actors;
  }

  publicProjectionForUid(uid: string, nowMs = Date.now()) {
    this.prune(nowMs);
    const actor = this.actors.get(uid);
    return actor ? this.project(actor, nowMs) : null;
  }

  subscribe(realmId: LivingKingdomRealmId, listener: RoomListener) {
    if (this.subscriberCount() >= this.maxSubscribers) return null;
    const room = this.subscribers.get(realmId) ?? new Set<RoomListener>();
    room.add(listener);
    this.subscribers.set(realmId, room);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      room.delete(listener);
      if (room.size === 0) this.subscribers.delete(realmId);
    };
  }

  recordInvalid() {
    this.metrics.invalid += 1;
  }

  recordRateLimited() {
    this.metrics.rateLimited += 1;
  }

  recordDropped(count = 1) {
    this.metrics.dropped += Math.max(1, Math.floor(count));
  }

  stats(nowMs = Date.now()): LivingKingdomHubStats {
    this.prune(nowMs);
    const realms: Record<string, number> = Object.fromEntries(
      LIVING_KINGDOM_REALMS.map((realm) => [realm.id, 0]),
    );
    let tabs = 0;
    let activeActors = 0;

    for (const actor of this.actors.values()) {
      tabs += actor.tabs.size;
      const projection = this.project(actor, nowMs);
      if (projection) {
        activeActors += 1;
        realms[projection.realmId] = (realms[projection.realmId] ?? 0) + 1;
      }
    }

    return {
      ...this.metrics,
      activeActors,
      tabs,
      realms,
      subscribers: this.subscriberCount(),
      caps: {
        actors: this.maxActors,
        tabsPerActor: this.maxTabsPerActor,
        sequenceFencesPerActor: this.maxSequenceFencesPerActor,
        publicActorsPerRealm: LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM,
        subscribers: this.maxSubscribers,
        ttlMs: this.ttlMs,
      },
    };
  }

  resetForTests() {
    this.actors.clear();
    this.subscribers.clear();
    this.pendingDeltas.clear();
    for (const timer of this.deltaTimers.values()) clearTimeout(timer);
    this.deltaTimers.clear();
    this.lastPruneMs = Number.NEGATIVE_INFINITY;
    for (const key of Object.keys(this.metrics) as Array<keyof LivingKingdomMetrics>) {
      this.metrics[key] = 0;
    }
  }

  prune(nowMs = Date.now()) {
    this.lastPruneMs = nowMs;
    for (const [uid, actor] of this.actors) {
      const previous = this.project(actor, nowMs, false);

      for (const [tabId, tab] of actor.tabs) {
        if (nowMs - tab.lastSeenMs >= this.ttlMs) {
          actor.tabs.delete(tabId);
          this.metrics.expired += 1;
        }
      }
      for (const [tabId, fence] of actor.sequences) {
        if (nowMs - fence.touchedAtMs >= this.ttlMs) actor.sequences.delete(tabId);
      }

      const next = this.project(actor, nowMs, false);
      this.publishProjectionChange(previous, next);
      if (actor.tabs.size === 0 && actor.sequences.size === 0) this.actors.delete(uid);
    }
  }

  private project(actor: ActorEntry, nowMs: number, enforceTtl = true) {
    let selected: TabEntry | null = null;
    for (const tab of actor.tabs.values()) {
      if (enforceTtl && nowMs - tab.lastSeenMs >= this.ttlMs) continue;
      if (tab.visibility !== "visible") continue;
      if (
        !selected ||
        tab.activityAtMs > selected.activityAtMs ||
        (tab.activityAtMs === selected.activityAtMs && tab.lastSeenMs > selected.lastSeenMs) ||
        (tab.activityAtMs === selected.activityAtMs &&
          tab.lastSeenMs === selected.lastSeenMs &&
          tab.tabId > selected.tabId)
      ) {
        selected = tab;
      }
    }
    if (!selected) return null;
    return {
      id: selected.identity.publicId,
      displayName: selected.identity.displayName,
      avatarUrl: selected.identity.avatarUrl,
      realmId: selected.realmId,
      href: livingKingdomRealmHref(selected.realmId),
      depthBand: selected.depthBand,
      motion: selected.motion,
    } satisfies LivingKingdomPublicActor;
  }

  private publishProjectionChange(
    previous: LivingKingdomPublicActor | null,
    next: LivingKingdomPublicActor | null,
  ) {
    if (publicActorsEqual(previous, next)) return;
    if (previous && (!next || previous.realmId !== next.realmId)) {
      this.queueDelta(previous.realmId, null, previous.id);
    }
    if (next) {
      this.queueDelta(next.realmId, next, null);
    }
  }

  private queueDelta(
    realmId: LivingKingdomRealmId,
    upsert: LivingKingdomPublicActor | null,
    removalId: string | null,
  ) {
    const pending = this.pendingDeltas.get(realmId) ?? {
      upserts: new Map<string, LivingKingdomPublicActor>(),
      removals: new Set<string>(),
    };
    if (removalId) {
      pending.upserts.delete(removalId);
      pending.removals.add(removalId);
    }
    if (upsert) {
      pending.removals.delete(upsert.id);
      pending.upserts.set(upsert.id, upsert);
    }
    this.pendingDeltas.set(realmId, pending);

    if (this.deltaTimers.has(realmId)) return;
    if (this.deltaCoalesceMs <= 0) {
      this.flushDelta(realmId);
      return;
    }
    const timer = setTimeout(() => this.flushDelta(realmId), this.deltaCoalesceMs);
    timer.unref?.();
    this.deltaTimers.set(realmId, timer);
  }

  private flushDelta(realmId: LivingKingdomRealmId) {
    const timer = this.deltaTimers.get(realmId);
    if (timer) clearTimeout(timer);
    this.deltaTimers.delete(realmId);
    const pending = this.pendingDeltas.get(realmId);
    if (!pending) return;
    this.pendingDeltas.delete(realmId);

    const upserts = Array.from(pending.upserts.values()).sort(publicActorOrder);
    const removals = Array.from(pending.removals).sort();
    const overflowedEvents =
      Math.max(0, upserts.length - LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM) +
      Math.max(0, removals.length - LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM);
    if (overflowedEvents) this.metrics.dropped += overflowedEvents;

    const room = this.collectRoomActors(realmId, Date.now(), false);
    this.publish(realmId, {
      kind: "delta",
      data: {
        protocol: LIVING_KINGDOM_PROTOCOL_VERSION,
        realmId,
        upserts: upserts.slice(0, LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM),
        removals: removals.slice(0, LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM),
        overflowCount: Math.max(
          0,
          room.length - LIVING_KINGDOM_MAX_PUBLIC_ACTORS_PER_REALM,
        ),
      },
    });
  }

  private publish(realmId: LivingKingdomRealmId, event: LivingKingdomRoomEvent) {
    const room = this.subscribers.get(realmId);
    if (!room) return;
    for (const listener of room) {
      try {
        listener(event);
      } catch {
        this.metrics.dropped += 1;
      }
    }
  }

  private collectRoomActors(
    realmId: LivingKingdomRealmId,
    nowMs: number,
    enforceTtl = true,
  ) {
    const actors: LivingKingdomPublicActor[] = [];
    for (const actor of this.actors.values()) {
      const projection = this.project(actor, nowMs, enforceTtl);
      if (projection?.realmId === realmId) actors.push(projection);
    }
    return actors.sort(publicActorOrder);
  }

  private anonymousActorCount() {
    let count = 0;
    for (const uid of this.actors.keys()) {
      if (uid.startsWith(LIVING_KINGDOM_ANONYMOUS_UID_PREFIX)) count += 1;
    }
    return count;
  }

  private evictOldestAnonymousActor(nowMs: number) {
    let oldestUid: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [uid, actor] of this.actors) {
      if (!uid.startsWith(LIVING_KINGDOM_ANONYMOUS_UID_PREFIX)) continue;
      if (actor.touchedAtMs < oldestAt) {
        oldestUid = uid;
        oldestAt = actor.touchedAtMs;
      }
    }
    if (!oldestUid) return false;
    const actor = this.actors.get(oldestUid);
    const previous = actor ? this.project(actor, nowMs) : null;
    this.actors.delete(oldestUid);
    this.publishProjectionChange(previous, null);
    this.metrics.dropped += 1;
    return true;
  }

  private evictOldestActor(nowMs: number) {
    let oldestUid: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [uid, actor] of this.actors) {
      if (actor.touchedAtMs < oldestAt) {
        oldestUid = uid;
        oldestAt = actor.touchedAtMs;
      }
    }
    if (!oldestUid) return;
    const actor = this.actors.get(oldestUid);
    const previous = actor ? this.project(actor, nowMs) : null;
    this.actors.delete(oldestUid);
    this.publishProjectionChange(previous, null);
    this.metrics.dropped += 1;
  }

  private evictOldestTab(actor: ActorEntry) {
    let oldestTabId: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [tabId, tab] of actor.tabs) {
      if (tab.lastSeenMs < oldestAt) {
        oldestTabId = tabId;
        oldestAt = tab.lastSeenMs;
      }
    }
    if (oldestTabId) {
      actor.tabs.delete(oldestTabId);
      this.metrics.dropped += 1;
    }
  }

  private setSequenceFence(actor: ActorEntry, tabId: string, seq: number, nowMs: number) {
    if (!actor.sequences.has(tabId) && actor.sequences.size >= this.maxSequenceFencesPerActor) {
      let oldestTabId: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [candidateTabId, fence] of actor.sequences) {
        if (fence.touchedAtMs < oldestAt) {
          oldestTabId = candidateTabId;
          oldestAt = fence.touchedAtMs;
        }
      }
      if (oldestTabId) actor.sequences.delete(oldestTabId);
    }
    actor.sequences.set(tabId, { seq, touchedAtMs: nowMs });
  }

  private subscriberCount() {
    let count = 0;
    for (const room of this.subscribers.values()) count += room.size;
    return count;
  }

  private pruneMaybe(nowMs: number) {
    if (nowMs < this.lastPruneMs || nowMs - this.lastPruneMs >= 1_000) {
      this.prune(nowMs);
    }
  }
}

type GlobalWithLivingKingdomHub = typeof globalThis & {
  __livingKingdomHub?: LivingKingdomHub;
  __livingKingdomSweepTimer?: ReturnType<typeof setInterval>;
};

const hubGlobal = globalThis as GlobalWithLivingKingdomHub;

export const livingKingdomHub = hubGlobal.__livingKingdomHub ?? new LivingKingdomHub();
hubGlobal.__livingKingdomHub = livingKingdomHub;

if (!hubGlobal.__livingKingdomSweepTimer) {
  const timer = setInterval(() => livingKingdomHub.prune(), 5_000);
  timer.unref?.();
  hubGlobal.__livingKingdomSweepTimer = timer;
}
