"use client";

import React from "react";
import { Download, Smartphone } from "lucide-react";

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

export default function InstallAppPrompt({ compact = false }: { compact?: boolean }) {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [showTip, setShowTip] = React.useState(false);

  React.useEffect(() => {
    setInstalled(isStandalone());

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

  if (installed) return null;

  const handleInstall = async () => {
    if (!promptEvent) {
      setShowTip((value) => !value);
      return;
    }

    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
  };

  return (
    <div
      className={`rounded-[8px] border border-amber-300/20 bg-amber-300/10 text-amber-50 shadow-[0_18px_60px_rgba(0,0,0,0.18)] ${
        compact ? "px-3 py-2" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Smartphone className="h-4 w-4 shrink-0 text-amber-200" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Install war room</div>
            {!compact ? (
              <div className="text-xs text-amber-100/75">Live, challenges, WOLO, profile.</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
        >
          <Download className="h-3.5 w-3.5" />
          Install
        </button>
      </div>
      {showTip ? (
        <div className="mt-2 text-xs text-amber-100/80">Use browser menu → Add to Home Screen.</div>
      ) : null}
    </div>
  );
}
