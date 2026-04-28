"use client";

import React from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  CalendarClock,
  ChevronRight,
  Coins,
  Radio,
  ShieldCheck,
  Swords,
  UserCircle,
  Wallet,
} from "lucide-react";

import AppShellNav from "@/components/pwa/AppShellNav";
import ConnectionStatusRail, { useConnectionStatus } from "@/components/pwa/ConnectionStatusRail";
import InstallAppPrompt from "@/components/pwa/InstallAppPrompt";
import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

type UserMePayload = {
  walletAddress?: string | null;
  pendingClaimAmountWolo?: number | null;
  pendingClaimCount?: number | null;
};

type LiveSummaryPayload = {
  liveCount?: number;
  readyCount?: number;
  updatedAt?: string;
};

type ScheduledMatchSummary = {
  id: number;
  displayState: string;
  scheduledAt: string;
  terms: {
    totalFundingWolo: number;
  };
  challenger: {
    uid: string;
    name: string;
  };
  challenged: {
    uid: string;
    name: string;
  };
  economy?: {
    challenger?: { fundedAt?: string | null };
    challenged?: { fundedAt?: string | null };
  };
};

type ChallengePayload = {
  scheduledMatches?: ScheduledMatchSummary[];
  updatedAt?: string;
};

type WoloTransactionRow = {
  id: string;
  direction: "in" | "out";
  amountWolo: number;
  label: string;
  status: string;
  occurredAt: string;
};

type WoloTransactionsPayload = {
  rows?: WoloTransactionRow[];
};

type LoadState = {
  user: UserMePayload | null;
  live: LiveSummaryPayload | null;
  challenges: ChallengePayload | null;
  transactions: WoloTransactionRow[];
  loadedAt: string | null;
};

