"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Coins,
  Crown,
  Filter,
  FileSearch,
  FlaskConical,
  Home,
  Images,
  LayoutGrid,
  Palette,
  RadioTower,
  Search,
  SortDesc,
  Sparkles,
  UsersRound,
} from "lucide-react";

import AdminUserCard from "@/components/admin/command-tower/AdminUserCard";
import type { AdminUserRow, DraftState } from "@/components/admin/command-tower/types";
import WoloChainEntryTile from "@/components/admin/command-tower/WoloChainEntryTile";
import {
  formatWolo,
  pinnedBottomRank,
} from "@/components/admin/command-tower/utils";
import { useAdminCommandTowerData } from "@/components/admin/command-tower/useAdminCommandTowerData";
import { WatcherDownloadRail } from "@/components/admin/WatcherDownloadRail";

type DraftStateByUid = Record<string, DraftState>;
type JourneyFilterMode =
  | "all"
  | "Hot"
  | "Active"
  | "Browsing"
  | "Dormant"
  | "Unknown"
  | "suspicious";
type UserSortMode = "recent" | "engagement" | "newest" | "wolo";

const EMPTY_DRAFT: DraftState = {
  customBadge: "",
  beltTitle: "",
  beltNote: "",
  beltDisplayOnProfile: true,
  artifactTitle: "",
  artifactNote: "",
  artifactDisplayOnProfile: true,
  designationTitle: "",
  designationNote: "",
  designationDisplayOnProfile: true,
  clanSlug: "",
  giftKind: "WOLO",
  giftAmount: "",
  giftNote: "",
  rescindNote: "",
};

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Admin Home", Icon: Home },
  { href: "/admin/hero-studio", label: "Hero Studio", Icon: Sparkles },
  { href: "/admin/events", label: "Featured Event", Icon: CalendarRange },
  { href: "/admin/trophies", label: "Trophy Command", Icon: Crown },
  { href: "/admin/media-assets", label: "Media Assets", Icon: Images },
  { href: "/admin/replay-review", label: "Replay Review", Icon: FileSearch },
  { href: "/admin/parser-lab", label: "HD Replay Engine Room", Icon: FlaskConical },
  { href: "/admin/wolochain", label: "WoloChain", Icon: Coins },
  { href: "/admin/user-list", label: "User List / Command Tower", Icon: UsersRound },
] as const;

const JOURNEY_FILTERS: Array<{ mode: JourneyFilterMode; label: string }> = [
  { mode: "all", label: "All" },
  { mode: "Hot", label: "Hot" },
  { mode: "Active", label: "Active" },
  { mode: "Browsing", label: "Browsing" },
  { mode: "Dormant", label: "Dormant" },
  { mode: "Unknown", label: "Unknown" },
  { mode: "suspicious", label: "Suspicious / Low Confidence" },
];

const SORT_OPTIONS: Array<{ mode: UserSortMode; label: string }> = [
  { mode: "recent", label: "Last seen / recent activity" },
  { mode: "engagement", label: "Engagement quality" },
  { mode: "newest", label: "Newest user" },
  { mode: "wolo", label: "WOLO on file" },
];

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      {sublabel ? <div className="mt-2 text-sm text-slate-400">{sublabel}</div> : null}
    </div>
  );
}

function JourneyCountPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "hot" | "active" | "quiet" | "unknown" | "suspicious";
}) {
  const toneClass = {
    hot: "border-amber-200/25 bg-amber-400/10 text-amber-100",
    active: "border-emerald-200/25 bg-emerald-400/10 text-emerald-100",
    quiet: "border-white/10 bg-white/5 text-slate-300",
    unknown: "border-slate-400/20 bg-slate-400/10 text-slate-300",
    suspicious: "border-rose-300/25 bg-rose-400/10 text-rose-100",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function journeyIsSuspiciousOrLowConfidence(user: AdminUserRow) {
  const journey = user.journeySummary;
  return Boolean(
    journey?.suspiciousSignal ||
      journey?.confidenceLabel === "Low" ||
      journey?.qualityNotes.some((note) => /suspicious|probe|low confidence|thin/i.test(note))
  );
}

function userMatchesJourneyFilter(user: AdminUserRow, filterMode: JourneyFilterMode) {
  if (filterMode === "all") return true;
  if (filterMode === "suspicious") return journeyIsSuspiciousOrLowConfidence(user);
  return (user.journeySummary?.engagementLabel ?? "Unknown") === filterMode;
}

function buildJourneySearchText(user: AdminUserRow) {
  const journey = user.journeySummary;
  return [
    user.displayName,
    user.uid,
    user.inGameName,
    user.steamPersonaName,
    user.email,
    journey?.currentPath,
    journey?.previousPath,
    journey?.entryPath,
    journey?.lastMeaningfulAction?.label,
    journey?.lastMeaningfulAction?.path,
    journey?.pathSequence.join(" "),
    journey?.recentActionTrail.map((event) => `${event.type} ${event.label} ${event.path ?? ""}`).join(" "),
    user.recentActions.map((event) => `${event.type} ${event.label ?? ""} ${event.path ?? ""}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function userMatchesSearch(user: AdminUserRow, searchValue: string) {
  const needle = searchValue.trim().toLowerCase();
  if (!needle) return true;
  return buildJourneySearchText(user).includes(needle);
}

function journeyEngagementRank(user: AdminUserRow) {
  const journey = user.journeySummary;
  if (!journey) return 0;
  const labelScore = {
    Hot: 5,
    Active: 4,
    Browsing: 3,
    Dormant: 1,
    Unknown: 0,
  }[journey.engagementLabel];
  const confidenceScore = {
    High: 3,
    Good: 2,
    Limited: 1,
    Low: 0,
  }[journey.confidenceLabel];
  const suspicionPenalty = journeyIsSuspiciousOrLowConfidence(user) ? 1 : 0;
  return labelScore * 10 + confidenceScore - suspicionPenalty;
}

function timestampRank(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function recentActivityRank(user: AdminUserRow) {
  return Math.max(timestampRank(user.lastActivityAt), timestampRank(user.lastSeen));
}

function woloOnFileRank(user: AdminUserRow) {
  return (
    user.giftedWolo +
    user.pendingWoloClaimAmount +
    user.claimedWoloClaimAmount +
    user.betStats.stakedWolo +
    user.betStats.paidOutWolo
  );
}

function compareUsersByMode(left: AdminUserRow, right: AdminUserRow, sortMode: UserSortMode) {
  const leftPinned = pinnedBottomRank(left);
  const rightPinned = pinnedBottomRank(right);
  if (leftPinned !== rightPinned) {
    if (leftPinned === 0) return -1;
    if (rightPinned === 0) return 1;
    return leftPinned - rightPinned;
  }

  if (sortMode === "engagement") {
    const engagementDelta = journeyEngagementRank(right) - journeyEngagementRank(left);
    if (engagementDelta !== 0) return engagementDelta;
    return recentActivityRank(right) - recentActivityRank(left);
  }

  if (sortMode === "newest") {
    return timestampRank(right.createdAt) - timestampRank(left.createdAt);
  }

  if (sortMode === "wolo") {
    const woloDelta = woloOnFileRank(right) - woloOnFileRank(left);
    if (woloDelta !== 0) return woloDelta;
    return recentActivityRank(right) - recentActivityRank(left);
  }

  const activityDelta = recentActivityRank(right) - recentActivityRank(left);
  if (activityDelta !== 0) return activityDelta;

  if (left.recentActionsTotalCount !== right.recentActionsTotalCount) {
    return right.recentActionsTotalCount - left.recentActionsTotalCount;
  }

  if (left.userUnreadCount !== right.userUnreadCount) {
    return right.userUnreadCount - left.userUnreadCount;
  }

  return right.unreadCount - left.unreadCount;
}

function buildJourneyCounts(users: AdminUserRow[]) {
  return {
    hot: users.filter((user) => user.journeySummary?.engagementLabel === "Hot").length,
    activeBrowsing: users.filter((user) =>
      ["Active", "Browsing"].includes(user.journeySummary?.engagementLabel ?? "")
    ).length,
    dormant: users.filter((user) => user.journeySummary?.engagementLabel === "Dormant").length,
    unknown: users.filter((user) => !user.journeySummary || user.journeySummary.engagementLabel === "Unknown").length,
    suspicious: users.filter(journeyIsSuspiciousOrLowConfidence).length,
  };
}

type PlayerAiTelemetryMode = "aoe2_ai" | "regular" | "unknown";

function getPlayerAiModeFromActivity(
  activity: AdminUserRow["recentActions"][number]
): PlayerAiTelemetryMode {
  const mode = activity.metadata?.mode;
  if (mode === "aoe2_ai" || mode === "regular") return mode;
  const label = activity.label?.toLowerCase() ?? "";
  if (label.includes("aoe2")) return "aoe2_ai";
  if (label.includes("regular")) return "regular";
  return "unknown";
}

function formatTelemetryTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildPlayerAiTelemetry(users: AdminUserRow[]) {
  const events = users.flatMap((user) =>
    user.recentActions
      .filter((activity) => activity.type.startsWith("player_ai_"))
      .map((activity) => ({
        ...activity,
        displayName: user.displayName,
        uid: user.uid,
        mode: getPlayerAiModeFromActivity(activity),
      }))
  ).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const latestModeByUid = new Map<string, PlayerAiTelemetryMode>();

  for (const event of events) {
    if (
      !latestModeByUid.has(event.uid) &&
      (event.type === "player_ai_mode_selected" || event.type === "player_ai_mode_stayed")
    ) {
      latestModeByUid.set(event.uid, event.mode);
    }
  }

  return {
    aiSelected: events.filter((event) => event.type === "player_ai_mode_selected" && event.mode === "aoe2_ai").length,
    regularSelected: events.filter((event) => event.type === "player_ai_mode_selected" && event.mode === "regular").length,
    aiStayed: events.filter((event) => event.type === "player_ai_mode_stayed" && event.mode === "aoe2_ai").length,
    regularStayed: events.filter((event) => event.type === "player_ai_mode_stayed" && event.mode === "regular").length,
    fundClicks: events.filter((event) => event.type === "player_ai_fund_clicked").length,
    currentAi: Array.from(latestModeByUid.values()).filter((mode) => mode === "aoe2_ai").length,
    currentRegular: Array.from(latestModeByUid.values()).filter((mode) => mode === "regular").length,
    latest: events.slice(0, 8),
  };
}

function PlayerAiTelemetryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}

function formatAdminDateTime(value: string | null) {
  if (!value) return "No signal yet";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const ACADEMY_HERO_VARIANT_LABELS = {
  b: "Base",
  a: "Antique",
  e: "Epic",
} as const;


export default function AdminCommandTowerPage() {
  const {
    data,
    activityByUid,
    activityTotals,
    activityNextOffsets,
    loading,
    error,
    refreshAll,
    loadNextActions,
  } = useAdminCommandTowerData();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftStateByUid>({});
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilterMode>("all");
  const [journeySearch, setJourneySearch] = useState("");
  const [sortMode, setSortMode] = useState<UserSortMode>("recent");

  const getDraft = useCallback(
    (uid: string) => drafts[uid] ?? EMPTY_DRAFT,
    [drafts]
  );

  const updateDraft = useCallback((uid: string, patch: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [uid]: {
        ...(current[uid] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
  }, []);

  const runCommunityAction = useCallback(async (uid: string, body: Record<string, unknown>) => {
    setBusyKey(`${uid}:${String(body.action)}`);
    try {
      const response = await fetch(`/api/admin/users/${uid}/community`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }

      await refreshAll();
    } catch (nextError) {
      console.error("Community action failed:", nextError);
      window.alert(nextError instanceof Error ? nextError.message : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }, [refreshAll]);

  const deleteUser = useCallback(async (uid: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    setBusyKey(`${uid}:delete`);
    try {
      const response = await fetch(`/api/admin/delete_user/${uid}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }
      await refreshAll();
    } catch (nextError) {
      console.error("Delete failed:", nextError);
      window.alert("Delete failed.");
    } finally {
      setBusyKey(null);
    }
  }, [refreshAll]);

  const loadMoreActions = useCallback(async (uid: string) => {
    setBusyKey(`${uid}:next_actions`);
    try {
      await loadNextActions(uid);
    } catch (nextError) {
      console.error("Failed to load activity history:", nextError);
      window.alert(nextError instanceof Error ? nextError.message : "Activity history failed.");
    } finally {
      setBusyKey(null);
    }
  }, [loadNextActions]);

  const journeyCounts = useMemo(
    () => buildJourneyCounts(data?.users ?? []),
    [data?.users]
  );

  const playerAiTelemetry = useMemo(
    () => buildPlayerAiTelemetry(data?.users ?? []),
    [data?.users]
  );

  const sortedUsers = useMemo(() => {
    const users = data?.users ?? [];
    return users
      .filter((user) => userMatchesJourneyFilter(user, journeyFilter))
      .filter((user) => userMatchesSearch(user, journeySearch))
      .sort((left, right) => compareUsersByMode(left, right, sortMode));
  }, [data?.users, journeyFilter, journeySearch, sortMode]);

  if (!data && loading) {
    return (
      <main className="space-y-6 py-6 text-white">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
          <div className="max-w-4xl space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              Community Command Tower
            </div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">
              Loading operator rails...
            </h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="max-w-4xl space-y-4">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
            Community Command Tower
          </div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">
            Admin dashboard for the real player experience
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            User health, honors, schedule pressure, bet history, direct-line unread danger, and
            the product signals that tell you who is alive, who is drifting, and where the heat is
            building.
          </p>
          <nav aria-label="Admin sections" className="flex flex-wrap gap-2 pt-2">
            {ADMIN_NAV_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/45 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-200/40 hover:bg-amber-300/10 hover:text-amber-100"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {data?.overview ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Users" value={data.overview.totalUsers} sublabel={`${data.overview.activeUsers24h} active in 24h`} />
          <StatCard label="Needs Reply" value={data.overview.unreadForAdmin} sublabel="Unread from players to you" />
          <StatCard label="Player Surprise" value={data.overview.unreadForUsers} sublabel="Unread items currently showing for players" />
          <StatCard label="Pending Honors" value={data.overview.pendingHonors} sublabel="Badges + gifts waiting on acceptance" />
          <StatCard label="Pending Wallet Links" value={data.overview.pendingWoloClaims} sublabel={`${formatWolo(data.overview.pendingWoloClaimAmount)} WOLO awaiting verified wallets`} />
          <StatCard label="Claimed Claims" value={data.overview.claimedWoloClaims} sublabel={`${formatWolo(data.overview.claimedWoloClaimAmount)} WOLO resolved`} />
        </section>
      ) : null}

      {data ? (
        <section className="rounded-[1.5rem] border border-cyan-200/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.10),transparent_30%),linear-gradient(135deg,rgba(2,6,23,0.88),rgba(15,23,42,0.72))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-cyan-100/60">
                <Sparkles className="h-4 w-4" />
                Player AI Telemetry
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                AoE2WAR AI vs Regular profile behavior
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Clicks, settled mode, and funding intent from the player hero chamber.
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
              Current: {playerAiTelemetry.currentAi} AI · {playerAiTelemetry.currentRegular} regular
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <PlayerAiTelemetryCard label="AI selected" value={playerAiTelemetry.aiSelected} sublabel="Opened AoE2WAR AI" />
            <PlayerAiTelemetryCard label="Regular selected" value={playerAiTelemetry.regularSelected} sublabel="Returned to profile" />
            <PlayerAiTelemetryCard label="Stayed AI" value={playerAiTelemetry.aiStayed} sublabel="Stayed 9s on AI" />
            <PlayerAiTelemetryCard label="Stayed Regular" value={playerAiTelemetry.regularStayed} sublabel="Stayed 9s regular" />
            <PlayerAiTelemetryCard label="Fund Clicks" value={playerAiTelemetry.fundClicks} sublabel="Development funding intent" />
          </div>

          <div className="mt-5 grid gap-2">
            {playerAiTelemetry.latest.length > 0 ? (
              playerAiTelemetry.latest.map((event) => (
                <div
                  key={`${event.uid}:${event.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3 text-sm"
                >
                  <div>
                    <span className="font-semibold text-white">{event.displayName}</span>
                    <span className="ml-2 text-slate-400">{event.label || event.type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.16em] ${
                      event.mode === "aoe2_ai"
                        ? "border-cyan-200/25 bg-cyan-400/10 text-cyan-100"
                        : event.mode === "regular"
                          ? "border-amber-200/25 bg-amber-400/10 text-amber-100"
                          : "border-white/10 bg-white/5 text-slate-300"
                    }`}>
                      {event.mode === "aoe2_ai" ? "AoE2 AI" : event.mode}
                    </span>
                    <span className="text-slate-500">{formatTelemetryTime(event.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-4 text-sm text-slate-400">
                No Player AI events yet. Open a player page and toggle the AI chamber once.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {data?.overview ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Palette className="h-4 w-4" />
              Theme Mix
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {data.overview.themeBreakdown.map((entry) => (
                <div key={entry.themeKey} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{entry.themeKey}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{entry.count}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Sparkles className="h-4 w-4" />
              Tile Skin Split
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {data.overview.viewBreakdown.map((entry) => (
                <div key={entry.viewMode} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{entry.viewMode}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{entry.count}</div>
                </div>
              ))}
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tracked Actions</div>
                <div className="mt-2 text-3xl font-semibold text-white">{data.overview.totalActionEvents}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 xl:col-span-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <LayoutGrid className="h-4 w-4" />
              View Preference Signals
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.overview.tileViewBreakdown.map((entry) => (
                <div key={entry.tileKey} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {entry.label}
                    </div>
                    <div className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] capitalize text-slate-300">
                      {entry.preferredMode}
                    </div>
                  </div>
                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-950/80">
                    <span
                      className="bg-slate-500"
                      style={{ width: `${entry.basicPercent}%` }}
                      title={`${entry.basicPercent}% Basic`}
                    />
                    <span
                      className="bg-amber-300"
                      style={{ width: `${entry.advancedPercent}%` }}
                      title={`${entry.advancedPercent}% Advanced`}
                    />
                    <span
                      className="bg-sky-300"
                      style={{ width: `${entry.extremePercent}%` }}
                      title={`${entry.extremePercent}% Extreme`}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      ["B", entry.basicCount, entry.basicPercent],
                      ["A", entry.advancedCount, entry.advancedPercent],
                      ["E", entry.extremeCount, entry.extremePercent],
                    ].map(([mode, count, percent]) => (
                      <div
                        key={String(mode)}
                        className="rounded-xl border border-white/7 bg-slate-950/55 px-2 py-2 text-center"
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {mode}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">{count}</div>
                        <div className="text-[10px] text-slate-500">{percent}%</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                    <span>{entry.explicitCount} chosen</span>
                    <span>{entry.defaultCount} default</span>
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-amber-200/12 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_48%),rgba(255,255,255,0.04)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Ranked Ladder
                  </div>
                  <div className="rounded-full border border-amber-200/18 bg-amber-300/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-100/80">
                    {data.overview.leaderboardLaneBreakdown.preferredLane} leads
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["RM", data.overview.leaderboardLaneBreakdown.rmCount, data.overview.leaderboardLaneBreakdown.rmPercent],
                    ["DM", data.overview.leaderboardLaneBreakdown.dmCount, data.overview.leaderboardLaneBreakdown.dmPercent],
                  ].map(([lane, count, percent]) => (
                    <div key={String(lane)} className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {lane}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">{count}</div>
                      <div className="mt-1 text-xs text-slate-500">{percent}% of users</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-950/80">
                  <span
                    className="bg-amber-300"
                    style={{ width: `${data.overview.leaderboardLaneBreakdown.rmPercent}%` }}
                  />
                  <span
                    className="bg-cyan-300"
                    style={{ width: `${data.overview.leaderboardLaneBreakdown.dmPercent}%` }}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-rose-200/12 bg-[radial-gradient(circle_at_top_right,rgba(124,29,67,0.2),transparent_52%),rgba(255,255,255,0.04)] px-4 py-4 md:col-span-2 xl:col-span-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Academy Hero Signal
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">
                      Latest chosen hero per visitor. Raw clicks stay visible underneath.
                    </div>
                  </div>
                  <div className="rounded-full border border-rose-200/16 bg-rose-300/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase text-rose-100/80">
                    {ACADEMY_HERO_VARIANT_LABELS[data.overview.academyHeroPreferences.preferredVariant]} leads
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="flex h-2 overflow-hidden rounded-full bg-slate-950/80">
                      <span
                        className="bg-slate-500"
                        style={{
                          width: `${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.b}%`,
                        }}
                        title={`${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.b}% Base`}
                      />
                      <span
                        className="bg-amber-300"
                        style={{
                          width: `${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.a}%`,
                        }}
                        title={`${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.a}% Antique`}
                      />
                      <span
                        className="bg-rose-400"
                        style={{
                          width: `${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.e}%`,
                        }}
                        title={`${data.overview.academyHeroPreferences.latestVisitorChoicePercentages.e}% Epic`}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(["b", "a", "e"] as const).map((variant) => (
                        <div
                          key={variant}
                          className="rounded-xl border border-white/7 bg-slate-950/55 px-2 py-2 text-center"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {variant.toUpperCase()}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {data.overview.academyHeroPreferences.latestVisitorChoiceCounts[variant]}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {data.overview.academyHeroPreferences.latestVisitorChoicePercentages[variant]}% users
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Visitors</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {data.overview.academyHeroPreferences.uniqueVisitors}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Events</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {data.overview.academyHeroPreferences.totalEvents}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">24h</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {data.overview.academyHeroPreferences.last24Hours}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Latest</div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-200">
                          {formatAdminDateTime(data.overview.academyHeroPreferences.latestAt)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        Recent Choices
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {data.overview.academyHeroPreferences.sourceCounts.heroClick} clicks · {data.overview.academyHeroPreferences.sourceCounts.toggle} toggles
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {data.overview.academyHeroPreferences.recent.length > 0 ? (
                        data.overview.academyHeroPreferences.recent.slice(0, 5).map((row, index) => (
                          <div
                            key={`${row.at}-${row.anonymousId ?? row.ip ?? index}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-black/20 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-200">
                                {row.path || "/academy"} · {row.source === "hero-click" ? "hero click" : row.source}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                {formatAdminDateTime(row.at)} · {row.ip ?? "unknown ip"}
                              </div>
                            </div>
                            <div className="rounded-full border border-rose-200/14 bg-rose-300/[0.08] px-2.5 py-1 text-[11px] font-black uppercase text-rose-100">
                              {row.variant}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-white/7 bg-black/20 px-3 py-3 text-xs text-slate-500">
                          No Academy hero choices logged yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 md:col-span-2 xl:col-span-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Schedule Organization
                  </div>
                  <div className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] text-slate-300">
                    {data.overview.scheduledPreferenceUsage.usersWithPreferences} users
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <div className="text-2xl font-semibold text-white">
                      {data.overview.scheduledPreferenceUsage.favoriteCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">favorites</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-white">
                      {data.overview.scheduledPreferenceUsage.bookmarkedCount}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">bookmarks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-white">
                      {Object.values(data.overview.scheduledPreferenceUsage.colorTagCounts).reduce(
                        (sum, count) => sum + count,
                        0
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">color tags</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {Object.entries(data.overview.scheduledPreferenceUsage.colorTagCounts).map(
                    ([tag, count]) => (
                      <span key={tag} className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-1">
                        {tag} {count}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data ? (
        <div className="mt-6">
          <WoloChainEntryTile
            marketSummary={data.marketRail.summary}
            settlementSummary={data.settlementRail.summary}
            walletFrictionSummary={data.walletFriction.summary}
          />
        </div>
      ) : null}

      {data ? (
        <div className="mt-6">
          <div className="mb-3 flex justify-end">
            <Link
              href="/admin/watcher-funnel"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-400/15"
            >
              <RadioTower className="h-3.5 w-3.5" />
              Detailed watcher funnel
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <WatcherDownloadRail analytics={data.watcherDownloads} />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                <Filter className="h-4 w-4" />
                Journey Intelligence
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {sortedUsers.length} of {data.users.length} users shown
              </div>
            </div>
            <div className="grid w-full gap-3 lg:w-auto lg:grid-cols-[minmax(16rem,22rem)_minmax(14rem,18rem)]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={journeySearch}
                  onChange={(event) => setJourneySearch(event.target.value)}
                  placeholder="Search users, routes, actions"
                  className="h-11 w-full rounded-xl border border-white/10 bg-slate-900/85 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
                />
              </label>
              <label className="relative block">
                <SortDesc className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as UserSortMode)}
                  className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-slate-900/85 pl-9 pr-9 text-sm text-white outline-none transition focus:border-amber-300/35"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.mode} value={option.mode}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <JourneyCountPill label="Hot" value={journeyCounts.hot} tone="hot" />
            <JourneyCountPill label="Active / Browsing" value={journeyCounts.activeBrowsing} tone="active" />
            <JourneyCountPill label="Dormant" value={journeyCounts.dormant} tone="quiet" />
            <JourneyCountPill label="Unknown" value={journeyCounts.unknown} tone="unknown" />
            <JourneyCountPill label="Suspicious / Low" value={journeyCounts.suspicious} tone="suspicious" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {JOURNEY_FILTERS.map((filter) => (
              <button
                key={filter.mode}
                type="button"
                onClick={() => setJourneyFilter(filter.mode)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  journeyFilter === filter.mode
                    ? "border-amber-200/50 bg-amber-300/15 text-amber-100"
                    : "border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {filter.mode === "suspicious" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {filter.label}
                  </span>
                ) : (
                  filter.label
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        {sortedUsers.length > 0 ? (
          sortedUsers.map((user) => (
            <AdminUserCard
              key={user.uid}
              user={user}
              clans={data?.clans ?? []}
              draft={getDraft(user.uid)}
              busyKey={busyKey}
              renderedActions={activityByUid[user.uid] ?? user.recentActions}
              activityTotal={activityTotals[user.uid] ?? user.recentActionsTotalCount}
              nextOffset={activityNextOffsets[user.uid] ?? null}
              onDraftChange={updateDraft}
              onLoadNextActions={loadMoreActions}
              onRunCommunityAction={runCommunityAction}
              onDeleteUser={deleteUser}
            />
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-5 py-6 text-sm text-slate-400">
            No users match the current journey filters.
          </div>
        )}
      </section>

    </main>
  );
}
