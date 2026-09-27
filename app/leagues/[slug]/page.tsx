import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Shield, Swords, Trophy } from "lucide-react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const league = await getPrisma().league.findUnique({
    where: { slug },
    select: { name: true, mode: true, teamSize: true },
  }).catch(() => null);

  return {
    title: league ? `${league.name} · Leagues` : "League",
    description: league
      ? `${league.teamSize}v${league.teamSize} ${league.mode.toUpperCase()} league on AoE2WAR.`
      : "AoE2WAR league.",
  };
}

export default async function LeagueDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const league = await getPrisma().league.findUnique({
    where: { slug },
  }).catch(() => null);

  if (!league || league.status !== "active") notFound();

  return (
    <main className="mx-auto w-full max-w-[82rem] space-y-6 px-3 py-5 text-white sm:px-5 sm:py-7">
      <SpeedReadyMarker route="/leagues/[slug]" />

      <Link
        href="/leagues"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-amber-100"
      >
        <ArrowLeft className="h-4 w-4" />
        All leagues
      </Link>

      <section className="overflow-hidden rounded-[2.4rem] border border-amber-200/16 bg-[radial-gradient(circle_at_78%_12%,rgba(251,191,36,0.16),transparent_28%),linear-gradient(145deg,#07111f,#050914_58%,#120b08)] p-6 shadow-[0_42px_130px_rgba(0,0,0,0.42)] sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-100/60">
              Community league
            </div>
            <h1 className="mt-4 font-serif text-5xl font-semibold tracking-[-0.045em]">
              {league.name}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-amber-100">
                {league.teamSize}v{league.teamSize}
              </span>
              <span className="rounded-full border border-sky-200/16 bg-sky-300/8 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-sky-100">
                {league.mode.toUpperCase()}
              </span>
            </div>
          </div>
          <Trophy className="h-12 w-12 text-amber-200/55" />
        </div>

        <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300">
          {league.description || "A player-founded AoE2WAR league. Its first season is waiting for the field to assemble."}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.2rem] border border-white/9 bg-black/22 p-4">
            <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Founder</div>
            <div className="mt-2 font-semibold text-white">{league.creatorDisplayNameSnapshot}</div>
          </div>
          <div className="rounded-[1.2rem] border border-white/9 bg-black/22 p-4">
            <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Founded</div>
            <div className="mt-2 font-semibold text-white">{formatDate(league.createdAt)}</div>
          </div>
          <div className="rounded-[1.2rem] border border-white/9 bg-black/22 p-4">
            <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Charter</div>
            <div className="mt-2 font-semibold text-amber-100">{league.creationPriceWolo} WOLO</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-amber-100">
            <Swords className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.26em]">Season table</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold">The field is open</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Standings, fixtures, roster registration, promotion, and league trophies attach to this charter next.
            The founding record is already permanent.
          </p>
        </div>

        <div className="rounded-[1.8rem] border border-emerald-200/12 bg-emerald-300/[0.045] p-5">
          <div className="flex items-center gap-2 text-emerald-100">
            <Shield className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.26em]">Founding proof</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold">Settled on WoloChain</h2>
          <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-400">
            {league.creationTxHash}
          </p>
          {league.creationProofUrl ? (
            <Link
              href={league.creationProofUrl}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-100 transition hover:text-white"
            >
              Inspect transaction
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
