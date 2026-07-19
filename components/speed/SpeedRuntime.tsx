"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { getTrafficCorrelationIds } from "@/lib/speed/clientIds";
import { createSpeedSampleId, patchSpeedSample, registerSpeedSample } from "@/lib/speed/clientStore";
import {
  readExplicitSpeedReady,
  SPEED_READY_EVENT,
  type SpeedReadySignal,
} from "@/lib/speed/readiness";
import { sanitizeSpeedPath } from "@/lib/speed/routeSanitizer";
import type {
  SpeedLongTask,
  SpeedNavigationKind,
  SpeedNavigationStartSource,
  SpeedSample,
  SpeedTimingItem,
} from "@/lib/speed/types";

const PENDING_NAV_KEY = "aoe2hdbets:speed-pending-navigation";
const MAX_PENDING_AGE_MS = 120_000;
const SLOW_DETAIL_THRESHOLD_MS = 1_500;

type PendingNavigation = {
  route: string;
  startedAtEpochMs: number;
  startedAtPerfMs: number;
  timeOriginMs: number;
  source: SpeedNavigationStartSource;
  navigationKind: SpeedNavigationKind;
};

type ActiveMeasurement = {
  route: string;
  sampleId: string;
  startEpochMs: number;
  startPerfMs: number;
  isInitialDocumentSample: boolean;
  visibilityTainted: boolean;
  missingIntent: boolean;
  registered: boolean;
  explicitReadyAtEpochMs: number | null;
};

type NetworkInformationLike = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
};

function roundMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1000) / 1000
    : null;
}

function absoluteNow() {
  return performance.timeOrigin + performance.now();
}

function writePendingNavigation(value: PendingNavigation) {
  try {
    window.sessionStorage.setItem(PENDING_NAV_KEY, JSON.stringify(value));
  } catch {
    // Navigation measurement remains functional without sessionStorage.
  }
}

function readPendingNavigation() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingNavigation;
    if (
      !parsed ||
      typeof parsed.route !== "string" ||
      typeof parsed.startedAtEpochMs !== "number" ||
      typeof parsed.startedAtPerfMs !== "number" ||
      typeof parsed.timeOriginMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingNavigation() {
  try {
    window.sessionStorage.removeItem(PENDING_NAV_KEY);
  } catch {
    // Best effort.
  }
}

function mapNavigationType(type: PerformanceNavigationTiming["type"]): SpeedNavigationKind {
  if (type === "reload") return "reload";
  if (type === "back_forward") return "back_forward";
  if (type === "prerender") return "prerender";
  return "initial";
}

function navigationTiming() {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry instanceof PerformanceNavigationTiming ? entry : null;
}

function initialTimingFields(nav: PerformanceNavigationTiming | null) {
  if (!nav) return {};
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    ttfb_ms: roundMetric(nav.responseStart - nav.startTime),
    fcp_ms: roundMetric(fcp?.startTime),
    dom_content_loaded_ms: nav.domContentLoadedEventEnd > 0 ? roundMetric(nav.domContentLoadedEventEnd) : null,
    load_event_ms: nav.loadEventEnd > 0 ? roundMetric(nav.loadEventEnd) : null,
  };
}

function navigationTimingDetail(
  nav: PerformanceNavigationTiming | null,
): Record<string, number | null> {
  if (!nav) return {};
  return {
    dns_ms: roundMetric(nav.domainLookupEnd - nav.domainLookupStart),
    connect_ms: roundMetric(nav.connectEnd - nav.connectStart),
    tls_ms:
      nav.secureConnectionStart > 0
        ? roundMetric(nav.connectEnd - nav.secureConnectionStart)
        : null,
    request_ms: roundMetric(nav.responseStart - nav.requestStart),
    response_ms: roundMetric(nav.responseEnd - nav.responseStart),
    ttfb_ms: roundMetric(nav.responseStart - nav.startTime),
    dom_interactive_ms: nav.domInteractive > 0 ? roundMetric(nav.domInteractive) : null,
    dom_content_loaded_ms:
      nav.domContentLoadedEventEnd > 0 ? roundMetric(nav.domContentLoadedEventEnd) : null,
    load_event_ms: nav.loadEventEnd > 0 ? roundMetric(nav.loadEventEnd) : null,
  };
}

