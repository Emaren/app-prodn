"use client";

import { useEffect } from "react";

const CLIENT_BUILD_VERSION =
  process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "";

const VERSION_CHECK_INTERVAL_MS = 60_000;

type DeploymentVersionResponse = {
  buildVersion?: unknown;
};

function normalizeVersion(value: unknown) {
  return String(value || "").trim();
}

export default function DeploymentVersionGuard() {
  useEffect(() => {
    if (!CLIENT_BUILD_VERSION) return;

    let disposed = false;
    let checking = false;
    let firstCheckTimer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const checkDeploymentVersion = async () => {
      if (disposed || checking) return;

      checking = true;

      try {
        const response = await fetch(
          `/api/deployment-version?t=${Date.now()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          }
        );

        if (!response.ok || disposed) return;

        const payload =
          (await response.json()) as
            DeploymentVersionResponse;

        const serverBuildVersion =
          normalizeVersion(payload.buildVersion);

        if (
          !serverBuildVersion ||
          serverBuildVersion ===
            CLIENT_BUILD_VERSION
        ) {
          return;
        }

        const reloadKey =
          `aoe2war-build-reload:${serverBuildVersion}`;

        try {
          if (
            window.sessionStorage.getItem(reloadKey) ===
            "1"
          ) {
            return;
          }

          window.sessionStorage.setItem(
            reloadKey,
            "1"
          );
        } catch {
          // Storage may be blocked. Reload remains safe
          // because the new client will carry the new ID.
        }

        window.location.reload();
      } catch (error) {
        console.warn(
          "Deployment version check failed:",
          error
        );
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (
        document.visibilityState === "visible"
      ) {
        void checkDeploymentVersion();
      }
    };

    const scheduleFirstCheck = () => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(checkWhenVisible, {
          timeout: 8_000,
        });
      } else {
        firstCheckTimer = window.setTimeout(checkWhenVisible, 5_000);
      }
    };

    if (document.readyState === "complete") scheduleFirstCheck();
    else window.addEventListener("load", scheduleFirstCheck, { once: true });

    const interval = window.setInterval(
      checkWhenVisible,
      VERSION_CHECK_INTERVAL_MS
    );

    window.addEventListener(
      "focus",
      checkWhenVisible
    );

    document.addEventListener(
      "visibilitychange",
      checkWhenVisible
    );

    return () => {
      disposed = true;

      window.removeEventListener("load", scheduleFirstCheck);
      if (firstCheckTimer !== null) window.clearTimeout(firstCheckTimer);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        checkWhenVisible
      );

      document.removeEventListener(
        "visibilitychange",
        checkWhenVisible
      );
    };
  }, []);

  return null;
}
