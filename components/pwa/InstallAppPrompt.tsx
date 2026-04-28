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

  const nativeInstallReady = Boolean(promptEvent);

  return (
    <>
      <div
        className={`rounded-[10px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))] text-slate-50 shadow-[0_18px_70px_rgba(0,0,0,0.28)] ${
          compact ? "px-3 py-3" : featured ? "p-5" : "p-4"
        } ${animateEntry ? "aoe2-install-enter" : ""} ${className}`}
      >
        <div
          className={
            compact
              ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              : "flex items-center justify-between gap-3"
          }
        >
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
          <div
            className={
              compact
                ? "flex w-full shrink-0 items-center gap-2 pl-11 sm:w-auto sm:pl-0"
                : "flex shrink-0 items-center gap-2"
            }
          >
            <button
              type="button"
              onClick={handleInstall}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/25 bg-amber-300/[0.12] px-3 py-2 text-xs font-bold text-amber-50 transition hover:border-amber-200/40 hover:bg-amber-300/[0.18] ${
                compact ? "min-h-9 flex-1 sm:flex-none" : ""
              }`}
            >
              {nativeInstallReady ? <Download className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {nativeInstallReady ? "Install App" : featured ? "How to Install" : "Install App"}
            </button>
            {dismissible ? (
              <button
                type="button"
                onClick={handleDismiss}
                className={`inline-flex items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.03] text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white ${
                  compact ? "h-9 w-9 px-0" : "px-3 py-2"
                }`}
                aria-label="Dismiss install prompt"
                title="Not now"
              >
                <span className={compact ? "sr-only" : "hidden sm:inline"}>Not now</span>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {guideOpen ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+7.65rem)] z-[120] flex justify-center sm:inset-x-6 sm:bottom-6">
          <div className="aoe2-install-guide pointer-events-auto w-full max-w-md rounded-[16px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-4 text-slate-50 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.36em] text-amber-200/75">
                  Install On iPhone
                </div>
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
            <div className="mt-3 rounded-[12px] border border-amber-200/15 bg-amber-200/[0.05] p-3.5">
              <p className="text-sm leading-6 text-slate-200">
                In Safari, tap{" "}
                <span
                  className="mx-1 inline-flex h-7 w-7 translate-y-1 items-center justify-center rounded-[8px] border border-sky-300/30 bg-sky-300/10 text-sky-200"
                  aria-label="Share"
                  title="Share"
                >
                  <Share2 className="h-4 w-4" />
                </span>{" "}
                then Add to Home Screen to run AoE2HDBets like an app.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Your live games, challenges, WOLO, and profile stay one tap away.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              {dismissible ? (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-[10px] border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  Not now
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-[10px] border border-amber-200/25 bg-amber-300/[0.12] px-4 py-2 text-xs font-bold text-amber-50 transition hover:border-amber-200/40 hover:bg-amber-300/[0.18]"
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
