"use client";

import { useEffect } from "react";

const CLIENT_BUILD_VERSION =
  process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "unversioned";
const CLEANUP_KEY = `aoe2war:pwa-cleanup:${CLIENT_BUILD_VERSION}`;

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    try {
      if (window.localStorage.getItem(CLEANUP_KEY) === "1") return;
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }

    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const cleanLegacyPwaState = async () => {
      const registrations = await navigator.serviceWorker
        .getRegistrations()
        .catch(() => []);
      await Promise.all(
        registrations.map((registration) =>
          registration.unregister().catch(() => false)
        )
      );

      if ("caches" in window) {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
      }

      if (!cancelled) {
        try {
          window.localStorage.setItem(CLEANUP_KEY, "1");
        } catch {
          // Cleanup still succeeded; it may run again if storage is blocked.
        }
      }
    };

    const scheduleCleanup = () => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(
          () => void cleanLegacyPwaState(),
          { timeout: 8_000 }
        );
      } else {
        timer = window.setTimeout(() => void cleanLegacyPwaState(), 4_000);
      }
    };

    if (document.readyState === "complete") scheduleCleanup();
    else window.addEventListener("load", scheduleCleanup, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleCleanup);
      if (timer !== null) window.clearTimeout(timer);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, []);

  return null;
}
