"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useUserAuth } from "@/context/UserAuthContext";

const JOURNEY_SESSION_STORAGE_KEY = "aoe2hdbets:journey-session-id";

function normalizeClientText(value: string | null | undefined, maxLength = 120) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

function getJourneySessionId() {
  try {
    const existing = window.sessionStorage.getItem(JOURNEY_SESSION_STORAGE_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `journey_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(JOURNEY_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `journey_${Date.now().toString(36)}`;
  }
}

function parseReferrer() {
  if (!document.referrer) {
    return {
      referrerHost: null,
      referrerPath: null,
    };
  }

  try {
    const url = new URL(document.referrer);
    return {
      referrerHost: normalizeClientText(url.hostname, 120),
      referrerPath: normalizeClientText(url.pathname, 160),
    };
  } catch {
    return {
      referrerHost: null,
      referrerPath: null,
    };
  }
}

function deviceKindFor(width: number) {
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

function buildBaseMetadata(pathname: string, previousPath: string | null) {
  const url = new URL(window.location.href);
  const referrer = parseReferrer();
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    journeySessionId: getJourneySessionId(),
    previousPath,
    currentPath: pathname,
    ...referrer,
    utmSource: normalizeClientText(url.searchParams.get("utm_source"), 80),
    utmMedium: normalizeClientText(url.searchParams.get("utm_medium"), 80),
    utmCampaign: normalizeClientText(url.searchParams.get("utm_campaign"), 120),
    utmContent: normalizeClientText(url.searchParams.get("utm_content"), 120),
    utmTerm: normalizeClientText(url.searchParams.get("utm_term"), 120),
    viewportWidth: width,
    viewportHeight: height,
    deviceKind: deviceKindFor(width),
    touch: navigator.maxTouchPoints > 0,
    timezone: normalizeClientText(Intl.DateTimeFormat().resolvedOptions().timeZone, 80),
    language: normalizeClientText(navigator.language, 40),
    capturedAt: new Date().toISOString(),
  };
}

function isSensitiveClickTarget(element: Element) {
  return Boolean(
    element.closest(
      "input, textarea, select, [contenteditable='true'], [data-private], [data-no-activity]"
    )
  );
}

function resolveClickTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || isSensitiveClickTarget(target)) {
    return null;
  }

  return target.closest("a, button, [role='button']");
}

function sanitizeHref(element: Element) {
  if (!(element instanceof HTMLAnchorElement) || !element.href) {
    return {
      href: null,
      hrefHost: null,
      hrefPath: null,
      external: false,
    };
  }

  try {
    const url = new URL(element.href);
    const external = url.origin !== window.location.origin;
    return {
      href: external ? url.hostname : url.pathname,
      hrefHost: normalizeClientText(url.hostname, 120),
      hrefPath: normalizeClientText(url.pathname, 160),
      external,
    };
  } catch {
    return {
      href: null,
      hrefHost: null,
      hrefPath: null,
      external: false,
    };
  }
}

async function postActivity(payload: Record<string, unknown>) {
  try {
    await fetch("/api/user/experience", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn("User activity tracking failed:", error);
  }
}

export default function UserExperienceTracker() {
  const pathname = usePathname();
  const { uid, isAuthenticated } = useUserAuth();
  const lastTrackedPathRef = useRef<string | null>(null);
  const lastClickSignatureRef = useRef<{ signature: string; at: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !uid || !pathname) {
      return;
    }

    if (lastTrackedPathRef.current === pathname) {
      return;
    }

    const previousPath = lastTrackedPathRef.current;
    lastTrackedPathRef.current = pathname;
    void postActivity({
      type: "page_view",
      path: pathname,
      label: pathname,
      metadata: buildBaseMetadata(pathname, previousPath),
      dedupeWithinSeconds: 60,
    });
  }, [isAuthenticated, pathname, uid]);

  useEffect(() => {
    if (!isAuthenticated || !uid || !pathname) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const trackingElement = resolveClickTarget(event.target);
      if (!trackingElement) {
        return;
      }

      const label =
        normalizeClientText(trackingElement.getAttribute("aria-label"), 80) ||
        normalizeClientText(trackingElement.getAttribute("title"), 80) ||
        normalizeClientText(trackingElement.textContent, 80) ||
        trackingElement.tagName.toLowerCase();
      const href = sanitizeHref(trackingElement);
      const signature = `${pathname}:${trackingElement.tagName}:${label}:${href.href ?? ""}`;
      const now = Date.now();

      if (
        lastClickSignatureRef.current?.signature === signature &&
        now - lastClickSignatureRef.current.at < 1500
      ) {
        return;
      }

      lastClickSignatureRef.current = { signature, at: now };
      void postActivity({
        type: "click",
        path: pathname,
        label,
        metadata: {
          ...buildBaseMetadata(pathname, lastTrackedPathRef.current),
          targetTag: trackingElement.tagName.toLowerCase(),
          targetRole: normalizeClientText(trackingElement.getAttribute("role"), 40),
          targetLabel: label,
          buttonType:
            trackingElement instanceof HTMLButtonElement
              ? normalizeClientText(trackingElement.type, 40)
              : null,
          ...href,
        },
        dedupeWithinSeconds: 2,
      });
    };

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [isAuthenticated, pathname, uid]);

  return null;
}
