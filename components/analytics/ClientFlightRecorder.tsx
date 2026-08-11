"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useUserAuth } from "@/context/UserAuthContext";

const LOOP_INTERVAL_MS = 2_000;
const LOOP_STALL_THRESHOLD_MS = 1_000;
const LONG_TASK_THRESHOLD_MS = 750;
const LONG_TASK_COOLDOWN_MS = 5_000;

function cleanText(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") return null;

  return (
    value
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength) || null
  );
}

function journeySessionId() {
  try {
    return window.sessionStorage.getItem(
      "aoe2hdbets:journey-session-id",
    );
  } catch {
    return null;
  }
}

function sourcePath(value: string | null) {
  if (!value) return null;

  try {
    return new URL(
      value,
      window.location.href,
    ).pathname.slice(0, 240);
  } catch {
    return cleanText(
      value.replace(/[?#].*$/, ""),
      240,
    );
  }
}

function cleanStack(value: unknown) {
  if (typeof value !== "string") return null;

  const withoutSensitiveUrls = value.replace(
    /https?:\/\/[^\s)]+/g,
    (rawUrl) => {
      try {
        return new URL(rawUrl).pathname;
      } catch {
        return rawUrl.replace(/[?#].*$/, "");
      }
    },
  );

  return cleanText(
    withoutSensitiveUrls,
    1200,
  );
}

function errorDetail(value: unknown) {
  if (value instanceof Error) {
    return {
      errorName:
        cleanText(value.name, 120) || "Error",
      errorMessage:
        cleanText(value.message, 500),
      errorStack:
        cleanStack(value.stack),
      reasonType: "error",
    };
  }

  if (typeof value === "string") {
    return {
      errorName: "Unhandled rejection",
      errorMessage:
        cleanText(value, 500),
      errorStack: null,
      reasonType: "string",
    };
  }

  return {
    errorName: "Unhandled rejection",
    errorMessage: null,
    errorStack: null,
    reasonType:
      value === null ? "null" : typeof value,
  };
}

export default function ClientFlightRecorder() {
  const pathname = usePathname();
  const { uid, isAuthenticated } = useUserAuth();

  useEffect(() => {
    if (!isAuthenticated || !uid || !pathname) {
      return;
    }

    const post = (
      type: string,
      label: string,
      metadata: Record<string, unknown> = {},
      dedupeWithinSeconds = 2,
    ) => {
      const body = {
        type,
        path: pathname,
        label,
        metadata: {
          journeySessionId: journeySessionId(),
          currentPath: pathname,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          timezone:
            Intl.DateTimeFormat()
              .resolvedOptions()
              .timeZone,
          language: navigator.language,
          capturedAt: new Date().toISOString(),
          visibilityState:
            document.visibilityState,
          online: navigator.onLine,
          ...metadata,
        },
        dedupeWithinSeconds,
      };

      void fetch("/api/user/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => undefined);
    };

    const handleError = (event: ErrorEvent) => {
      const detail =
        event.error instanceof Error
          ? errorDetail(event.error)
          : {
              errorName: "Error",
              errorMessage:
                cleanText(event.message, 500),
              errorStack: null,
              reasonType: "error_event",
            };

      post(
        "client_error",
        detail.errorName || "Error",
        {
          ...detail,
          sourcePath: sourcePath(event.filename),
          lineNumber: event.lineno || null,
          columnNumber: event.colno || null,
        },
      );
    };

    const handleUnhandledRejection = (
      event: PromiseRejectionEvent,
    ) => {
      const detail = errorDetail(event.reason);

      post(
        "client_unhandled_rejection",
        detail.errorName ||
          "Unhandled rejection",
        detail,
      );
    };

    let expected =
      performance.now() + LOOP_INTERVAL_MS;
    let lastVisibilityChangeAt =
      performance.now();

    const resetLoopClock = () => {
      const now = performance.now();
      expected = now + LOOP_INTERVAL_MS;
      lastVisibilityChangeAt = now;
    };

    const handleVisibility = () => {
      resetLoopClock();

      post(
        "client_visibility",
        document.visibilityState,
        {},
        1,
      );
    };

    const handlePageHide = (
      event: PageTransitionEvent,
    ) => {
      post(
        "client_pagehide",
        event.persisted
          ? "persisted"
          : "unloaded",
        {
          persisted: event.persisted,
        },
        1,
      );
    };

    const handlePageShow = (
      event: PageTransitionEvent,
    ) => {
      resetLoopClock();

      post(
        "client_pageshow",
        event.persisted
          ? "bfcache"
          : "normal",
        {
          persisted: event.persisted,
        },
        1,
      );
    };

    const handleOnline = () => {
      post("client_online", "online", {}, 1);
    };

    const handleOffline = () => {
      post("client_offline", "offline", {}, 1);
    };

    let lastLongTaskPost = 0;
    let observer: PerformanceObserver | null = null;

    try {
      if (
        PerformanceObserver.supportedEntryTypes
          ?.includes("longtask")
      ) {
        observer = new PerformanceObserver(
          (list) => {
            for (const entry of list.getEntries()) {
              if (
                entry.duration <
                LONG_TASK_THRESHOLD_MS
              ) {
                continue;
              }

              const now = Date.now();

              if (
                now - lastLongTaskPost <
                  LONG_TASK_COOLDOWN_MS &&
                entry.duration < 3_000
              ) {
                continue;
              }

              lastLongTaskPost = now;

              post(
                "client_long_task",
                `${Math.round(entry.duration)}ms`,
                {
                  longTaskDurationMs:
                    entry.duration,
                  longTaskStartMs:
                    entry.startTime,
                },
                5,
              );
            }
          },
        );

        observer.observe({
          type: "longtask",
          buffered: true,
        });
      }
    } catch {
      observer = null;
    }

    const loopTimer = window.setInterval(() => {
      const now = performance.now();
      const stallMs = Math.max(
        0,
        now - expected,
      );

      expected = now + LOOP_INTERVAL_MS;

      if (
        document.visibilityState !== "visible" ||
        now - lastVisibilityChangeAt <
          LOOP_INTERVAL_MS +
            LOOP_STALL_THRESHOLD_MS ||
        stallMs < LOOP_STALL_THRESHOLD_MS
      ) {
        return;
      }

      post(
        "client_event_loop_stall",
        `${Math.round(stallMs)}ms`,
        {
          eventLoopStallMs: stallMs,
        },
        5,
      );
    }, LOOP_INTERVAL_MS);

    window.addEventListener(
      "error",
      handleError,
    );

    window.addEventListener(
      "unhandledrejection",
      handleUnhandledRejection,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    window.addEventListener(
      "pagehide",
      handlePageHide,
    );

    window.addEventListener(
      "pageshow",
      handlePageShow,
    );

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    return () => {
      observer?.disconnect();
      window.clearInterval(loopTimer);

      window.removeEventListener(
        "error",
        handleError,
      );

      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      window.removeEventListener(
        "pagehide",
        handlePageHide,
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );

      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );
    };
  }, [isAuthenticated, pathname, uid]);

  return null;
}
