"use client";

import {
  Bell,
  Bookmark,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Copy,
  Crown,
  Eye,
  Feather,
  Flame,
  Lightbulb,
  Lock,
  Map,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Pin,
  Radio,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  buildForumFallbackSnapshot,
  FORUM_CHANNELS,
  FORUM_REACTIONS,
  FORUM_TABS,
  type ForumChannelKey,
  type ForumReaction,
  type ForumSnapshot,
  type ForumTabKey,
  type ForumThreadView,
} from "@/lib/forum";
import { TILE_VIEW_MODES, type TileViewMode } from "@/lib/tileViewPreferences";

const READ_STORAGE_KEY = "aoe2hdbets:forum-read-threads";
const GUEST_BOOKMARK_STORAGE_KEY = "aoe2hdbets:forum-guest-bookmarks";
const FALLBACK_SNAPSHOT = buildForumFallbackSnapshot();
const CHRONICLE_SLUG = "wolo-chronicles-001-the-kingdom-has-no-pause-button";
const HOUSE_RULES_SLUG = "war-room-code-bring-receipts-respect-the-gg";
const CHAMPION_SLUG = "champions-desk-what-the-throne-asks-of-a-challenger";

type ForumShelf =
  | "featured"
  | "feed"
  | "bookmarks"
  | "mine"
  | "mentions"
  | "watched";

const fieldManual = [
  {
    title: "The first expensive decision",
    body: "Find it before reviewing the final dramatic fight. The wipe is often only the invoice.",
    slug: "replay-clinic-the-game-was-lost-before-the-score-noticed",
  },
  {
    title: "Scout with a question",
    body: "Random movement reveals terrain. Purposeful movement reveals a plan.",
    slug: "what-should-i-do-while-aging-up",
  },
  {
    title: "Follow-up makes the castle",
    body: "Without a next move, 650 stone is just extremely confident landscaping.",
    slug: "castle-drops-masterpiece-or-medieval-eviction-notice",
  },
];

const roomSignals = [
  {
    eyebrow: "Tonight's weather",
    title: "Heavy castle-drop discourse",
    body: "Visibility poor near the forward gold.",
    slug: "castle-drops-masterpiece-or-medieval-eviction-notice",
  },
  {
    eyebrow: "Useful question",
    title: "When did AoE2 become a place?",
    body: "The first Chronicle is collecting origin stories.",
    slug: CHRONICLE_SLUG,
  },
  {
    eyebrow: "Replay doctrine",
    title: "Bring the evidence",
    body: "A timestamp beats twelve paragraphs of fog.",
    slug: HOUSE_RULES_SLUG,
  },
];

const channelIcons: Record<ForumChannelKey, LucideIcon> = {
  "wolo-chronicles": Feather,
  "champion-corner": Crown,
  "official-announcements": Megaphone,
  "bounty-board": Swords,
  tournaments: Trophy,
  "strategy-builds": Lightbulb,
  "replays-analysis": BookOpen,
  "maps-civs": Map,
  "new-players": CircleHelp,
  "watcher-help": Wrench,
  suggestions: Sparkles,
  "off-topic-tavern": MessageCircle,
};

function readStoredSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
}

function writeStoredSet(key: string, values: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    // Private browsing can reject local storage. The current page state still works.
  }
}

function formatCount(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }
  return String(value);
}

function formatForumDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Field date unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === 2026 ? undefined : "numeric",
  }).format(date);
}

function reactionTotal(thread: ForumThreadView) {
  return thread.reactions.reduce((total, reaction) => total + reaction.count, 0);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ThreadAvatar({
  seed,
  hot = false,
  size = "standard",
}: {
  seed: string;
  hot?: boolean;
  size?: "small" | "standard";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${
        size === "small" ? "h-9 w-9 text-[11px]" : "h-12 w-12 text-sm"
      } ${
        hot
          ? "border-amber-200/36 bg-amber-300/12 text-amber-100"
          : "border-sky-200/22 bg-sky-300/10 text-sky-100"
      }`}
      aria-hidden="true"
    >
      {initials(seed)}
    </div>
  );
}

function ForumModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: TileViewMode;
  onChange: (mode: TileViewMode) => void;
}) {
  const labels: Record<TileViewMode, string> = {
    basic: "Basic",
    advanced: "Advanced",
    extreme: "Extreme",
  };

  return (
    <div
      className="inline-flex items-center rounded-full border border-amber-200/28 bg-[#050910]/88 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.46),0_0_24px_rgba(251,191,36,0.08)] backdrop-blur-xl"
      role="group"
      aria-label="Forum view"
    >
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={viewMode === mode}
          aria-label={`${labels[mode]} forum view`}
          title={`${labels[mode]} view`}
          className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            viewMode === mode
              ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
              : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
          }`}
        >
          {mode[0]}
        </button>
      ))}
    </div>
  );
}

function SideButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-amber-300/12 text-amber-50"
          : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${
            active ? "text-amber-200" : "text-amber-100/70"
          }`}
        />
        <span className="truncate">{label}</span>
      </span>
      {count != null ? (
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] ${
            active
              ? "border-amber-200/20 bg-amber-300/10 text-amber-100"
              : "border-white/10 bg-white/[0.05] text-slate-400"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ForumHero({
  viewMode,
  onViewModeChange,
  onOpenChronicle,
}: {
  viewMode: TileViewMode;
  onViewModeChange: (mode: TileViewMode) => void;
  onOpenChronicle: () => void;
}) {
  const advanced = viewMode !== "basic";

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.22),transparent_25%),linear-gradient(145deg,#17100a,#091018_50%,#050608)] px-5 py-10 shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:px-8">
      <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,rgba(0,0,0,0.45),transparent)]" />
      <div className="absolute right-4 top-4 z-20 sm:right-5 sm:top-5">
        <ForumModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>

      {advanced ? (
        <div className="relative z-10 grid gap-7 pt-8 text-left lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-end lg:pt-0">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
              <Crown className="h-4 w-4" />
              AoE2WAR
            </div>
            <h1 className="mt-3 font-serif text-5xl font-semibold uppercase tracking-[0.12em] text-amber-50 sm:text-7xl">
              Forum
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              The War Room for people who know a replay is evidence, “one more game”
              is not a unit of time, and every great rivalry deserves a written record.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                Advanced view
              </span>
              {viewMode === "extreme" ? (
                <span className="rounded-full border border-sky-200/14 bg-sky-300/[0.06] px-3 py-1.5 text-sky-100/70">
                  Extreme width · advanced kit
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenChronicle}
            className="group relative overflow-hidden rounded-[1.45rem] border border-amber-200/22 bg-black/32 p-5 text-left transition hover:border-amber-200/42 hover:bg-black/42"
          >
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-300/10 blur-2xl transition group-hover:bg-amber-300/18" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-100/62">
                <Feather className="h-3.5 w-3.5" />
                Wolo Chronicles · I
              </div>
              <div className="mt-3 text-lg font-semibold leading-6 text-white">
                The Kingdom Has No Pause Button
              </div>
              <div className="mt-3 text-xs leading-5 text-slate-400">
                Origin stories from the civilization we keep returning to.
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-100">
                Read the first Chronicle
                <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="relative z-10 mx-auto max-w-4xl pt-7 text-center sm:pt-0">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
            <Crown className="h-4 w-4" />
            AoE2WAR
          </div>
          <h1 className="mt-3 font-serif text-5xl font-semibold uppercase tracking-[0.12em] text-amber-50 sm:text-7xl">
            Forum
          </h1>
          <p className="mt-4 text-sm uppercase tracking-[0.24em] text-slate-300">
            War Room
          </p>
        </div>
      )}
    </section>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 sm:max-w-[18rem]">
      <Search className="h-3.5 w-3.5 shrink-0" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search the War Room"
        className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full p-0.5 text-slate-500 hover:text-white"
          aria-label="Clear forum search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

function FeaturedThreadCard({
  thread,
  advanced,
  read,
  onOpen,
  onBookmark,
}: {
  thread: ForumThreadView;
  advanced: boolean;
  read: boolean;
  onOpen: () => void;
  onBookmark: () => void;
}) {
  return (
    <article
      className={`rounded-[1.35rem] border p-4 transition hover:bg-white/[0.06] ${
        thread.isPinned
          ? "border-amber-200/36 bg-amber-300/8 shadow-[0_0_34px_rgba(245,158,11,0.1)]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex gap-4">
        <ThreadAvatar seed={thread.author.displayName} hot={thread.isHot} />
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                thread.isHot
                  ? "border-amber-200/28 bg-amber-300/10 text-amber-100"
                  : "border-sky-200/20 bg-sky-300/10 text-sky-100"
              }`}
            >
              {thread.tag}
            </span>
            {thread.isPinned ? <Pin className="h-3.5 w-3.5 text-amber-200/70" /> : null}
            {thread.isHot ? <Flame className="h-4 w-4 text-orange-300" /> : null}
            {!read ? (
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.8)]" />
            ) : null}
          </div>
          <h2 className="mt-2 text-base font-semibold leading-6 text-white sm:text-lg">
            {thread.title}
          </h2>
          {advanced ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
              {thread.excerpt}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="text-slate-400">{thread.author.displayName}</span>
            <span>{formatForumDate(thread.createdAt)}</span>
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <button
            type="button"
            onClick={onBookmark}
            className={`rounded-full border p-2 transition ${
              thread.bookmarked
                ? "border-amber-200/28 bg-amber-300/12 text-amber-100"
                : "border-white/8 bg-white/[0.025] text-slate-500 hover:text-white"
            }`}
            aria-label={thread.bookmarked ? "Remove bookmark" : "Bookmark thread"}
          >
            <Bookmark
              className={`h-3.5 w-3.5 ${thread.bookmarked ? "fill-current" : ""}`}
            />
          </button>
          <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {thread.replyCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {formatCount(thread.viewCount)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function RecentThreadCard({
  thread,
  advanced,
  read,
  onOpen,
  onBookmark,
}: {
  thread: ForumThreadView;
  advanced: boolean;
  read: boolean;
  onOpen: () => void;
  onBookmark: () => void;
}) {
  return (
    <article className="rounded-[1.1rem] border border-white/8 bg-white/[0.025] px-4 py-3 transition hover:border-white/16 hover:bg-white/[0.045]">
      <div className="flex items-start gap-3">
        <ThreadAvatar seed={thread.author.displayName} size="small" hot={thread.isHot} />
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            {!read ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
            ) : null}
            <h3 className="min-w-0 text-sm font-semibold leading-5 text-white">
              {thread.title}
            </h3>
          </div>
          {advanced ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">
              {thread.excerpt}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>{thread.author.displayName}</span>
            <span>{thread.tag}</span>
            <span>{formatForumDate(thread.updatedAt)}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <MessageSquare className="h-3.5 w-3.5" />
            {thread.replyCount}
          </span>
          <button
            type="button"
            onClick={onBookmark}
            className={`rounded-full p-1.5 transition hover:bg-white/[0.06] hover:text-white ${
              thread.bookmarked ? "text-amber-200" : "text-slate-500"
            }`}
            aria-label={thread.bookmarked ? "Remove bookmark" : "Bookmark thread"}
          >
            <Bookmark
              className={`h-3.5 w-3.5 ${thread.bookmarked ? "fill-current" : ""}`}
            />
          </button>
        </div>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-black/22 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function EmptyForumState({
  onReset,
  onCreate,
}: {
  onReset: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.025] px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-200/16 bg-amber-300/[0.06] text-amber-100">
        <Search className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">No scouts found that trail.</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        Clear the filters or open the thread the room apparently forgot to start.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
        >
          Clear filters
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Start a dispatch
        </button>
      </div>
    </div>
  );
}

function ThreadDialog({
  thread,
  authenticated,
  ledgerOnline,
  pendingAction,
  onClose,
  onBookmark,
  onReaction,
  onReply,
  onSignIn,
}: {
  thread: ForumThreadView;
  authenticated: boolean;
  ledgerOnline: boolean;
  pendingAction: string | null;
  onClose: () => void;
  onBookmark: () => void;
  onReaction: (emoji: ForumReaction) => void;
  onReply: (body: string) => Promise<boolean>;
  onSignIn: () => void;
}) {
  const [reply, setReply] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const channel = FORUM_CHANNELS.find((entry) => entry.key === thread.channel);
  const canWrite = authenticated && ledgerOnline && thread.id != null && !thread.isLocked;

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    const sent = await onReply(reply);
    if (sent) setReply("");
  }

  async function copyLink() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("thread", thread.slug);
      await window.navigator.clipboard.writeText(url.toString());
      toast.success("Thread link copied.");
    } catch {
      toast.error("The link would not copy. The trebuchets deny involvement.");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-[#02060f]/82 backdrop-blur-[5px]"
        onClick={onClose}
        aria-label="Close thread"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="forum-thread-title"
        className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/12 bg-[linear-gradient(145deg,#0d1828,#050b14_58%,#03070d)] shadow-[0_36px_140px_rgba(0,0,0,0.72)] sm:max-h-[90dvh] sm:rounded-[1.75rem]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-[#07101b]/92 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-amber-100/65">
              {thread.isPinned ? <Pin className="h-3.5 w-3.5" /> : null}
              {channel?.label || "War Room"}
            </div>
            <div className="mt-1 truncate text-xs text-slate-500">
              {thread.tag} · {formatForumDate(thread.createdAt)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition hover:text-white"
              aria-label="Copy thread link"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onBookmark}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                thread.bookmarked
                  ? "border-amber-200/25 bg-amber-300/12 text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
              }`}
              aria-label={thread.bookmarked ? "Remove bookmark" : "Bookmark thread"}
            >
              <Bookmark
                className={`h-4 w-4 ${thread.bookmarked ? "fill-current" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition hover:text-white"
              aria-label="Close thread"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto">
          <article className="px-5 py-7 sm:px-9 sm:py-9">
            <div className="flex items-center gap-3">
              <ThreadAvatar seed={thread.author.displayName} hot={thread.isHot} />
              <div>
                <div className="font-semibold text-white">{thread.author.displayName}</div>
                <div className="mt-0.5 text-xs text-slate-500">{thread.author.role}</div>
              </div>
            </div>

            <h1
              id="forum-thread-title"
              className="mt-6 max-w-3xl font-serif text-3xl font-semibold leading-tight text-amber-50 sm:text-5xl"
            >
              {thread.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              {thread.excerpt}
            </p>

            <div className="mt-7 space-y-5 text-[15px] leading-8 text-slate-200">
              {thread.body.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-white/8 py-4">
              <div className="flex flex-wrap gap-2">
                {FORUM_REACTIONS.map((emoji) => {
                  const reaction = thread.reactions.find((entry) => entry.emoji === emoji);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onReaction(emoji)}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                        reaction?.viewerReacted
                          ? "border-amber-200/30 bg-amber-300/12 text-amber-50"
                          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                      aria-label={`React ${emoji}`}
                    >
                      <span>{emoji}</span>
                      <span className="text-xs text-slate-400">{reaction?.count ?? 0}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {formatCount(thread.viewCount)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {thread.replyCount}
                </span>
              </div>
            </div>
          </article>

          <section className="border-t border-white/8 bg-black/16 px-5 py-7 sm:px-9">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                  Campfire Replies
                </div>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {thread.replyCount === 0
                    ? "First scout gets the clean ground."
                    : `${thread.replyCount} voice${thread.replyCount === 1 ? "" : "s"} at the table`}
                </h2>
              </div>
              {thread.isLocked ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
                  <Lock className="h-3.5 w-3.5" />
                  Sealed
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3">
              {thread.posts.map((post, index) => (
                <article
                  key={post.id ?? `${post.author.displayName}-${index}`}
                  className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="flex gap-3">
                    <ThreadAvatar seed={post.author.displayName} size="small" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-white">
                          {post.author.displayName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {post.author.role} · {formatForumDate(post.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                        {post.body}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {!thread.isLocked ? (
              <form onSubmit={submitReply} className="mt-5">
                {canWrite ? (
                  <>
                    <label className="block">
                      <span className="sr-only">Reply to this thread</span>
                      <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={4}
                        maxLength={12_000}
                        placeholder="Add evidence, a useful question, or one exceptionally well-supported grievance…"
                        className="w-full resize-y rounded-[1.2rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/30"
                      />
                    </label>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        Argue the build. Leave the villager intact.
                      </div>
                      <button
                        type="submit"
                        disabled={!reply.trim() || pendingAction === "reply"}
                        className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {pendingAction === "reply" ? "Sending…" : "Send reply"}
                      </button>
                    </div>
                  </>
                ) : authenticated ? (
                  <div className="rounded-[1.2rem] border border-amber-200/14 bg-amber-300/[0.05] px-4 py-4 text-sm leading-6 text-amber-50/80">
                    The Chronicle is readable, but the shared forum ledger is not available
                    in this environment yet. No pretend posting: your reply rail will open
                    when the forum migration is live.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="flex w-full items-center justify-between gap-4 rounded-[1.2rem] border border-amber-200/18 bg-amber-300/[0.06] px-4 py-4 text-left transition hover:bg-amber-300/[0.1]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-amber-50">
                        Sign in to pull up a chair
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Reading is public. Replies and reactions belong to known citizens.
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-amber-200" />
                  </button>
                )}
              </form>
            ) : null}
          </section>
        </div>
      </section>
    </div>,
    document.body
  );
}

function NewThreadDialog({
  authenticated,
  ledgerOnline,
  pending,
  onClose,
  onSignIn,
  onSubmit,
}: {
  authenticated: boolean;
  ledgerOnline: boolean;
  pending: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onSubmit: (draft: {
    channel: ForumChannelKey;
    title: string;
    excerpt: string;
    body: string;
  }) => Promise<boolean>;
}) {
  const [channel, setChannel] = useState<ForumChannelKey>("wolo-chronicles");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ channel, title, excerpt, body });
  }

  return createPortal(
    <div className="fixed inset-0 z-[330] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-[#02060f]/82 backdrop-blur-[5px]"
        onClick={onClose}
        aria-label="Close new thread composer"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-thread-title"
        className="relative max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[1.75rem] border border-white/12 bg-[linear-gradient(145deg,#0d1828,#050b14_58%,#03070d)] p-5 shadow-[0_36px_140px_rgba(0,0,0,0.72)] sm:max-h-[90dvh] sm:rounded-[1.75rem] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-100/65">
              <Feather className="h-3.5 w-3.5" />
              New dispatch
            </div>
            <h2 id="new-thread-title" className="mt-2 text-2xl font-semibold text-white">
              Put something worth answering on the table.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
            aria-label="Close composer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!authenticated ? (
          <div className="mt-6 rounded-[1.25rem] border border-amber-200/18 bg-amber-300/[0.06] p-5">
            <div className="text-base font-semibold text-amber-50">
              Reading is public. Publishing has a name on it.
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Sign in with Steam, then come back to your dispatch. The room is more
              useful when claims and people can find each other again.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="mt-4 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200"
            >
              Sign in to write
            </button>
          </div>
        ) : !ledgerOnline ? (
          <div className="mt-6 rounded-[1.25rem] border border-amber-200/18 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-50/85">
            The page archive is here, but the shared forum ledger is not available in this
            environment. The composer stays closed rather than pretending a local draft
            was published to everyone.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Table
              </span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as ForumChannelKey)}
                className="mt-2 w-full rounded-[1rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              >
                {FORUM_CHANNELS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Headline
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                placeholder="A question, case, challenge, or useful confession"
                className="mt-2 w-full rounded-[1rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Field note
              </span>
              <input
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                maxLength={320}
                placeholder="One sentence that tells the room why it should click"
                className="mt-2 w-full rounded-[1rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Dispatch
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={12_000}
                rows={9}
                placeholder="Give context. Name the map or version. Add the replay or timestamp when the claim needs evidence. Paragraphs are welcome; fog is not."
                className="mt-2 w-full resize-y rounded-[1rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/30"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
              <div className="text-xs text-slate-500">
                Bring receipts. Respect the GG.
              </div>
              <button
                type="submit"
                disabled={pending || title.trim().length < 6 || body.trim().length < 20}
                className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                {pending ? "Publishing…" : "Publish dispatch"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}

export default function ForumWarRoom() {
  const { viewMode, setViewMode } = useTileViewPreference("forum");
  const {
    isAuthenticated,
    loginWithSteam,
    playerName,
    uid,
  } = useUserAuth();
  const [snapshot, setSnapshot] = useState<ForumSnapshot>(FALLBACK_SNAPSHOT);
  const [ledgerOnline, setLedgerOnline] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<ForumTabKey>("war-room");
  const [selectedChannel, setSelectedChannel] = useState<ForumChannelKey | null>(null);
  const [shelf, setShelf] = useState<ForumShelf>("feed");
  const [query, setQuery] = useState("");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [readSlugs, setReadSlugs] = useState<Set<string>>(new Set());
  const [guestBookmarks, setGuestBookmarks] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const advanced = viewMode !== "basic";
  const extreme = viewMode === "extreme";

  const hydrateSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const response = await fetch("/api/forum", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Forum request failed: ${response.status}`);
      }
      const payload = (await response.json()) as ForumSnapshot;
      setSnapshot(payload);
      setLedgerOnline(payload.ledgerAvailable);
    } catch (error) {
      console.warn("War Room ledger unavailable; using editorial fallback:", error);
      setSnapshot(FALLBACK_SNAPSHOT);
      setLedgerOnline(false);
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setReadSlugs(readStoredSet(READ_STORAGE_KEY));
    setGuestBookmarks(readStoredSet(GUEST_BOOKMARK_STORAGE_KEY));
    void hydrateSnapshot();

    const threadParam = new URL(window.location.href).searchParams.get("thread");
    if (threadParam) setActiveSlug(threadParam);

    function onPopState() {
      const next = new URL(window.location.href).searchParams.get("thread");
      setActiveSlug(next);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hydrateSnapshot]);

  useEffect(() => {
    if (ledgerOnline && isAuthenticated && snapshot.viewer.uid !== uid) {
      void hydrateSnapshot();
    }
  }, [hydrateSnapshot, isAuthenticated, ledgerOnline, snapshot.viewer.uid, uid]);

  const threads = useMemo(
    () =>
      snapshot.threads.map((thread) => ({
        ...thread,
        bookmarked: thread.bookmarked || guestBookmarks.has(thread.slug),
      })),
    [guestBookmarks, snapshot.threads]
  );

  const bookmarkCount = threads.filter((thread) => thread.bookmarked).length;
  const mineCount = threads.filter(
    (thread) =>
      (snapshot.viewer.uid && thread.author.uid === snapshot.viewer.uid) ||
      (!snapshot.viewer.uid &&
        playerName &&
        thread.author.displayName.toLowerCase() === playerName.toLowerCase())
  ).length;
  const mentionNeedle = (snapshot.viewer.displayName || playerName || "").trim().toLowerCase();
  const mentionsCount = mentionNeedle
    ? threads.filter((thread) =>
        `${thread.title} ${thread.excerpt} ${thread.body}`
          .toLowerCase()
          .includes(`@${mentionNeedle}`)
      ).length
    : 0;

  const filteredThreads = useMemo(() => {
    const activeTab = FORUM_TABS.find((tab) => tab.key === selectedTab);
    const normalizedQuery = query.trim().toLowerCase();

    return threads.filter((thread) => {
      if (selectedChannel && thread.channel !== selectedChannel) return false;
      if (
        !selectedChannel &&
        activeTab &&
        activeTab.channels.length > 0 &&
        !(activeTab.channels as readonly string[]).includes(thread.channel)
      ) {
        return false;
      }

      if (shelf === "featured" && !thread.isFeatured) return false;
      if (shelf === "bookmarks" && !thread.bookmarked) return false;
      if (
        shelf === "mine" &&
        !(
          (snapshot.viewer.uid && thread.author.uid === snapshot.viewer.uid) ||
          (!snapshot.viewer.uid &&
            playerName &&
            thread.author.displayName.toLowerCase() === playerName.toLowerCase())
        )
      ) {
        return false;
      }
      if (
        shelf === "mentions" &&
        (!mentionNeedle ||
          !`${thread.title} ${thread.excerpt} ${thread.body}`
            .toLowerCase()
            .includes(`@${mentionNeedle}`))
      ) {
        return false;
      }
      if (shelf === "watched" && !readSlugs.has(thread.slug)) return false;

      if (
        normalizedQuery &&
        !`${thread.title} ${thread.excerpt} ${thread.body} ${thread.author.displayName} ${thread.tag}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [
    mentionNeedle,
    playerName,
    query,
    readSlugs,
    selectedChannel,
    selectedTab,
    shelf,
    snapshot.viewer.uid,
    threads,
  ]);

  const featuredThreads = useMemo(() => {
    const featured = filteredThreads.filter((thread) => thread.isFeatured);
    return (featured.length > 0 ? featured : filteredThreads).slice(0, advanced ? 5 : 4);
  }, [advanced, filteredThreads]);

  const featuredSlugs = new Set(featuredThreads.map((thread) => thread.slug));
  const latestThreads = filteredThreads
    .filter((thread) => !featuredSlugs.has(thread.slug))
    .slice(0, advanced ? 10 : 8);
  const activeThread = activeSlug
    ? threads.find((thread) => thread.slug === activeSlug) ?? null
    : null;
  const selectedChannelDetail = selectedChannel
    ? snapshot.channels.find((channel) => channel.key === selectedChannel) ||
      FORUM_CHANNELS.find((channel) => channel.key === selectedChannel)
    : null;

  const resetFilters = useCallback(() => {
    setSelectedTab("war-room");
    setSelectedChannel(null);
    setShelf("feed");
    setQuery("");
  }, []);

  const updateThreadUrl = useCallback((slug: string | null, replace = false) => {
    const url = new URL(window.location.href);
    if (slug) {
      url.searchParams.set("thread", slug);
    } else {
      url.searchParams.delete("thread");
    }
    window.history[replace ? "replaceState" : "pushState"](
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, []);

  const openThread = useCallback(
    (slug: string) => {
      setActiveSlug(slug);
      updateThreadUrl(slug);

      if (!readSlugs.has(slug)) {
        const next = new Set(readSlugs);
        next.add(slug);
        setReadSlugs(next);
        writeStoredSet(READ_STORAGE_KEY, next);

        const thread = threads.find((entry) => entry.slug === slug);
        if (thread?.id != null && ledgerOnline) {
          void fetch("/api/forum", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "record_view", threadId: thread.id }),
          });
          setSnapshot((snapshotState) => ({
            ...snapshotState,
            threads: snapshotState.threads.map((entry) =>
              entry.slug === slug
                ? { ...entry, viewCount: entry.viewCount + 1 }
                : entry
              ),
          }));
        }
      }
    },
    [ledgerOnline, readSlugs, threads, updateThreadUrl]
  );

  const closeThread = useCallback(() => {
    setActiveSlug(null);
    updateThreadUrl(null);
  }, [updateThreadUrl]);

  const mutateForum = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>
    ): Promise<(ForumSnapshot & { createdSlug?: string | null }) | null> => {
      setPendingAction(action);
      try {
        const response = await fetch("/api/forum", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const result = (await response.json().catch(() => ({}))) as Partial<
          ForumSnapshot & { detail: string; createdSlug: string | null }
        >;
        if (!response.ok) {
          throw new Error(result.detail || `War Room action failed: ${response.status}`);
        }
        const nextSnapshot = result as ForumSnapshot & { createdSlug?: string | null };
        setSnapshot(nextSnapshot);
        setLedgerOnline(true);
        return nextSnapshot;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "The War Room could not record that.";
        toast.error(detail);
        return null;
      } finally {
        setPendingAction(null);
      }
    },
    []
  );

  const toggleBookmark = useCallback(
    async (thread: ForumThreadView) => {
      if (isAuthenticated && ledgerOnline && thread.id != null) {
        const result = await mutateForum("toggle_bookmark", { threadId: thread.id });
        if (result) {
          setGuestBookmarks((current) => {
            if (!current.has(thread.slug)) return current;
            const next = new Set(current);
            next.delete(thread.slug);
            writeStoredSet(GUEST_BOOKMARK_STORAGE_KEY, next);
            return next;
          });
        }
        return;
      }

      setGuestBookmarks((current) => {
        const next = new Set(current);
        if (next.has(thread.slug)) {
          next.delete(thread.slug);
          toast.success("Bookmark removed.");
        } else {
          next.add(thread.slug);
          toast.success(
            isAuthenticated
              ? "Saved in this browser while the shared ledger is offline."
              : "Saved in this browser."
          );
        }
        writeStoredSet(GUEST_BOOKMARK_STORAGE_KEY, next);
        return next;
      });
    },
    [isAuthenticated, ledgerOnline, mutateForum]
  );

  const toggleReaction = useCallback(
    async (thread: ForumThreadView, emoji: ForumReaction) => {
      if (!isAuthenticated) {
        toast("Sign in to put your name behind a reaction.");
        loginWithSteam(`/forum?thread=${encodeURIComponent(thread.slug)}`);
        return;
      }
      if (!ledgerOnline || thread.id == null) {
        toast.error("Reactions wait for the shared forum ledger. No phantom applause.");
        return;
      }
      await mutateForum("toggle_reaction", { threadId: thread.id, emoji });
    },
    [isAuthenticated, ledgerOnline, loginWithSteam, mutateForum]
  );

  const submitReply = useCallback(
    async (thread: ForumThreadView, body: string) => {
      if (!isAuthenticated) {
        loginWithSteam(`/forum?thread=${encodeURIComponent(thread.slug)}`);
        return false;
      }
      if (!ledgerOnline || thread.id == null) {
        toast.error("The shared reply rail is not available in this environment.");
        return false;
      }
      const result = await mutateForum("reply", { threadId: thread.id, body });
      if (result) {
        toast.success("Reply carried into the War Room.");
        return true;
      }
      return false;
    },
    [isAuthenticated, ledgerOnline, loginWithSteam, mutateForum]
  );

  const submitThread = useCallback(
    async (draft: {
      channel: ForumChannelKey;
      title: string;
      excerpt: string;
      body: string;
    }) => {
      if (!isAuthenticated) {
        loginWithSteam("/forum");
        return false;
      }
      const result = await mutateForum("create_thread", draft);
      if (!result?.createdSlug) return false;
      setComposerOpen(false);
      setShelf("feed");
      setSelectedChannel(null);
      setSelectedTab("war-room");
      toast.success("Dispatch published. The room has the floor.");
      openThread(result.createdSlug);
      return true;
    },
    [isAuthenticated, loginWithSteam, mutateForum, openThread]
  );

  function selectShelf(nextShelf: ForumShelf) {
    setShelf(nextShelf);
    setSelectedChannel(null);
    setSelectedTab("war-room");
  }

  function selectTab(tab: ForumTabKey) {
    setSelectedTab(tab);
    setSelectedChannel(null);
    setShelf("feed");
  }

  function selectChannel(channel: ForumChannelKey) {
    setSelectedChannel((current) => (current === channel ? null : channel));
    setSelectedTab("war-room");
    setShelf("feed");
  }

  function markAllRead() {
    const next = new Set(threads.map((thread) => thread.slug));
    setReadSlugs(next);
    writeStoredSet(READ_STORAGE_KEY, next);
    toast.success("The room is caught up. Briefly.");
  }

  return (
    <>
      <main className="overflow-x-hidden py-1 text-white sm:py-2">
        <div
          className={`grid gap-5 ${
            extreme
              ? "xl:grid-cols-[15rem_minmax(0,1fr)_22rem]"
              : advanced
                ? "xl:grid-cols-[14rem_minmax(0,1fr)_20rem]"
                : "xl:grid-cols-[13rem_minmax(0,1fr)_19rem]"
          }`}
        >
          <aside className="hidden space-y-5 xl:block">
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[1.15rem] border border-amber-200/28 bg-amber-300/12 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/18"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Thread
            </button>

            <section className="rounded-[1.45rem] border border-white/10 bg-black/24 p-3">
              <SideButton
                icon={Star}
                label="Featured"
                count={threads.filter((thread) => thread.isFeatured).length}
                active={shelf === "featured"}
                onClick={() => selectShelf("featured")}
              />
              <SideButton
                icon={Users}
                label="My Feed"
                active={shelf === "feed"}
                onClick={() => selectShelf("feed")}
              />
              <SideButton
                icon={Bookmark}
                label="Bookmarks"
                count={bookmarkCount}
                active={shelf === "bookmarks"}
                onClick={() => selectShelf("bookmarks")}
              />
              <SideButton
                icon={MessageSquare}
                label="My Threads"
                count={mineCount}
                active={shelf === "mine"}
                onClick={() => selectShelf("mine")}
              />
              <SideButton
                icon={Bell}
                label="Mentions"
                count={mentionsCount}
                active={shelf === "mentions"}
                onClick={() => selectShelf("mentions")}
              />
              <SideButton
                icon={Eye}
                label="Watched"
                count={readSlugs.size}
                active={shelf === "watched"}
                onClick={() => selectShelf("watched")}
              />
            </section>

            <section className="rounded-[1.45rem] border border-white/10 bg-black/24 p-3">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">
                Channels
              </div>
              {snapshot.channels.map((channel) => {
                const Icon = channelIcons[channel.key];
                return (
                  <SideButton
                    key={channel.key}
                    icon={Icon}
                    label={channel.label}
                    count={channel.count}
                    active={selectedChannel === channel.key}
                    onClick={() => selectChannel(channel.key)}
                  />
                );
              })}
            </section>
          </aside>

          <div className="min-w-0 space-y-5">
            <ForumHero
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onOpenChronicle={() => openThread(CHRONICLE_SLUG)}
            />

            <nav className="w-full overflow-x-auto [scrollbar-width:none]">
              <div className="flex min-w-max gap-2">
                {FORUM_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectTab(tab.key)}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                      selectedTab === tab.key && !selectedChannel
                        ? "border-amber-200/36 bg-amber-300/14 text-amber-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>

            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-amber-200/24 bg-amber-300/[0.08] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/14 xl:hidden"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New War Room Dispatch
            </button>

            {advanced ? (
              <section className="grid gap-2 rounded-[1.45rem] border border-white/8 bg-black/20 p-2 sm:grid-cols-3">
                {roomSignals.map((signal) => (
                  <button
                    key={signal.eyebrow}
                    type="button"
                    onClick={() => openThread(signal.slug)}
                    className="rounded-[1.05rem] border border-white/7 bg-white/[0.025] px-4 py-3 text-left transition hover:border-amber-200/16 hover:bg-white/[0.05]"
                  >
                    <div className="text-[9px] uppercase tracking-[0.24em] text-amber-100/55">
                      {signal.eyebrow}
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-white">{signal.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{signal.body}</div>
                  </button>
                ))}
              </section>
            ) : null}

            <section className="rounded-[1.55rem] border border-amber-200/18 bg-amber-300/8 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Crown className="h-8 w-8 shrink-0 text-amber-100" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Champion&apos;s Desk: What the Throne Asks
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      A real challenge needs a player, a format, a window, and a reason to watch.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openThread(CHAMPION_SLUG)}
                  className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Open Dispatch
                </button>
              </div>
            </section>

            <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <Star className="h-4 w-4 text-amber-100" />
                    {selectedChannelDetail ? selectedChannelDetail.label : "Featured Threads"}
                  </div>
                  {selectedChannelDetail && advanced ? (
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                      {selectedChannelDetail.description}
                    </p>
                  ) : null}
                </div>
                <SearchField value={query} onChange={setQuery} />
              </div>

              <div className="mt-4 grid gap-3">
                {filteredThreads.length === 0 ? (
                  <EmptyForumState
                    onReset={resetFilters}
                    onCreate={() => setComposerOpen(true)}
                  />
                ) : (
                  featuredThreads.map((thread) => (
                    <FeaturedThreadCard
                      key={thread.slug}
                      thread={thread}
                      advanced={advanced}
                      read={readSlugs.has(thread.slug)}
                      onOpen={() => openThread(thread.slug)}
                      onBookmark={() => void toggleBookmark(thread)}
                    />
                  ))
                )}
              </div>
            </section>

            {filteredThreads.length > 0 && latestThreads.length > 0 ? (
              <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Latest Posts
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      The room is moving.
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                  >
                    Mark all read
                  </button>
                </div>
                <div className={`mt-4 grid gap-2 ${advanced ? "2xl:grid-cols-2" : ""}`}>
                  {latestThreads.map((thread) => (
                    <RecentThreadCard
                      key={thread.slug}
                      thread={thread}
                      advanced={advanced}
                      read={readSlugs.has(thread.slug)}
                      onOpen={() => openThread(thread.slug)}
                      onBookmark={() => void toggleBookmark(thread)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
            <section className="rounded-[1.65rem] border border-amber-200/24 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.26))] p-5">
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-amber-100/72">
                  World Champion
                </div>
                <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/12 text-amber-100">
                  <Crown className="h-14 w-14" />
                </div>
                <h2 className="mt-4 text-3xl font-semibold text-white">Sniper</h2>
                <div className="mt-2 text-sm text-slate-400">The open throne has a name.</div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <MiniStat label="Title" value="World" />
                  <MiniStat label="Room Status" value="Challengeable" />
                </div>
                <Link
                  href="/champions"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-amber-200/28 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/16"
                >
                  View Championships
                </Link>
              </div>
            </section>

            <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Users className="h-4 w-4" />
                Around the Fire
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Voices in these Chronicles—not a fake live-presence counter.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["War Room Scribe", "CastleEnjoyer", "NoobQuestion", "ReplayOrItDidnt", "StableHand", "ComebackKing"].map(
                  (name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setQuery(name);
                        setShelf("feed");
                        setSelectedChannel(null);
                        setSelectedTab("war-room");
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/22 bg-emerald-400/10 text-xs text-emerald-100 transition hover:bg-emerald-400/16"
                      title={`Find posts by ${name}`}
                      aria-label={`Find posts by ${name}`}
                    >
                      {initials(name)}
                    </button>
                  )
                )}
              </div>
            </section>

            {advanced ? (
              <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <BookOpen className="h-4 w-4" />
                  Field Manual
                </div>
                <div className="mt-4 grid gap-3">
                  {fieldManual.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => openThread(item.slug)}
                      className="group rounded-[1rem] border border-white/8 bg-white/[0.025] p-3 text-left transition hover:border-amber-200/16 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-200/16 bg-amber-300/[0.07] text-[10px] font-semibold text-amber-100">
                          {index + 1}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-slate-100 group-hover:text-white">
                            {item.title}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {item.body}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <Trophy className="h-4 w-4" />
                  Top Contributors
                </div>
                <div className="mt-4 grid gap-2">
                  {threads
                    .slice()
                    .sort((a, b) => reactionTotal(b) - reactionTotal(a))
                    .slice(0, 5)
                    .map((thread, index) => (
                      <button
                        key={thread.slug}
                        type="button"
                        onClick={() => openThread(thread.slug)}
                        className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-200">
                          {index + 1}. {thread.author.displayName}
                        </span>
                        <span className="ml-2 text-sm font-semibold text-amber-100">
                          {reactionTotal(thread)}
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            )}

            <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Sparkles className="h-4 w-4" />
                Room Signals
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  {
                    label: "The first Chronicle is taking origin stories.",
                    slug: CHRONICLE_SLUG,
                  },
                  {
                    label: "The bounty board wants a matchup with a pulse.",
                    slug: "bounty-board-name-the-matchup-the-room-deserves",
                  },
                  {
                    label: "Arena diplomacy has predictably collapsed.",
                    slug: "arena-is-a-45-minute-trust-exercise",
                  },
                  {
                    label: "Watcher help now starts with four calm checks.",
                    slug: "replay-missing-four-checks-before-panic",
                  },
                ].map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => openThread(item.slug)}
                    className="flex gap-3 text-left text-sm leading-6 text-slate-300 transition hover:text-white"
                  >
                    <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-100" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div
                className={`mt-5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  ledgerOnline
                    ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-100/75"
                    : "border-amber-200/14 bg-amber-300/[0.05] text-amber-100/70"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ledgerOnline ? "bg-emerald-300" : "bg-amber-300"
                  }`}
                />
                {snapshotLoading
                  ? "Checking the shared ledger…"
                  : ledgerOnline
                    ? "Shared forum ledger online"
                    : "Editorial archive · read-only ledger"}
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-5 grid gap-2 rounded-[1.5rem] border border-amber-200/14 bg-black/24 p-2 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            href="/wolo"
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <Crown className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">WOLO Economy</div>
              <div className="mt-1 text-xs text-slate-400">Balances, rewards, chain view</div>
            </div>
          </Link>
          <Link
            href="/game-stats"
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <BookOpen className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">Replay Library</div>
              <div className="mt-1 text-xs text-slate-400">Bring the actual evidence</div>
            </div>
          </Link>
          <Link
            href="/watch"
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <Radio className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">Watch the War</div>
              <div className="mt-1 text-xs text-slate-400">Live games and battle tape</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 text-left transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <MessageSquarePlus className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">New Dispatch</div>
              <div className="mt-1 text-xs text-slate-400">Give the room something useful</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openThread(HOUSE_RULES_SLUG)}
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 text-left transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <ShieldAlert className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">House Rules</div>
              <div className="mt-1 text-xs text-slate-400">Bring receipts. Respect the GG.</div>
            </div>
          </button>
        </section>
      </main>

      {mounted && activeThread ? (
        <ThreadDialog
          thread={activeThread}
          authenticated={isAuthenticated}
          ledgerOnline={ledgerOnline}
          pendingAction={pendingAction}
          onClose={closeThread}
          onBookmark={() => void toggleBookmark(activeThread)}
          onReaction={(emoji) => void toggleReaction(activeThread, emoji)}
          onReply={(body) => submitReply(activeThread, body)}
          onSignIn={() =>
            loginWithSteam(`/forum?thread=${encodeURIComponent(activeThread.slug)}`)
          }
        />
      ) : null}

      {mounted && composerOpen ? (
        <NewThreadDialog
          authenticated={isAuthenticated}
          ledgerOnline={ledgerOnline}
          pending={pendingAction === "create_thread"}
          onClose={() => setComposerOpen(false)}
          onSignIn={() => loginWithSteam("/forum")}
          onSubmit={submitThread}
        />
      ) : null}
    </>
  );
}
