"use client";

import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronRight,
  Copy,
  Crown,
  Eye,
  Feather,
  Flame,
  Lock,
  MessageSquare,
  Pin,
  Send,
  Swords,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  FORUM_CHANNELS,
  FORUM_REACTIONS,
  type ForumReaction,
  type ForumSnapshot,
  type ForumThreadView,
} from "@/lib/forum";
import { TILE_VIEW_MODES, type TileViewMode } from "@/lib/tileViewPreferences";

const GUEST_BOOKMARK_STORAGE_KEY = "aoe2hdbets:forum-guest-bookmarks";
const READ_STORAGE_KEY = "aoe2hdbets:forum-read-threads";

function formatForumDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Field date unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCount(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }
  return String(value);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function readGuestBookmarks() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(GUEST_BOOKMARK_STORAGE_KEY) || "[]");
    return new Set(
      Array.isArray(raw)
        ? raw.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
}

function writeGuestBookmarks(values: Set<string>) {
  try {
    window.localStorage.setItem(
      GUEST_BOOKMARK_STORAGE_KEY,
      JSON.stringify(Array.from(values))
    );
  } catch {
    // The current state still works when private browsing rejects persistence.
  }
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
      className="inline-flex items-center rounded-full border border-amber-200/24 bg-[#050910]/90 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42)]"
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
          className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            viewMode === mode
              ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.2)]"
              : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
          }`}
        >
          {mode[0]}
        </button>
      ))}
    </div>
  );
}

function AuthorMark({
  thread,
  large = false,
}: {
  thread: ForumThreadView;
  large?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-amber-200/28 bg-amber-300/10 font-semibold text-amber-100 ${
          large ? "h-14 w-14 text-sm" : "h-10 w-10 text-xs"
        }`}
      >
        {initials(thread.author.displayName)}
      </div>
      <div>
        <div className="font-semibold text-white">{thread.author.displayName}</div>
        <div className="mt-0.5 text-xs text-slate-500">{thread.author.role}</div>
      </div>
    </div>
  );
}

