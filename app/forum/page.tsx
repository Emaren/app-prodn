import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  BookOpen,
  Coins,
  Crown,
  Eye,
  Flame,
  MessageSquare,
  MessageSquarePlus,
  Radio,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

import {
  featuredForumThreads,
  forumChannels,
  recentForumPosts,
} from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "Forum",
  description: "AoE2WAR War Room forum shell for champions, bounties, strategy, and community posts.",
};

const tabs = ["War Room", "Match Discussions", "Strategy & Guides", "Replays & Analysis", "General", "Off-Topic"];

const contributors = [
  ["Sniper", "12,450"],
  ["DauT", "9,210"],
  ["Hera", "7,890"],
  ["TheViper", "6,733"],
  ["MembTV", "5,420"],
];

const activity = [
  "Sniper defended the World Championship vs DauT",
  "Julio Alvarez won Mexican Champion",
  "Team Canada claimed Tag Team Trials",
  "Chaos Champion awarded to TheViperFan",
];

function ThreadAvatar({ seed, hot = false }: { seed: string; hot?: boolean }) {
  const initials = seed
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border font-semibold ${
        hot
          ? "border-amber-200/36 bg-amber-300/12 text-amber-100"
          : "border-sky-200/22 bg-sky-300/10 text-sky-100"
      }`}
    >
      {initials}
    </div>
  );
}

function FeaturedThread({
  thread,
  index,
}: {
  thread: (typeof featuredForumThreads)[number];
  index: number;
}) {
  return (
    <article
      className={`rounded-[1.35rem] border p-4 transition hover:bg-white/[0.06] ${
        index === 0
          ? "border-amber-200/36 bg-amber-300/8 shadow-[0_0_34px_rgba(245,158,11,0.1)]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex gap-4">
        <ThreadAvatar seed={thread.author} hot={thread.hot} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                thread.hot
                  ? "border-amber-200/28 bg-amber-300/10 text-amber-100"
                  : "border-sky-200/20 bg-sky-300/10 text-sky-100"
              }`}
            >
              {thread.tag}
            </span>
            {thread.hot ? <Flame className="h-4 w-4 text-orange-300" /> : null}
          </div>
          <h2 className="mt-2 text-base font-semibold leading-6 text-white sm:text-lg">
            {thread.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{thread.author}</span>
            <span>3 hours ago</span>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-sm text-slate-400 sm:flex">
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {thread.replies}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {thread.views}</span>
        </div>
      </div>
    </article>
  );
}

function RecentPost({ title, index }: { title: string; index: number }) {
  const author = ["TheViperFan", "AoE2Caster", "NoobQuestion", "TeamBoom", "OldSchoolHD", "CastleEnjoyer", "AoE2WAR Official", "ComebackKing"][index] || "War Room";
  return (
    <article className="rounded-[1.1rem] border border-white/8 bg-white/[0.025] px-4 py-3 transition hover:border-white/16 hover:bg-white/[0.045]">
      <div className="flex items-center gap-3">
        <ThreadAvatar seed={author} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{author}</span>
            <span>{index + 1} hour{index === 0 ? "" : "s"} ago</span>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4" /> {12 + index * 7}</span>
          <Bookmark className="h-4 w-4" />
        </div>
      </div>
    </article>
  );
}

function SideLink({ icon: Icon, label, count }: { icon: typeof Star; label: string; count?: number }) {
  return (
    <Link
      href="#"
      className="flex items-center justify-between gap-3 rounded-[1rem] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-amber-100/80" />
        <span className="truncate">{label}</span>
      </span>
      {count != null ? (
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-400">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export default function ForumPage() {
  return (
    <main className="overflow-x-hidden py-4 text-white sm:py-6">
      <div className="grid gap-5 xl:grid-cols-[13rem_minmax(0,1fr)_19rem]">
        <aside className="hidden space-y-5 xl:block">
          <Link
            href="#"
            className="flex items-center justify-center gap-2 rounded-[1.15rem] border border-amber-200/28 bg-amber-300/12 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/18"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New Thread
          </Link>

          <section className="rounded-[1.45rem] border border-white/10 bg-black/24 p-3">
            <SideLink icon={Star} label="Featured" />
            <SideLink icon={Users} label="My Feed" />
            <SideLink icon={Bookmark} label="Bookmarks" />
            <SideLink icon={MessageSquare} label="My Threads" />
            <SideLink icon={Bell} label="Mentions" count={8} />
            <SideLink icon={Eye} label="Watched" />
          </section>

          <section className="rounded-[1.45rem] border border-white/10 bg-black/24 p-3">
            <div className="px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">Channels</div>
            {forumChannels.map((channel) => (
              <SideLink key={channel.label} icon={Crown} label={channel.label} count={channel.count} />
            ))}
          </section>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.22),transparent_25%),linear-gradient(145deg,#17100a,#091018_50%,#050608)] px-5 py-10 text-center shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:px-8">
            <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,rgba(0,0,0,0.45),transparent)]" />
            <div className="relative z-10 mx-auto max-w-4xl">
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
          </section>

          <nav className="w-full overflow-x-auto [scrollbar-width:none]">
            <div className="flex min-w-max gap-2">
              {tabs.map((tab, index) => (
                <Link
                  key={tab}
                  href="#"
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    index === 0
                      ? "border-amber-200/36 bg-amber-300/14 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white"
                  }`}
                >
                  {tab}
                </Link>
              ))}
            </div>
          </nav>

          <section className="rounded-[1.55rem] border border-amber-200/18 bg-amber-300/8 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Crown className="h-8 w-8 shrink-0 text-amber-100" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Champion Breakdown by Sniper</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Monthly game breakdowns, meta analysis, and improvement tips.
                  </div>
                </div>
              </div>
              <Link
                href="#"
                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                View Latest
              </Link>
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Star className="h-4 w-4 text-amber-100" />
                Featured Threads
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                <Search className="h-3.5 w-3.5" />
                Search soon
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {featuredForumThreads.map((thread, index) => (
                <FeaturedThread key={thread.title} thread={thread} index={index} />
              ))}
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest Posts</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">The room is moving.</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                Mark all read
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {recentForumPosts.map((post, index) => (
                <RecentPost key={post} title={post} index={index} />
              ))}
            </div>
          </section>
        </div>

        <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-[1.65rem] border border-amber-200/24 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.26))] p-5">
            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-100/72">World Champion</div>
              <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/12 text-amber-100">
                <Crown className="h-14 w-14" />
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-white">Sniper</h2>
              <div className="mt-2 text-sm text-slate-400">Reign: 27 days</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Monthly Purse" value="10,000 WOLO" />
                <MiniStat label="Bounty On Head" value="4,850 WOLO" />
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
              Active Now
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Sn", "Ju", "Ji", "Da", "He", "Vi"].map((name) => (
                <div key={name} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/22 bg-emerald-400/10 text-xs text-emerald-100">
                  {name}
                </div>
              ))}
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
                +139
              </span>
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Trophy className="h-4 w-4" />
              Top Contributors
            </div>
            <div className="mt-4 grid gap-2">
              {contributors.map(([name, score], index) => (
                <div key={name} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
                  <span className="text-sm text-slate-200">{index + 1}. {name}</span>
                  <span className="text-sm font-semibold text-amber-100">{score}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-white/10 bg-black/24 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Sparkles className="h-4 w-4" />
              Recent Champion Activity
            </div>
            <div className="mt-4 grid gap-3">
              {activity.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-slate-300">
                  <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-amber-100" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-5 grid gap-2 rounded-[1.5rem] border border-amber-200/14 bg-black/24 p-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          [Coins, "Earn WOLO", "Post, react, bet, spectate"],
          [BookOpen, "Post Synopsis", "Earn up to 1000 WOLO"],
          [Radio, "Spectate & Earn", "Watch games, earn WOLO"],
          [Vote, "Create Poll", "Ask the community"],
          [ShieldAlert, "Report", "Keep AoE2WAR clean"],
        ].map(([Icon, title, body]) => (
          <Link
            key={String(title)}
            href="#"
            className="flex items-center gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] px-4 py-3 transition hover:border-amber-200/20 hover:bg-white/[0.055]"
          >
            <Icon className="h-7 w-7 shrink-0 text-amber-100" />
            <div>
              <div className="text-sm font-semibold text-white">{String(title)}</div>
              <div className="mt-1 text-xs text-slate-400">{String(body)}</div>
            </div>
          </Link>
        ))}
      </section>
    </main>
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
