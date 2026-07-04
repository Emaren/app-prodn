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
    <main className="academy-war-college space-y-6 py-3 text-white sm:space-y-8 sm:py-5">
      <section
        className="relative isolate min-h-[34rem] overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#05070d] bg-cover shadow-[0_38px_120px_rgba(0,0,0,0.42)] sm:min-h-[40rem]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(3,7,18,0.70) 0%, rgba(3,7,18,0.42) 30%, rgba(3,7,18,0.08) 58%, rgba(3,7,18,0.00) 100%), linear-gradient(180deg, rgba(3,7,18,0.00) 0%, rgba(3,7,18,0.02) 54%, rgba(3,7,18,0.24) 100%), url('/academy/academy-gates-red.webp')",
          backgroundPosition: "center, center, 62% center",
          backgroundSize: "cover, cover, cover",
        }}
      >
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

        <div className="relative flex min-h-[34rem] flex-col px-6 py-10 sm:min-h-[40rem] sm:px-10 lg:px-14">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/22 bg-black/24 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100 backdrop-blur-md">
              <Flame className="h-3.5 w-3.5" />
              The gate is open
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-red-100/18 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-red-100/90 backdrop-blur-md">
              <Shield className="h-3.5 w-3.5" />
              War counsel
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100/16 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100/90 backdrop-blur-md">
              <Orbit className="h-3.5 w-3.5" />
              First advisor seated
            </span>
          </div>

          <div className="mt-auto max-w-[41rem] pb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.44em] text-slate-300/72">
              AoE2WAR · The Academy
            </p>
            <h1 className="mt-16 font-serif text-5xl font-medium leading-[0.9] tracking-[-0.045em] text-amber-50 drop-shadow-[0_18px_42px_rgba(0,0,0,0.42)] sm:text-7xl">
              The Academy
            </h1>
            <div className="mt-5 h-px w-56 bg-gradient-to-r from-amber-200/70 via-amber-100/20 to-transparent" />
            <p className="mt-5 max-w-[34rem] text-base font-medium leading-7 text-slate-100 sm:text-lg">
              Read the field. Move with intent. Raise your ELO.
            </p>
            <p className="mt-3 max-w-[37rem] text-sm leading-6 text-slate-300">
              Replay study, battlefield judgment, and proven advice from real players.
              A cleaner war school for players who want to improve before they wager.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#advisors"
                className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-100/26 bg-[linear-gradient(135deg,rgba(92,64,18,0.28),rgba(3,7,18,0.52))] px-5 py-2.5 text-xs font-semibold text-amber-50 shadow-[0_16px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/40 hover:bg-amber-100/[0.075] academy-war-cta academy-war-cta-primary"
                data-academy-primary-cta="true"
              >
                Meet the advisors
                <ArrowRight className="h-3.5 w-3.5 text-amber-100/75 transition group-hover:translate-x-1" />
              </Link>
              <Link
                href="/zodiac"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/20 px-5 py-2.5 text-xs font-semibold text-slate-300 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-100/28 hover:bg-violet-300/[0.07] hover:text-slate-100 academy-war-cta academy-war-cta-secondary"
                data-academy-secondary-cta="true"
              >
                Train under the Zodiac
                <Sparkles className="h-3.5 w-3.5 text-violet-200/75" />
              </Link>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 hidden grid-cols-3 overflow-hidden rounded-[1.1rem] border border-amber-100/13 bg-black/24 text-left shadow-[0_18px_46px_rgba(0,0,0,0.28)] backdrop-blur-md lg:grid">
            <div className="border-r border-white/8 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">Doctrine</div>
              <div className="mt-1 text-sm font-bold text-amber-50">Field reads</div>
            </div>
            <div className="border-r border-white/8 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">Command</div>
              <div className="mt-1 text-sm font-bold text-amber-50">Timing</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">Proof</div>
              <div className="mt-1 text-sm font-bold text-amber-50">Replay war</div>
            </div>
          </div>
        </div>
      </section>

      <section className="academy-discipline-grid grid gap-3 md:grid-cols-3">
        {DISCIPLINES.map(({ icon: Icon, title, detail }, index) => (
          <article
            key={title}
            className="academy-discipline-card group flex items-center gap-4 rounded-[1.45rem] border border-white/9 bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(3,7,18,0.9))] p-4 transition hover:-translate-y-0.5 hover:border-amber-100/20 sm:p-5"
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
            <h2 className="mt-3 max-w-xl bg-[linear-gradient(115deg,rgba(253,230,138,0.92),rgba(226,232,240,0.84)_42%,rgba(167,139,250,0.72)_78%,rgba(120,113,108,0.82))] bg-clip-text font-serif text-3xl font-medium leading-tight tracking-[-0.025em] text-transparent drop-shadow-[0_18px_44px_rgba(0,0,0,0.32)] sm:text-5xl academy-war-heading academy-war-heading-major" data-academy-heading="major">
              Proven voices. Real wars.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-slate-500">
            Counsel earned at the table: replay, judgment, and pressure
            remembered clearly.
          </p>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <Link
            href="/zodiac"
            className="academy-advisor-card group relative min-h-[33rem] overflow-hidden rounded-[1.8rem] border border-violet-100/20 bg-black/30 shadow-[0_28px_80px_rgba(0,0,0,0.3)]"
          >
            <Image
              src={zodiac.avatarUrl}
              alt={`${zodiac.name}, founding Academy advisor`}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-contain object-top opacity-90 transition duration-700 scale-[0.88] translate-y-6 origin-top group-hover:scale-[0.91]" data-academy-advisor-portrait="true"
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
              <div className="academy-advisor-title-row">
                  <h3 className="academy-advisor-name">{zodiac.name}</h3>
                  <span className="academy-advisor-stat-rotator" aria-label="Advisor record and ELO">
                    <span className="academy-advisor-stat academy-advisor-stat--record">9-0-0</span>
                    <span className="academy-advisor-stat academy-advisor-stat--elo">1671 ELO</span>
                  </span>
                </div>
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

          <article className="academy-next-seat flex min-h-[33rem] flex-col justify-between rounded-[1.8rem] border border-dashed border-white/13 bg-[radial-gradient(circle_at_50%_25%,rgba(251,191,36,0.08),transparent_27%),rgba(0,0,0,0.2)] p-6">
            <div>
              <div className="grid h-14 w-14 place-items-center rounded-[1.2rem] border border-white/10 bg-white/[0.04] text-slate-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">
                The next seat
              </p>
              <h3 className="academy-next-seat-title mt-3 font-serif text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl" data-academy-heading="minor">
                Another doctrine belongs here.
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Random Map, team command, openings, economy, tournament nerve.
                The Academy grows by proven craft.
              </p>
            </div>
            <Link
              href="/contact-emaren?subject=Academy%20advisor%20seat"
              className="group mt-8 flex min-h-11 items-center justify-between rounded-full border border-white/10 bg-white/[0.035] px-5 text-sm font-semibold text-slate-300 transition hover:border-amber-100/24 hover:bg-amber-200/[0.055] hover:text-amber-50"
            >
              Claim an advisor seat
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </article>
        </div>
      </section>

      <section className="academy-field-manual rounded-[2rem] border border-white/9 bg-black/22 p-5 sm:p-8">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-100/65">
          <Swords className="h-4 w-4" />
          The field manual
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FIELD_MANUAL.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="academy-manual-card flex min-h-28 flex-col justify-between rounded-[1.25rem] border border-white/8 bg-white/[0.025] p-4"
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