function resourcePath(name: string) {
  try {
    return sanitizeSpeedPath(new URL(name, window.location.origin).pathname);
  } catch {
    return "/";
  }
}

function collectResources(startPerfMs: number, endPerfMs: number) {
  const entries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(
    (entry) =>
      entry.startTime >= Math.max(0, startPerfMs) &&
      entry.startTime <= endPerfMs &&
      !resourcePath(entry.name).startsWith("/api/speed/"),
  );

  const items: SpeedTimingItem[] = entries.map((entry) => ({
    name: resourcePath(entry.name),
    duration_ms: roundMetric(entry.duration),
    transfer_bytes: Number.isFinite(entry.transferSize) ? Math.max(0, Math.round(entry.transferSize)) : null,
    initiator_type: entry.initiatorType || "",
  }));

  const apiItems = items.filter((item) => item.name.startsWith("/api/"));
  const slowestApi = [...apiItems].sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0))[0];
  const transferBytes = items.reduce((total, item) => total + (item.transfer_bytes || 0), 0);

  return {
    resourceCount: items.length,
    transferBytes,
    apiRequestCount: apiItems.length,
    slowestApiPath: slowestApi?.name || "",
    slowestApiMs: slowestApi?.duration_ms ?? null,
    topResources: [...items].sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0)).slice(0, 10),
    topApiRequests: [...apiItems].sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0)).slice(0, 10),
  };
}

function connectionFields() {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return {
    effective_connection_type: connection?.effectiveType || "",
    connection_rtt_ms: roundMetric(connection?.rtt),
    downlink_mbps: roundMetric(connection?.downlink),
    save_data: typeof connection?.saveData === "boolean" ? connection.saveData : null,
  };
}

function findAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("a") as HTMLAnchorElement | null;
}

function shouldTrackAnchor(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    const current = sanitizeSpeedPath(window.location.pathname);
    const destination = sanitizeSpeedPath(url.pathname);
    return destination !== current;
  } catch {
    return false;
  }
}

