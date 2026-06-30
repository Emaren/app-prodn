import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  Compass,
  Eye,
  Flame,
  Orbit,
  Shield,
  Sparkles,
  Swords,
  Target,
  TimerReset,
} from "lucide-react";

import { avatarUrlForUser } from "@/lib/avatarAssets";
import { loadClaimedPlayerProfile } from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import { ZODIAC_TRAINING_CONFIG } from "@/lib/zodiacTraining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Academy",
  description:
    "AoE2WAR Academy: strategy, replay study, battlefield judgment, and direct counsel from proven Age of Empires II advisors.",
  alternates: {
    canonical: "/academy",
  },
};

const DISCIPLINES = [
  {
    icon: Eye,
    title: "Read the field",
    detail: "Scout the signal.",
  },
  {
    icon: TimerReset,
    title: "Command timing",
    detail: "Move before panic.",
  },
  {
    icon: Target,
    title: "Review the war",
    detail: "Find the true turn.",
  },
] as const;

const FIELD_MANUAL = [
  { icon: Compass, label: "Map control" },
  { icon: Shield, label: "Civ answers" },
  { icon: BrainCircuit, label: "Decision pressure" },
  { icon: Swords, label: "Multi-front command" },
] as const;

async function loadZodiacCard() {
  const fallbackName = "Zodiac";
  const fallbackAvatar = avatarUrlForUser(
    ZODIAC_TRAINING_CONFIG.userUid,
    fallbackName
  );

  try {
    const profile = await loadClaimedPlayerProfile(
      getPrisma(),
      ZODIAC_TRAINING_CONFIG.userUid
    );
    const name = profile?.displayName || fallbackName;
    const avatarBase = avatarUrlForUser(
      ZODIAC_TRAINING_CONFIG.userUid,
      name
    );

    return {
      name,
      avatarUrl: `${avatarBase}${avatarBase.includes("?") ? "&" : "?"}size=card`,
      matchCount: profile?.matchFeed.totalMatches || 0,
    };
  } catch (error) {
    console.warn("Academy advisor card could not load replay profile:", error);
    return {
      name: fallbackName,
      avatarUrl: `${fallbackAvatar}${
        fallbackAvatar.includes("?") ? "&" : "?"
      }size=card`,
      matchCount: 0,
    };
  }
}

