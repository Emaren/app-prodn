"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { useUserAuth } from "@/context/UserAuthContext";
import {
  isLivingKingdomRealmId,
  livingKingdomRealmForPath,
  type LivingKingdomRealmId,
} from "@/lib/livingKingdom/realms";
import LivingKingdomOverlay from "./LivingKingdomOverlay";
import type {
  LivingKingdomActor,
  LivingKingdomDelta,
  LivingKingdomDoorEvent,
  LivingKingdomFlight,
  LivingKingdomMotion,
  LivingKingdomPreference,
  LivingKingdomPublishMode,
  LivingKingdomSnapshot,
  LivingKingdomViewerMode,
} from "./livingKingdomTypes";

const VIEWER_MODE_STORAGE_KEY = "aoe2war.livingKingdom.viewerMode.v1";
const STATE_SEND_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;

type ConnectionNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
    addEventListener?: (type: "change", listener: () => void) => void;
    removeEventListener?: (type: "change", listener: () => void) => void;
  };
};

type PendingDoorPublish = {
  controller: AbortController;
  promise: Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeLocalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function parseActor(value: unknown): LivingKingdomActor | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > 160 ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim() ||
    value.displayName.length > 100 ||
    !safeLocalPath(value.avatarUrl) ||
    !safeLocalPath(value.href) ||
    !isLivingKingdomRealmId(value.realmId) ||
    !Number.isInteger(value.depthBand) ||
    Number(value.depthBand) < 0 ||
    Number(value.depthBand) > 20 ||
    (value.motion !== "up" && value.motion !== "down" && value.motion !== "idle")
  ) {
    return null;
  }

  return {
    id: value.id,
    displayName: value.displayName.trim(),
    avatarUrl: value.avatarUrl,
    realmId: value.realmId,
    href: value.href,
    depthBand: Number(value.depthBand),
    motion: value.motion,
  };
}

function parseSnapshot(value: unknown, expectedRealm: LivingKingdomRealmId): LivingKingdomSnapshot | null {
  if (
    !isRecord(value) ||
    value.protocol !== 1 ||
    value.realmId !== expectedRealm ||
    !Array.isArray(value.actors) ||
    !Number.isInteger(value.overflowCount) ||
    Number(value.overflowCount) < 0
  ) {
    return null;
  }
  const actors = value.actors.map(parseActor).filter((actor): actor is LivingKingdomActor => Boolean(actor));
  return {
    protocol: 1,
    realmId: expectedRealm,
    actors,
    overflowCount: Number(value.overflowCount),
    ...(typeof value.selfId === "string" ? { selfId: value.selfId } : {}),
  };
}

function parseDelta(value: unknown, expectedRealm: LivingKingdomRealmId): LivingKingdomDelta | null {
  if (
    !isRecord(value) ||
    value.protocol !== 1 ||
    value.realmId !== expectedRealm ||
    !Array.isArray(value.upserts) ||
    !Array.isArray(value.removals) ||
    !Number.isInteger(value.overflowCount) ||
    Number(value.overflowCount) < 0
  ) {
    return null;
  }
  if (!value.removals.every((id) => typeof id === "string")) return null;
  return {
    protocol: 1,
    realmId: expectedRealm,
    upserts: value.upserts.map(parseActor).filter((actor): actor is LivingKingdomActor => Boolean(actor)),
    removals: value.removals,
    overflowCount: Number(value.overflowCount),
  };
}

function parseDoorEvent(value: unknown): LivingKingdomDoorEvent | null {
  if (
    !isRecord(value) ||
    value.protocol !== 1 ||
    !isLivingKingdomRealmId(value.fromRealmId) ||
    !isLivingKingdomRealmId(value.toRealmId)
  ) {
    return null;
  }
  const actor = parseActor(value.actor);
  return actor
    ? {
        protocol: 1,
        actor,
        fromRealmId: value.fromRealmId,
        toRealmId: value.toRealmId,
      }
    : null;
}

