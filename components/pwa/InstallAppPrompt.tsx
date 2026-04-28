"use client";

import React from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";
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
const MOBILE_INSTALL_ROUTES = ["/", "/lobby", "/challenge", "/live-games", "/profile", "/wolo"];
const DESKTOP_INSTALL_ROUTES = ["/profile"];

function routeMatches(pathname: string | null, routes: string[]) {
  if (!pathname) return false;
  return routes.some((route) => (route === "/" ? pathname === "/" : pathname.startsWith(route)));
}

function readDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DISMISS_KEY) === "1";
}

export default function InstallAppPrompt({
  compact = false,
  dismissible = true,
  className = "",
}: {
  compact?: boolean;
  dismissible?: boolean;
  className?: string;
}) {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [showTip, setShowTip] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setInstalled(isStandalone());
    setDismissed(readDismissed());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setShowTip(false);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowTip(false);
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
      setShowTip(true);
      return;
    }

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  };

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={`rounded-[10px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))] text-slate-50 shadow-[0_18px_70px_rgba(0,0,0,0.28)] ${
        compact ? "px-3 py-2" : "p-4"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src="/icons/icon-192x192.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[8px] border border-white/10 bg-slate-950/70"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Install AoE2HDBets</div>
            {!compact ? (
              <div className="text-xs text-slate-300">
                Live games, challenges, WOLO, and match alerts in one tap.
              </div>
            ) : (
              <div className="truncate text-xs text-slate-400">
                Live games, challenges, WOLO.
              </div>
            )}
            {!promptEvent || showTip ? (
              <div className="mt-1 text-xs text-amber-100/85">Tap Share → Add to Home Screen</div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
          >
            <Download className="h-3.5 w-3.5" />
            Install App
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
