import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Plus,
  Shield,
  Sparkles,
  UsersRound,
} from "lucide-react";

import ClanHallPurchase from "@/components/clans/ClanHallPurchase";
import ClanViewToggle from "@/components/clans/ClanViewToggle";
import {
  FOUNDING_CLAN_FALLBACKS,
  loadClanDirectory,
  mergeClanDirectoryWithFoundingClans,
  normalizeClanView,
  type ClanDirectoryEntry,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clans",
  description:
    "AoE2WAR clan warhouses: banners, hall chat, rivalries, and shared battle history.",
};

async function getClans(): Promise<
  ClanDirectoryEntry[]
> {
  try {
    const clans = await loadClanDirectory(
      getPrisma(),
    );

    return mergeClanDirectoryWithFoundingClans(
      clans,
    );
  } catch (error) {
    console.warn(
      "Failed to load clan directory:",
      error,
    );

    return [...FOUNDING_CLAN_FALLBACKS];
  }
}

function clanWarLine(slug: string) {
  if (slug === "jims-clan") {
    return "The American Champion's warhouse";
  }

  if (slug === "legend-clan") {
    return "The Sultan's palace-hall";
  }

  return "The founding warhouse";
}

export default async function ClansPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const view = normalizeClanView(
    resolvedSearchParams.view,
  );
  const clans = await getClans();
  const hallHref = (slug: string) =>
    view === "advanced"
      ? `/clans/${slug}`
      : `/clans/${slug}?view=${view}`;

  return (
    <main
      className={`clan-directory clan-${view}-view mx-auto w-full space-y-6 py-3 text-white sm:py-5`}
    >
      <section className="clan-directory-masthead relative overflow-hidden rounded-[1.6rem] border border-red-200/14 px-5 py-4 sm:px-7">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/16 bg-red-950/45 text-red-100">
              <UsersRound className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.34em] text-red-100/62">
                Houses of AoE2WAR
              </div>
              <div className="mt-0.5 text-sm text-stone-500">
                Three banners stand. Another can rise.
              </div>
            </div>
          </div>

          <ClanViewToggle
            view={view}
            basePath="/clans"
          />
        </div>
      </section>

      <section className="clan-directory-grid grid gap-5 lg:grid-cols-2">
        {clans.map((clan) => (
          <Link
            key={clan.slug}
            href={hallHref(clan.slug)}
            data-clan-slug={clan.slug}
            className="clan-directory-card clan-directory-card--house group relative flex min-h-[34rem] flex-col overflow-hidden rounded-[2.1rem] border p-5 transition duration-300 hover:-translate-y-1 sm:p-7"
          >
            <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />

            <div className="clan-crest-stage relative mx-auto grid aspect-square w-full max-w-[23rem] place-items-center overflow-hidden rounded-[1.7rem] border border-amber-100/14 p-2">
              {clan.crestUrl ? (
                <Image
                  src={clan.crestUrl}
                  alt={`${clan.name} crest`}
                  fill
                  priority
                  sizes="(max-width: 1024px) 90vw, 38vw"
                  className="rounded-[1.35rem] object-cover transition duration-700 group-hover:scale-[1.035] group-hover:saturate-[1.08]"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-[1.35rem] border border-dashed border-red-200/16 bg-black/30 text-stone-700">
                  <Shield className="h-28 w-28" strokeWidth={1} />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 rounded-[1.7rem] bg-[radial-gradient(circle_at_50%_50%,transparent_46%,rgba(0,0,0,0.46)_100%)]" />
            </div>

            <div className="relative mt-6 flex flex-1 flex-col">
              <div className="text-[10px] font-black uppercase tracking-[0.30em] text-red-100/55">
                {clanWarLine(clan.slug)}
              </div>
              <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.035em] text-stone-50 sm:text-5xl">
                {clan.name}
              </h2>
              <div className="mt-3 h-px w-28 bg-gradient-to-r from-red-400/55 via-amber-100/22 to-transparent" />
              <p className="mt-4 text-sm leading-6 text-stone-400">
                {clan.tagline}
              </p>

              <div className="mt-auto flex items-center justify-between gap-4 border-t border-stone-500/16 pt-5">
                <span className="text-xs font-bold uppercase tracking-[0.20em] text-stone-600">
                  {clan.memberCount > 0
                    ? `${clan.memberCount} hall member${clan.memberCount === 1 ? "" : "s"}`
                    : "Roster forming"}
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.10em] text-amber-100/85 transition group-hover:text-amber-50">
                  Enter hall
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        ))}

        <a
          href="#buy-clan-hall"
          className="clan-directory-card clan-directory-card--summon group relative flex min-h-[34rem] flex-col items-center justify-center overflow-hidden rounded-[2.1rem] border border-dashed px-7 py-10 text-center transition duration-300 hover:-translate-y-1"
        >
          <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />

          <div className="relative grid h-36 w-36 place-items-center rounded-[2rem] border border-red-200/20 bg-red-950/35 text-red-100 shadow-[0_24px_80px_rgba(0,0,0,0.38)] transition duration-300 group-hover:scale-105 group-hover:border-amber-200/30">
            <Plus className="h-14 w-14" strokeWidth={1.4} />
          </div>

          <div className="relative mt-8 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-red-100/70">
            <Flame className="h-4 w-4 text-amber-200" />
            Raise a banner
          </div>
          <h2 className="relative mt-4 font-serif text-4xl tracking-[-0.025em] text-white">
            Found your house
          </h2>
          <div className="relative mt-2 text-[10px] font-bold uppercase tracking-[0.30em] text-amber-200/60">
            Claim ground · Rally your own
          </div>
          <p className="relative mt-4 max-w-md text-sm leading-6 text-stone-400">
            Bring your founding name, pay the hall commission, and send
            Emaren a verified Clan Alert.
          </p>
          <span className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-stone-950 transition group-hover:bg-amber-200">
            Buy a Clan Hall · 100 WOLO
            <ArrowRight className="h-4 w-4" />
          </span>
          <Sparkles className="pointer-events-none absolute bottom-8 right-8 h-6 w-6 text-red-200/30" />
        </a>
      </section>

      <ClanHallPurchase />
    </main>
  );
}
