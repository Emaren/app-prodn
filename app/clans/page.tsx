import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquareText,
  Plus,
  Shield,
  Sparkles,
  UsersRound,
} from "lucide-react";

import ClanViewToggle from "@/components/clans/ClanViewToggle";
import {
  loadClanDirectory,
  MYSTIKAL_FALLBACK,
  normalizeClanView,
  type ClanDirectoryEntry,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clans",
  description:
    "AoE2WAR clan halls for team identity, community chat, rivalries, and shared replay history.",
};

async function getClans(): Promise<ClanDirectoryEntry[]> {
  try {
    const clans = await loadClanDirectory(getPrisma());
    return clans.length > 0 ? clans : [MYSTIKAL_FALLBACK];
  } catch (error) {
    console.warn("Failed to load clan directory:", error);
    return [MYSTIKAL_FALLBACK];
  }
}

export default async function ClansPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view = normalizeClanView(resolvedSearchParams.view);
  const clans = await getClans();
  const hallHref = (slug: string) =>
    view === "advanced"
      ? `/clans/${slug}`
      : `/clans/${slug}?view=${view}`;

  return (
    <main
      className={`clan-directory clan-${view}-view mx-auto w-full space-y-6 py-3 text-white sm:py-5`}
    >
      <section className="relative overflow-hidden rounded-[2.2rem] border border-violet-200/14 bg-[radial-gradient(circle_at_15%_15%,rgba(139,92,246,0.19),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(56,189,248,0.11),transparent_28%),linear-gradient(145deg,#111629,#070b16_58%,#03050c)] px-5 py-9 shadow-[0_34px_120px_rgba(0,0,0,0.32)] sm:px-8 sm:py-12">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/50 to-transparent" />
        <div className="absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
          <ClanViewToggle view={view} basePath="/clans" />
        </div>
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.36em] text-violet-200/75">
            <UsersRound className="h-4 w-4" />
            Houses of AoE2WAR
          </div>
          <h1 className="mt-4 font-serif text-5xl font-semibold tracking-[-0.035em] text-white sm:text-7xl">
            Clan halls
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Find your banner, enter the hall, and keep the conversation,
            rivalries, and old war stories together.
          </p>
        </div>
      </section>

      <section className="clan-directory-grid grid gap-5 lg:grid-cols-2">
        {clans.map((clan) => (
          <Link
            key={clan.slug}
            href={hallHref(clan.slug)}
            className="clan-directory-card clan-directory-card--house group relative flex min-h-[31rem] flex-col overflow-hidden rounded-[2.1rem] border border-violet-100/18 bg-[radial-gradient(circle_at_50%_21%,rgba(168,85,247,0.30),transparent_24%),radial-gradient(circle_at_48%_18%,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_50%_78%,rgba(251,191,36,0.10),transparent_33%),linear-gradient(155deg,rgba(10,9,22,0.99),rgba(5,7,17,0.99)_54%,rgba(3,5,12,0.99))] p-5 shadow-[0_32px_110px_rgba(0,0,0,0.40),0_0_70px_rgba(109,40,217,0.16)] transition duration-300 hover:-translate-y-1 hover:border-amber-100/30 hover:shadow-[0_42px_130px_rgba(0,0,0,0.48),0_0_92px_rgba(124,58,237,0.25)] sm:p-7"
          >
            <div className="pointer-events-none absolute inset-0 opacity-80">
              <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-violet-500/16 blur-3xl" />
              <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-300/10 blur-3xl" />
              <div className="absolute bottom-12 right-4 h-52 w-52 rounded-full bg-amber-300/8 blur-3xl" />
              <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />
              <div className="absolute inset-x-16 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-200/28 to-transparent" />
            </div>
            <div className="relative mx-auto grid aspect-square w-full max-w-[22rem] place-items-center overflow-hidden rounded-[2rem] border border-amber-100/18 bg-[radial-gradient(circle_at_50%_42%,rgba(250,204,21,0.11),transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.58),rgba(0,0,0,0.88))] p-3 shadow-[0_32px_90px_rgba(0,0,0,0.52),0_0_74px_rgba(109,40,217,0.30),inset_0_0_34px_rgba(255,255,255,0.05)] before:pointer-events-none before:absolute before:inset-3 before:rounded-[1.55rem] before:border before:border-white/8 after:pointer-events-none after:absolute after:inset-0 after:rounded-[2rem] after:bg-[radial-gradient(circle_at_50%_50%,transparent_38%,rgba(0,0,0,0.42)_100%)]">
              <Image
                src={clan.crestUrl || "/clans/mystikal-crest.webp"}
                alt={`${clan.name} crest`}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 38vw"
                className="rounded-[1.45rem] object-cover transition duration-700 group-hover:scale-[1.035] group-hover:saturate-[1.12]"
              />
            </div>

            <div className="clan-directory-card__body relative mt-6 flex flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100/22 bg-amber-200/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.08)]">
                  <Shield className="h-3.5 w-3.5" />
                  Founding house
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100/16 bg-violet-200/[0.055] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-violet-100/86">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Hall open
                </span>
              </div>
              <div className="clan-directory-card__title relative mx-auto mt-4 flex h-[4.95rem] w-full max-w-[27rem] items-center justify-center overflow-visible px-3 sm:h-[5.35rem]">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.22),transparent_60%),radial-gradient(circle_at_50%_52%,rgba(56,189,248,0.12),transparent_62%)] blur-2xl" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[88%] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-sky-300/22 to-transparent" />
                <Image
                  src="/clans/mystikal-wordmark.png"
                  alt="Mystikal"
                  width={2172}
                  height={724}
                  className="relative mx-auto block h-auto w-full max-w-[20rem] select-none object-contain object-center opacity-[0.97] mix-blend-screen brightness-[1.12] contrast-[1.18] saturate-[1.08] drop-shadow-[0_0_18px_rgba(129,140,248,0.34)] transition duration-500 group-hover:opacity-100 group-hover:brightness-[1.16] group-hover:drop-shadow-[0_0_30px_rgba(167,139,250,0.48)] sm:max-w-[21.5rem]"
                  sizes="(max-width: 640px) 78vw, 344px"
                  priority={false}
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)",
                    maskImage:
                      "linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)",
                  }}
                />
              </div>
              {view !== "basic" ? (
                <div className="clan-directory-card__rank mt-2 text-[10px] font-black uppercase tracking-[0.42em] text-amber-100/58 [text-shadow:0_0_16px_rgba(251,191,36,0.16)]">
                  {view === "extreme"
                    ? "Blood remembers the banner"
                    : "The founding warhouse"}
                </div>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-slate-300/92">
                {clan.tagline}
              </p>
              <div className="mt-auto flex items-center justify-between gap-4 border-t border-amber-100/12 pt-5">
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  {clan.memberCount > 0
                    ? `${clan.memberCount} hall member${clan.memberCount === 1 ? "" : "s"}`
                    : "Roster forming"}
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-amber-100/88 transition group-hover:text-amber-50">
                  Enter hall
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ))}

        <Link
          href="/contact-emaren?subject=Add%20your%20clan"
          className="clan-directory-card clan-directory-card--summon group relative flex min-h-[31rem] flex-col items-center justify-center overflow-hidden rounded-[2.1rem] border border-dashed border-amber-200/24 bg-[radial-gradient(circle_at_50%_36%,rgba(251,191,36,0.10),transparent_31%),linear-gradient(155deg,rgba(23,18,10,0.82),rgba(3,6,15,0.96))] px-7 py-10 text-center transition duration-300 hover:-translate-y-1 hover:border-amber-200/45 hover:bg-amber-300/[0.055]"
        >
          <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
          <div className="relative grid h-36 w-36 place-items-center rounded-[2.2rem] border border-amber-200/18 bg-amber-300/[0.07] text-amber-100 shadow-[0_24px_80px_rgba(0,0,0,0.3)] transition duration-300 group-hover:scale-105 group-hover:bg-amber-300/10">
            <Plus className="h-14 w-14" strokeWidth={1.4} />
          </div>
          <div className="relative mt-8 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-200/70">
            <Sparkles className="h-4 w-4" />
            Raise a banner
          </div>
          <h2 className="clan-directory-card__title relative mt-4 text-3xl font-black tracking-[-0.025em] text-white sm:text-4xl">
            {view === "basic"
              ? "Add your clan"
              : view === "extreme"
                ? "Found your house"
                : "Raise your banner"}
          </h2>
          {view !== "basic" ? (
            <div className="clan-directory-card__rank relative mt-2 text-[10px] font-bold uppercase tracking-[0.34em] text-amber-200/60">
              Claim ground · Rally your own
            </div>
          ) : null}
          <p className="relative mt-3 max-w-md text-sm leading-6 text-slate-300">
            Bring your crest, founding roster, and house rules. We’ll open a
            hall beside Mystikal.
          </p>
          <span className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 transition group-hover:bg-amber-200">
            Request a clan hall
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </section>
    </main>
  );
}
