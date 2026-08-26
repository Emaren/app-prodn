"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Crown,
  Eye,
  RadioTower,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
  TimerReset,
  Users,
} from "lucide-react";

import { WarGraphBoard } from "@/components/wargraph/WarGraphBoard";
import { WarGraphTime } from "@/components/wargraph/WarGraphTime";
import { WarGraphViewToggle } from "@/components/wargraph/WarGraphViewToggle";
import { WarriorDrawer } from "@/components/wargraph/WarriorDrawer";
import type {
  WarGraphActionKind,
  WarGraphAdvanceResponse,
  WarGraphPresenceResponse,
  WarGraphPublicAdvance,
  WarGraphPublicEngagement,
  WarGraphPublicHistoryEvent,
  WarGraphPublicNode,
  WarGraphPublicSnapshot,
  WarGraphViewMode,
} from "@/lib/wargraph/publicTypes";
import { WARGRAPH_VIEW_MODES } from "@/lib/wargraph/publicTypes";

const VIEW_STORAGE_KEY = "aoe2war.wargraph.view.v1";
const PRESENCE_INTERVAL_MS = 20_000;
const SNAPSHOT_INTERVAL_MS = 12_000;
const ACTION_TIMEOUT_MS = 12_000;

function isViewMode(value: unknown): value is WarGraphViewMode {
  return typeof value === "string" && WARGRAPH_VIEW_MODES.includes(value as WarGraphViewMode);
}

function Countdown({ target }: { target: string | null }) {
  const [remaining, setRemaining] = React.useState<string>("—");

  React.useEffect(() => {
    if (!target) {
      setRemaining("Schedule pending");
      return;
    }

    function update() {
      const distance = new Date(target as string).getTime() - Date.now();
      if (!Number.isFinite(distance)) {
        setRemaining("Schedule pending");
        return;
      }
      if (distance <= 0) {
        setRemaining("Now");
        return;
      }

      const hours = Math.floor(distance / 3_600_000);
      const minutes = Math.floor((distance % 3_600_000) / 60_000);
      const seconds = Math.floor((distance % 60_000) / 1_000);
      setRemaining(
        hours > 0
          ? `${hours}h ${String(minutes).padStart(2, "0")}m`
          : `${minutes}m ${String(seconds).padStart(2, "0")}s`,
      );
    }

    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [target]);

  return <span suppressHydrationWarning>{remaining}</span>;
}

function nodeName(
  nodeById: ReadonlyMap<string, WarGraphPublicNode>,
  nodeId: string,
) {
  return nodeById.get(nodeId)?.displayName ?? "Open seat";
}

function historyIcon(kind: WarGraphPublicHistoryEvent["kind"]) {
  switch (kind) {
    case "battle":
      return Swords;
    case "movement":
      return ArrowUpRight;
    case "engagement":
      return Swords;
    case "default":
      return ShieldCheck;
    case "gravity":
      return ArrowUpRight;
    case "reward":
      return Sparkles;
    case "void":
      return TimerReset;
  }
}

function StatusPill({ snapshot }: { snapshot: WarGraphPublicSnapshot }) {
  const healthy = snapshot.health.state === "healthy";
  const maintenance = snapshot.phase === "maintenance";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] ${
        healthy && !maintenance
          ? "border-emerald-300/[0.18] bg-emerald-300/[0.055] text-emerald-200"
          : "border-amber-200/[0.18] bg-amber-300/[0.055] text-amber-100"
      }`}
      title={snapshot.health.detail ?? snapshot.health.label}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          healthy && !maintenance
            ? "bg-emerald-300 shadow-[0_0_9px_rgba(110,231,183,0.8)] motion-safe:animate-pulse"
            : "bg-amber-300"
        }`}
      />
      {snapshot.health.label}
    </div>
  );
}

