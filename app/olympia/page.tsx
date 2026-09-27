import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Crown, Flag, Shield, Sparkles, Swords } from "lucide-react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { featuredAvatarUrlForUser } from "@/lib/avatarAssets";
import { loadChampionTitleEconomyState } from "@/lib/champions/titleState";
import { loadPublicPlayerDirectory, type PublicPlayerDirectoryEntry } from "@/lib/publicPlayerDirectory";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Olympia",
  description:
    "The AoE2WAR hall of national champions: Canada, the United States, and Mexico assembling between future Olympia Games.",
};

const OLYMPIA_TITLES = [
  { id: "national-canada", flag: "🇨🇦", nation: "Canada", crown: "Canadian Champion" },
  { id: "national-usa", flag: "🇺🇸", nation: "United States", crown: "American Champion" },
  { id: "national-mexico", flag: "🇲🇽", nation: "Mexico", crown: "Mexican Champion" },
] as const;

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findPlayer(
  directory: Awaited<ReturnType<typeof loadPublicPlayerDirectory>>,
  uid: string | null | undefined,
  name: string,
): PublicPlayerDirectoryEntry | null {
  const uidKey = String(uid ?? "").trim().toLowerCase();
  const nameKey = normalizeIdentity(name);

  return (
    directory.allEntries.find((entry) => uidKey && entry.uid?.toLowerCase() === uidKey) ??
    directory.allEntries.find((entry) => normalizeIdentity(entry.name) === nameKey) ??
    null
  );
}

function championPersona(name: string) {
  const key = normalizeIdentity(name);

  if (key === "emaren") {
    return {
      style: "The Tactician",
      blurb:
        "Measured pressure, calculated risk, and adaptation. The fight changes shape; the plan changes with it.",
    };
  }

  if (key === "jim") {
    return {
      style: "The Fortress",
      blurb:
        "Builds ground, survives ugly positions, and turns structure into pressure when the battlefield starts to crack.",
    };
  }

  if (key === "julio" || key === "julioalvarez") {
    return {
      style: "The Conquistador",
      blurb:
        "Forward momentum and decisive ground-taking. Once the opening appears, the attack is meant to keep moving.",
    };
  }

  return {
    style: "National Champion",
    blurb:
      "A reigning national standard-bearer. The Olympia dossier grows with every verified battle and title defense.",
  };
}

function ratingLabel(entry: PublicPlayerDirectoryEntry | null) {
  if (!entry) return "—";
  if (entry.steamRmRating != null) return `${entry.steamRmRating} RM`;
  if (entry.steamDmRating != null) return `${entry.steamDmRating} DM`;
  return "—";
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Reign active";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function vacantChallengeHref(commissionerUid: string | null) {
  const params = new URLSearchParams({ kind: "national" });
  if (commissionerUid) {
    params.set("opponent", commissionerUid);
  }
  return `/challenge?${params.toString()}#schedule-game`;
}

