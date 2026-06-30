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

import {
  loadClanDirectory,
  MYSTIKAL_FALLBACK,
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

export default async function ClansPage() {
  const clans = await getClans();

  return (
    <main className="space-y-6 py-3 text-white sm:py-5">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-violet-200/14 bg-[radial-gradient(circle_at_15%_15%,rgba(139,92,246,0.19),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(56,189,248,0.11),transparent_28%),linear-gradient(145deg,#111629,#070b16_58%,#03050c)] px-5 py-9 shadow-[0_34px_120px_rgba(0,0,0,0.32)] sm:px-8 sm:py-12">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/50 to-transparent" />
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

      <section className="grid gap-5 lg:grid-cols-2">
        {clans.map((clan) => (
          <Link
            key={clan.slug}
            href={`/clans/${clan.slug}`}
            className="group relative flex min-h-[31rem] flex-col overflow-hidden rounded-[2.1rem] border border-violet-200/18 bg-[radial-gradient(circle_at_50%_20%,rgba(124,58,237,0.18),transparent_33%),linear-gradient(155deg,rgba(12,18,35,0.98),rgba(3,6,15,0.98))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-violet-200/35 hover:shadow-[0_38px_110px_rgba(76,29,149,0.18)] sm:p-7"
          >
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/55 to-transparent" />
            <div className="relative mx-auto aspect-square w-full max-w-[22rem] overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/35 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
              <Image
                src={clan.crestUrl || "/clans/mystikal-crest.webp"}
                alt={`${clan.name} crest`}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 38vw"
                className="object-cover transition duration-500 group-hover:scale-[1.025]"
              />
            </div>

            <div className="relative mt-6 flex flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/18 bg-violet-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100">
                  <Shield className="h-3.5 w-3.5" />
                  Founding clan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Hall open
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.025em] text-white sm:text-4xl">
                {clan.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {clan.tagline}
              </p>
              <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/9 pt-5">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {clan.memberCount > 0
                    ? `${clan.memberCount} hall member${clan.memberCount === 1 ? "" : "s"}`
                    : "Roster forming"}
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-violet-100 transition group-hover:text-white">
                  Enter hall
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ))}

        <Link
          href="/contact-emaren?subject=Add%20your%20clan"
          className="group relative flex min-h-[31rem] flex-col items-center justify-center overflow-hidden rounded-[2.1rem] border border-dashed border-amber-200/24 bg-[radial-gradient(circle_at_50%_36%,rgba(251,191,36,0.10),transparent_31%),linear-gradient(155deg,rgba(23,18,10,0.82),rgba(3,6,15,0.96))] px-7 py-10 text-center transition duration-300 hover:-translate-y-1 hover:border-amber-200/45 hover:bg-amber-300/[0.055]"
        >
          <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
          <div className="relative grid h-36 w-36 place-items-center rounded-[2.2rem] border border-amber-200/18 bg-amber-300/[0.07] text-amber-100 shadow-[0_24px_80px_rgba(0,0,0,0.3)] transition duration-300 group-hover:scale-105 group-hover:bg-amber-300/10">
            <Plus className="h-14 w-14" strokeWidth={1.4} />
          </div>
          <div className="relative mt-8 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-amber-200/70">
            <Sparkles className="h-4 w-4" />
            Raise a banner
          </div>
          <h2 className="relative mt-4 text-3xl font-black tracking-[-0.025em] text-white sm:text-4xl">
            Add your clan
          </h2>
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