function parsePreference(value: unknown): LivingKingdomPreference | null {
  if (!isRecord(value) || (value.mode !== "off" && value.mode !== "public_coarse")) return null;
  if (
    typeof value.decisionRecorded !== "boolean" ||
    typeof value.featureAllowed !== "boolean" ||
    typeof value.displayEligible !== "boolean" ||
    typeof value.avatarEligible !== "boolean"
  ) return null;
  return {
    mode: value.mode,
    decisionRecorded: value.decisionRecorded,
    featureAllowed: value.featureAllowed,
    displayEligible: value.displayEligible,
    avatarEligible: value.avatarEligible,
    avatarUrl: safeLocalPath(value.avatarUrl) ? value.avatarUrl : null,
    displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : null,
    enabledAt: typeof value.enabledAt === "string" ? value.enabledAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function readViewerMode(): LivingKingdomViewerMode {
  try {
    const stored = window.localStorage.getItem(VIEWER_MODE_STORAGE_KEY);
    if (stored === "full" || stored === "calm" || stored === "off") return stored;
  } catch {
    // Storage may be disabled; the in-memory preference still works.
  }
  return "full";
}

function createTabId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `lk_${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`
    : `lk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 40);
}

function readScrollPosition() {
  const root = document.querySelector<HTMLElement>("[data-presence-scroll-root]");
  if (root) {
    const maximum = Math.max(0, root.scrollHeight - root.clientHeight);
    return {
      target: root as HTMLElement | Window,
      top: root.scrollTop,
      band: maximum ? Math.round((root.scrollTop / maximum) * 20) : 0,
    };
  }
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const top = window.scrollY || scrollingElement.scrollTop;
  const maximum = Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
  return {
    target: window as HTMLElement | Window,
    top,
    band: maximum ? Math.round((top / maximum) * 20) : 0,
  };
}

function eventPayload(event: Event) {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return null;
  }
}

function demoActors(realmId: LivingKingdomRealmId) {
  const names = [
    "Emaren", "Jim", "Julio", "Sniper", "Aethel", "Boudica", "Caesar", "Darius",
    "El Cid", "Freydis", "Genghis", "Hannibal", "Isabella", "Jadwiga", "Khalid",
    "Le Loi", "Montezuma", "Nobunaga", "Olga", "Pyrrhus", "Qutuz", "Ragnar",
    "Saladin", "Tamar", "Urraca", "Vlad", "William", "Zenobia",
  ];
  const avatars = [
    "/champions/players/emaren.thumb.webp",
    "/champions/players/jim.thumb.webp",
    "/champions/players/julio.thumb.webp",
    "/champions/players/sniper.thumb.webp",
    "/champions/players/female_silhouette.thumb.webp",
  ];
  return names.map<LivingKingdomActor>((displayName, index) => ({
    id: `demo-warrior-${String(index).padStart(2, "0")}`,
    displayName,
    avatarUrl: avatars[index % avatars.length],
    realmId,
    href: "/players",
    depthBand: (index * 7 + Math.floor(index / 3)) % 21,
    motion: index % 4 === 0 ? "down" : index % 7 === 0 ? "up" : "idle",
  }));
}

export default function LivingKingdomClient() {
  const pathname = usePathname();
  const { uid } = useUserAuth();
  const realmId = pathname ? livingKingdomRealmForPath(pathname) : null;
  const [viewerMode, setViewerMode] = React.useState<LivingKingdomViewerMode>("full");
  const [actorsById, setActorsById] = React.useState<Map<string, LivingKingdomActor>>(new Map());
  const [selfId, setSelfId] = React.useState<string | null>(null);
  const [overflowCount, setOverflowCount] = React.useState(0);
  const [streamHealthy, setStreamHealthy] = React.useState(false);
  const [pageVisible, setPageVisible] = React.useState(true);
  const [preference, setPreference] = React.useState<LivingKingdomPreference | null>(null);
  const [preferenceSaving, setPreferenceSaving] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [bandwidthCalm, setBandwidthCalm] = React.useState(false);
  const [flights, setFlights] = React.useState<LivingKingdomFlight[]>([]);
  const [arrivingIds, setArrivingIds] = React.useState<Set<string>>(new Set());
  const [demoChecked, setDemoChecked] = React.useState(false);
  const [demoEnabled, setDemoEnabled] = React.useState(false);
  const tabIdRef = React.useRef("");
  const sequenceRef = React.useRef(0);
  const flightSequenceRef = React.useRef(0);
  const publisherBlockedRef = React.useRef(false);
  const doorDepartureRef = React.useRef<{ realmId: LivingKingdomRealmId; markedAt: number } | null>(null);
  const flightDedupeRef = React.useRef<Map<string, number>>(new Map());
  const recentlyRemovedActorsRef = React.useRef<Map<string, { actor: LivingKingdomActor; removedAt: number }>>(new Map());
  const actorsByIdRef = React.useRef<Map<string, LivingKingdomActor>>(new Map());
  const selfIdRef = React.useRef<string | null>(null);
  const pendingDoorPublishRef = React.useRef<PendingDoorPublish | null>(null);

  React.useEffect(() => {
    tabIdRef.current = createTabId();
    setPageVisible(document.visibilityState === "visible");
    const nextDemoEnabled =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("living-kingdom-demo") === "1";
    setViewerMode(nextDemoEnabled ? "full" : readViewerMode());
    setDemoEnabled(nextDemoEnabled);
    setDemoChecked(true);
  }, []);

  React.useEffect(() => {
    actorsByIdRef.current = actorsById;
  }, [actorsById]);

  React.useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  React.useEffect(() => {
    if (!demoChecked) return;
    try {
      window.localStorage.setItem(VIEWER_MODE_STORAGE_KEY, viewerMode);
    } catch {
      // Keep the setting for this page lifetime when storage is unavailable.
    }
  }, [demoChecked, viewerMode]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as ConnectionNavigator).connection;
    const read = () => {
      setReducedMotion(media.matches);
      setBandwidthCalm(connection?.saveData === true);
    };
    read();
    media.addEventListener("change", read);
    connection?.addEventListener?.("change", read);
    return () => {
      media.removeEventListener("change", read);
      connection?.removeEventListener?.("change", read);
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setPreference(null);
    publisherBlockedRef.current = false;
    if (!uid) {
      return () => {
        cancelled = true;
      };
    }

    void fetch("/api/user/presence-preference", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return parsePreference(await response.json().catch(() => null));
      })
      .then((nextPreference) => {
        if (!cancelled) setPreference(nextPreference);
      })
      .catch(() => {
        // Preference and publishing fail closed; ambient viewing remains public.
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const changePublishMode = React.useCallback(async (mode: LivingKingdomPublishMode) => {
    if (preferenceSaving) return;
    setPreferenceSaving(true);
    try {
      const response = await fetch("/api/user/presence-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) return;
      const saved = parsePreference(await response.json().catch(() => null));
      if (saved) {
        publisherBlockedRef.current = false;
        setPreference(saved);
      }
    } catch {
      // Leave the previous privacy choice intact if saving fails.
    } finally {
      setPreferenceSaving(false);
    }
  }, [preferenceSaving]);

  const queueFlight = React.useCallback(
    (
      actor: LivingKingdomActor,
      fromRealmId: LivingKingdomRealmId,
      toRealmId: LivingKingdomRealmId,
      direction: "departure" | "arrival",
    ) => {
      const id = `flight-${Date.now()}-${flightSequenceRef.current++}`;
      setFlights((current) => [
        ...current.slice(-11),
        {
          id,
          actor,
          fromRealmId,
          toRealmId,
          direction,
          createdAt: Date.now(),
        },
      ]);
      window.setTimeout(() => {
        setFlights((current) => current.filter((flight) => flight.id !== id));
      }, 1_300);
      if (direction === "departure") {
        const next = new Map(actorsByIdRef.current);
        next.delete(actor.id);
        actorsByIdRef.current = next;
        setActorsById(next);
      } else {
        setArrivingIds((current) => new Set(current).add(actor.id));
        window.setTimeout(() => {
          setArrivingIds((current) => {
            const next = new Set(current);
            next.delete(actor.id);
            return next;
          });
        }, 1_000);
      }
    },
    [],
  );

  const queueDoorFlight = React.useCallback(
    (door: LivingKingdomDoorEvent, currentRealm: LivingKingdomRealmId) => {
      if (door.fromRealmId !== currentRealm) return;
      const dedupeKey = `${door.actor.id}:${door.fromRealmId}:${door.toRealmId}`;
      const now = Date.now();
      const previous = flightDedupeRef.current.get(dedupeKey) ?? 0;
      if (now - previous < 1_500) return;
      flightDedupeRef.current.set(dedupeKey, now);
      for (const [key, timestamp] of flightDedupeRef.current) {
        if (now - timestamp > 3_000) flightDedupeRef.current.delete(key);
      }
      queueFlight(door.actor, door.fromRealmId, door.toRealmId, "departure");
    },
    [queueFlight],
  );

  const queueArrivalFlight = React.useCallback(
    (actor: LivingKingdomActor, currentRealm: LivingKingdomRealmId) => {
      queueFlight(actor, currentRealm, currentRealm, "arrival");
    },
    [queueFlight],
  );

  React.useEffect(() => {
    if (!demoChecked || demoEnabled || !realmId || viewerMode === "off" || !pageVisible) {
      if (!demoEnabled) {
        setStreamHealthy(false);
        const empty = new Map<string, LivingKingdomActor>();
        actorsByIdRef.current = empty;
        setActorsById(empty);
        setSelfId(null);
        setOverflowCount(0);
      }
      return;
    }

    setStreamHealthy(false);
    const empty = new Map<string, LivingKingdomActor>();
    actorsByIdRef.current = empty;
    setActorsById(empty);
    setSelfId(null);
    setOverflowCount(0);
    const source = new EventSource(`/api/kingdom-presence/events?realm=${encodeURIComponent(realmId)}`);

    const onSnapshot = (event: Event) => {
      const snapshot = parseSnapshot(eventPayload(event), realmId);
      if (!snapshot) return;
      const next = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
      actorsByIdRef.current = next;
      setActorsById(next);
      setSelfId(snapshot.selfId ?? null);
      setOverflowCount(snapshot.overflowCount);
      setStreamHealthy(true);
    };
    const onDelta = (event: Event) => {
      const delta = parseDelta(eventPayload(event), realmId);
      if (!delta) return;
      const now = Date.now();
      for (const [id, removed] of recentlyRemovedActorsRef.current) {
        if (now - removed.removedAt > 3_000) {
          recentlyRemovedActorsRef.current.delete(id);
        }
      }
      const current = actorsByIdRef.current;
      const arrivals = delta.upserts.filter((actor) => !current.has(actor.id));
      const next = new Map(current);
      for (const id of delta.removals) {
        const removed = next.get(id);
        if (removed) recentlyRemovedActorsRef.current.set(id, { actor: removed, removedAt: now });
        next.delete(id);
      }
      for (const actor of delta.upserts) next.set(actor.id, actor);
      actorsByIdRef.current = next;
      setActorsById(next);
      for (const actor of arrivals) queueArrivalFlight(actor, realmId);
      setOverflowCount(delta.overflowCount);
      setStreamHealthy(true);
    };
    const onDoor = (event: Event) => {
      const door = parseDoorEvent(eventPayload(event));
      if (!door) return;
      const removed = recentlyRemovedActorsRef.current.get(door.actor.id);
      queueDoorFlight(
        removed && Date.now() - removed.removedAt < 2_000
          ? { ...door, actor: { ...door.actor, depthBand: removed.actor.depthBand, motion: removed.actor.motion } }
          : door,
        realmId,
      );
      recentlyRemovedActorsRef.current.delete(door.actor.id);
      setStreamHealthy(true);
    };
    const onError = () => {
      setStreamHealthy(false);
      const next = new Map<string, LivingKingdomActor>();
      actorsByIdRef.current = next;
      setActorsById(next);
      setOverflowCount(0);
    };

    source.addEventListener("snapshot", onSnapshot);
    source.addEventListener("delta", onDelta);
    source.addEventListener("door", onDoor);
    source.addEventListener("error", onError);

    return () => {
      source.removeEventListener("snapshot", onSnapshot);
      source.removeEventListener("delta", onDelta);
      source.removeEventListener("door", onDoor);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [demoChecked, demoEnabled, pageVisible, queueArrivalFlight, queueDoorFlight, realmId, viewerMode]);

  const nextSequence = React.useCallback(() => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const publishMutation = React.useCallback(async (
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    if (publisherBlockedRef.current) return null;
    try {
      const response = await fetch("/api/kingdom-presence/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        signal,
        body: JSON.stringify(body),
      });
      if (response.status === 403 || response.status === 404) {
        publisherBlockedRef.current = true;
        return null;
      }
      if (!response.ok) return null;
      const payload = (await response.json().catch(() => null)) as unknown;
      if (isRecord(payload) && typeof payload.selfId === "string") {
        setSelfId(payload.selfId);
      }
      return payload;
    } catch {
      return null;
    }
  }, []);

  const removePublishedPresence = React.useCallback(() => {
    if (!tabIdRef.current || publisherBlockedRef.current) return;
    void fetch("/api/kingdom-presence/state", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({ protocol: 1, tabId: tabIdRef.current, seq: nextSequence() }),
    }).catch(() => undefined);
  }, [nextSequence]);

  React.useEffect(() => {
    const canPublish =
      Boolean(uid) &&
      Boolean(realmId) &&
      pageVisible &&
      demoChecked &&
      !demoEnabled &&
      preference?.mode === "public_coarse" &&
      preference.featureAllowed &&
      preference.displayEligible &&
      preference.avatarEligible &&
      !publisherBlockedRef.current &&
      Boolean(tabIdRef.current);

    if (!canPublish || !realmId) return;

    if (doorDepartureRef.current && doorDepartureRef.current.realmId !== realmId) {
      doorDepartureRef.current = null;
    }

    let frame = 0;
    let trailingTimer = 0;
    let idleTimer = 0;
    let lastTop = readScrollPosition().top;
    let lastBand = -1;
    let lastMotion: LivingKingdomMotion = "idle";
    let lastSentAt = 0;
    let publishReady = pendingDoorPublishRef.current === null;
    let queuedBeforeDoor: { motion: LivingKingdomMotion; force: boolean } | null = null;
    let doorSettlementTimer = 0;
    let cancelled = false;
    const minimumInterval = bandwidthCalm ? 1_000 : STATE_SEND_INTERVAL_MS;

    const sendState = (motion: LivingKingdomMotion, force = false) => {
      if (!publishReady) {
        queuedBeforeDoor = { motion, force: force || queuedBeforeDoor?.force === true };
        return;
      }
      const scroll = readScrollPosition();
      const now = Date.now();
      const changed = scroll.band !== lastBand || motion !== lastMotion;
      if (!force && !changed) return;
      const wait = minimumInterval - (now - lastSentAt);
      if (!force && wait > 0) {
        window.clearTimeout(trailingTimer);
        trailingTimer = window.setTimeout(() => sendState(motion), wait);
        return;
      }
      lastBand = scroll.band;
      lastMotion = motion;
      lastSentAt = now;
      void publishMutation({
        protocol: 1,
        kind: "state",
        tabId: tabIdRef.current,
        seq: nextSequence(),
        realmId,
        depthBand: scroll.band,
        motion,
        visibility: "visible",
      });
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextTop = readScrollPosition().top;
        const delta = nextTop - lastTop;
        lastTop = nextTop;
        const motion: LivingKingdomMotion = delta > 1 ? "down" : delta < -1 ? "up" : "idle";
        sendState(motion);
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => sendState("idle"), 650);
      });
    };

    const scrollTarget = readScrollPosition().target;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    sendState("idle", true);
    const pendingDoor = pendingDoorPublishRef.current;
    if (pendingDoor) {
      doorSettlementTimer = window.setTimeout(() => pendingDoor.controller.abort(), 1_500);
      void pendingDoor.promise.finally(() => {
        window.clearTimeout(doorSettlementTimer);
        if (cancelled) return;
        publishReady = true;
        const queued = queuedBeforeDoor;
        queuedBeforeDoor = null;
        sendState(queued?.motion ?? "idle", true);
      });
    }
    const heartbeat = window.setInterval(() => sendState("idle", true), bandwidthCalm ? 20_000 : HEARTBEAT_INTERVAL_MS);
    const removeUnlessDoorDeparted = () => {
      const departure = doorDepartureRef.current;
      if (
        departure?.realmId === realmId &&
        Date.now() - departure.markedAt < 5_000
      ) {
        return;
      }
      removePublishedPresence();
    };
    const onPageHide = () => removeUnlessDoorDeparted();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(heartbeat);
      window.clearTimeout(trailingTimer);
      window.clearTimeout(idleTimer);
      window.clearTimeout(doorSettlementTimer);
      if (frame) window.cancelAnimationFrame(frame);
      removeUnlessDoorDeparted();
    };
  }, [bandwidthCalm, demoChecked, demoEnabled, nextSequence, pageVisible, preference, publishMutation, realmId, removePublishedPresence, uid]);

  React.useEffect(() => {
    if (
      !realmId ||
      !uid ||
      preference?.mode !== "public_coarse" ||
      !preference.featureAllowed ||
      !preference.displayEligible ||
      !preference.avatarEligible ||
      demoEnabled
    ) {
      return;
    }
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const destinationRealmId = livingKingdomRealmForPath(url.pathname);
      if (!destinationRealmId || destinationRealmId === realmId) return;

      doorDepartureRef.current = { realmId, markedAt: Date.now() };
      const controller = new AbortController();
      const promise = publishMutation({
        protocol: 1,
        kind: "door",
        tabId: tabIdRef.current,
        seq: nextSequence(),
        realmId,
        destinationRealmId,
      }, controller.signal);
      const pendingDoor = { controller, promise } satisfies PendingDoorPublish;
      pendingDoorPublishRef.current = pendingDoor;
      void promise.finally(() => {
        if (pendingDoorPublishRef.current === pendingDoor) {
          pendingDoorPublishRef.current = null;
        }
      });

      const currentSelfId = selfIdRef.current;
      const ownActor = currentSelfId ? actorsByIdRef.current.get(currentSelfId) : null;
      if (ownActor) {
        queueDoorFlight(
          {
            protocol: 1,
            actor: { ...ownActor, realmId: destinationRealmId, href: url.pathname, depthBand: 0, motion: "idle" },
            fromRealmId: realmId,
            toRealmId: destinationRealmId,
          },
          realmId,
        );
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [demoEnabled, nextSequence, preference, publishMutation, queueDoorFlight, realmId, uid]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || !demoChecked || !demoEnabled || !realmId) return;
    setSelfId("demo-warrior-00");
    setStreamHealthy(true);
    setOverflowCount(0);
    const initialActors = new Map(demoActors(realmId).map((actor) => [actor.id, actor]));
    actorsByIdRef.current = initialActors;
    setActorsById(initialActors);
    let tick = 0;
    const interval = window.setInterval(() => {
      tick += 1;
      setActorsById((current) => {
        const next = new Map(current);
        for (const actor of [...next.values()].slice(0, 9)) {
          const direction = (Number(actor.id.slice(-2)) + tick) % 2 === 0 ? 1 : -1;
          next.set(actor.id, {
            ...actor,
            depthBand: Math.max(0, Math.min(20, actor.depthBand + direction)),
            motion: direction > 0 ? "down" : "up",
          });
        }
        actorsByIdRef.current = next;
        return next;
      });
      if (tick % 4 === 0) {
        const actor = demoActors(realmId)[tick % 12];
        const destinationRealmId: LivingKingdomRealmId = realmId === "staking" ? "kingdom" : "staking";
        if (tick % 8 === 0) {
          queueArrivalFlight({ ...actor, realmId, depthBand: 0, motion: "idle" }, realmId);
        } else {
          queueDoorFlight(
            {
              protocol: 1,
              actor: { ...actor, realmId: destinationRealmId, depthBand: 0, motion: "idle" },
              fromRealmId: realmId,
              toRealmId: destinationRealmId,
            },
            realmId,
          );
        }
      }
    }, 1_800);
    return () => window.clearInterval(interval);
  }, [demoChecked, demoEnabled, queueArrivalFlight, queueDoorFlight, realmId]);

  const actors = React.useMemo(
    () => (streamHealthy ? [...actorsById.values()].filter((actor) => actor.realmId === realmId) : []),
    [actorsById, realmId, streamHealthy],
  );
  if (!demoChecked || !realmId) return null;

  return (
    <LivingKingdomOverlay
      actors={actors}
      overflowCount={overflowCount}
      selfId={selfId}
      viewerMode={viewerMode}
      onViewerModeChange={setViewerMode}
      preference={preference}
      preferenceSaving={preferenceSaving}
      onPublishModeChange={(mode) => void changePublishMode(mode)}
      streamHealthy={streamHealthy}
      flights={flights}
      arrivingIds={arrivingIds}
      onFlightFinished={(id) => setFlights((current) => current.filter((flight) => flight.id !== id))}
      reducedMotion={reducedMotion}
      bandwidthCalm={bandwidthCalm}
    />
  );
}