function ReactionRail({
  thread,
  pendingAction,
  onReaction,
}: {
  thread: ForumThreadView;
  pendingAction: string | null;
  onReaction: (emoji: ForumReaction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FORUM_REACTIONS.map((emoji) => {
        const reaction = thread.reactions.find((entry) => entry.emoji === emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReaction(emoji)}
            disabled={pendingAction === "toggle_reaction"}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
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
  );
}

function ReplySection({
  thread,
  viewMode,
  reply,
  setReply,
  pendingAction,
  canWrite,
  authenticated,
  onSubmit,
  onSignIn,
}: {
  thread: ForumThreadView;
  viewMode: TileViewMode;
  reply: string;
  setReply: (value: string) => void;
  pendingAction: string | null;
  canWrite: boolean;
  authenticated: boolean;
  onSubmit: (event: FormEvent) => void;
  onSignIn: () => void;
}) {
  const basic = viewMode === "basic";
  const extreme = viewMode === "extreme";

  return (
    <section
      className={
        extreme
          ? "border-l border-white/10 bg-black/20 px-5 py-6 2xl:px-7"
          : basic
            ? "mt-10 border-t border-white/10 pt-8"
            : "mt-5 rounded-[1.6rem] border border-white/10 bg-black/22 p-5 sm:p-7"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/55">
            The Long Table
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
            className={`border border-white/9 bg-white/[0.03] ${
              extreme
                ? "rounded-[1rem] p-4"
                : basic
                  ? "rounded-[1.1rem] p-4"
                  : "rounded-[1.2rem] p-4 sm:p-5"
            }`}
          >
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-200/18 bg-sky-300/[0.07] text-[11px] font-semibold text-sky-100">
                {initials(post.author.displayName)}
              </div>
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
        <form onSubmit={onSubmit} className="mt-5">
          {canWrite ? (
            <>
              <label className="block">
                <span className="sr-only">Reply to this thread</span>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={extreme ? 6 : 4}
                  maxLength={12_000}
                  placeholder="Add evidence, a useful question, or one exceptionally well-supported grievance…"
                  className="w-full resize-y rounded-[1.1rem] border border-white/10 bg-[#050b13] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/30"
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
            <div className="rounded-[1.1rem] border border-amber-200/14 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-50/80">
              Reply rail unavailable. Reading remains open.
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="flex w-full items-center justify-between gap-4 rounded-[1.1rem] border border-amber-200/18 bg-amber-300/[0.06] px-4 py-4 text-left transition hover:bg-amber-300/[0.1]"
            >
              <div>
                <div className="text-sm font-semibold text-amber-50">
                  Sign in to pull up a chair
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Reading is public. Replies belong to known citizens.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-200" />
            </button>
          )}
        </form>
      ) : null}
    </section>
  );
}

function ThreadUtilityBar({
  thread,
  bookmarked,
  pendingAction,
  onBookmark,
  onCopy,
  onReaction,
}: {
  thread: ForumThreadView;
  bookmarked: boolean;
  pendingAction: string | null;
  onBookmark: () => void;
  onCopy: () => void;
  onReaction: (emoji: ForumReaction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/10 py-4">
      <ReactionRail
        thread={thread}
        pendingAction={pendingAction}
        onReaction={onReaction}
      />
      <div className="flex items-center gap-2">
        <span className="mr-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <Eye className="h-3.5 w-3.5" />
          {formatCount(thread.viewCount)}
        </span>
        <span className="mr-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <MessageSquare className="h-3.5 w-3.5" />
          {thread.replyCount}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition hover:text-white"
          aria-label="Copy thread link"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onBookmark}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
            bookmarked
              ? "border-amber-200/25 bg-amber-300/12 text-amber-100"
              : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
          }`}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark thread"}
        >
          <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function RelatedRail({
  thread,
  related,
}: {
  thread: ForumThreadView;
  related: ForumThreadView[];
}) {
  const channel = FORUM_CHANNELS.find((entry) => entry.key === thread.channel);

  return (
    <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
      <section className="rounded-[1.45rem] border border-amber-200/16 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.14),transparent_45%),rgba(0,0,0,0.26)] p-5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-amber-100/62">
          <BookOpen className="h-4 w-4" />
          Thread Record
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Views</div>
            <div className="mt-1 text-lg font-semibold text-white">{formatCount(thread.viewCount)}</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Voices</div>
            <div className="mt-1 text-lg font-semibold text-white">{thread.replyCount}</div>
          </div>
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-400">
          {channel?.description}
        </div>
      </section>

      <section className="rounded-[1.45rem] border border-white/10 bg-black/24 p-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
          Continue Through the Room
        </div>
        <div className="mt-3 grid gap-2">
          {related.map((entry) => (
            <Link
              key={entry.slug}
              href={`/forum/thread/${entry.slug}`}
              className="group rounded-[1rem] border border-white/8 bg-white/[0.025] p-3 transition hover:border-amber-200/16 hover:bg-white/[0.05]"
            >
              <div className="text-[9px] uppercase tracking-[0.18em] text-amber-100/55">
                {entry.tag}
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-5 text-slate-100 group-hover:text-white">
                {entry.title}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default function ForumThreadPageClient({
  initialSnapshot,
  slug,
}: {
  initialSnapshot: ForumSnapshot;
  slug: string;
}) {
  const { viewMode, setViewMode } = useTileViewPreference("forum");
  const { isAuthenticated, loginWithSteam } = useUserAuth();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [guestBookmarked, setGuestBookmarked] = useState(false);
  const recordedViewRef = useRef(false);

  const thread =
    snapshot.threads.find((entry) => entry.slug === slug) ??
    initialSnapshot.threads[0]!;
  const related = useMemo(() => {
    const sameChannel = snapshot.threads.filter(
      (entry) => entry.slug !== slug && entry.channel === thread.channel
    );
    const rest = snapshot.threads.filter(
      (entry) => entry.slug !== slug && entry.channel !== thread.channel
    );
    return [...sameChannel, ...rest].slice(0, 4);
  }, [slug, snapshot.threads, thread.channel]);
  const bookmarked = thread.bookmarked || guestBookmarked;
  const ledgerOnline = snapshot.ledgerAvailable;
  const canWrite = isAuthenticated && ledgerOnline && thread.id != null && !thread.isLocked;
  const channel = FORUM_CHANNELS.find((entry) => entry.key === thread.channel);

  useEffect(() => {
    setGuestBookmarked(readGuestBookmarks().has(slug));
    try {
      const parsed = JSON.parse(window.localStorage.getItem(READ_STORAGE_KEY) || "[]");
      const read = new Set(
        Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string")
          : []
      );
      read.add(slug);
      window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(read)));
    } catch {
      // Reading remains available when local persistence is unavailable.
    }
  }, [slug]);

  useEffect(() => {
    if (recordedViewRef.current || thread.id == null || !ledgerOnline) return;
    recordedViewRef.current = true;
    void fetch("/api/forum", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_view", threadId: thread.id }),
    });
    setSnapshot((current) => ({
      ...current,
      threads: current.threads.map((entry) =>
        entry.slug === slug ? { ...entry, viewCount: entry.viewCount + 1 } : entry
      ),
    }));
  }, [ledgerOnline, slug, thread.id]);

  const mutateForum = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      setPendingAction(action);
      try {
        const response = await fetch("/api/forum", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const result = (await response.json().catch(() => ({}))) as Partial<
          ForumSnapshot & { detail: string }
        >;
        if (!response.ok) {
          throw new Error(result.detail || `War Room action failed: ${response.status}`);
        }
        setSnapshot(result as ForumSnapshot);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The War Room could not record that."
        );
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    []
  );

  async function toggleBookmark() {
    if (isAuthenticated && ledgerOnline && thread.id != null) {
      const saved = await mutateForum("toggle_bookmark", { threadId: thread.id });
      if (saved) {
        const next = readGuestBookmarks();
        next.delete(slug);
        writeGuestBookmarks(next);
        setGuestBookmarked(false);
      }
      return;
    }

    const next = readGuestBookmarks();
    if (next.has(slug)) {
      next.delete(slug);
      setGuestBookmarked(false);
      toast.success("Bookmark removed.");
    } else {
      next.add(slug);
      setGuestBookmarked(true);
      toast.success("Saved in this browser.");
    }
    writeGuestBookmarks(next);
  }

  function toggleReaction(emoji: ForumReaction) {
    if (!isAuthenticated) {
      toast("Sign in to put your name behind a reaction.");
      loginWithSteam(`/forum/thread/${encodeURIComponent(slug)}`);
      return;
    }
    if (!ledgerOnline || thread.id == null) {
      toast.error("Reactions wait for the shared forum ledger.");
      return;
    }
    void mutateForum("toggle_reaction", { threadId: thread.id, emoji });
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    if (!isAuthenticated) {
      loginWithSteam(`/forum/thread/${encodeURIComponent(slug)}`);
      return;
    }
    if (!ledgerOnline || thread.id == null) {
      toast.error("The shared reply rail is not available in this environment.");
      return;
    }
    const saved = await mutateForum("reply", { threadId: thread.id, body: reply });
    if (saved) {
      setReply("");
      toast.success("Reply carried into the War Room.");
    }
  }

  async function copyLink() {
    try {
      await window.navigator.clipboard.writeText(window.location.href);
      toast.success("Thread link copied.");
    } catch {
      toast.error("The link would not copy. The trebuchets deny involvement.");
    }
  }

  const utilityBar = (
    <ThreadUtilityBar
      thread={thread}
      bookmarked={bookmarked}
      pendingAction={pendingAction}
      onBookmark={() => void toggleBookmark()}
      onCopy={() => void copyLink()}
      onReaction={toggleReaction}
    />
  );

  const replies = (
    <ReplySection
      thread={thread}
      viewMode={viewMode}
      reply={reply}
      setReply={setReply}
      pendingAction={pendingAction}
      canWrite={canWrite}
      authenticated={isAuthenticated}
      onSubmit={(event) => void submitReply(event)}
      onSignIn={() => loginWithSteam(`/forum/thread/${encodeURIComponent(slug)}`)}
    />
  );

  if (viewMode === "basic") {
    return (
      <main className="py-1 text-white sm:py-3">
        <div className="mx-auto max-w-[48rem]">
          <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <Link
              href="/forum"
              className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              War Room
            </Link>
            <ForumModeToggle viewMode={viewMode} onChange={setViewMode} />
          </header>

          <article className="py-8 sm:py-12">
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-amber-100/60">
              {thread.isPinned ? <Pin className="h-3.5 w-3.5" /> : null}
              {thread.tag}
              {thread.isHot ? <Flame className="h-3.5 w-3.5 text-orange-300" /> : null}
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.04] text-amber-50 sm:text-6xl">
              {thread.title}
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">{thread.excerpt}</p>
            <div className="mt-7">
              <AuthorMark thread={thread} />
            </div>
            <div className="mt-8 space-y-6 text-[16px] leading-8 text-slate-200">
              {thread.body.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-9">{utilityBar}</div>
            {replies}
          </article>
        </div>
      </main>
    );
  }

  if (viewMode === "extreme") {
    return (
      <main className="py-1 text-white sm:py-2">
        <header className="border-y border-amber-200/18 bg-[linear-gradient(90deg,rgba(251,191,36,0.06),transparent_28%,transparent_72%,rgba(125,211,252,0.05))] px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/forum"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/75 transition hover:text-amber-50"
            >
              <ArrowLeft className="h-4 w-4" />
              The War Room
            </Link>
            <div className="text-center">
              <div className="font-serif text-2xl font-semibold uppercase tracking-[0.22em] text-amber-50 sm:text-3xl">
                The Wolo Chronicle
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.34em] text-slate-500">
                Open Edition · The Long War Continues
              </div>
            </div>
            <ForumModeToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </header>

        <section className="mt-4 overflow-hidden rounded-[1.1rem] border border-white/12 bg-[linear-gradient(145deg,rgba(13,24,40,0.96),rgba(4,9,16,0.98))]">
          <div className="border-b border-white/10 px-5 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.26em] text-amber-100/60">
              <span className="inline-flex items-center gap-2">
                <Feather className="h-4 w-4" />
                {channel?.label} · {formatForumDate(thread.createdAt)}
              </span>
              <span>{thread.tag}</span>
            </div>
            <h1 className="mt-5 max-w-[74rem] font-serif text-5xl font-semibold leading-[0.96] text-amber-50 sm:text-7xl xl:text-[6.5rem]">
              {thread.title}
            </h1>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
              <p className="max-w-4xl text-xl leading-9 text-slate-300">{thread.excerpt}</p>
              <AuthorMark thread={thread} large />
            </div>
          </div>

          <div className="2xl:grid 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <article className="px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
              <div className="gap-10 text-[16px] leading-8 text-slate-200 lg:columns-2">
                {thread.body.split(/\n\s*\n/).map((paragraph, index) => (
                  <p
                    key={paragraph}
                    className={`mb-6 break-inside-avoid ${
                      index === 0
                        ? "first-letter:float-left first-letter:mr-3 first-letter:mt-2 first-letter:font-serif first-letter:text-7xl first-letter:leading-[0.72] first-letter:text-amber-200"
                        : ""
                    }`}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
              <div className="mt-6">{utilityBar}</div>

              <div className="mt-10 grid gap-px overflow-hidden rounded-[1rem] border border-white/10 bg-white/10 md:grid-cols-4">
                {related.map((entry, index) => (
                  <Link
                    key={entry.slug}
                    href={`/forum/thread/${entry.slug}`}
                    className="group bg-[#07101b] p-4 transition hover:bg-[#0b1726]"
                  >
                    <div className="text-[9px] uppercase tracking-[0.2em] text-amber-100/50">
                      Dispatch {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5 text-slate-100 group-hover:text-white">
                      {entry.title}
                    </div>
                  </Link>
                ))}
              </div>
            </article>
            {replies}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="py-1 text-white sm:py-2">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
        <Link
          href="/forum"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the War Room
        </Link>
        <ForumModeToggle viewMode={viewMode} onChange={setViewMode} />
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <article className="overflow-hidden rounded-[1.85rem] border border-amber-200/18 bg-[radial-gradient(circle_at_46%_0%,rgba(251,191,36,0.13),transparent_25%),linear-gradient(145deg,#0d1828,#050b14_58%,#03070d)] shadow-[0_30px_100px_rgba(0,0,0,0.36)]">
            <div className="border-b border-white/8 px-5 py-4 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-amber-100/60">
                  {thread.isPinned ? <Pin className="h-3.5 w-3.5" /> : null}
                  {channel?.label}
                  {thread.isHot ? <Flame className="h-3.5 w-3.5 text-orange-300" /> : null}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {thread.tag} · {formatForumDate(thread.createdAt)}
                </div>
              </div>
            </div>

            <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
              <AuthorMark thread={thread} large />
              <h1 className="mt-7 max-w-4xl font-serif text-5xl font-semibold leading-[0.98] text-amber-50 sm:text-7xl">
                {thread.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
                {thread.excerpt}
              </p>
              <div className="mt-9 max-w-4xl space-y-6 text-[16px] leading-8 text-slate-200">
                {thread.body.split(/\n\s*\n/).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="mt-9">{utilityBar}</div>
            </div>
          </article>
          {replies}
        </div>

        <RelatedRail thread={thread} related={related} />
      </div>

      <section className="mt-5 grid gap-3 rounded-[1.35rem] border border-white/10 bg-black/20 p-3 sm:grid-cols-3">
        <Link
          href="/game-stats"
          className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.055]"
        >
          <BookOpen className="h-6 w-6 text-amber-100" />
          <div>
            <div className="text-sm font-semibold text-white">Bring the replay</div>
            <div className="mt-1 text-xs text-slate-500">Evidence lives in the archive.</div>
          </div>
        </Link>
        <Link
          href="/champions"
          className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.055]"
        >
          <Crown className="h-6 w-6 text-amber-100" />
          <div>
            <div className="text-sm font-semibold text-white">The open throne</div>
            <div className="mt-1 text-xs text-slate-500">See who currently matters.</div>
          </div>
        </Link>
        <Link
          href="/challenge"
          className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-white/[0.03] p-4 transition hover:bg-white/[0.055]"
        >
          <Swords className="h-6 w-6 text-amber-100" />
          <div>
            <div className="text-sm font-semibold text-white">Settle it properly</div>
            <div className="mt-1 text-xs text-slate-500">Turn the argument into a match.</div>
          </div>
        </Link>
      </section>
    </main>
  );
}
