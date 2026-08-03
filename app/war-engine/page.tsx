import Link from "next/link";
import type { ReactNode } from "react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import {
  displayPlayerName,
  parsePlayers,
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";
import {
  resolvePublicWarEngineStatus,
  WAR_ENGINE_CASE_PUBLIC_SELECT,
  WAR_ENGINE_TIER_LABELS,
  type WarEngineTier,
} from "@/lib/warEngine";

export const dynamic = "force-dynamic";

const TIERS = Object.entries(
  WAR_ENGINE_TIER_LABELS
).map(([tier, label]) => ({
  tier: Number(tier) as WarEngineTier,
  label,
}));

export default async function WarEnginePage() {
  const prisma = getPrisma();
  const cases = await prisma.warEngineCase.findMany({
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      ...WAR_ENGINE_CASE_PUBLIC_SELECT,
      gameStats: {
        select: {
          id: true,
          map: true,
          players: true,
          played_on: true,
          timestamp: true,
          createdAt: true,
          duration: true,
          game_duration: true,
        },
      },
    },
  });

  const publicCases = cases.map((item) => ({
    item,
    status: resolvePublicWarEngineStatus({
      warEngineCase: item,
    }),
  }));

  const queuedCount = publicCases.filter(
    ({ status }) =>
      status?.status === "required" ||
      status?.status === "queued"
  ).length;
  const runningCount = publicCases.filter(
    ({ status }) => status?.status === "running"
  ).length;
  const classifiedCount = publicCases.filter(
    ({ status }) => status?.classification
  ).length;

  return (
    <main className="mx-auto w-full max-w-[112rem] space-y-8 px-3 py-6 text-white sm:px-5 lg:px-8">
      <section className="overflow-hidden rounded-[2.4rem] border border-amber-200/15 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.2),transparent_28%),radial-gradient(circle_at_88%_16%,rgba(56,189,248,0.16),transparent_28%),linear-gradient(135deg,#111827,#08111f_54%,#020617)] p-7 shadow-[0_36px_110px_rgba(0,0,0,0.45)] sm:p-10">
        <div className="max-w-5xl space-y-6">
          <div className="text-xs uppercase tracking-[0.4em] text-amber-200/70">
            AoE2WAR Forensic Reconstruction
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
              The War Engine
            </h1>

            <p className="max-w-4xl text-base leading-8 text-slate-300 sm:text-lg">
              Standard replay parsing stops where the recorded result stops.
              The War Engine escalates unresolved battles through deterministic
              verdict replay, full state reconstruction, instrumented client
              playback and—only at the final tier—human adjudication.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Cases" value={cases.length} />
            <Metric label="Queued" value={queuedCount} />
            <Metric
              label="Running / Classified"
              value={`${runningCount} / ${classifiedCount}`}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">
          Escalation Ladder
        </div>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          Six evidence tiers
        </h2>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TIERS.map(({ tier, label }) => (
            <div
              key={tier}
              className="rounded-[1.4rem] border border-white/8 bg-white/[0.035] p-5"
            >
              <div className="text-[11px] uppercase tracking-[0.3em] text-amber-200/65">
                Tier {tier}
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {label}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {tierDescription(tier)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">
            Reconstruction Queue
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Battles requiring deeper truth
          </h2>
        </div>

        {publicCases.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-slate-400">
            No battles currently require War Engine escalation.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {publicCases.map(({ item, status }) => {
              if (!status) return null;

              const names = parsePlayers(
                item.gameStats.players
              )
                .map((player) =>
                  displayPlayerName(player)
                )
                .filter(
                  (name) =>
                    name &&
                    name !== "Roster unresolved"
                );
              const playedAt = readPlayedAt(
                item.gameStats
              );

              return (
                <article
                  id={`case-${item.id}`}
                  key={item.id}
                  className="scroll-mt-24 rounded-[1.8rem] border border-amber-200/12 bg-[linear-gradient(145deg,rgba(245,158,11,0.07),rgba(255,255,255,0.025))] p-6 shadow-xl shadow-black/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/70">
                        {status.badge}
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold text-white">
                        {readMapName(item.gameStats.map)}
                      </h3>
                      <div className="mt-2 text-sm text-slate-300">
                        {names.length > 0
                          ? names.join(" vs ")
                          : `Battle #${item.gameStats.id}`}
                      </div>
                    </div>

                    <div className="rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-4 py-2 text-xs text-sky-100">
                      Tier {status.tier} · {status.tierLabel}
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-7 text-slate-300">
                    {status.detail}
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Fact
                      label="Replay"
                      value={`#${item.gameStats.id}`}
                    />
                    <Fact
                      label="Recorded"
                      value={
                        playedAt ? (
                          <TimeDisplayText
                            value={playedAt}
                            includeYear
                          />
                        ) : (
                          "Date preserved"
                        )
                      }
                    />
                    <Fact
                      label="Evidence"
                      value={`${replayHashCount(
                        item.sourceReplayHashes
                      )} archived perspective${
                        replayHashCount(
                          item.sourceReplayHashes
                        ) === 1
                          ? ""
                          : "s"
                      }`}
                    />
                    <Fact
                      label="Financial Authority"
                      value="Locked"
                    />
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-4 text-xs leading-6 text-slate-400">
                    {item.financialLockReason}
                  </div>

                  <div className="mt-5">
                    <Link
                      href={`/game-stats/${item.gameStats.id}`}
                      className="inline-flex rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-200/30 hover:text-white"
                    >
                      Open Battle Record
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-black/20 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-200">
        {value}
      </div>
    </div>
  );
}

function replayHashCount(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item) =>
          typeof item === "string" &&
          /^[0-9a-f]{64}$/.test(item)
      ).length
    : 0;
}

function tierDescription(tier: WarEngineTier) {
  switch (tier) {
    case 1:
      return "Reads immutable headers, roster identity and recording boundaries without simulating the battle.";
    case 2:
      return "Decodes commands, resignation signals, defeat flags and explicit result operations.";
    case 3:
      return "Replays only the minimum deterministic state needed to prove a winner or confirm that the recording ends first.";
    case 4:
      return "Reconstructs economy, population, military, technology, buildings, score and final battlefield state.";
    case 5:
      return "Automates the real AoE2 HD client and captures visible result screens, messages and postgame evidence.";
    case 6:
      return "Records an append-only human verdict when machine evidence is exhausted and independent corroboration exists.";
  }
}
