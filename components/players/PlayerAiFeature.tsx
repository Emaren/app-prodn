"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { payAcademyAdvisorOnChain } from "@/lib/clientAcademyPayment";

type PlayerAiFeatureProps = {
  totalMatches: number;
  winRateLabel: string;
  mapLabel: string;
  civLabel: string;
  weaknessLabel: string;
  profileUid?: string;
  profileDisplayName?: string;
  profileIdentityKind?: "claimed" | "replay";
  variant?: "hero" | "rail" | "signal";
};

const FUNDING_AMOUNT_WOLO = 100;
const DEFAULT_MEMO = "Hasten development please — AoE2WAR Player AI";

type PlayerAiMode = "aoe2_ai" | "regular";

function getPlayerAiViewMode() {
  if (typeof window === "undefined") return "unknown";
  return new URLSearchParams(window.location.search).get("view") || "advanced";
}

function trackPlayerAiTelemetry(
  props: PlayerAiFeatureProps,
  type: "player_ai_mode_selected" | "player_ai_mode_stayed" | "player_ai_fund_clicked",
  mode: PlayerAiMode,
  label?: string
) {
  if (typeof window === "undefined") return;

  const payload = {
    type,
    path: `${window.location.pathname}${window.location.search}`,
    label:
      label ||
      (mode === "aoe2_ai"
        ? "Player profile mode: AoE2WAR AI"
        : "Player profile mode: Regular"),
    metadata: {
      mode,
      profileUid: props.profileUid || null,
      profileDisplayName: props.profileDisplayName || null,
      profileIdentityKind: props.profileIdentityKind || null,
      playerView: getPlayerAiViewMode(),
      surface: "player_profile_hero",
    },
  };

  void fetch("/api/user/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}


function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'a, button, input, textarea, select, label, [role="button"], [data-player-ai-interactive="true"]'
    )
  );
}

function getBoxArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function normalizedText(element: HTMLElement) {
  return (element.textContent || "").toLowerCase();
}

function hasSignalLabels(element: HTMLElement) {
  const text = normalizedText(element);

  return (
    text.includes("watcher proof") &&
    text.includes("steam") &&
    text.includes("favorite map") &&
    text.includes("stream")
  );
}

function hasLeftIdentityNoise(element: HTMLElement) {
  const text = normalizedText(element);

  return (
    text.includes("aoe2hd gamer profile") ||
    text.includes("open my profile") ||
    text.includes("claim this page") ||
    text.includes("browse players")
  );
}

function isPlayerHeroRoot(element: HTMLElement) {
  const text = normalizedText(element);
  const rect = element.getBoundingClientRect();

  return (
    text.includes("aoe2hd gamer profile") &&
    text.includes("watcher proof") &&
    text.includes("favorite map") &&
    text.includes("steam") &&
    text.includes("stream") &&
    rect.width >= 720 &&
    rect.height >= 240 &&
    rect.height <= 760
  );
}

function findHeroFromClickedElement(clicked: HTMLElement) {
  let current: HTMLElement | null = clicked;

  while (current) {
    if (isPlayerHeroRoot(current)) return current;
    current = current.parentElement;
  }

  return null;
}

function findAllPlayerHeroRoots() {
  return Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
    .filter(isPlayerHeroRoot)
    .sort((left, right) => getBoxArea(left) - getBoxArea(right));
}

function findSignalPanelFromHero(hero: HTMLElement) {
  const heroRect = hero.getBoundingClientRect();

  const candidates = Array.from(
    hero.querySelectorAll<HTMLElement>("div, section, article")
  );

  return (
    candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const area = getBoxArea(element);

        const isRightChamber =
          rect.left >= heroRect.left + heroRect.width * 0.36;

        const goodShape =
          rect.width >= 320 &&
          rect.width <= 720 &&
          rect.height >= 190 &&
          rect.height <= 560;

        return {
          element,
          area,
          isTarget:
            hasSignalLabels(element) &&
            !hasLeftIdentityNoise(element) &&
            isRightChamber &&
            goodShape,
        };
      })
      .filter((entry) => entry.isTarget)
      .sort((left, right) => left.area - right.area)[0]?.element || null
  );
}

function hideSignalPanelBackground(panel: HTMLElement) {
  Array.from(panel.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child.dataset.playerAiPortal === "true") return;

    if (child.dataset.playerAiOriginalVisibility === undefined) {
      child.dataset.playerAiOriginalVisibility = child.style.visibility || "";
    }

    child.style.visibility = "hidden";
  });
}

function restoreSignalPanelBackground(panel: HTMLElement | null) {
  if (!panel) return;

  Array.from(panel.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child.dataset.playerAiPortal === "true") return;

    child.style.visibility = child.dataset.playerAiOriginalVisibility || "";
    delete child.dataset.playerAiOriginalVisibility;
  });
}

