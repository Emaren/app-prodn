"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gauge, X } from "lucide-react";

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
  LivingKingdomPreference,
  LivingKingdomPublishMode,
  LivingKingdomViewerMode,
} from "./livingKingdomTypes";
import styles from "./LivingKingdom.module.css";

type OverlayProps = {
  actors: LivingKingdomActor[];
  overflowCount: number;
  selfId: string | null;
  viewerMode: LivingKingdomViewerMode;
  onViewerModeChange: (mode: LivingKingdomViewerMode) => void;
  preference: LivingKingdomPreference | null;
  preferenceSaving: boolean;
  onPublishModeChange: (mode: LivingKingdomPublishMode) => void;
  streamHealthy: boolean;
  flights: LivingKingdomFlight[];
  arrivingIds: ReadonlySet<string>;
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
        const start = flight.direction === "departure" ? markerPoint : doorPoint;
        const end = flight.direction === "departure" ? doorPoint : markerPoint;
        const startTransform = `translate3d(${start.x - 17}px, ${start.y - 17}px, 0) scale(${flight.direction === "arrival" ? 0.58 : 1})`;
        const endTransform = `translate3d(${end.x - 17}px, ${end.y - 17}px, 0) scale(${flight.direction === "departure" ? 0.58 : 1})`;

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
              duration: flight.direction === "departure" ? 820 : 680,
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

  const canFollow = flight.direction === "departure";
  return (
    <button
      ref={ref}
      type="button"
      className={styles.flight}
      aria-label={canFollow ? `Follow ${flight.actor.displayName} to ${flight.toRealmId}` : undefined}
      aria-hidden={canFollow ? undefined : true}
      tabIndex={canFollow ? 0 : -1}
      title={canFollow ? `Follow ${flight.actor.displayName}` : undefined}
      onClick={canFollow ? () => router.push(livingKingdomRealmHref(flight.toRealmId)) : undefined}
    >
      <Image src={flight.actor.avatarUrl} alt="" width={34} height={34} unoptimized draggable={false} />
    </button>
  );
}

