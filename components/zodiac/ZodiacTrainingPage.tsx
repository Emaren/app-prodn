import Image from "next/image";
import Link from "next/link";

import type { PlayerProfileMatchItem } from "@/lib/playerProfile";
import type { ZodiacTrainingConfig } from "@/lib/zodiacTraining";

type ZodiacTrainingPageProps = {
  config: ZodiacTrainingConfig;
  mentorName: string;
  avatarUrl: string;
  profileHref: string;
  featuredMatches: PlayerProfileMatchItem[];
  totalMatches: number;
};

const TRAINING_STEPS = [
  {
    number: "01",
    icon: "✦",
    title: "New Blood",
    body: "Install the tools, upload a game, and learn the first civ answers.",
    action: "Learn",
  },
  {
    number: "02",
    icon: "◈",
    title: "Apprentice",
    body: "Submit a real replay. Review the decisions that actually shaped your war.",
    action: "Upload",
  },
  {
    number: "03",
    icon: "⚔",
    title: "Contender",
    body: "Play coached games, adapt faster, and build a plan you trust under pressure.",
    action: "Improve",
  },
  {
    number: "04",
    icon: "♛",
    title: "Arena Threat",
    body: "Challenge ranked players, chase titles, and put the new instincts on the board.",
    action: "Challenge",
  },
] as const;

const DM_SKILLS = [
  "Civ answers",
  "Map control",
  "Tech-tree judgment",
  "Relics & raids",
  "Bluffing",
  "Multi-front control",
] as const;

function formatMatchDate(value: string | null) {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function resultLabel(result: PlayerProfileMatchItem["result"]) {
  if (result === "win") return "Zodiac victory";
  if (result === "loss") return "Hard lesson";
  return "Result unknown";
}

function resultClasses(result: PlayerProfileMatchItem["result"]) {
  if (result === "win") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }
  if (result === "loss") {
    return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  }
  return "border-slate-300/20 bg-white/[0.05] text-slate-200";
}

function PrimaryCtas({
  config,
  profileHref,
  compact = false,
}: {
  config: ZodiacTrainingConfig;
  profileHref: string;
  compact?: boolean;
}) {
  const requestHref =
    config.primaryCtaMode === "direct_message"
      ? `/contact-emaren?user=${encodeURIComponent(config.userUid)}`
      : profileHref;

  return (
    <div
      className={`grid gap-2.5 ${
        compact ? "sm:grid-cols-2" : "sm:flex sm:flex-wrap"
      }`}
    >
      <Link
        href={requestHref}
        className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_16px_40px_rgba(251,191,36,0.22)] transition hover:-translate-y-0.5 hover:brightness-110"
      >
        Request Training
        <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
          →
        </span>
      </Link>
      <Link
        href="/upload"
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-200/[0.08] px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:-translate-y-0.5 hover:border-cyan-200/45 hover:bg-cyan-200/[0.12]"
      >
        Upload a Game for Review
      </Link>
      {!compact ? (
        <Link
          href="#dm-civ-guide"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-violet-200/30 hover:text-white"
        >
          Read the DM Civ Guide
        </Link>
      ) : null}
    </div>
  );
}

