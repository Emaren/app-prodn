"use client";

import React from "react";
import Image from "next/image";
import { Download, Share2, X } from "lucide-react";
import { usePathname } from "next/navigation";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
}

const DISMISS_KEY = "aoe2hdbets.installPrompt.dismissed.v1";
const ANIMATION_KEY = "aoe2hdbets.installPrompt.animated.v1";
const DISMISS_DAYS = 14;
const MOBILE_INSTALL_ROUTES = ["/", "/lobby", "/challenge", "/live-games", "/profile", "/wolo"];
const DESKTOP_INSTALL_ROUTES = ["/profile"];

function routeMatches(pathname: string | null, routes: string[]) {
  if (!pathname) return false;
  return routes.some((route) => (route === "/" ? pathname === "/" : pathname.startsWith(route)));
}

function readDismissed() {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(DISMISS_KEY);
  if (!value) return false;
  if (value === "1") return true;

  const dismissedUntil = Number.parseInt(value, 10);
  if (!Number.isFinite(dismissedUntil)) return false;
  if (dismissedUntil > Date.now()) return true;

  window.localStorage.removeItem(DISMISS_KEY);
  return false;
}

function shouldAnimateInstallPrompt() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.sessionStorage.getItem(ANIMATION_KEY) === "1") return false;
  window.sessionStorage.setItem(ANIMATION_KEY, "1");
  return true;
}

export default function InstallAppPrompt({
  compact = false,
  dismissible = true,
  featured = false,
  className = "",
}: {
  compact?: boolean;
  dismissible?: boolean;
  featured?: boolean;
  className?: string;
}) {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [animateEntry, setAnimateEntry] = React.useState(false);

  React.useEffect(() => {
    setInstalled(isStandalone());
    setDismissed(readDismissed());
    setAnimateEntry(shouldAnimateInstallPrompt());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setGuideOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || (dismissible && dismissed)) return null;

  const handleInstall = async () => {
    if (!promptEvent) {
      setGuideOpen(true);
      return;
    }

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  };

  const handleDismiss = () => {
    const dismissedUntil = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(DISMISS_KEY, String(dismissedUntil));
    setDismissed(true);
    setGuideOpen(false);
  };

  return (
    <>
      <div
        className={`rounded-[10px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))] text-slate-50 shadow-[0_18px_70px_rgba(0,0,0,0.28)] ${
          compact ? "px-3 py-2" : featured ? "p-5" : "p-4"
        } ${animateEntry ? "aoe2-install-enter" : ""} ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Image
              src="/icons/icon-192x192.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-[9px] border border-amber-200/15 bg-slate-950/70 shadow-[0_0_18px_rgba(245,201,95,0.08)]"
            />
            <div className="min-w-0">
              {featured ? (
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/75">
                  Install App
                </div>
              ) : null}
              <div className="text-sm font-semibold">Install AoE2HDBets</div>
              <div className={compact ? "truncate text-xs text-slate-400" : "text-xs text-slate-300"}>
                Live games, challenges, WOLO, and match alerts.
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-300/15 px-3 py-2 text-xs font-bold text-amber-50 transition hover:border-amber-200/40 hover:bg-amber-300/20"
            >
              {promptEvent ? <Download className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {promptEvent ? "Install App" : featured ? "How to Install" : "Install App"}
            </button>
            {dismissible ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Dismiss install prompt"
                title="Not now"
              >
                <span className="hidden sm:inline">Not now</span>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {guideOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="aoe2-install-guide w-full max-w-md rounded-[16px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5 text-slate-50 shadow-[0_24px_90px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.36em] text-amber-200/75">
                  Install On iPhone
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">Add the war room</h2>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Close install guide"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-4 rounded-[12px] border border-amber-200/15 bg-amber-200/[0.06] p-4">
              <p className="text-sm leading-6 text-slate-200">
                In Safari, tap Share → Add to Home Screen to run AoE2HDBets like an app.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Your live games, challenges, WOLO, and profile stay one tap away.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              {dismissible ? (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  Not now
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function GlobalInstallAppPrompt() {
  const pathname = usePathname();
  const showMobile = routeMatches(pathname, MOBILE_INSTALL_ROUTES);
  const showDesktop = routeMatches(pathname, DESKTOP_INSTALL_ROUTES);

  if (!showMobile && !showDesktop) return null;

  return (
    <div className={`mb-4 ${showDesktop ? "" : "lg:hidden"}`}>
      <InstallAppPrompt compact className="mx-auto max-w-3xl" />
    </div>
  );
}