async function loadDevelopmentTarget() {
  const response = await fetch("/api/player-ai/development-target", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    walletAddress?: string | null;
    memo?: string | null;
    error?: string;
  };

  if (!response.ok || !payload.ok || !payload.walletAddress) {
    throw new Error(payload.error || "Emaren development wallet is not configured yet.");
  }

  return {
    walletAddress: payload.walletAddress,
    memo: payload.memo || DEFAULT_MEMO,
  };
}

export function PlayerAiDevelopmentConsole({
  totalMatches,
  winRateLabel,
  mapLabel,
  civLabel,
  weaknessLabel,
  profileUid,
  profileDisplayName,
  profileIdentityKind,
  variant = "rail",
}: PlayerAiFeatureProps) {
  const [question, setQuestion] = useState("Analyze my latest game.");
  const [fundingStatus, setFundingStatus] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);

  const telemetryProps: PlayerAiFeatureProps = {
    totalMatches,
    winRateLabel,
    mapLabel,
    civLabel,
    weaknessLabel,
    profileUid,
    profileDisplayName,
    profileIdentityKind,
    variant,
  };

  const signal = variant === "signal";
  const compact = variant === "rail" || variant === "signal";

  const fundDevelopment = async () => {
    trackPlayerAiTelemetry(
      telemetryProps,
      "player_ai_fund_clicked",
      "aoe2_ai",
      "Player AI Fund Development clicked"
    );
    setIsFunding(true);
    setTxHash(null);
    setFundingStatus("Opening Keplr for 100 WOLO development funding...");

    try {
      const target = await loadDevelopmentTarget();

      const result = await payAcademyAdvisorOnChain({
        advisorWalletAddress: target.walletAddress,
        amountWolo: FUNDING_AMOUNT_WOLO,
        memo: target.memo,
      });

      setTxHash(result.transactionHash);
      setFundingStatus("Development funded. The war room heard the bell.");
    } catch (error) {
      setFundingStatus(
        error instanceof Error ? error.message : "Funding could not be completed."
      );
    } finally {
      setIsFunding(false);
    }
  };

  return (
    <div
      data-player-ai-interactive="true"
      className={[
        signal
          ? "relative z-10 flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] border border-transparent bg-transparent p-3 shadow-none outline-none ring-0 sm:p-4"
          : "relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.08),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(244,63,94,0.08),transparent_34%),linear-gradient(135deg,rgba(2,6,23,0.94),rgba(8,13,28,0.95)_52%,rgba(3,7,18,0.99))]",
        !signal && (compact ? "p-4" : "p-5 sm:p-6"),
      ].join(" ")}
      onClick={(event) => event.stopPropagation()}
    >

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-100/58">
            AoE2WAR AI
          </div>
          <h3
            className={
              signal
                ? "mt-1.5 text-lg font-semibold text-white"
                : compact
                  ? "mt-2 text-2xl font-semibold text-white"
                  : "mt-2 text-3xl font-semibold tracking-tight text-white"
            }
          >
            Personal war intelligence
          </h3>
        </div>

        <div className="rounded-full border border-cyan-100/12 bg-cyan-200/[0.045] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/68">
          Prototype locked
        </div>
      </div>

      <div className={signal ? "mt-3 grid grid-cols-3 gap-2" : "mt-5 grid gap-3 sm:grid-cols-3"}>
        <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Archive</div>
          <div className="mt-1.5 text-lg font-semibold text-white">{totalMatches}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">loaded wars</div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Read</div>
          <div className="mt-1.5 text-lg font-semibold text-white">{winRateLabel}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{mapLabel} · {civLabel}</div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Review</div>
          <div className="mt-1.5 text-lg font-semibold text-white">{weaknessLabel}</div>
        </div>
      </div>

      <div className={signal ? "mt-3 rounded-2xl border border-transparent bg-black/20 p-2" : "mt-5 rounded-2xl border border-white/8 bg-black/24 p-3"}>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={signal ? 2 : compact ? 3 : 4}
          className={[
            signal ? "min-h-[3.7rem]" : "min-h-24",
            signal ? "w-full resize-none rounded-xl border border-white/[0.025] bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-100/16 focus:bg-slate-950/72" : "w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-100/22 focus:bg-slate-950/90",
          ].join(" ")}
          placeholder="Analyze my latest game."
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={isFunding}
            onClick={fundDevelopment}
            className="rounded-full border border-amber-100/20 bg-[linear-gradient(135deg,rgba(248,214,84,0.98)_0%,rgba(232,181,49,0.98)_100%)] px-5 py-2.5 text-sm font-bold text-slate-950 shadow-none transition hover:bg-amber-300/95 hover:brightness-[1.01] disabled:cursor-wait disabled:opacity-70"
          >
            {isFunding ? "Opening Keplr..." : "Fund Development"}
          </button>

          <div className="text-xs leading-5 text-slate-500">
            Sends {FUNDING_AMOUNT_WOLO} WOLO · memo suggested: “Hasten development please”
          </div>
        </div>
      </div>

      {fundingStatus ? (
        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-slate-300">
          {fundingStatus}
          {txHash ? (
            <div className="mt-1 break-all text-[11px] text-cyan-100/70">
              tx {txHash}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PlayerHeroAiDomBinder(props: PlayerAiFeatureProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const stayTimerRef = useRef<number | null>(null);
  const hiddenPanelRef = useRef<HTMLElement | null>(null);

  const scheduleStayedTelemetry = (mode: PlayerAiMode) => {
    if (stayTimerRef.current) {
      window.clearTimeout(stayTimerRef.current);
    }

    stayTimerRef.current = window.setTimeout(() => {
      trackPlayerAiTelemetry(
        props,
        "player_ai_mode_stayed",
        mode,
        mode === "aoe2_ai"
          ? "Stayed on AoE2WAR AI profile view"
          : "Stayed on Regular profile view"
      );
      stayTimerRef.current = null;
    }, 9000);
  };

  const openPanel = (panel: HTMLElement) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    panel.dataset.playerAiSignalPanel = "true";
    panel.style.cursor = "pointer";

    if (window.getComputedStyle(panel).position === "static") {
      panel.style.position = "relative";
    }

    if (hiddenPanelRef.current && hiddenPanelRef.current !== panel) {
      restoreSignalPanelBackground(hiddenPanelRef.current);
    }

    hideSignalPanelBackground(panel);
    hiddenPanelRef.current = panel;

    setTarget(panel);
    setIsRendered(true);
    trackPlayerAiTelemetry(props, "player_ai_mode_selected", "aoe2_ai");
    scheduleStayedTelemetry("aoe2_ai");
    window.requestAnimationFrame(() => setIsVisible(true));
  };

  const closePanel = () => {
    setIsVisible(false);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    trackPlayerAiTelemetry(props, "player_ai_mode_selected", "regular");
    scheduleStayedTelemetry("regular");

    closeTimerRef.current = window.setTimeout(() => {
      restoreSignalPanelBackground(hiddenPanelRef.current || target);
      hiddenPanelRef.current = null;
      setIsRendered(false);
      setTarget(null);
      closeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    scheduleStayedTelemetry("regular");

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (stayTimerRef.current) {
        window.clearTimeout(stayTimerRef.current);
      }
      restoreSignalPanelBackground(hiddenPanelRef.current);
      hiddenPanelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const markHeroSurfaces = () => {
      findAllPlayerHeroRoots().forEach((hero) => {
        hero.dataset.playerAiHeroToggle = "true";
        hero.style.cursor = "pointer";
      });
    };

    markHeroSurfaces();

    const interval = window.setInterval(markHeroSurfaces, 900);
    window.addEventListener("resize", markHeroSurfaces);
    window.addEventListener("focus", markHeroSurfaces);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", markHeroSurfaces);
      window.removeEventListener("focus", markHeroSurfaces);
    };
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (!(event.target instanceof HTMLElement)) return;

      const hero = findHeroFromClickedElement(event.target);
      if (!hero) return;

      const panel = findSignalPanelFromHero(hero);
      if (!panel) return;

      event.preventDefault();
      event.stopPropagation();

      if (isRendered && target === panel) {
        closePanel();
      } else {
        openPanel(panel);
      }
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isRendered, target]);

  if (!target || !isRendered) return null;

  return createPortal(
    <div
      className={[
        "absolute inset-0 isolate z-40 grid place-items-stretch overflow-hidden rounded-[1.65rem] border border-transparent",
        "bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.10),transparent_36%),radial-gradient(circle_at_88%_12%,rgba(244,63,94,0.08),transparent_34%),linear-gradient(135deg,rgba(2,6,23,1)_0%,rgba(3,7,18,1)_52%,rgba(2,6,23,1)_100%)]",
        "p-2 transition-all duration-200 ease-out sm:p-3",
        isVisible ? "scale-100 opacity-100 blur-0" : "scale-[0.985] opacity-0 blur-[1px]",
      ].join(" ")}
      data-player-ai-interactive="true"
      data-player-ai-portal="true"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex h-full w-full max-w-2xl flex-col">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="rounded-full border border-white/12 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/22 hover:text-white"
            onClick={closePanel}
          >
            Profile
          </button>
        </div>

        <PlayerAiDevelopmentConsole {...props} variant="signal" />
      </div>
    </div>,
    target
  );
}
