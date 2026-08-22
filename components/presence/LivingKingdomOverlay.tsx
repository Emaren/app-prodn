"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  livingKingdomRealmHref,
  type LivingKingdomRealmId,
} from "@/lib/livingKingdom/realms";
import {
  depthBandToRatio,
  layoutPresenceActors,
  presenceMaxItemsForViewport,
  presenceSideForId,
} from "./presenceLayout";
import type {
  LivingKingdomActor,
  LivingKingdomFlight,
} from "./livingKingdomTypes";
import styles from "./LivingKingdom.module.css";

type OverlayProps = {
  actors: LivingKingdomActor[];
  selfId: string | null;
  selfVisible: boolean;
  onHideSelf: () => void;
  flights: LivingKingdomFlight[];
  onFlightFinished: (id: string) => void;
  reducedMotion: boolean;
  bandwidthCalm: boolean;
};

type ViewportMode = "phone" | "tablet" | "desktop";

function useViewport() {
  const [viewport, setViewport] = React.useState({
    width: 0,
    height: 0,
    mode: "desktop" as ViewportMode,
  });

  React.useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const width = window.innerWidth;
      setViewport({
        width,
        height: window.innerHeight,
        mode: width < 640 ? "phone" : width < 1024 ? "tablet" : "desktop",
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return viewport;
}

function visibleRect(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
    return null;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return null;
  }
  return rect;
}

function findDoorRect(realmId: LivingKingdomRealmId, origin?: { x: number; y: number }) {
  const exact: Array<{ rect: DOMRect; score: number }> = [];
  const fallback: Array<{ rect: DOMRect; score: number }> = [];
  const defaultOrigin = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  for (const element of document.querySelectorAll<HTMLElement>("[data-presence-door]")) {
    const rect = visibleRect(element);
    if (!rect) continue;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const score = Math.hypot(centerX - defaultOrigin.x, centerY - defaultOrigin.y);
    const entry = { rect, score };
    if (element.dataset.presenceDoor === realmId) exact.push(entry);
    if (element.dataset.presenceDoor === "kingdom") fallback.push(entry);
  }

  const candidates = exact.length ? exact : fallback;
  candidates.sort((left, right) => left.score - right.score);
  if (candidates[0]) return candidates[0].rect;

  return visibleRect(document.querySelector("[data-app-shell-header]") ?? document.body);
}

function findMarkerRect(actorId: string) {
  for (const marker of document.querySelectorAll<HTMLElement>("[data-presence-member-ids]")) {
    if (marker.dataset.presenceMemberIds?.split(" ").includes(actorId)) {
      return visibleRect(marker);
    }
  }
  return null;
}

function centerOf(rect: DOMRect | null, fallback: { x: number; y: number }) {
  if (!rect) return fallback;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function DoorHalo({ flight }: { flight: LivingKingdomFlight }) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const realmId = flight.toRealmId;

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRect(findDoorRect(realmId)));
    return () => window.cancelAnimationFrame(frame);
  }, [realmId, flight.id]);

  if (!rect) return null;
  const haloStyle = {
    width: `${Math.max(42, rect.width + 12)}px`,
    height: `${Math.max(42, rect.height + 12)}px`,
    "--door-x": `${rect.left - 6}px`,
    "--door-y": `${rect.top - 6}px`,
  } as React.CSSProperties;

  return <span aria-hidden="true" className={styles.doorHalo} style={haloStyle} />;
}

function PresenceFlightAvatar({
  flight,
  reducedMotion,
  onFinished,
}: {
  flight: LivingKingdomFlight;
  reducedMotion: boolean;
  onFinished: () => void;
}) {
  const router = useRouter();
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const onFinishedRef = React.useRef(onFinished);

  React.useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let animation: Animation | null = null;
    let finishTimer = 0;
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const markerRect = findMarkerRect(flight.actor.id);
        const fallbackSide = presenceSideForId(flight.actor.id);
        const markerPoint = centerOf(markerRect, {
          x: fallbackSide === "left" ? 22 : window.innerWidth - 22,
          y: 96 + depthBandToRatio(flight.actor.depthBand) * Math.max(0, window.innerHeight - 190),
        });
        const doorRealm = flight.toRealmId;
        const doorPoint = centerOf(findDoorRect(doorRealm, markerPoint), {
          x: window.innerWidth / 2,
          y: 62,
        });
        const start = markerPoint;
        const end = doorPoint;
        const startTransform = `translate3d(${start.x - 17}px, ${start.y - 17}px, 0) scale(1)`;
        const endTransform = `translate3d(${end.x - 17}px, ${end.y - 17}px, 0) scale(0.58)`;

        if (reducedMotion) {
          animation = element.animate(
            [
              { opacity: 0, transform: startTransform },
              { opacity: 1, transform: endTransform },
            ],
            { duration: 140, easing: "linear", fill: "forwards" },
          );
        } else {
          const arc = Math.min(72, Math.max(30, Math.abs(end.x - start.x) * 0.12));
          animation = element.animate(
            [
              { opacity: 0.92, transform: startTransform, offset: 0 },
              {
                opacity: 1,
                transform: `translate3d(${(start.x + end.x) / 2 - 17}px, ${(start.y + end.y) / 2 - arc - 17}px, 0) scale(1.08)`,
                offset: 0.55,
              },
              { opacity: 0.12, transform: endTransform, offset: 1 },
            ],
            {
              duration: 820,
              easing: "cubic-bezier(0.2, 0.82, 0.25, 1)",
              fill: "forwards",
            },
          );
        }

        animation.onfinish = () => onFinishedRef.current();
        finishTimer = window.setTimeout(() => onFinishedRef.current(), reducedMotion ? 260 : 1_050);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(finishTimer);
      animation?.cancel();
    };
  }, [flight, reducedMotion]);

  return (
    <button
      ref={ref}
      type="button"
      className={styles.flight}
      aria-label={`Follow ${flight.actor.displayName} to ${flight.toRealmId}`}
      title={`Follow ${flight.actor.displayName}`}
      onClick={() => router.push(livingKingdomRealmHref(flight.toRealmId))}
    >
      <Image src={flight.actor.avatarUrl} alt="" width={34} height={34} unoptimized draggable={false} />
    </button>
  );
}

