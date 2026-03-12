import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  displayPlayerName,
  parsePlayers,
  readMapName,
  readPlayedAt,
  winnerLabel,
} from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const dynamic = "force-dynamic";

export default async function ReplayOnlyPlayerPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const playerName = normalizePublicPlayerName(decodeURIComponent(name));
  if (!playerName) {
    notFound();
  }

  const prisma = getPrisma();
  const claimedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { inGameName: { equals: playerName, mode: "insensitive" } },
        { steamPersonaName: { equals: playerName, mode: "insensitive" } },
      ],
    },
    select: { uid: true },
  });

  if (claimedUser) {
    redirect(`/players/${claimedUser.uid}`);
  }

  const normalizedPlayerName = normalizePublicPlayerName(playerName);
  const candidateMatches = await prisma.gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      map: true,
      winner: true,
      players: true,
      played_on: true,
      timestamp: true,
      parse_reason: true,
      disconnect_detected: true,
    },
  });

  const matches = candidateMatches
    .filter((match) =>
      parsePlayers(match.players).some(
        (player) => normalizePublicPlayerName(displayPlayerName(player)) === normalizedPlayerName
      )
    )
    .slice(0, 24);

  if (matches.length === 0) {
    notFound();
  }

  const wins = matches.filter((match) => match.winner === playerName).length;
  const losses = matches.filter((match) => match.winner && match.winner !== playerName).length;
  const unknowns = matches.length - wins - losses;
  const claimHref = `/profile?claim_name=${encodeURIComponent(playerName)}`;

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-rose-200/70">Replay-Built Warrior Page</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{playerName}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              This public page was created automatically from parsed AoE2HD replays. If this is
              you, sign in with Steam, claim the name, and start building a verified tournament and
              betting identity.
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>unclaimed identity</Tag>
              <Tag>{matches.length} parsed matches</Tag>
              {wins > 0 ? <Tag>{wins} wins</Tag> : null}
              {losses > 0 ? <Tag>{losses} losses</Tag> : null}
              {unknowns > 0 ? <Tag>{unknowns} unknown outcomes</Tag> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={claimHref}
              className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
            >
              Claim This Identity
            </Link>
            <Link
              href="/game-stats"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Back To Parser Lab
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Why Claim It</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Turn replay sightings into a real profile</h2>

          <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
            <p>
              Right now this page only knows what the parser saw in replay files. Claiming it lets
              you link Steam, join tournaments, chat in the lobby, mint a watcher key, and turn this
              into a verified player identity.
            </p>
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
              <div className="text-sm font-medium text-white">Claim flow</div>
              <ol className="mt-3 space-y-2 text-slate-300">
                <li>1. Sign in with Steam.</li>
                <li>2. Save this in-game name on your profile.</li>
                <li>3. Upload one replay with your watcher key to verify it.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Match Feed</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent Parsed Matches</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {matches.length} recent
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {matches.map((match) => {
              const players = parsePlayers(match.players);
              const playedAt = readPlayedAt(match);

              return (
                <Link
                  key={match.id}
                  href={`/game-stats/${match.id}`}
                  className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-rose-300/30 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-white">{readMapName(match.map)}</div>
                      <div className="mt-1 text-sm text-slate-300">
                        {players.length > 0
                          ? players.map((player) => displayPlayerName(player)).join(" vs ")
                          : "Players unavailable"}
                      </div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                      {winnerLabel(match.winner, match.parse_reason)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Tag>{match.parse_reason || "unknown parse reason"}</Tag>
                    {match.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
                  </div>

                  {playedAt ? (
                    <div className="mt-3 text-xs text-slate-400">
                      {new Date(playedAt).toLocaleString()}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}