export default function SpeedRuntime() {
  const pathname = usePathname();
  const lastRouteRef = useRef<string | null>(null);
  const measurementTokenRef = useRef(0);
  const longTasksRef = useRef<SpeedLongTask[]>([]);
  const inMemoryPendingRef = useRef<PendingNavigation | null>(null);
  const activeMeasurementRef = useRef<ActiveMeasurement | null>(null);
  const hiddenDuringPendingRef = useRef(false);

  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasksRef.current.push({
              start_ms: entry.startTime,
              duration_ms: entry.duration,
            });
          }
          if (longTasksRef.current.length > 200) {
            longTasksRef.current = longTasksRef.current.slice(-200);
          }
        });
        observer.observe({ type: "longtask", buffered: true });
      }
    } catch {
      observer = null;
    }

    const capturePending = (
      route: string,
      source: SpeedNavigationStartSource,
      navigationKind: SpeedNavigationKind,
    ) => {
      const pending: PendingNavigation = {
        route,
        startedAtEpochMs: absoluteNow(),
        startedAtPerfMs: performance.now(),
        timeOriginMs: performance.timeOrigin,
        source,
        navigationKind,
      };
      inMemoryPendingRef.current = pending;
      hiddenDuringPendingRef.current = document.visibilityState !== "visible";
      writePendingNavigation(pending);
    };

    const handleClick = (event: MouseEvent) => {
      const anchor = findAnchor(event.target);
      if (!anchor || !shouldTrackAnchor(event, anchor)) return;
      const url = new URL(anchor.href, window.location.href);
      capturePending(sanitizeSpeedPath(url.pathname), "link_click", "internal");
    };

    const handlePopState = () => {
      capturePending(sanitizeSpeedPath(window.location.pathname), "popstate", "back_forward");
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        if (inMemoryPendingRef.current) hiddenDuringPendingRef.current = true;
        if (activeMeasurementRef.current) {
          activeMeasurementRef.current.visibilityTainted = true;
        }
      }
    };

    const applyExplicitReady = (signal: SpeedReadySignal) => {
      const active = activeMeasurementRef.current;
      if (!active || signal.route !== active.route) return;
      if (signal.atEpochMs < active.startEpochMs) return;

      active.explicitReadyAtEpochMs = signal.atEpochMs;
      if (!active.registered) return;

      const readyMs = roundMetric(signal.atEpochMs - active.startEpochMs);
      if (readyMs === null || readyMs < 0 || readyMs >= 600_000) return;

      const endPerfMs = Math.max(
        active.startPerfMs,
        Math.min(performance.now(), signal.atEpochMs - performance.timeOrigin),
      );
      const resources = collectResources(active.startPerfMs, endPerfMs);
      const tasks = longTasksRef.current.filter(
        (task) =>
          task.start_ms >= Math.max(0, active.startPerfMs) &&
          task.start_ms <= endPerfMs,
      );
      const longTaskDurations = tasks.map((task) => task.duration_ms);
      const visibilityTainted =
        active.visibilityTainted || document.visibilityState !== "visible";
      const validForAggregation = !visibilityTainted && !active.missingIntent;
      const invalidReason = visibilityTainted
        ? "visibility_tainted"
        : active.missingIntent
          ? "missing_navigation_intent"
          : "";
      const details =
        readyMs >= SLOW_DETAIL_THRESHOLD_MS
          ? {
              top_resources: resources.topResources,
              top_api_requests: resources.topApiRequests,
              navigation_timing: active.isInitialDocumentSample
                ? navigationTimingDetail(navigationTiming())
                : {},
              long_tasks: tasks.slice(0, 10),
            }
          : undefined;

      patchSpeedSample(
        active.sampleId,
        {
          ready_source: "explicit",
          ready_ms: readyMs,
          resource_count: resources.resourceCount,
          transfer_bytes: resources.transferBytes,
          api_request_count: resources.apiRequestCount,
          slowest_api_path: resources.slowestApiPath,
          slowest_api_ms: resources.slowestApiMs,
          long_task_count: tasks.length,
          long_task_max_ms: longTaskDurations.length
            ? roundMetric(Math.max(...longTaskDurations))
            : 0,
          long_task_total_ms: roundMetric(
            longTaskDurations.reduce((total, value) => total + value, 0),
          ),
          valid_for_aggregation: validForAggregation,
          invalid_reason: invalidReason,
          visibility_tainted: visibilityTainted,
          ...(details ? { details } : {}),
        },
        { includeDetails: Boolean(details) },
      );
    };

    const handleExplicitReady = (event: Event) => {
      const signal = (event as CustomEvent<SpeedReadySignal>).detail;
      if (!signal || typeof signal.route !== "string" || typeof signal.atEpochMs !== "number") {
        return;
      }
      applyExplicitReady(signal);
    };

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);
    window.addEventListener(SPEED_READY_EVENT, handleExplicitReady);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      observer?.disconnect();
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener(SPEED_READY_EVENT, handleExplicitReady);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;

    const route = sanitizeSpeedPath(pathname);
    const isInitialDocumentSample = lastRouteRef.current === null;
    if (!isInitialDocumentSample && lastRouteRef.current === route) return;

    lastRouteRef.current = route;
    const token = ++measurementTokenRef.current;
    const nowEpoch = absoluteNow();
    const nav = navigationTiming();
    const storedPending = readPendingNavigation();
    const pendingAge = storedPending ? nowEpoch - storedPending.startedAtEpochMs : Number.POSITIVE_INFINITY;
    const matchingPending =
      storedPending &&
      storedPending.route === route &&
      pendingAge >= 0 &&
      pendingAge <= MAX_PENDING_AGE_MS
        ? storedPending
        : null;

    if (storedPending && (!matchingPending || storedPending.route === route)) {
      clearPendingNavigation();
    }

    const sameDocumentPending =
      matchingPending && Math.abs(matchingPending.timeOriginMs - performance.timeOrigin) < 1;
    const startEpochMs = matchingPending?.startedAtEpochMs ?? performance.timeOrigin;
    const startPerfMs = sameDocumentPending ? matchingPending.startedAtPerfMs : 0;
    const navigationKind: SpeedNavigationKind = matchingPending
      ? matchingPending.navigationKind
      : isInitialDocumentSample && nav
        ? mapNavigationType(nav.type)
        : "unknown";
    const navigationStartSource: SpeedNavigationStartSource = matchingPending
      ? matchingPending.source
      : isInitialDocumentSample
        ? "document"
        : "route_commit";
    const fallbackReadySource = isInitialDocumentSample ? "initial_hydration" : "route_paint";
    const startedHidden = document.visibilityState !== "visible";
    const pendingWasHidden = Boolean(
      sameDocumentPending &&
        inMemoryPendingRef.current?.startedAtEpochMs === matchingPending?.startedAtEpochMs &&
        hiddenDuringPendingRef.current,
    );
    const missingIntent = !isInitialDocumentSample && !matchingPending;
    const sampleId = createSpeedSampleId();
    const preMarkedReady = readExplicitSpeedReady(route, startEpochMs);
    activeMeasurementRef.current = {
      route,
      sampleId,
      startEpochMs,
      startPerfMs,
      isInitialDocumentSample,
      visibilityTainted: startedHidden || pendingWasHidden,
      missingIntent,
      registered: false,
      explicitReadyAtEpochMs: preMarkedReady?.atEpochMs ?? null,
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (measurementTokenRef.current !== token) return;

        const active = activeMeasurementRef.current;
        if (!active || active.sampleId !== sampleId || active.route !== route) return;

        const explicitReadyAtEpochMs = active.explicitReadyAtEpochMs;
        const endEpochMs = explicitReadyAtEpochMs ?? absoluteNow();
        const endPerfMs = explicitReadyAtEpochMs
          ? Math.max(
              startPerfMs,
              Math.min(performance.now(), explicitReadyAtEpochMs - performance.timeOrigin),
            )
          : performance.now();
        const readyMs = roundMetric(endEpochMs - startEpochMs);
        const readySource = explicitReadyAtEpochMs ? "explicit" : fallbackReadySource;
        const visibilityTainted =
          active.visibilityTainted || document.visibilityState !== "visible";
        const validForAggregation =
          !visibilityTainted && !missingIntent && readyMs !== null && readyMs >= 0 && readyMs < 600_000;
        const invalidReason = visibilityTainted
          ? "visibility_tainted"
          : missingIntent
            ? "missing_navigation_intent"
            : "";
        const ids = getTrafficCorrelationIds();
        const resources = collectResources(startPerfMs, endPerfMs);
        const tasks = longTasksRef.current.filter(
          (task) => task.start_ms >= Math.max(0, startPerfMs) && task.start_ms <= endPerfMs,
        );
        const longTaskDurations = tasks.map((task) => task.duration_ms);
        const slowEnoughForDetails = (readyMs || 0) >= SLOW_DETAIL_THRESHOLD_MS;

        const sample: SpeedSample = {
          sample_id: sampleId,
          occurred_at: new Date().toISOString(),
          route,
          traffic_visitor_id: ids.trafficVisitorId,
          traffic_session_id: ids.trafficSessionId,
          journey_session_id: ids.journeySessionId,
          navigation_kind: navigationKind,
          navigation_start_source: navigationStartSource,
          ready_source: readySource,
          ready_ms: readyMs,
          ...(isInitialDocumentSample ? initialTimingFields(nav) : {}),
          resource_count: resources.resourceCount,
          transfer_bytes: resources.transferBytes,
          api_request_count: resources.apiRequestCount,
          slowest_api_path: resources.slowestApiPath,
          slowest_api_ms: resources.slowestApiMs,
          long_task_count: tasks.length,
          long_task_max_ms: longTaskDurations.length ? roundMetric(Math.max(...longTaskDurations)) : 0,
          long_task_total_ms: roundMetric(longTaskDurations.reduce((total, value) => total + value, 0)),
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          ...connectionFields(),
          valid_for_aggregation: validForAggregation,
          invalid_reason: invalidReason,
          visibility_tainted: visibilityTainted,
          ...(slowEnoughForDetails
            ? {
                details: {
                  top_resources: resources.topResources,
                  top_api_requests: resources.topApiRequests,
                  navigation_timing: isInitialDocumentSample ? navigationTimingDetail(nav) : {},
                  long_tasks: tasks.slice(0, 10),
                },
              }
            : {}),
        };

        registerSpeedSample(sample, { initial: isInitialDocumentSample });
        if (activeMeasurementRef.current?.sampleId === sampleId) {
          activeMeasurementRef.current.registered = true;
        }
        inMemoryPendingRef.current = null;
        hiddenDuringPendingRef.current = false;
      });
    });
  }, [pathname]);

  return null;
}