function ViewerActionCard({
  snapshot,
  pending,
  onAdvance,
}: {
  snapshot: WarGraphPublicSnapshot;
  pending: boolean;
  onAdvance: () => void;
}) {
  const viewerNode = snapshot.nodes.find((node) => node.id === snapshot.viewer.nodeId);
  const viewerRing = viewerNode
    ? snapshot.rings.find((ring) => ring.id === viewerNode.ringId) ?? null
    : null;
  const actionsRemaining = Math.max(
    0,
    snapshot.viewer.actionLimit - snapshot.viewer.actionsUsed,
  );

  return (
    <section className="overflow-hidden rounded-[1.3rem] border border-amber-200/[0.18] bg-[linear-gradient(145deg,rgba(76,48,13,0.25),rgba(5,14,22,0.96)_55%)] shadow-[0_20px_55px_rgba(0,0,0,0.34)]" aria-labelledby="wargraph-your-move">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="wargraph-your-move" className="flex items-center gap-2 font-serif text-sm font-black text-amber-50">
            <Activity className="h-4 w-4 text-amber-200" />
            Your Move
          </h2>
          <span className="rounded-full border border-white/[0.08] bg-black/20 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
            {snapshot.viewer.participating ? `${actionsRemaining} left` : "Automatic board"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {viewerNode ? (
          <div className="mb-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">Holding</span>
            <strong className="font-serif text-amber-100">{viewerRing?.label ?? "The Frontier"}</strong>
          </div>
        ) : (
          <p className="mb-3 text-xs leading-5 text-slate-400">
            {snapshot.viewer.authenticated
              ? "Your linked identity is not currently eligible for public WarGraph participation."
              : "Every eligible warrior is already on the board. Sign in to command your position."}
          </p>
        )}

        <button
          type="button"
          disabled={!snapshot.viewer.canAdvance || pending}
          onClick={onAdvance}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-100/[0.48] bg-[linear-gradient(145deg,#f5d78f,#b97a25)] px-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#080c11] shadow-[0_13px_30px_rgba(185,122,37,0.24)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40 motion-reduce:transition-none"
        >
          <ArrowUpRight className="h-4 w-4" />
          {pending ? "Opening advance…" : "Advance"}
        </button>

        {!snapshot.viewer.canAdvance && snapshot.viewer.advanceDisabledReason ? (
          <p className="mt-2.5 text-center text-[10px] leading-4 text-slate-500">
            {snapshot.viewer.advanceDisabledReason}
          </p>
        ) : (
          <p className="mt-2.5 text-center text-[9px] uppercase tracking-[0.12em] text-amber-100/50">
            Ask the next ring for battle
          </p>
        )}
      </div>
    </section>
  );
}

function OpenAdvanceList({
  advances,
  snapshot,
  pendingAdvanceId,
  onFocus,
  onTakeFight,
}: {
  advances: ReadonlyArray<WarGraphPublicAdvance>;
  snapshot: WarGraphPublicSnapshot;
  pendingAdvanceId: string | null;
  onFocus: (nodeId: string) => void;
  onTakeFight: (advanceId: string) => void;
}) {
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const ringById = new Map(snapshot.rings.map((ring) => [ring.id, ring]));
  const orderedAdvances = [...advances].sort((left, right) => {
    const leftEligible = snapshot.viewer.eligibleAdvanceIds.includes(left.id) ? 1 : 0;
    const rightEligible = snapshot.viewer.eligibleAdvanceIds.includes(right.id) ? 1 : 0;
    if (leftEligible !== rightEligible) return rightEligible - leftEligible;
    return Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
  });

  return (
    <section className="rounded-[1.3rem] border border-sky-200/[0.12] bg-[linear-gradient(145deg,rgba(12,32,47,0.9),rgba(4,11,18,0.97))] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)]" aria-labelledby="wargraph-open-advances">
      <div className="flex items-center justify-between gap-3">
        <h2 id="wargraph-open-advances" className="flex items-center gap-2 font-serif text-sm font-black text-amber-50">
          <Swords className="h-4 w-4 text-sky-300" />
          Open Advances
        </h2>
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-200/55">
          {advances.length} live
        </span>
      </div>

      {advances.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The rings are quiet. An advance request will appear here the instant a warrior calls upward.
        </p>
      ) : (
        <div className="mt-3 max-h-[28rem] space-y-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          {orderedAdvances.map((advance) => {
            const eligible =
              snapshot.viewer.canTakeFight &&
              snapshot.viewer.eligibleAdvanceIds.includes(advance.id);
            const requesterName = nodeName(nodeById, advance.requesterNodeId);
            const targetRing = ringById.get(advance.targetRingId)?.shortLabel ?? "next ring";

            return (
              <article
                key={advance.id}
                data-wargraph-advance-id={advance.id}
                className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
              >
                <button
                  type="button"
                  onClick={() => onFocus(advance.requesterNodeId)}
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/65"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate font-serif text-xs text-slate-100">{requesterName}</strong>
                    <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.1em] text-sky-200/65">
                      → {targetRing}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{advance.label}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[8px] uppercase tracking-[0.1em] text-slate-600">
                    <span>Closes <WarGraphTime value={advance.expiresAt} /></span>
                    {advance.winnerRewardWolo > 0 ? (
                      <span className="font-black text-amber-200/65">Winner +{advance.winnerRewardWolo} WOLO</span>
                    ) : null}
                  </div>
                </button>

                {eligible ? (
                  <button
                    type="button"
                    disabled={pendingAdvanceId === advance.id}
                    onClick={() => onTakeFight(advance.id)}
                    className="mt-2.5 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200/[0.24] bg-sky-300/[0.08] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-300/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 disabled:opacity-50 motion-reduce:transition-none"
                  >
                    <Swords className="h-3.5 w-3.5" />
                    {pendingAdvanceId === advance.id ? "Binding…" : "Take the fight"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RulesCard({ snapshot }: { snapshot: WarGraphPublicSnapshot }) {
  return (
    <section className="rounded-[1.3rem] border border-amber-200/[0.12] bg-[#06101a]/[0.92] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.26)]" aria-labelledby="wargraph-rules">
      <h2 id="wargraph-rules" className="flex items-center gap-2 font-serif text-sm font-black text-amber-50">
        <Scale className="h-4 w-4 text-amber-200" />
        Movement Rules
      </h2>
      <ul className="mt-3 space-y-2 text-[10px] leading-4 text-slate-400">
        <li><span className="font-black text-amber-200">Win</span> · {snapshot.rules.winMovement}</li>
        <li><span className="font-black text-sky-200">Loss</span> · {snapshot.rules.lossMovement}</li>
        <li><span className="font-black text-slate-300">Proof</span> · {snapshot.rules.proofRequirement}</li>
        <li><span className="font-black text-amber-100">WOLO</span> · {snapshot.rules.rewardNotice}</li>
        <li><span className="font-black text-slate-300">Inactivity</span> · {snapshot.rules.inactivity}</li>
      </ul>
    </section>
  );
}

function HistoryLedger({ snapshot }: { snapshot: WarGraphPublicSnapshot }) {
  return (
    <section className="mt-4 rounded-[1.45rem] border border-white/[0.08] bg-[#050d15]/[0.88] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.3)] sm:p-5" aria-labelledby="wargraph-ledger">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200/55">Immutable record</div>
          <h2 id="wargraph-ledger" className="mt-1 font-serif text-lg font-black text-amber-50">Recent War Ledger</h2>
        </div>
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Bounded public history</span>
      </div>

      {snapshot.recentHistory.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">The persistent ledger has not written its first movement yet.</p>
      ) : (
        <div className="mt-4 grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
          {snapshot.recentHistory.map((event) => {
            const Icon = historyIcon(event.kind);
            return (
              <article key={event.id} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-200/[0.12] bg-amber-300/[0.05] text-amber-200">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-serif text-xs font-black text-slate-100">{event.headline}</h3>
                    {event.woloDelta !== null && event.woloDelta !== 0 ? (
                      <span className="shrink-0 text-[8px] font-black text-amber-200">
                        {event.woloDelta > 0 ? "+" : ""}{event.woloDelta.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{event.detail}</p>
                  <p className="mt-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-600">{event.reasonLabel}</p>
                  <WarGraphTime value={event.at} className="mt-1.5 block text-[8px] uppercase tracking-[0.1em] text-slate-600" />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function WarGraphExperience({
  initialSnapshot,
}: {
  initialSnapshot: WarGraphPublicSnapshot;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [viewMode, setViewMode] = React.useState<WarGraphViewMode>("basic");
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<
    { kind: WarGraphActionKind; targetId?: string } | null
  >(null);
  const [actionNotice, setActionNotice] = React.useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [spectatorCount, setSpectatorCount] = React.useState(initialSnapshot.spectatorCount);
  const presenceInFlightRef = React.useRef(false);
  const snapshotInFlightRef = React.useRef(false);
  const actionInFlightRef = React.useRef(false);
  const snapshotRef = React.useRef(initialSnapshot);
  const boardRootRef = React.useRef<HTMLDivElement | null>(null);
  const visibleAdvanceIdsRef = React.useRef(new Set<string>());
  const focusedEngagementIdRef = React.useRef<string | null>(null);
  const actionIdempotencyRef = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    setSnapshot(initialSnapshot);
    snapshotRef.current = initialSnapshot;
    setSpectatorCount(initialSnapshot.spectatorCount);
  }, [initialSnapshot]);

  const refreshSnapshot = React.useCallback(async () => {
    if (document.visibilityState !== "visible" || snapshotInFlightRef.current) return;
    snapshotInFlightRef.current = true;
    try {
      const response = await fetch("/api/wargraph", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "If-None-Match": `"wargraph-${snapshotRef.current.revision}"`,
        },
      });
      if (response.status === 304) return;
      if (!response.ok) return;
      const next = (await response.json()) as Partial<WarGraphPublicSnapshot>;
      if (
        next.schemaVersion !== "wargraph-public/v1" ||
        typeof next.revision !== "string" ||
        !Array.isArray(next.nodes) ||
        !Array.isArray(next.rings) ||
        !Array.isArray(next.openAdvances) ||
        !Array.isArray(next.engagements)
      ) {
        return;
      }
      const verified = next as WarGraphPublicSnapshot;
      snapshotRef.current = verified;
      setSnapshot(verified);
      setSpectatorCount(verified.spectatorCount);
    } catch {
      // The last authoritative projection remains visible through transient loss.
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const interval = window.setInterval(
      () => void refreshSnapshot(),
      SNAPSHOT_INTERVAL_MS,
    );
    const resume = () => {
      if (document.visibilityState === "visible") void refreshSnapshot();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [refreshSnapshot]);

  React.useEffect(() => {
    const deadlines = [
      snapshot.night.nextTransitionAt,
      ...snapshot.openAdvances.map((advance) => advance.expiresAt),
      ...snapshot.engagements.map((engagement) => engagement.expiresAt),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right);
    const first = deadlines[0];
    if (!first) return;
    const timeout = window.setTimeout(
      () => void refreshSnapshot(),
      Math.max(250, Math.min(2_147_000_000, first - Date.now() + 250)),
    );
    return () => window.clearTimeout(timeout);
  }, [snapshot.night.nextTransitionAt, snapshot.openAdvances, snapshot.engagements, refreshSnapshot]);

  React.useEffect(() => {
    const root = boardRootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visibleIds = visibleAdvanceIdsRef.current;
    visibleIds.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.wargraphAdvanceId;
          if (!id) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            visibleIds.add(id);
          } else {
            visibleIds.delete(id);
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    root
      .querySelectorAll<HTMLElement>("[data-wargraph-advance-id]")
      .forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      visibleIds.clear();
    };
  }, [snapshot.openAdvances]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (isViewMode(stored)) setViewMode(stored);
    } catch {
      // Private browsing can deny storage. Basic remains the deterministic default.
    }
  }, []);

  const updateViewMode = React.useCallback((mode: WarGraphViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // View selection remains valid for the current visit.
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function heartbeat() {
      if (document.visibilityState !== "visible" || presenceInFlightRef.current) return;
      presenceInFlightRef.current = true;
      try {
        const response = await fetch("/api/wargraph/presence", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            intent: "heartbeat",
            page: "wargraph",
            visibleAdvanceIds: [...visibleAdvanceIdsRef.current],
            focusEngagementId: focusedEngagementIdRef.current,
          }),
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as WarGraphPresenceResponse;
        if (typeof payload.spectatorCount === "number") {
          setSpectatorCount(Math.max(0, Math.floor(payload.spectatorCount)));
        }
      } catch {
        // Presence is ambient telemetry and never blocks board interaction.
      } finally {
        presenceInFlightRef.current = false;
      }
    }

    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), PRESENCE_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, []);

  const submitAction = React.useCallback(
    async (kind: WarGraphActionKind, targetId?: string) => {
      if (pendingAction || actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      const actionIdentity = `${kind}:${targetId ?? "self"}`;
      const idempotencyKey =
        actionIdempotencyRef.current.get(actionIdentity) ??
        window.crypto.randomUUID();
      actionIdempotencyRef.current.set(actionIdentity, idempotencyKey);
      setPendingAction({ kind, targetId });
      setActionNotice(null);
      let actionTimeout: number | null = null;

      try {
        const controller = new AbortController();
        actionTimeout = window.setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
        const response = await fetch("/api/wargraph/advance", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            action: kind,
            advanceId: kind === "take_fight" ? targetId : undefined,
            engagementId: kind === "ready" ? targetId : undefined,
            idempotencyKey,
          }),
        });
        window.clearTimeout(actionTimeout);
        actionTimeout = null;
        const payload = (await response.json().catch(() => null)) as
          | WarGraphAdvanceResponse
          | null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "The WarGraph could not bind that move.");
        }

        if (payload.snapshot) {
          snapshotRef.current = payload.snapshot;
          setSnapshot(payload.snapshot);
        }
        actionIdempotencyRef.current.delete(actionIdentity);
        setActionNotice({ tone: "success", message: payload.message });
        if (kind === "take_fight") setFocusedNodeId(null);
        router.refresh();
      } catch (error) {
        setActionNotice({
          tone: "error",
          message:
            error instanceof DOMException && error.name === "AbortError"
              ? "The response timed out. Retry safely—the same command key will be reused."
              : error instanceof Error
                ? error.message
                : "The WarGraph could not bind that move.",
        });
      } finally {
        if (actionTimeout !== null) window.clearTimeout(actionTimeout);
        actionInFlightRef.current = false;
        setPendingAction(null);
      }
    },
    [pendingAction, router],
  );

  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const ringById = new Map(snapshot.rings.map((ring) => [ring.id, ring]));
  const focusedNode = focusedNodeId ? nodeById.get(focusedNodeId) ?? null : null;
  const focusedRing = focusedNode ? ringById.get(focusedNode.ringId) ?? null : null;
  const focusedEngagement = focusedNode
    ? snapshot.engagements.find(
        (engagement) =>
          engagement.aggressorNodeId === focusedNode.id || engagement.defenderNodeId === focusedNode.id,
      ) ?? null
    : null;
  const focusedAdvance = focusedNode
    ? snapshot.openAdvances.find((advance) => advance.requesterNodeId === focusedNode.id) ?? null
    : null;
  const openAdvanceRequesterIds = new Set(
    snapshot.openAdvances.map((advance) => advance.requesterNodeId),
  );
  const crownHolder = snapshot.crown.holderNodeId
    ? nodeById.get(snapshot.crown.holderNodeId) ?? null
    : null;
  const engagementCount = snapshot.engagements.filter(
    (engagement) => engagement.state !== "void",
  ).length;
  const closeDrawer = React.useCallback(() => setFocusedNodeId(null), []);
  const focusEngagement = React.useCallback(
    (engagement: WarGraphPublicEngagement) => {
      setFocusedNodeId(engagement.aggressorNodeId);
    },
    [],
  );
  React.useEffect(() => {
    focusedEngagementIdRef.current = focusedEngagement?.id ?? null;
  }, [focusedEngagement?.id]);

  return (
    <div ref={boardRootRef} className="relative isolate min-h-[70vh] pb-8 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-5vw] top-[-4rem] -z-10 h-[46rem] bg-[radial-gradient(ellipse_at_50%_15%,rgba(184,119,28,0.14),transparent_58%),radial-gradient(ellipse_at_12%_35%,rgba(27,111,154,0.08),transparent_54%)]" />

      <header className="mb-4 grid gap-4 border-b border-amber-200/[0.12] pb-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill snapshot={snapshot} />
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              <Eye className="h-3 w-3 text-sky-300" />
              {spectatorCount.toLocaleString()} watching
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="hidden h-12 w-12 place-items-center rounded-[1rem] border border-amber-200/[0.24] bg-amber-300/[0.07] text-amber-100 shadow-[0_14px_35px_rgba(0,0,0,0.28)] sm:grid">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <h2 className="bg-[linear-gradient(180deg,#fff3c9_0%,#e1b457_58%,#9b5f1d_100%)] bg-clip-text font-serif text-[2.35rem] font-black leading-none tracking-[0.02em] text-transparent sm:text-5xl">
                WARGRAPH
              </h2>
              <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/[0.52] sm:text-xs">
                The living tournament
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            {viewMode === "basic" ? (
              <>
                A persistent board of war tables. Win verified battles, move inward, and claim the Crown.
              </>
            ) : (
              <>
                Run a <Link href="https://aoe2war.com/download" className="cursor-pointer text-inherit no-underline hover:text-inherit hover:no-underline">watcher</Link>. Advance inward. Take the Crown. 2 battles per night. 5–11 PM Mountain Time.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <WarGraphViewToggle value={viewMode} onChange={updateViewMode} />
          <p className="px-1 text-[9px] uppercase tracking-[0.12em] text-slate-600">
            One board · three levels of detail
          </p>
        </div>
      </header>

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200/20 bg-[linear-gradient(145deg,rgba(110,71,20,0.13),rgba(6,17,27,0.82))] px-4 py-3" role="note" aria-label="Automatic WarGraph participation contract">
        <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
        <div>
          <strong className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">WarGraph live</strong>
          <p className="mt-0.5 text-xs leading-5 text-slate-400">
            Every eligible AoE2WAR warrior is already on the board. During Prime, an eligible live game proven by both players&apos; Watchers may affect position automatically.
          </p>
        </div>
      </div>

      <section className="mb-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="WarGraph live status">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#06101a]/75 px-3.5 py-3">
          <Clock3 className="h-4 w-4 shrink-0 text-amber-200" />
          <div className="min-w-0">
            <div className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{snapshot.night.label}</div>
            <div className="mt-0.5 truncate font-serif text-sm font-black text-amber-50">{snapshot.phaseLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#06101a]/75 px-3.5 py-3">
          <TimerReset className="h-4 w-4 shrink-0 text-sky-300" />
          <div className="min-w-0">
            <div className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{snapshot.night.nextTransitionLabel}</div>
            <div className="mt-0.5 font-serif text-sm font-black text-slate-100"><Countdown target={snapshot.night.nextTransitionAt} /></div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#06101a]/75 px-3.5 py-3">
          <Swords className="h-4 w-4 shrink-0 text-amber-200" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Live engagements</div>
            <div className="mt-0.5 font-serif text-sm font-black text-slate-100">{engagementCount}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#06101a]/75 px-3.5 py-3">
          <RadioTower className="h-4 w-4 shrink-0 text-emerald-300" />
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Your Watcher</div>
            <div className="mt-0.5 truncate font-serif text-sm font-black text-slate-100">{snapshot.viewer.watcher.label}</div>
          </div>
        </div>
      </section>

      {snapshot.transition ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-sky-200/15 bg-sky-300/[0.055] px-4 py-3 text-xs text-sky-50/80" role="status">
          <TimerReset className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
          <div>
            <strong className="font-serif text-sky-100">{snapshot.transition.label}</strong>
            <p className="mt-0.5 leading-5 text-slate-400">{snapshot.transition.detail}</p>
          </div>
        </div>
      ) : null}

      {actionNotice ? (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
            actionNotice.tone === "success"
              ? "border-emerald-300/[0.18] bg-emerald-300/[0.06] text-emerald-100"
              : "border-rose-300/[0.18] bg-rose-300/[0.06] text-rose-100"
          }`}
          role={actionNotice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {actionNotice.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
          {actionNotice.message}
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        <aside className="order-1 space-y-4 xl:order-none">
          <ViewerActionCard
            snapshot={snapshot}
            pending={pendingAction?.kind === "advance"}
            onAdvance={() => void submitAction("advance")}
          />

          {viewMode !== "basic" ? <RulesCard snapshot={snapshot} /> : null}

          {viewMode === "extreme" ? (
            <section className="rounded-[1.3rem] border border-white/[0.07] bg-[#06101a]/80 p-4" aria-label="WarGraph legend">
              <h2 className="flex items-center gap-2 font-serif text-sm font-black text-amber-50"><Scale className="h-4 w-4 text-amber-200" /> Board Legend</h2>
              <div className="mt-3 space-y-2.5 text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500">
                <div className="flex items-center gap-2"><span className="h-px w-8 bg-amber-200" /> Verified engagement</div>
                <div className="flex items-center gap-2"><span className="h-px w-8 border-t border-dashed border-sky-300" /> Open advance</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Ready now</div>
                <div className="flex items-center gap-2"><RadioTower className="h-3 w-3 text-sky-300" /> Player Watcher live</div>
              </div>
            </section>
          ) : null}
        </aside>

        <main className="order-2 min-w-0 xl:order-none">
          <WarGraphBoard
            rings={snapshot.rings}
            nodes={snapshot.nodes}
            engagements={snapshot.engagements}
            openAdvanceRequesterIds={openAdvanceRequesterIds}
            focusedNodeId={focusedNodeId}
            mode={viewMode}
            onFocusNode={setFocusedNodeId}
            onFocusEngagement={focusEngagement}
          />
        </main>

        <aside className="order-3 space-y-4 xl:order-none">
          <section className="rounded-[1.3rem] border border-amber-200/[0.17] bg-[linear-gradient(155deg,rgba(72,48,16,0.22),rgba(5,14,22,0.96)_55%)] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.3)]" aria-labelledby="wargraph-crown">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/60">
              <Crown className="h-3.5 w-3.5" /> The summit
            </div>
            <h2 id="wargraph-crown" className="mt-2 font-serif text-lg font-black text-amber-50">{snapshot.crown.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{snapshot.crown.subtitle}</p>
            <button
              type="button"
              disabled={!crownHolder}
              onClick={() => crownHolder && setFocusedNodeId(crownHolder.id)}
              className="mt-3 w-full rounded-xl border border-amber-200/[0.14] bg-black/20 p-3 text-left transition hover:border-amber-200/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/70 disabled:cursor-default motion-reduce:transition-none"
            >
              <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Crown holder</span>
              <span className="mt-1 block truncate font-serif text-base font-black text-amber-100">{crownHolder?.displayName ?? "Unclaimed"}</span>
              <span className="mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.11em] text-amber-200/55"><Sparkles className="h-3 w-3" /> Verified Crown winner +{snapshot.crown.battleRewardWolo.toLocaleString()} WOLO</span>
            </button>
            {viewMode !== "basic" ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-slate-500">
                  <span>Defenses tonight</span>
                  <strong className="text-amber-100">{snapshot.crown.defensesTonight}/{snapshot.crown.actionLimit}</strong>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/35">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#a7671e,#f4d47f)]"
                    style={{ width: `${Math.min(100, snapshot.crown.actionLimit > 0 ? (snapshot.crown.defensesTonight / snapshot.crown.actionLimit) * 100 : 0)}%` }}
                  />
                </div>
                {snapshot.crown.firstBloodAvailable ? (
                  <p className="mt-2 text-[9px] leading-4 text-amber-100/55">
                    First Blood remains live: the first qualifying Crown aggressor game to commence adds {snapshot.crown.firstBloodBonusWolo} WOLO.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <OpenAdvanceList
            advances={snapshot.openAdvances}
            snapshot={snapshot}
            pendingAdvanceId={pendingAction?.kind === "take_fight" ? pendingAction.targetId ?? null : null}
            onFocus={setFocusedNodeId}
            onTakeFight={(advanceId) => void submitAction("take_fight", advanceId)}
          />

          <section className="rounded-[1.3rem] border border-white/[0.07] bg-[#06101a]/80 p-4" aria-label="WarGraph schedule">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500"><Clock3 className="h-3.5 w-3.5 text-amber-200" /> Prime Hours</div>
            <div className="mt-2 font-serif text-sm font-black text-slate-100">{snapshot.night.primeHoursLabel}</div>
            {snapshot.night.nextTransitionAt ? (
              <WarGraphTime value={snapshot.night.nextTransitionAt} clock="mountain" className="mt-1 block text-[10px] text-slate-500" />
            ) : (
              <p className="mt-1 text-[10px] text-slate-500">Schedule pending</p>
            )}
            <p className="mt-2 border-t border-white/[0.06] pt-2 text-[9px] leading-4 text-slate-600">Persistent board · Mountain Time</p>
          </section>
        </aside>
      </div>

      {viewMode === "extreme" ? <HistoryLedger snapshot={snapshot} /> : null}

      <footer className="mt-5 flex flex-col items-center justify-between gap-2 border-t border-amber-200/10 px-2 pt-4 text-center sm:flex-row sm:text-left">
        <p className="font-serif text-xs uppercase tracking-[0.16em] text-amber-200/70">Fight for glory. Fight for WOLO.</p>
        <p className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.17em] text-slate-600"><Users className="h-3 w-3" /> Real players · verified battles · persistent consequence</p>
      </footer>

      {focusedNode ? (
        <WarriorDrawer
          node={focusedNode}
          ring={focusedRing}
          mode={viewMode}
          engagement={focusedEngagement}
          openAdvance={focusedAdvance}
          canTakeFight={
            Boolean(focusedAdvance) &&
            snapshot.viewer.canTakeFight &&
            snapshot.viewer.eligibleAdvanceIds.includes(focusedAdvance?.id ?? "")
          }
          takeFightDisabledReason={snapshot.viewer.takeFightDisabledReason}
          actionPending={pendingAction?.kind === "take_fight"}
          readyPending={pendingAction?.kind === "ready"}
          onTakeFight={(advanceId) => void submitAction("take_fight", advanceId)}
          onReady={(engagementId) => void submitAction("ready", engagementId)}
          onClose={closeDrawer}
        />
      ) : null}
    </div>
  );
}