export default function ZodiacTrainingPage({
  config,
  mentorName,
  avatarUrl,
  profileHref,
  featuredMatches,
  totalMatches,
}: ZodiacTrainingPageProps) {
  const zodiacMessageHref = `/contact-emaren?user=${encodeURIComponent(
    config.userUid
  )}`;

  return (
    <main className="space-y-5 py-4 pb-14 text-white sm:space-y-7 sm:py-6">
      <section className="relative isolate overflow-hidden rounded-[1.6rem] border border-violet-200/15 bg-[#050611] shadow-[0_35px_100px_rgba(0,0,0,0.42)] sm:rounded-[2.3rem]">
        <div className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.28),transparent_30%),radial-gradient(circle_at_75%_20%,rgba(34,211,238,0.15),transparent_25%),linear-gradient(145deg,#09081a_0%,#080c19_48%,#02050d_100%)]" />
        <div className="absolute inset-0 -z-20 opacity-60 [background-image:radial-gradient(circle_at_15%_25%,white_0_1px,transparent_1.5px),radial-gradient(circle_at_72%_18%,white_0_1px,transparent_1.5px),radial-gradient(circle_at_52%_71%,white_0_1px,transparent_1.5px),radial-gradient(circle_at_88%_62%,white_0_1px,transparent_1.5px)] [background-size:190px_190px,240px_240px,170px_170px,260px_260px]" />
        <div className="absolute -right-32 -top-28 -z-10 h-96 w-96 rounded-full border border-violet-200/10 shadow-[0_0_110px_rgba(124,58,237,0.17)] sm:right-4 sm:top-10" />
        <div className="absolute -right-10 top-16 -z-10 h-64 w-64 rounded-full border border-cyan-200/10 sm:right-20 sm:top-24" />

        <div className="grid min-h-[660px] lg:min-h-[610px] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="flex flex-col justify-center p-5 pb-4 sm:p-9 lg:p-12">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/85">
                The old gate opens
              </span>
              <span className="rounded-full border border-emerald-200/20 bg-emerald-200/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                {config.trainingAvailability}
              </span>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-violet-200/70">
              AoE2 HD Deathmatch Training
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.96] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              {config.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-7 text-cyan-50/90 sm:text-xl sm:leading-8">
              {config.subtitle}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              {config.introBody}
            </p>

            <div className="mt-7">
              <PrimaryCtas config={config} profileHref={profileHref} />
            </div>

            <div className="mt-7 flex flex-wrap gap-2 text-[11px] font-medium text-slate-300">
              {["DM mentor", "HD old guard", "Recruiter", "Beginner-safe"].map(
                (label) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5"
                  >
                    {label}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="relative min-h-[390px] overflow-hidden border-t border-white/8 lg:min-h-full lg:border-l lg:border-t-0">
            <Image
              src={avatarUrl}
              alt={`${mentorName}, Deathmatch mentor`}
              fill
              priority
              unoptimized
              sizes="(max-width: 1024px) 100vw, 46vw"
              className="object-cover object-center opacity-90"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,17,0.06),rgba(5,6,17,0.15)_45%,rgba(5,6,17,0.96)_100%),linear-gradient(90deg,rgba(5,6,17,0.36),transparent_45%)]" />
            <div className="absolute inset-x-4 bottom-4 grid gap-3 sm:inset-x-6 sm:bottom-6 sm:grid-cols-2">
              <div className="rounded-[1.2rem] border border-white/12 bg-slate-950/72 p-4 backdrop-blur-xl">
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">
                  Player-provided history
                </div>
                <div className="mt-1 text-xl font-black text-white">2K+ since 2002</div>
                <div className="mt-1 text-xs text-slate-400">
                  An old-war claim, not a DB rating badge.
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-white/12 bg-slate-950/72 p-4 backdrop-blur-xl">
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                  Replay-backed archive
                </div>
                <div className="mt-1 text-xl font-black text-white">
                  {totalMatches} games
                </div>
                <Link
                  href={profileHref}
                  className="mt-1 inline-flex text-xs text-cyan-100 hover:text-white"
                >
                  Open Zodiac’s proof page →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.5rem] border border-violet-200/12 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.14),transparent_38%),rgba(8,10,22,0.88)] p-5 sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-200/65">
            Why Deathmatch
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            Classical builds the hall. Jazz survives the fire.
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.15rem] border border-white/9 bg-white/[0.035] p-4">
              <div className="text-xl" aria-hidden="true">
                ♫
              </div>
              <h3 className="mt-2 font-bold text-slate-100">RM is classical</h3>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                The build unfolds slowly. Structure and timing conduct the opening.
              </p>
            </div>
            <div className="rounded-[1.15rem] border border-cyan-200/16 bg-cyan-200/[0.055] p-4">
              <div className="text-xl" aria-hidden="true">
                ✦
              </div>
              <h3 className="mt-2 font-bold text-cyan-50">DM is jazz</h3>
              <p className="mt-1 text-sm leading-6 text-cyan-50/70">
                The armies are here. Improvise, adapt, and answer the next bar before it lands.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-cyan-200/12 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_35%),rgba(8,10,22,0.88)] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/65">
                Fast does not mean mindless
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                Fifteen minutes can become an epic.
              </h2>
            </div>
            <span className="rounded-full border border-amber-200/18 bg-amber-200/[0.07] px-3 py-1.5 text-xs text-amber-100">
              15–20 minute wars
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DM_SKILLS.map((skill) => (
              <div
                key={skill}
                className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3 text-center text-xs font-semibold text-slate-200"
              >
                {skill}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[1.6rem] border border-white/9 bg-slate-950/55 p-4 sm:rounded-[2rem] sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/65">
              The training path
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Learn → Upload → Review → Improve → Challenge
            </h2>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white"
          >
            Start with one replay <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="mt-5 flex flex-col gap-1 rounded-[1rem] border border-emerald-200/12 bg-emerald-200/[0.045] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
            Player-reported student result
          </span>
          <strong className="text-sm text-emerald-50">
            One apprentice climbed 400+ rating points.
          </strong>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {TRAINING_STEPS.map((step) => (
            <article
              key={step.number}
              className="group rounded-[1.25rem] border border-white/9 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-3.5 transition hover:-translate-y-1 hover:border-violet-200/22 sm:p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl text-amber-100" aria-hidden="true">
                  {step.icon}
                </span>
                <span className="text-[10px] font-bold tracking-[0.2em] text-slate-600">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{step.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-400 sm:min-h-16 sm:text-sm sm:leading-6">
                {step.body}
              </p>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/70">
                {step.action}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="dm-civ-guide"
        className="grid scroll-mt-24 gap-5 lg:grid-cols-[1.08fr_0.92fr]"
      >
        <article className="overflow-hidden rounded-[1.6rem] border border-amber-200/15 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.94),rgba(4,6,15,0.98))] p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">
              DM Civ Guide
            </p>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              Guide coming from Zodiac
            </span>
          </div>
          <h2 className="mt-5 max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            Know the answer before the army arrives.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              "Know what to make with every civ.",
              "Know what not to make.",
              "Know the counter before panic begins.",
            ].map((line) => (
              <div
                key={line}
                className="rounded-[1rem] border border-white/9 bg-black/20 p-4 text-sm font-medium leading-6 text-slate-200"
              >
                {line}
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-400">
            {config.dmGuideBody ||
              "The first guide will be published from Zodiac’s civ-by-civ notes. Until then, bring a replay and ask about the matchup that beat you."}
          </p>
          {config.dmGuideUrl ? (
            <Link
              href={config.dmGuideUrl}
              className="mt-5 inline-flex rounded-full bg-amber-200 px-5 py-3 text-sm font-bold text-slate-950"
            >
              Open the DM Civ Guide
            </Link>
          ) : (
            <Link
              href={zodiacMessageHref}
              className="mt-5 inline-flex rounded-full border border-amber-200/25 bg-amber-200/[0.08] px-5 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-200/[0.13]"
            >
              Ask Zodiac a civ question
            </Link>
          )}
        </article>

        <article className="rounded-[1.6rem] border border-violet-200/15 bg-[radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.18),transparent_38%),rgba(8,10,22,0.92)] p-5 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-200/70">
            Private coaching
          </p>
          <h2 className="mt-4 text-3xl font-black tracking-tight">
            Bring the war you actually played.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Upload a replay. Zodiac can teach from your choices, your civ, and the pressure that
            made the game turn.
          </p>
          <div className="mt-6 rounded-[1.1rem] border border-white/9 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-white">Session request</span>
              <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Open
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-400">Pay in WOLO</span>
              <span className="text-amber-100">
                {config.coachingPriceWolo
                  ? `${config.coachingPriceWolo} WOLO`
                  : "Coming soon"}
              </span>
            </div>
          </div>
          <div className="mt-5">
            <PrimaryCtas config={config} profileHref={profileHref} compact />
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-cyan-200/12 bg-cyan-950/10 p-5 sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/65">
            The DM tribe
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            The band is still playing.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Zodiac says there is a 70-player Deathmatch group on Steam. Mystikal is the band;
            Zodiac is the solo act. No private invite is published here.
          </p>
          <Link
            href={config.steamGroupUrl || zodiacMessageHref}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white"
          >
            Ask Zodiac about the DM group <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="rounded-[1.5rem] border border-rose-200/12 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.12),transparent_35%),rgba(15,8,18,0.8)] p-5 sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-rose-200/65">
            Rivalry rail
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            The old board has a new threat.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Training is not the finish line. Step into the Challenge Hall when the new instincts
            are ready to meet a real name.
          </p>
          <Link
            href="/challenge"
            className="mt-5 inline-flex rounded-full border border-rose-200/25 bg-rose-200/[0.08] px-5 py-3 text-sm font-semibold text-rose-50 transition hover:bg-rose-200/[0.14]"
          >
            Enter the Challenge Hall
          </Link>
        </article>
      </section>

      <section className="rounded-[1.6rem] border border-white/9 bg-slate-950/55 p-4 sm:rounded-[2rem] sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-200/65">
              Featured matches
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Replay proof from Zodiac’s war room
            </h2>
          </div>
          <Link
            href={profileHref}
            className="text-sm font-semibold text-cyan-100 hover:text-white"
          >
            View all replay-backed stats →
          </Link>
        </div>

        {featuredMatches.length > 0 ? (
          <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-3">
            {featuredMatches.map((match) => (
              <Link
                key={match.id}
                href={match.href}
                className="group min-w-[82vw] snap-start rounded-[1.2rem] border border-white/9 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4 transition hover:-translate-y-1 hover:border-violet-200/25 md:min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${resultClasses(
                      match.result
                    )}`}
                  >
                    {resultLabel(match.result)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {formatMatchDate(match.playedAt)}
                  </span>
                </div>
                <h3 className="mt-4 line-clamp-2 min-h-12 font-bold leading-6 text-white">
                  {match.playersLabel}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-300">
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                    {match.mapName}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                    {match.playerCivilization}
                  </span>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1">
                    {match.durationLabel}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Replay / stat proof</span>
                  <span className="font-semibold text-cyan-100 transition group-hover:translate-x-0.5">
                    Inspect →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[1.2rem] border border-dashed border-white/12 bg-white/[0.025] p-6 text-sm leading-6 text-slate-400">
            Zodiac’s featured replay rail is being selected. His public profile remains the source
            of truth for parsed match proof.
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-[1.6rem] border border-amber-200/15 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.15),transparent_42%),linear-gradient(145deg,#121021,#050713)] p-6 text-center sm:rounded-[2rem] sm:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70">
          One game is enough to begin
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
          Bring a replay. Leave with a better answer.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
          Deathmatch needs new blood. The gate is open, the path is simple, and nobody expects a
          beginner to arrive already knowing the song.
        </p>
        <div className="mx-auto mt-6 max-w-2xl">
          <PrimaryCtas config={config} profileHref={profileHref} />
        </div>
      </section>
    </main>
  );
}