const ACTIVE_MATCH_STATES = new Set([
  "proposed",
  "pending",
  "accepted",
  "terms_accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "checkin_open",
  "left_checked_in",
  "right_checked_in",
  "ready",
  "live",
  "resolving",
]);

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function formatWolo(value: number | null | undefined) {
  if (!value) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatLocalDate(value: string | null | undefined) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function compactState(value: string | null | undefined) {
  return (value || "ready").replace(/_/g, " ");
}

function pickNextMatch(matches: ScheduledMatchSummary[] | undefined) {
  if (!matches?.length) return null;
  const active = matches
    .filter((match) => ACTIVE_MATCH_STATES.has(match.displayState))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

  return active[0] ?? matches[0] ?? null;
}

function matchFundingLabel(match: ScheduledMatchSummary | null, uid: string | null) {
  if (!match || !uid) return "Challenge ready";
  const isChallenger = match.challenger.uid === uid;
  const fundedAt = isChallenger
    ? match.economy?.challenger?.fundedAt
    : match.economy?.challenged?.fundedAt;
  return fundedAt ? "You funded" : "Needs funding";
}

function WarRoomCard({
  eyebrow,
  title,
  value,
  href,
  icon: Icon,
  accent = "slate",
}: {
  eyebrow: string;
  title: string;
  value: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "slate" | "amber" | "emerald" | "sky";
}) {
  const accents = {
    slate: "border-white/10 bg-white/[0.04] text-slate-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    sky: "border-sky-300/20 bg-sky-300/10 text-sky-100",
  };

  return (
    <Link
      href={href}
      className={`group flex min-h-[9rem] flex-col justify-between rounded-[10px] border p-4 transition hover:-translate-y-0.5 hover:border-white/25 ${accents[accent]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">{eyebrow}</div>
          <div className="mt-2 text-lg font-semibold text-white">{title}</div>
        </div>
        <Icon className="h-5 w-5 shrink-0 opacity-75" />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="truncate text-sm text-slate-300">{value}</div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-white" />
      </div>
    </Link>
  );
}

export default function InstalledAppPage() {
  const { uid, user, isAuthenticated, loading, loginWithSteam } = useUserAuth();
  const { status: walletStatus, address, connect } = useKeplr();
  const balance = useWoloBalance(address);
  const [loadState, setLoadState] = React.useState<LoadState>({
    user: null,
    live: null,
    challenges: null,
    transactions: [],
    loadedAt: null,
  });
  const [walletError, setWalletError] = React.useState("");
  const connectionStatus = useConnectionStatus(loadState.loadedAt || loadState.live?.updatedAt);
  const isOffline = connectionStatus === "offline";

  React.useEffect(() => {
    let cancelled = false;

    async function loadWarRoom() {
      const [userPayload, livePayload, challengePayload, transactionsPayload] = await Promise.all([
        fetchJson<UserMePayload>("/api/user/me"),
        fetchJson<LiveSummaryPayload>("/api/live-games?summary=1"),
        fetchJson<ChallengePayload>("/api/challenges"),
        fetchJson<WoloTransactionsPayload>("/api/user/wolo-transactions?limit=5"),
      ]);

      if (cancelled) return;
      setLoadState({
        user: userPayload,
        live: livePayload,
        challenges: challengePayload,
        transactions: transactionsPayload?.rows ?? [],
        loadedAt: new Date().toISOString(),
      });
    }

    void loadWarRoom();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const nextMatch = pickNextMatch(loadState.challenges?.scheduledMatches);
  const recentTransaction = loadState.transactions[0] ?? null;
  const displayName = user?.inGameName || user?.steamPersonaName || "War room";
  const connectedAddress = address || loadState.user?.walletAddress || "";
  const walletValue =
    walletStatus === "connected"
      ? `${formatWolo(Number(balance.data ?? 0))} WOLO`
      : loadState.user?.pendingClaimAmountWolo
        ? `${formatWolo(loadState.user.pendingClaimAmountWolo)} WOLO pending`
        : "Connect wallet";

  const handleWalletConnect = async () => {
    if (isOffline) {
      setWalletError("Wallet actions need a live connection.");
      return;
    }

    setWalletError("");
    try {
      await connect();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  };

  return (
    <AppShellNav>
      <div className="space-y-5 pb-24 lg:pb-10">
        <section className="overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
          <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-7">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <ConnectionStatusRail lastUpdatedAt={loadState.loadedAt || loadState.live?.updatedAt} />
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300">
                  PWA ready
                </span>
              </div>
              <div className="text-xs uppercase tracking-[0.38em] text-amber-200/75">
                AoE2HDBets App
              </div>
              <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                Today War Room
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Live games, challenges, WOLO, and wagers in one installable command deck.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <Link
                    href="/challenge"
                    className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
                  >
                    <Swords className="h-4 w-4" />
                    Schedule Game
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => loginWithSteam("/app")}
                    disabled={loading || isOffline}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Steam Sign In
                  </button>
                )}
                {walletStatus === "connected" ? (
                  <Link
                    href="/wolo"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/25"
                  >
                    <Wallet className="h-4 w-4" />
                    Open WOLO
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleWalletConnect}
                    disabled={isOffline || walletStatus === "connecting"}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Wallet className="h-4 w-4" />
                    {isOffline ? "Offline" : "Connect Wallet"}
                  </button>
                )}
              </div>
              {walletError ? <div className="mt-3 text-xs text-rose-200">{walletError}</div> : null}
            </div>

            <div className="space-y-3">
              <InstallAppPrompt />
              <div className="rounded-[10px] border border-white/10 bg-slate-950/55 p-4">
                <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Signed in</div>
                <div className="mt-2 text-2xl font-semibold text-white">{displayName}</div>
                <div className="mt-2 truncate text-xs text-slate-400">
                  {connectedAddress || "Wallet not linked"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WarRoomCard
            eyebrow="WOLO"
            title={walletValue}
            value={
              walletStatus === "connected"
                ? "Wallet connected"
                : `${formatWolo(loadState.user?.pendingClaimCount)} pending claims`
            }
            href="/wolo"
            icon={Coins}
            accent="emerald"
          />
          <WarRoomCard
            eyebrow="Live games"
            title={`${formatWolo(loadState.live?.liveCount)} live`}
            value={`${formatWolo(loadState.live?.readyCount)} ready`}
            href="/live-games"
            icon={Radio}
            accent="sky"
          />
          <WarRoomCard
            eyebrow="Challenges"
            title={nextMatch ? `${nextMatch.challenger.name} vs ${nextMatch.challenged.name}` : "Schedule next"}
            value={
              nextMatch
                ? `${formatWolo(nextMatch.terms.totalFundingWolo)} WOLO each · ${formatLocalDate(
                    nextMatch.scheduledAt
                  )}`
                : "Create or accept a match"
            }
            href="/challenge"
            icon={CalendarClock}
            accent="amber"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[12px] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-slate-500">
                  Next lock
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {nextMatch ? `${nextMatch.challenger.name} vs ${nextMatch.challenged.name}` : "No active match"}
                </h2>
              </div>
              <Link
                href="/challenge"
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/25"
              >
                Open
              </Link>
            </div>
            <div className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.03] p-4">
              {nextMatch ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-300">
                  <span className="font-semibold text-white">
                    {formatWolo(nextMatch.terms.totalFundingWolo)} WOLO each
                  </span>
                  <span>·</span>
                  <span>{formatLocalDate(nextMatch.scheduledAt)}</span>
                  <span>·</span>
                  <span>{matchFundingLabel(nextMatch, uid)}</span>
                  <span>·</span>
                  <span>{compactState(nextMatch.displayState)}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-400">Challenge a player and lock the time.</div>
              )}
            </div>
          </div>

          <div className="rounded-[12px] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.34em] text-slate-500">
                  Money trail
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent WOLO</h2>
              </div>
              <Link
                href="/profile"
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/25"
              >
                Ledger
              </Link>
            </div>
            <div className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.03] p-4">
              {recentTransaction ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{recentTransaction.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {formatLocalDate(recentTransaction.occurredAt)} · {recentTransaction.status}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 font-semibold ${
                      recentTransaction.direction === "in" ? "text-emerald-200" : "text-amber-100"
                    }`}
                  >
                    {recentTransaction.direction === "in" ? "+" : "-"}
                    {formatWolo(recentTransaction.amountWolo)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">Sign in to see the latest WOLO movement.</div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <WarRoomCard
            eyebrow="Bet rail"
            title="Markets"
            value="Open wager board"
            href="/bets"
            icon={BadgeDollarSign}
          />
          <WarRoomCard
            eyebrow="Profile"
            title="Account"
            value="Preferences, ledger, scheduled games"
            href="/profile"
            icon={UserCircle}
          />
          <WarRoomCard
            eyebrow="Challenge"
            title="Match lock"
            value="Create + fund"
            href="/challenge"
            icon={Swords}
          />
        </section>
      </div>
    </AppShellNav>
  );
}
