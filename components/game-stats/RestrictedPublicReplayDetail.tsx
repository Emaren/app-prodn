import Link from "next/link";
import { notFound } from "next/navigation";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import {
  displayGameType,
  displayGameVersion,
  displayPlayerName,
  formatDurationLabel,
  parsePlayers,
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";
import { RESTRICTED_PUBLIC_REPLAY_SELECT } from "@/lib/restrictedPublicReplay";

/**
 * Public replay detail for the deliberately restricted R25 runtime.
 *
 * No relation joins, adjudication reads, case records, betting or user tables.
 * A missing private projection is not an empty case, a verified result,
 * a settled wager or a numeric zero.
 */
export default async function RestrictedPublicReplayDetail({
  gameId,
}: {
  gameId: number;
}) {
  const game = await getPrisma().gameStats.findUnique({
    where: { id: gameId },
    select: RESTRICTED_PUBLIC_REPLAY_SELECT,
  });
  if (!game) notFound();

  const players = parsePlayers(game.players)
    .map(displayPlayerName)
    .filter((name) => name !== "Roster unresolved")
    .slice(0, 16);
  const playedAt = readPlayedAt(game);

  const details = [
    ["Map", readMapName(game.map)],
    ["Type", displayGameType(game.game_type)],
    ["Game version", displayGameVersion(game.game_version)],
    ["Duration", formatDurationLabel(game.game_duration ?? game.duration)],
    ["Stored replay status", game.is_final ? "Final replay record" : "Result not final"],
  ];

  return (
    <main
      data-public-replay-model="restricted-scalar-v1"
      className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/battle-archive" className="text-sky-300 hover:underline">
          Battle Archive
        </Link>
        <span className="font-mono text-xs text-slate-400">Replay #{game.id}</span>
      </div>

      <section className="rounded-3xl border border-sky-400/20 bg-slate-950/85 p-6 sm:p-9">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
          Recorded Battle
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Replay #{game.id}
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          {playedAt ? <TimeDisplayText value={playedAt} /> : "Time unavailable"}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                {label}
              </div>
              <div className="mt-2 text-base text-slate-100">{value}</div>
            </div>
          ))}
        </div>

        <h2 className="mt-9 text-xl font-semibold">Recorded roster</h2>
        {players.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {players.map((name, index) => (
              <li key={index} className="rounded-lg border border-white/10 p-3">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Roster unavailable.</p>
        )}

        {game.is_final && game.winner?.trim() ? (
          <p className="mt-6 text-sm text-amber-200">
            Recorded winner: {game.winner}. This is stored parser data, not
            independently verified adjudication or settlement finality.
          </p>
        ) : null}
      </section>

      <section
        role="status"
        data-public-read-model="unavailable"
        className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-6 text-sm leading-7 text-amber-100"
      >
        Advanced replay statistics, adjudication history, War Engine case
        records, linked wagers and settlement evidence are unavailable until
        an independently reviewed public projection is approved. Their absence
        here does not mean there are no cases, no bets, or no obligations.
        No financial state has been queried or changed.
      </section>
    </main>
  );
}
