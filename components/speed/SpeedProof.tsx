"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  getLivingKingdomServerVisualSnapshot,
  getLivingKingdomVisualSnapshot,
  orderLivingKingdomChipActors,
  requestLivingKingdomSelfAvatar,
  subscribeLivingKingdomVisualSnapshot,
} from "@/components/presence/livingKingdomVisualStore";
import { livingKingdomRealmForPath } from "@/lib/livingKingdom/realms";
import {
  getRecentSpeedSamples,
  SPEED_SAMPLE_UPDATED_EVENT,
} from "@/lib/speed/clientStore";
import { sanitizeSpeedPath } from "@/lib/speed/routeSanitizer";
import type { SpeedSample } from "@/lib/speed/types";

const AUTHORITATIVE_ROUTES = new Set([
  "/",
  "/bets",
  "/live-games",
  "/players",
  "/rivalries",
  "/leaderboard",
  "/war-chest",
  "/staking",
]);

function isDisplayableProof(sample: SpeedSample | null | undefined, route: string) {
  return Boolean(
    sample &&
      sample.route === route &&
      isValidProof(sample),
  );
}

function isValidProof(sample: SpeedSample | null | undefined) {
  return Boolean(
    sample &&
      sample.ready_source === "explicit" &&
      sample.valid_for_aggregation &&
      !sample.visibility_tainted &&
      typeof sample.ready_ms === "number" &&
      Number.isFinite(sample.ready_ms) &&
      sample.ready_ms >= 0,
  );
}

