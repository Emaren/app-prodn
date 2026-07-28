import Link from "next/link";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicBattleArchive,
  teamRivalryFormatLabel,
  type PublicRivalryActivityEntry,
} from "@/lib/publicMatchups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BattleArchivePage() {
  const {
    entries,
    total,
    publicBattleRecords,
    duplicateBattleRecords,
    finalReplayRecords,
    excludedFinalRecords,
  } = await loadPublicBattleArchive(
    getPrisma(),
    {
      take: 120,
    }
  );

  return (
    <main
      className="mx-auto w-full max-w-[96rem] space-y-7 py-5 text-white sm:py-7"
      data-battle-archive-style="iron-vault"
    >
      <section className="relative overflow-hidden rounded-[2.35rem] border border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(148,163,184,0.11),transparent_28%),radial-gradient(circle_at_92%_100%,rgba(245,158,11,0.075),transparent_30%),linear-gradient(135deg,#0a101c,#07101e_56%,#05070d)] px-7 py-9 shadow-[0_34px_120px_rgba(0,0,0,0.46)] sm:px-10 xl:px-12">
        <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-slate-200/35 to-transparent" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
          <div>
            <div className="text-xs uppercase tracking-[0.46em] text-slate-300/55">
              Battle Archive
            </div>

            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
              The War Vault
            </h1>

            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">
              Every recorded battle, filed,
              numbered, and preserved.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/rivalries"
                className="rounded-full border border-amber-100/18 bg-amber-100/[0.04] px-5 py-3 text-sm font-semibold text-amber-50/80 transition hover:border-amber-100/38 hover:bg-amber-100/[0.08]"
              >
                Browse Rivalries
              </Link>

              <Link
                href="/live-games"
                className="rounded-full border border-white/10 bg-white/[0.025] px-5 py-3 text-sm text-slate-300 transition hover:border-white/22 hover:text-white"
              >
                Live Games
              </Link>
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/[0.085] bg-black/25 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="text-xs uppercase tracking-[0.32em] text-slate-500">
              Deduplicated Public Battles
            </div>

            <div className="mt-3 text-5xl font-semibold tracking-[-0.045em] text-white">
              {total.toLocaleString()}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
              <div>
                <div className="text-lg font-semibold tabular-nums text-slate-200">
                  {publicBattleRecords.toLocaleString()}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Public battle records
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold tabular-nums text-slate-200">
                  {finalReplayRecords.toLocaleString()}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Final ingestion records
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold tabular-nums text-slate-200">
                  {duplicateBattleRecords.toLocaleString()}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Duplicate/rehost records
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold tabular-nums text-slate-200">
                  {excludedFinalRecords.toLocaleString()}
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Excluded non-battles
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs leading-5 text-slate-500">
              The current public presentation key folds known duplicate rows.
              It is not universal proof that every semantic rehost is detected.
              Saved checkpoints and empty shells remain preserved, but are not
              battles.
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(2,6,23,0.92),rgba(8,15,28,0.84))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.3)] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.37em] text-slate-500">
              Recently Filed
            </div>

            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-white">
              Battle Record
            </h2>
          </div>

          <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
            {total.toLocaleString()} deduplicated battles
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-6 text-sm text-slate-300">
            Waiting for the first completed replay.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {entries.map(
              (entry, index) => (
                <ArchiveCard
                  key={entry.key}
                  entry={entry}
                  vaultNumber={
                    Math.max(
                      1,
                      total - index
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ArchiveCard({
  entry,
  vaultNumber,
}: {
  entry: PublicRivalryActivityEntry;
  vaultNumber: number;
}) {
  const formatLabel =
    entry.kind === "team"
      ? teamRivalryFormatLabel(
          entry.format
        )
      : "Player Duel";

  return (
    <article
      className="rounded-[1.75rem] border border-white/[0.085] bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.065),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.014))] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.24)] transition hover:border-amber-100/16 hover:bg-white/[0.045]"
      data-vault-number={vaultNumber}
      data-game-stats-id={entry.gameId}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.32em] text-slate-400/60">
            {formatLabel}
            {" · "}
            {entry.format}
          </div>

          <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
            {publicBattlefieldLabel(entry.mapName)}
          </div>

          <div className="mt-2 text-sm text-slate-500">
            {formatDate(
              entry.playedAt
            )}
          </div>
        </div>

        <div
          className="shrink-0 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5 text-[10px] font-medium tracking-[0.22em] text-slate-400/55"
          title={`Stored game-stats record ${entry.gameId}`}
        >
          #{vaultNumber}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-amber-100/[0.07] bg-amber-100/[0.025] px-4 py-3">
        <div className="text-[9px] uppercase tracking-[0.27em] text-amber-100/35">
          {entry.winnerLabel ? "Battle Victor" : "Archive Status"}
        </div>

        <div className="mt-2 break-words text-sm font-medium leading-6 text-amber-50/68">
          {entry.winnerLabel
            ? `${entry.winnerLabel} won`
            : "Battle preserved in the War Vault"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <ArchiveRoster
          players={entry.left}
          align="left"
        />

        <div className="text-center text-[9px] uppercase tracking-[0.3em] text-slate-700">
          VS
        </div>

        <ArchiveRoster
          players={entry.right}
          align="right"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-white/[0.055] pt-4">
        <Link
          href={entry.href}
          className="inline-flex min-h-10 items-center rounded-full border border-sky-100/14 bg-sky-100/[0.035] px-4 py-2 text-xs font-semibold text-sky-100/72 transition hover:border-sky-100/30 hover:bg-sky-100/[0.07]"
        >
          {entry.kind === "team"
            ? "Open Team Rivalry"
            : "Open Player Rivalry"}
        </Link>

        <Link
          href={entry.replayHref}
          className="inline-flex min-h-10 items-center rounded-full border border-white/[0.085] bg-white/[0.025] px-4 py-2 text-xs font-medium text-slate-400 transition hover:border-white/20 hover:text-white"
        >
          Open Replay
        </Link>

        <Link
          href={`/game-stats/${entry.gameId}`}
          className="inline-flex min-h-10 items-center rounded-full border border-sky-100/16 bg-sky-100/[0.04] px-4 py-2 text-xs font-semibold text-sky-100/78 transition hover:border-sky-100/36 hover:bg-sky-100/[0.08]"
          data-battle-archive-open-stats
        >
          Open Stats
        </Link>

        {entry.marketHref ? (
          <Link
            href={entry.marketHref}
            className="inline-flex min-h-10 items-center rounded-full border border-amber-100/18 bg-amber-100/[0.045] px-4 py-2 text-xs font-semibold text-amber-100/78 transition hover:border-amber-100/38 hover:bg-amber-100/[0.085]"
          >
            Open Bet
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function ArchiveRoster({
  players,
  align,
}: {
  players:
    PublicRivalryActivityEntry["left"];
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 rounded-[1.2rem] border border-white/[0.06] bg-black/18 px-4 py-4 ${
        align === "right"
          ? "md:text-right"
          : ""
      }`}
    >
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.token}
            className={`flex min-w-0 flex-wrap items-center gap-2 ${
              align === "right"
                ? "md:justify-end"
                : ""
            }`}
          >
            <span className="break-words text-sm font-semibold leading-5 text-white">
              {player.name}
            </span>

            {player.claimed ? (
              <SteamLinkedBadge compact />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(
  value: string | null
) {
  return value
    ? new Date(value).toLocaleString(
        [],
        {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      )
    : "Filed battle";
}

function publicBattlefieldLabel(value: string) {
  const trimmed = value.trim();
  return !trimmed || trimmed.toLowerCase().includes("unavailable")
    ? "Recorded Battlefield"
    : trimmed;
}