export default async function OlympiaPage() {
  const prisma = getPrisma();
  const [titles, directory] = await Promise.all([
    loadChampionTitleEconomyState(prisma),
    loadPublicPlayerDirectory(prisma),
  ]);

  const commissioner =
    directory.allEntries.find(
      (entry) => normalizeIdentity(entry.name) === "emaren",
    ) ?? null;

  const champions = OLYMPIA_TITLES.flatMap((slot) => {
    const title = titles.titles.find((row) => row.id === slot.id);
    const holder = title?.holders[0];
    if (!title || !holder) return [];

    const player = findPlayer(directory, holder.uid, holder.name);
    return [{
      ...slot,
      title,
      holder,
      player,
      persona: championPersona(holder.name),
    }];
  });

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-8 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6">
      <SpeedReadyMarker route="/olympia" />

      <section className="relative overflow-hidden rounded-[2.6rem] border border-sky-100/14 bg-[radial-gradient(circle_at_50%_-10%,rgba(125,211,252,0.20),transparent_35%),radial-gradient(circle_at_16%_22%,rgba(251,191,36,0.15),transparent_23%),linear-gradient(145deg,#06101d,#080a14_58%,#140d08)] px-6 py-10 text-center shadow-[0_48px_160px_rgba(0,0,0,0.48)] sm:px-8 lg:py-14">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-200/25 bg-amber-300/10 text-amber-100">
          <Crown className="h-7 w-7" />
        </div>
        <div className="mt-5 text-[10px] font-black uppercase tracking-[0.45em] text-sky-100/55">
          The national hall
        </div>
        <h1 className="mt-3 font-serif text-6xl font-semibold tracking-[-0.055em] text-white sm:text-7xl">
          OLYMPIA
        </h1>
        <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-300">
          The Games are not underway. This is the hall between them: national champions
          standing beneath their flags, carrying their belts, building the records that
          will one day walk into the AoE2WAR Olympia. The future Games are a four-year
          summit; Olympia remains their living hall between cycles.
        </p>
        <div className="mx-auto mt-7 h-px max-w-3xl bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.45),transparent)]" />
      </section>

      <section>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {champions.map(({ title, holder, player, persona, flag, nation, crown }) => {
            const avatar = featuredAvatarUrlForUser(
              holder.uid,
              holder.name,
              player?.featuredAvatarRevision,
            );

            return (
              <article
                key={title.id}
                className="group relative min-h-[44rem] overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(3,7,18,0.98))] shadow-[0_30px_100px_rgba(0,0,0,0.34)]"
              >
                <div className="absolute inset-x-0 top-0 h-[27rem] bg-[radial-gradient(circle_at_50%_26%,rgba(251,191,36,0.13),transparent_48%)]" />
                <div className="absolute right-4 top-4 z-20 text-5xl drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]" aria-label={nation}>
                  {flag}
                </div>

                <div className="relative h-[29rem] overflow-hidden">
                  <Image
                    src={avatar}
                    alt=""
                    fill
                    priority
                    unoptimized
                    sizes="(min-width:1280px) 24vw, (min-width:768px) 48vw, 92vw"
                    className="object-contain object-bottom opacity-95 transition duration-500 group-hover:scale-[1.025]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_38%,rgba(3,7,18,0.30)_66%,#030712_100%)]" />
                  <div className="absolute bottom-3 left-4 right-4 z-10">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/65">
                      {crown}
                    </div>
                    <Link
                      href={holder.href || title.routeHref}
                      className="mt-1 block font-serif text-4xl font-semibold tracking-[-0.035em] text-white transition hover:text-amber-100"
                    >
                      {holder.name}
                    </Link>
                    <div className="mt-1 text-sm font-semibold text-sky-100/75">
                      {persona.style}
                    </div>
                  </div>
                </div>

                <div className="relative px-5 pb-5">
                  <p className="min-h-[5.5rem] text-sm leading-6 text-slate-400">
                    {persona.blurb}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                      <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">Battles</div>
                      <div className="mt-1 font-semibold text-white">{player?.totalMatches ?? "—"}</div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                      <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">Record</div>
                      <div className="mt-1 font-semibold text-white">
                        {player ? `${player.wins}-${player.losses}` : "—"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                      <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">Rating</div>
                      <div className="mt-1 whitespace-nowrap font-semibold text-white">{ratingLabel(player)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-xs text-slate-500">
                    <span>Reign · {dateLabel(title.holderSince)}</span>
                    <Link href={title.routeHref} className="font-semibold text-amber-100/80 hover:text-amber-50">
                      View belt
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}

          <article className="flex min-h-[44rem] flex-col justify-between overflow-hidden rounded-[2.2rem] border border-dashed border-amber-200/22 bg-[radial-gradient(circle_at_50%_26%,rgba(251,191,36,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(3,7,18,0.92))] p-6">
            <div>
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/8 text-amber-100">
                <Flag className="h-7 w-7" />
              </div>
              <div className="mt-8 text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/55">
                Vacant national standard
              </div>
              <h2 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em]">
                Claim your nation&apos;s vacant belt.
              </h2>
              <p className="mt-5 text-sm leading-7 text-slate-400">
                Canada, America, and Mexico are only the opening delegation. If your nation
                has no active champion, call out the Commissioner and start its title lineage
                with a verified fight.
              </p>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-slate-300">
                  <Shield className="h-4 w-4 text-amber-100/70" />
                  Commissioner guards vacant titles
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-slate-300">
                  <Swords className="h-4 w-4 text-amber-100/70" />
                  Replay proof decides the crown
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-sm text-slate-300">
                  <Sparkles className="h-4 w-4 text-amber-100/70" />
                  First holder lights a new Olympia flag
                </div>
              </div>
            </div>

            <Link
              href={vacantChallengeHref(commissioner?.uid ?? null)}
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-amber-200/30 bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200"
            >
              Challenge the Commissioner
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