function formatReadyDuration(ms: number) {
  if (ms < 10) return "<0.01s";
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function navigationLabel(kind: SpeedSample["navigation_kind"]) {
  if (kind === "initial") return "Initial page load";
  if (kind === "reload") return "Page reload";
  if (kind === "back_forward") return "Back/forward restore";
  if (kind === "internal") return "In-site navigation";
  return "Navigation";
}

export default function SpeedProof() {
  const pathname = usePathname();
  const route = sanitizeSpeedPath(pathname || "/");
  const authoritative = AUTHORITATIVE_ROUTES.has(route);
  const livingKingdomRealm = livingKingdomRealmForPath(route);
  const [sample, setSample] = useState<SpeedSample | null>(null);
  const [open, setOpen] = useState(false);
  const proofRef = useRef<HTMLDivElement | null>(null);
  const routeRef = useRef(route);
  const routeBeganAtRef = useRef(Date.now());
  const presence = useSyncExternalStore(
    subscribeLivingKingdomVisualSnapshot,
    getLivingKingdomVisualSnapshot,
    getLivingKingdomServerVisualSnapshot,
  );

  useEffect(() => {
    routeRef.current = route;
    routeBeganAtRef.current = Date.now() - 3_000;
    setOpen(false);

    if (!AUTHORITATIVE_ROUTES.has(route)) {
      // Exact detail realms still share the combined presence chip. Reuse the
      // latest valid on-device proof rather than leaving a permanent fake
      // "Measuring…" label on a route that does not claim authoritative proof.
      setSample(
        getRecentSpeedSamples().find((candidate) => isValidProof(candidate)) ??
          null,
      );
      return;
    }

    setSample(null);

    const findCurrentProof = () => {
      const current = getRecentSpeedSamples().find((candidate) => {
        const occurredAt = Date.parse(candidate.occurred_at);
        return (
          isDisplayableProof(candidate, route) &&
          Number.isFinite(occurredAt) &&
          occurredAt >= routeBeganAtRef.current
        );
      });
      if (current) setSample(current);
    };

    // Covers initial hydration where the recorder can publish before this
    // component's effect subscription is active.
    findCurrentProof();
    const timers = [400, 1_200, 3_000, 7_000].map((delay) =>
      window.setTimeout(findCurrentProof, delay)
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [route]);

  useEffect(() => {
    const handleSample = (event: Event) => {
      const next = (event as CustomEvent<SpeedSample>).detail;
      const currentRoute = routeRef.current;
      if (!AUTHORITATIVE_ROUTES.has(currentRoute)) return;
      if (!isDisplayableProof(next, currentRoute)) return;
      setSample(next);
    };

    window.addEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
    return () => window.removeEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !proofRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!authoritative && !livingKingdomRealm) return null;

  const duration = sample?.ready_ms != null ? formatReadyDuration(sample.ready_ms) : null;
  const restored = sample?.navigation_kind === "back_forward";
  const retainedProof = Boolean(sample && sample.route !== route);
  const warriors = orderLivingKingdomChipActors(
    presence.actors,
    presence.selfId,
  );

  return (
    <div
      ref={proofRef}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 z-[170] sm:bottom-4 sm:right-4"
      data-speed-proof
    >
      {open && sample && duration ? (
        <div
          className="mb-2 w-[16.5rem] rounded-2xl border border-white/10 bg-[#080b12]/95 p-3.5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          role="status"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/80">
            AoE2WAR Speed Proof
          </div>
          <div className="mt-1.5 text-sm font-semibold text-white">
            {retainedProof ? "Last ready" : restored ? "Restored" : "Ready"} in {duration}
          </div>
          <div className="mt-1 text-xs leading-5 text-white/55">
            {retainedProof
              ? "Latest authoritative readiness measured on this device; this detail realm does not make a separate speed claim."
              : "Measured live on this device. This route reported authoritative readiness after its primary interface was usable."}
          </div>
          <div className="mt-2 border-t border-white/8 pt-2 text-[11px] text-white/40">
            {navigationLabel(sample.navigation_kind)} · {sample.route}
          </div>
          <Link
            href="/speed"
            className="mt-3 inline-flex text-xs font-medium text-amber-100/75 transition hover:text-amber-50"
          >
            Open my Speed Observatory →
          </Link>
        </div>
      ) : null}

      <div
        className={`flex h-10 items-center overflow-visible rounded-full border shadow-[0_10px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl transition ${
          duration
            ? "border-amber-100/15 bg-[#090b11]/88 text-amber-50/90 hover:border-amber-100/25 hover:bg-[#0d1018]/94"
            : "border-white/8 bg-[#090b11]/72 text-white/45"
        }`}
      >
        <button
          type="button"
          onClick={() => duration && setOpen((value) => !value)}
          className={`flex h-full items-center gap-1.5 rounded-l-full px-3 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/40 ${
            duration ? "cursor-pointer" : "cursor-default"
          }`}
          aria-expanded={duration ? open : undefined}
          aria-label={
            duration
              ? `AoE2WAR Speed Proof: ${retainedProof ? "last ready" : restored ? "restored" : "ready"} in ${duration}`
              : "AoE2WAR Speed Proof measuring this page"
          }
        >
          <span aria-hidden="true" className="text-[13px]">⚡</span>
          {duration ? (
            <span>
              {retainedProof ? "Last ready" : restored ? "Restored" : "Ready"} in <span className="font-semibold text-white">{duration}</span>
            </span>
          ) : authoritative ? (
            <span>Measuring…</span>
          ) : null}
        </button>

        {warriors.length ? (
          <div
            className="flex h-full max-w-[55vw] items-center overflow-x-auto border-l border-white/10 px-2.5 [scrollbar-width:none] sm:max-w-[34rem] [&::-webkit-scrollbar]:hidden"
            aria-label={`Warriors on this page: ${warriors.map((actor) => actor.displayName).join(", ")}${presence.overflowCount ? `, plus ${presence.overflowCount} more` : ""}`}
            data-living-kingdom-speed-stack
          >
            {warriors.map((actor, index) => {
              const isSelf = actor.id === presence.selfId;
              const portrait = (
                <Image
                  src={actor.avatarUrl}
                  alt=""
                  width={25}
                  height={25}
                  unoptimized
                  draggable={false}
                  className="h-full w-full object-cover object-top"
                />
              );
              const className = `relative grid h-[25px] w-[25px] shrink-0 overflow-hidden rounded-full border border-slate-200/35 bg-[#07111e] shadow-[0_3px_10px_rgba(0,0,0,0.48)] ${
                index ? "-ml-2" : ""
              } ${isSelf ? "opacity-[0.55] hover:opacity-80" : "opacity-80"}`;
              return isSelf ? (
                <button
                  key={actor.id}
                  type="button"
                  className={`${className} cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/55`}
                  style={{ zIndex: index + 1 }}
                  title={presence.selfVisible ? `${actor.displayName} (you)` : `Show ${actor.displayName} on your rail`}
                  aria-label={presence.selfVisible ? "Your roaming avatar is visible" : "Show my roaming avatar"}
                  onClick={requestLivingKingdomSelfAvatar}
                >
                  {portrait}
                </button>
              ) : (
                <span
                  key={actor.id}
                  className={className}
                  style={{ zIndex: index + 1 }}
                  title={actor.displayName}
                  aria-hidden="true"
                >
                  {portrait}
                </span>
              );
            })}
            {presence.overflowCount ? (
              <span
                className="relative grid h-[25px] min-w-[25px] shrink-0 -ml-2 place-items-center rounded-full border border-slate-200/35 bg-[#101827] px-1 text-[9px] font-bold text-slate-100/80 shadow-[0_3px_10px_rgba(0,0,0,0.48)]"
                style={{ zIndex: warriors.length + 1 }}
                title={`${presence.overflowCount} more warriors on this page`}
                aria-label={`${presence.overflowCount} additional warriors on this page`}
              >
                +{presence.overflowCount}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