export default async function AcademyPage() {
  const zodiac = await loadZodiacCard();

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-8 sm:py-5">
      <section className="relative isolate min-h-[38rem] overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#030711] shadow-[0_38px_120px_rgba(0,0,0,0.42)] sm:min-h-[43rem]">
        <Image
          src="/academy/academy-gates.webp"
          alt="The torchlit gates of the AoE2WAR Academy"
          fill
          priority
          sizes="(max-width: 1536px) 100vw, 1536px"
          className="object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,18,0.97)_0%,rgba(2,6,18,0.88)_31%,rgba(2,6,18,0.38)_60%,rgba(2,6,18,0.12)_100%),linear-gradient(180deg,rgba(2,6,18,0.12),rgba(2,6,18,0.18)_58%,rgba(2,6,18,0.92)_100%)]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

        <div className="relative flex min-h-[38rem] max-w-[49rem] flex-col justify-center px-6 py-12 sm:min-h-[43rem] sm:px-10 lg:px-14">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/22 bg-amber-200/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100">
              <Flame className="h-3.5 w-3.5" />
              The gate is open
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100/18 bg-violet-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100">
              <Orbit className="h-3.5 w-3.5" />
              First advisor seated
            </span>
          </div>

          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.42em] text-slate-400">
            AoE2WAR · The Academy
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-6xl font-semibold leading-[0.88] tracking-[-0.055em] text-white sm:text-8xl lg:text-[7.6rem]">
            Study the war.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
            Read the field. Move with intent. Raise your ELO without lowering
            the standard.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
            Strategy for players who respect the game—and want the game to
            start respecting them back.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#advisors"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-200 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_18px_45px_rgba(251,191,36,0.18)] transition hover:-translate-y-0.5 hover:bg-amber-100"
            >
              Meet the advisors
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="/zodiac"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/16 bg-black/24 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-100/35 hover:bg-violet-300/10"
            >
              Train under the Zodiac
              <Sparkles className="h-4 w-4 text-violet-200" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {DISCIPLINES.map(({ icon: Icon, title, detail }, index) => (
          <article
            key={title}
            className="group flex items-center gap-4 rounded-[1.45rem] border border-white/9 bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(3,7,18,0.9))] p-4 transition hover:-translate-y-0.5 hover:border-amber-100/20 sm:p-5"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] border border-amber-100/15 bg-amber-200/[0.07] text-amber-100">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-600">
                Discipline 0{index + 1}
              </div>
              <h2 className="mt-1 text-base font-bold text-white">{title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section
        id="advisors"
        className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-violet-100/14 bg-[radial-gradient(circle_at_88%_12%,rgba(124,58,237,0.18),transparent_30%),linear-gradient(145deg,#0a1020,#030711_68%)] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.3)] sm:p-8"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] text-violet-200/70">
              <Orbit className="h-4 w-4" />
              Advisors
            </div>
            <h2 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
              Proven voices. Real wars.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-slate-400">
            No lectures from the cheap seats. Advisors teach from decisions
            they have made under pressure.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <Link
            href="/zodiac"
            className="group relative min-h-[33rem] overflow-hidden rounded-[1.8rem] border border-violet-100/20 bg-black/30 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
          >
            <Image
              src={zodiac.avatarUrl}
              alt={`${zodiac.name}, founding Academy advisor`}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover object-center opacity-90 transition duration-700 group-hover:scale-[1.025]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.03),rgba(3,7,18,0.16)_38%,rgba(3,7,18,0.97)_88%),linear-gradient(90deg,rgba(3,7,18,0.48),transparent_62%)]" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-100/20 bg-amber-200/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-100 backdrop-blur-md">
                  Founding advisor
                </span>
                <span className="rounded-full border border-emerald-100/18 bg-emerald-300/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100 backdrop-blur-md">
                  Accepting apprentices
                </span>
              </div>
              <h3 className="mt-4 text-4xl font-black tracking-[-0.035em] sm:text-6xl">
                {zodiac.name}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Deathmatch · civ judgment · multi-front command
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/12 pt-5">
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{zodiac.matchCount} replay-backed wars</span>
                  <span className="text-amber-100">First lesson · 100 WOLO</span>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-violet-100 transition group-hover:text-white">
                  Train under the Zodiac
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>

          <article className="flex min-h-[33rem] flex-col justify-between rounded-[1.8rem] border border-dashed border-white/13 bg-[radial-gradient(circle_at_50%_25%,rgba(251,191,36,0.08),transparent_27%),rgba(0,0,0,0.2)] p-6">
            <div>
              <div className="grid h-14 w-14 place-items-center rounded-[1.2rem] border border-white/10 bg-white/[0.04] text-slate-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-600">
                The next seat
              </p>
              <h3 className="mt-3 text-3xl font-black tracking-[-0.025em] text-white">
                Another doctrine belongs here.
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Random Map, team command, openings, economy, tournament nerve.
                The Academy grows by proven craft.
              </p>
            </div>
            <Link
              href="/contact-emaren?subject=Become%20an%20Academy%20advisor"
              className="group mt-8 flex min-h-12 items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-bold text-slate-200 transition hover:border-amber-100/25 hover:bg-amber-200/[0.07] hover:text-white"
            >
              Claim an advisor seat
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </article>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/9 bg-black/22 p-5 sm:p-8">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-100/65">
          <Swords className="h-4 w-4" />
          The field manual
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FIELD_MANUAL.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex min-h-28 flex-col justify-between rounded-[1.25rem] border border-white/8 bg-white/[0.025] p-4"
            >
              <Icon className="h-5 w-5 text-amber-100" />
              <span className="mt-6 text-sm font-bold text-slate-200">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
