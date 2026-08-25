"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import {
  Activity,
  CheckCircle2,
  Crown,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from "lucide-react";

import { WarGraphTime } from "@/components/wargraph/WarGraphTime";
import type {
  WarGraphPublicAdvance,
  WarGraphPublicEngagement,
  WarGraphPublicNode,
  WarGraphPublicRing,
  WarGraphViewMode,
} from "@/lib/wargraph/publicTypes";

function initialsForName(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function WarriorDrawer({
  node,
  ring,
  mode,
  engagement,
  openAdvance,
  canTakeFight,
  takeFightDisabledReason,
  actionPending,
  readyPending,
  onTakeFight,
  onReady,
  onClose,
}: {
  node: WarGraphPublicNode;
  ring: WarGraphPublicRing | null;
  mode: WarGraphViewMode;
  engagement: WarGraphPublicEngagement | null;
  openAdvance: WarGraphPublicAdvance | null;
  canTakeFight: boolean;
  takeFightDisabledReason: string | null;
  actionPending: boolean;
  readyPending: boolean;
  onTakeFight: (advanceId: string) => void;
  onReady: (engagementId: string) => void;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const contextualReward = engagement?.winnerRewardWolo ?? openAdvance?.winnerRewardWolo ?? 0;
  const firstBloodBonus = engagement?.firstBloodBonusWolo ?? openAdvance?.firstBloodBonusWolo ?? 0;

  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[260]" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[#02060b]/[0.72] backdrop-blur-[2px]"
        aria-label="Close warrior details"
        onClick={onClose}
      />

      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wargraph-warrior-drawer-title"
        className="absolute inset-x-2 bottom-2 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-[1.65rem] border border-amber-200/20 bg-[linear-gradient(160deg,rgba(13,28,42,0.99),rgba(3,9,15,0.995))] p-4 shadow-[0_35px_100px_rgba(0,0,0,0.7)] sm:inset-y-3 sm:left-auto sm:right-3 sm:w-[25rem] sm:max-h-none sm:rounded-[1.9rem] sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-amber-100/30 bg-[#0b1824] shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
              {node.avatarUrl ? (
                <Image
                  src={node.avatarUrl}
                  alt={node.avatarAlt}
                  fill
                  sizes="64px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_35%_25%,rgba(245,205,111,0.23),rgba(15,27,39,0.96)_62%)] font-serif text-lg font-black text-amber-100">
                  {initialsForName(node.displayName)}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/60">
                {node.isCrownHolder ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {ring?.label ?? "WarGraph"}
              </div>
              <h2
                id="wargraph-warrior-drawer-title"
                className="mt-1 truncate font-serif text-2xl font-black text-amber-50"
              >
                {node.displayName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {node.subtitle ?? node.stateLabel}
              </p>
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close warrior details"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-amber-200/30 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ["Wins", node.record.wins],
            ["Losses", node.record.losses],
            ["Streak", node.record.streak > 0 ? `+${node.record.streak}` : node.record.streak],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-white/[0.07] bg-black/20 px-2 py-3 text-center"
            >
              <div className="font-serif text-lg font-black text-amber-50">{value}</div>
              <div className="mt-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>

        {contextualReward > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200/[0.12] bg-amber-300/[0.045] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Sparkles className="h-4 w-4 text-amber-200" />
                Verified winner reward
              </span>
              <strong className="font-serif text-base text-amber-100">
                {contextualReward.toLocaleString()} WOLO
              </strong>
            </div>
            {firstBloodBonus > 0 ? (
              <p className="mt-1.5 text-[9px] leading-4 text-amber-100/55">
                The first qualifying Crown aggressor game to commence tonight adds {firstBloodBonus.toLocaleString()} WOLO.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode !== "basic" ? (
          <section className="mt-4 rounded-[1.1rem] border border-white/[0.07] bg-black/20 p-3.5" aria-label="Watcher readiness">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                <RadioTower className="h-3.5 w-3.5 text-sky-300" />
                Player Watcher
              </div>
              <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${
                node.watcher.state === "healthy"
                  ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"
                  : "border-slate-300/[0.12] bg-white/[0.03] text-slate-400"
              }`}>
                {node.watcher.label}
              </span>
            </div>
            {mode === "extreme" ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                {[
                  ["Connected", node.watcher.connected],
                  ["Monitor", node.watcher.monitorAttached],
                  ["HD Folder", node.watcher.folderReady],
                ].map(([label, ready]) => (
                  <div key={String(label)} className="rounded-lg bg-white/[0.035] px-1 py-2">
                    <div className={`mx-auto h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-300" : "bg-slate-600"}`} />
                    <div className="mt-1.5 text-[8px] uppercase tracking-[0.1em] text-slate-500">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[9px] text-slate-500">
              <span>Presence</span>
              <span className="font-bold text-slate-300">{node.stateLabel}</span>
            </div>
            {node.fossilization.stage !== "living" ? (
              <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
                <span>Fossilization</span>
                <span className="font-bold text-slate-300">{node.fossilization.label}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {engagement ? (
          <section className="mt-4 rounded-[1.1rem] border border-sky-200/[0.16] bg-sky-300/[0.045] p-3.5" aria-label="Active engagement">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-sky-200">
              <Swords className="h-3.5 w-3.5" />
              {engagement.label}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{engagement.detail}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Aggressor", engagement.aggressorReady],
                ["Defender", engagement.defenderReady],
              ].map(([label, ready]) => (
                <div key={String(label)} className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2 text-center">
                  <CheckCircle2 className={`mx-auto h-3.5 w-3.5 ${ready ? "text-emerald-300" : "text-slate-600"}`} />
                  <div className="mt-1 text-[8px] font-black uppercase tracking-[0.11em] text-slate-500">
                    {label} {ready ? "ready" : "not ready"}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-black/20 px-2.5 py-2 text-[9px]">
              <span className="text-slate-500">Match proof</span>
              <strong className="uppercase tracking-[0.08em] text-slate-300">
                {engagement.watcherProof === "double_watcher_live"
                  ? "Double Watcher live"
                  : engagement.watcherProof.replaceAll("_", " ")}
              </strong>
            </div>
            {engagement.expiresAt ? (
              <p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Contract deadline · <WarGraphTime value={engagement.expiresAt} />
              </p>
            ) : null}
            {engagement.isViewerParticipant && !engagement.viewerReady ? (
              <button
                type="button"
                disabled={!engagement.viewerCanReady || readyPending}
                onClick={() => onReady(engagement.id)}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200/30 bg-emerald-300/[0.08] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-100 transition hover:bg-emerald-300/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100/70 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
              >
                <CheckCircle2 className="h-4 w-4" />
                {readyPending ? "Recording readiness…" : "Ready with Watcher"}
              </button>
            ) : engagement.viewerReady ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Your readiness is recorded
              </p>
            ) : null}
            {engagement.isViewerParticipant && !engagement.viewerCanReady && engagement.readyDisabledReason ? (
              <p className="mt-2 text-center text-[9px] leading-4 text-slate-500">{engagement.readyDisabledReason}</p>
            ) : null}
            {engagement.roomHref ? (
              <Link
                href={engagement.roomHref}
                className="mt-3 flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[9px] font-black uppercase tracking-[0.13em] text-slate-200 transition hover:border-sky-200/30 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100/70 motion-reduce:transition-none"
              >
                Open challenge room
              </Link>
            ) : null}
          </section>
        ) : null}

        {openAdvance ? (
          <section className="mt-4 rounded-[1.1rem] border border-amber-200/[0.18] bg-[linear-gradient(145deg,rgba(126,81,20,0.18),rgba(18,18,16,0.4))] p-3.5" aria-label="Open advance challenge">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-amber-100">
              <Activity className="h-3.5 w-3.5" />
              Open advance
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{openAdvance.label}</p>
            <p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-slate-500">
              Expires · <WarGraphTime value={openAdvance.expiresAt} />
            </p>

            <button
              type="button"
              disabled={!canTakeFight || actionPending}
              onClick={() => onTakeFight(openAdvance.id)}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-100/45 bg-[linear-gradient(145deg,#f4d181,#b87825)] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#090d12] shadow-[0_12px_30px_rgba(190,124,34,0.22)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
            >
              <Swords className="h-4 w-4" />
              {actionPending ? "Binding fight…" : "Take the fight"}
            </button>
            {!canTakeFight && takeFightDisabledReason ? (
              <p className="mt-2 text-center text-[10px] leading-4 text-slate-500">
                {takeFightDisabledReason}
              </p>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
