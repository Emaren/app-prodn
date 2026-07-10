"use client";

import { useEffect } from "react";

const CLIENT_BUILD_VERSION =
  process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "";

const VERSION_CHECK_INTERVAL_MS = 20_000;

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

    const firstCheck = window.setTimeout(
      checkWhenVisible,
      1500
    );

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

      window.clearTimeout(firstCheck);
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