function PresenceMarker({
  item,
  y,
  onFocusPosition,
  onActivate,
}: {
  item: ReturnType<typeof layoutPresenceActors>[number];
  y: number;
  onFocusPosition: (key: string | null, y?: number) => void;
  onActivate: () => void;
}) {
  const lead = item.members[0];
  const clustered = item.members.length > 1;
  const moving = item.members.some((member) => member.motion !== "idle");
  const label = clustered
    ? `${item.members.length} warriors near this part of the page`
    : `${lead.displayName}, ${Math.round((lead.depthBand / 20) * 100)}% through this page`;

  return (
    <button
      type="button"
      className={`${styles.marker} ${item.side === "left" ? styles.markerLeft : styles.markerRight} ${
        item.own ? styles.own : ""
      } ${moving ? styles.moving : ""}`}
      style={{ transform: `translate3d(0, ${y}px, 0)` }}
      data-presence-marker-id={lead.id}
      data-presence-member-ids={item.members.map((member) => member.id).join(" ")}
      aria-label={label}
      title={label}
      onClick={onActivate}
      onFocus={() => onFocusPosition(item.key, y)}
      onBlur={() => onFocusPosition(null)}
    >
      {clustered ? (
        <span className={styles.clusterPortraits} aria-hidden="true">
          {item.members.slice(0, 2).map((member) => (
            <span key={member.id} className={styles.clusterPortrait}>
              <Image src={member.avatarUrl} alt="" width={28} height={28} unoptimized draggable={false} />
            </span>
          ))}
          <span className={styles.clusterCount}>+{item.members.length}</span>
        </span>
      ) : (
        <span className={styles.portrait} aria-hidden="true">
          <Image src={lead.avatarUrl} alt="" width={32} height={32} unoptimized draggable={false} />
        </span>
      )}
    </button>
  );
}

export default function LivingKingdomOverlay(props: OverlayProps) {
  const router = useRouter();
  const viewport = useViewport();
  const [focusedMarker, setFocusedMarker] = React.useState<{ key: string; y: number } | null>(null);
  const visibleActors = React.useMemo(
    () => props.actors.filter((actor) => props.selfVisible || actor.id !== props.selfId),
    [props.actors, props.selfId, props.selfVisible],
  );
  const visibleFlights = React.useMemo(
    () => props.flights.filter((flight) => props.selfVisible || flight.actor.id !== props.selfId),
    [props.flights, props.selfId, props.selfVisible],
  );
  const markerSize = viewport.mode === "desktop" ? 32 : 27;
  const railTop = viewport.mode === "desktop" ? 96 : 108;
  const railBottom = viewport.mode === "desktop" ? 72 : 128;
  const maxItems = presenceMaxItemsForViewport({
    height: viewport.height,
    top: railTop,
    bottom: railBottom,
    markerSize,
    gap: 6,
    oneRail: viewport.mode !== "desktop",
    ceiling: viewport.mode === "desktop" ? 24 : 8,
  });
  const layout = React.useMemo(
    () =>
      layoutPresenceActors(visibleActors, {
        height: viewport.height,
        top: railTop,
        bottom: railBottom,
        markerSize,
        gap: 6,
        maxItems,
        oneRail: viewport.mode !== "desktop",
        selfId: props.selfId,
      }),
    [markerSize, maxItems, props.selfId, railBottom, railTop, viewport.height, viewport.mode, visibleActors],
  );
  return (
    <>
      {viewport.mode !== "phone" ? (
        <div className={styles.railRoot} aria-hidden={false}>
          {layout.map((item) => (
            <PresenceMarker
              key={item.key}
              item={item}
              y={focusedMarker?.key === item.key ? focusedMarker.y : item.y}
              onFocusPosition={(key, y) => setFocusedMarker(key && y !== undefined ? { key, y } : null)}
              onActivate={() => {
                if (item.own) {
                  props.onHideSelf();
                } else if (item.members.length === 1) {
                  router.push(item.members[0].href);
                }
              }}
            />
          ))}
        </div>
      ) : null}

      <div className={styles.flightLayer}>
        {!props.bandwidthCalm
          ? visibleFlights.slice(-8).map((flight) => (
              <React.Fragment key={flight.id}>
                <PresenceFlightAvatar
                  flight={flight}
                  reducedMotion={props.reducedMotion}
                  onFinished={() => props.onFlightFinished(flight.id)}
                />
                <DoorHalo flight={flight} />
              </React.Fragment>
            ))
          : null}
      </div>
    </>
  );
}