function PresenceMarker({
  item,
  y,
  arriving,
  onFocusPosition,
  onOpenPeople,
}: {
  item: ReturnType<typeof layoutPresenceActors>[number];
  y: number;
  arriving: boolean;
  onFocusPosition: (key: string | null, y?: number) => void;
  onOpenPeople: () => void;
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
      } ${moving ? styles.moving : ""} ${arriving ? styles.arrival : ""}`}
      style={{ transform: `translate3d(0, ${y}px, 0)` }}
      data-presence-marker-id={lead.id}
      data-presence-member-ids={item.members.map((member) => member.id).join(" ")}
      aria-label={label}
      title={label}
      onClick={onOpenPeople}
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

function PeoplePanel({
  actors,
  overflowCount,
  viewerMode,
  onViewerModeChange,
  preference,
  preferenceSaving,
  onPublishModeChange,
  onClose,
  streamHealthy,
}: Pick<
  OverlayProps,
  | "actors"
  | "overflowCount"
  | "viewerMode"
  | "onViewerModeChange"
  | "preference"
  | "preferenceSaving"
  | "onPublishModeChange"
  | "streamHealthy"
> & { onClose: () => void }) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sortedActors = [...actors].sort(
    (left, right) => left.depthBand - right.depthBand || left.displayName.localeCompare(right.displayName),
  );

  return (
    <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="living-kingdom-panel-title">
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.eyebrow}>Living Kingdom</div>
          <h2 id="living-kingdom-panel-title" className={styles.panelTitle}>People here</h2>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close People Here">
          <X size={16} />
        </button>
      </div>

      <div className={styles.modeGroup} role="radiogroup" aria-label="Living Kingdom display">
        {(["full", "calm", "off"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={viewerMode === mode}
            className={`${styles.modeButton} ${viewerMode === mode ? styles.modeButtonActive : ""}`}
            onClick={() => onViewerModeChange(mode)}
          >
            {mode === "full" ? "Full" : mode === "calm" ? "Calm" : "Off"}
          </button>
        ))}
      </div>

      {viewerMode === "off" ? (
        <div className={styles.emptyState}>Roaming avatars are hidden on this device. Your avatar setting is below.</div>
      ) : sortedActors.length ? (
        <div className={styles.peopleList} aria-label="Warriors on this page">
          {sortedActors.slice(0, 80).map((actor) => (
            <a key={actor.id} href={actor.href} className={styles.personLink}>
              <span className={styles.panelAvatar} aria-hidden="true">
                <Image src={actor.avatarUrl} alt="" width={34} height={34} unoptimized loading="lazy" draggable={false} />
              </span>
              <span className={styles.personMeta}>
                <span className={styles.personName}>{actor.displayName}</span>
                <span className={styles.personDepth}>{Math.round((actor.depthBand / 20) * 100)}% through this page</span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          {streamHealthy ? "No warriors are roaming this page yet." : "The kingdom is quiet right now."}
        </div>
      )}

      {overflowCount > 0 && viewerMode !== "off" ? (
        <div className={styles.overflowNote}>+{overflowCount} more warriors beyond the visible muster</div>
      ) : null}

      {preference?.featureAllowed ? (
        <div className={styles.sharingControl}>
          <div className={styles.sharingCopy}>
            <strong>
              {preference.displayEligible && preference.avatarEligible
                ? "My roaming avatar"
                : preference.avatarEligible
                  ? "Public name required"
                  : "Avatar required"}
            </strong>
            <span>
              {preference.displayEligible && preference.avatarEligible
                ? preference.mode === "public_coarse"
                  ? "Visible in the Living Kingdom"
                  : "Hidden from the Living Kingdom"
                : "Complete your public profile to join"}
            </span>
          </div>
          {preference.displayEligible && preference.avatarEligible ? (
            <button
              type="button"
              className={styles.shareButton}
              disabled={preferenceSaving}
              aria-pressed={preference.mode === "public_coarse"}
              aria-label={`My roaming avatar: ${preference.mode === "public_coarse" ? "On" : "Off"}`}
              onClick={() =>
                onPublishModeChange(preference.mode === "public_coarse" ? "off" : "public_coarse")
              }
            >
              {preference.mode === "public_coarse" ? "On" : "Off"}
            </button>
          ) : (
            <a href="/profile" className={styles.shareButton}>Profile</a>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function LivingKingdomOverlay(props: OverlayProps) {
  const viewport = useViewport();
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [focusedMarker, setFocusedMarker] = React.useState<{ key: string; y: number } | null>(null);
  const effectiveCalm = props.viewerMode === "calm" || props.bandwidthCalm;
  const visibleActors = React.useMemo(
    () =>
      effectiveCalm
        ? props.actors.filter((actor) => actor.motion !== "idle").slice(0, 8)
        : props.actors,
    [effectiveCalm, props.actors],
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
  const count = props.viewerMode === "off" ? 0 : props.actors.length + props.overflowCount;
  const previewActors = props.actors.slice(0, 3);

  return (
    <>
      {props.viewerMode !== "off" && viewport.mode !== "phone" ? (
        <div className={styles.railRoot} aria-hidden={false}>
          {layout.map((item) => (
            <PresenceMarker
              key={item.key}
              item={item}
              y={focusedMarker?.key === item.key ? focusedMarker.y : item.y}
              arriving={item.members.some((member) => props.arrivingIds.has(member.id))}
              onFocusPosition={(key, y) => setFocusedMarker(key && y !== undefined ? { key, y } : null)}
              onOpenPeople={() => setPanelOpen(true)}
            />
          ))}
        </div>
      ) : null}

      <div className={styles.flightLayer}>
        {props.viewerMode === "full" && !props.bandwidthCalm
          ? props.flights.slice(-8).map((flight) => (
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

      <button
        type="button"
        className={styles.roamingButton}
        aria-expanded={panelOpen}
        aria-controls="living-kingdom-people-panel"
        onClick={() => setPanelOpen((open) => !open)}
      >
        {previewActors.length ? (
          <span className={styles.roamingFaces} aria-hidden="true">
            {previewActors.map((actor) => (
              <span key={actor.id} className={styles.roamingFace}>
                <Image src={actor.avatarUrl} alt="" width={25} height={25} unoptimized draggable={false} />
              </span>
            ))}
          </span>
        ) : props.viewerMode === "off" ? (
          <EyeOff size={15} color="#94a3b8" aria-hidden="true" />
        ) : effectiveCalm ? (
          <Gauge size={15} color="#fde68a" aria-hidden="true" />
        ) : (
          <Eye size={15} color="#fde68a" aria-hidden="true" />
        )}
        <span>{props.viewerMode === "off" ? "Kingdom quiet" : `${count} ${count === 1 ? "warrior" : "warriors"} roaming`}</span>
      </button>

      {panelOpen ? (
        <div id="living-kingdom-people-panel">
          <PeoplePanel
            actors={props.actors}
            overflowCount={props.overflowCount}
            viewerMode={props.viewerMode}
            onViewerModeChange={props.onViewerModeChange}
            preference={props.preference}
            preferenceSaving={props.preferenceSaving}
            onPublishModeChange={props.onPublishModeChange}
            onClose={() => setPanelOpen(false)}
            streamHealthy={props.streamHealthy}
          />
        </div>
      ) : null}
    </>
  );
}
