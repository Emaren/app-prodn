"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

import type { LobbyLeaderboardEntry } from "@/lib/lobby";
import { calculateResolvedWinRate } from "@/lib/leaderboardPage";

function winRate(entry: LobbyLeaderboardEntry) {
  return calculateResolvedWinRate(entry.wins, entry.losses);
}

function streakTone(streak: string | null) {
  if (streak?.startsWith("W")) return "text-emerald-300";
  if (streak?.startsWith("L")) return "text-orange-300";
  return "text-slate-400";
}

function WinRate({ entry, compact = false }: { entry: LobbyLeaderboardEntry; compact?: boolean }) {
  const rate = winRate(entry);
  if (rate === null) return <span className="text-slate-500">—</span>;

  return (
    <div className={compact ? "min-w-[7rem]" : "min-w-[8.5rem]"}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold tabular-nums">
        <span className="text-amber-50">{rate.toFixed(1)}%</span>
        {compact ? null : <span className="text-slate-500">resolved</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/75">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-700 via-orange-600 to-amber-400"
          style={{ width: `${Math.max(2, Math.min(100, rate))}%` }}
        />
      </div>
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a,button,input,textarea,select,label,[role='button']"))
    : false;
}

export function ModernLeaderboardTable({ entries }: { entries: LobbyLeaderboardEntry[] }) {
  const router = useRouter();

  const openRow = (entry: LobbyLeaderboardEntry, event: MouseEvent<HTMLTableRowElement>) => {
    if (!isInteractiveTarget(event.target)) router.push(entry.href);
  };
  const openRowWithKeyboard = (
    entry: LobbyLeaderboardEntry,
    event: KeyboardEvent<HTMLTableRowElement>
  ) => {
    if (isInteractiveTarget(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(entry.href);
    }
  };

  return (
    <>
      <div className="hidden overflow-clip rounded-[1.35rem] border border-amber-200/12 bg-[#070d18] md:block">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#0b1424]/98 text-[11px] uppercase tracking-[0.18em] text-amber-100 shadow-[0_1px_0_rgba(251,191,36,0.28)] backdrop-blur">
            <tr>
              <th className="w-20 px-5 py-4 font-semibold">Rank</th>
              <th className="w-28 px-4 py-4 text-right font-semibold">Rating</th>
              <th className="px-5 py-4 font-semibold">Warrior</th>
              <th className="w-44 px-5 py-4 font-semibold">Win Rate</th>
              <th className="w-24 px-4 py-4 text-right font-semibold">Wins</th>
              <th className="w-24 px-4 py-4 text-right font-semibold">Losses</th>
              <th className="w-28 px-4 py-4 text-right font-semibold">Games</th>
              <th className="w-24 px-5 py-4 text-right font-semibold">Streak</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={entry.key}
                role="link"
                tabIndex={0}
                aria-label={`Open ${entry.name} player page`}
                onClick={(event) => openRow(entry, event)}
                onKeyDown={(event) => openRowWithKeyboard(entry, event)}
                className={`cursor-pointer border-b border-white/[0.055] text-sm text-slate-200 outline-none transition hover:bg-cyan-300/[0.055] focus-visible:bg-cyan-300/[0.08] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200/45 ${
                  index % 2 === 0 ? "bg-slate-800/35" : "bg-black/20"
                }`}
              >
                <td className="px-5 py-4 text-base font-semibold tabular-nums text-slate-300">#{entry.rank}</td>
                <td className="px-4 py-4 text-right">
                  <div className="text-base font-bold tabular-nums text-white">{entry.primaryRatingLabel}</div>
                  {entry.secondaryRatingLabel ? (
                    <div className="mt-1 text-[10px] text-slate-500">{entry.secondaryRatingLabel}</div>
                  ) : null}
                </td>
                <td className="min-w-0 px-5 py-4">
                  <Link href={entry.href} className="font-semibold text-cyan-200 underline decoration-cyan-300/25 underline-offset-4 transition hover:text-white">
                    {entry.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <span>{entry.primaryRatingSourceLabel}</span>
                    {entry.isOnline ? <span className="text-emerald-300">online</span> : null}
                    {entry.verified ? <span>Steam linked</span> : entry.claimed ? <span>claimed</span> : null}
                  </div>
                </td>
                <td className="px-5 py-4"><WinRate entry={entry} /></td>
                <td className="px-4 py-4 text-right text-base font-semibold tabular-nums text-emerald-300">{entry.wins}</td>
                <td className="px-4 py-4 text-right text-base tabular-nums text-orange-300">{entry.losses}</td>
                <td className="px-4 py-4 text-right tabular-nums">
                  <div>{entry.totalMatches}</div>
                  {entry.unknowns > 0 ? <div className="mt-1 text-[10px] text-amber-200/65">{entry.unknowns} unresolved</div> : null}
                </td>
                <td className={`px-5 py-4 text-right text-base font-semibold tabular-nums ${streakTone(entry.streakLabel)}`}>
                  {entry.streakLabel || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {entries.map((entry) => (
          <Link
            key={entry.key}
            href={entry.href}
            className="rounded-[1.25rem] border border-amber-200/12 bg-[linear-gradient(145deg,rgba(20,31,50,0.92),rgba(5,11,20,0.98))] p-4 outline-none transition hover:border-cyan-200/30 focus-visible:ring-2 focus-visible:ring-cyan-200/50"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-300/[0.06] font-bold tabular-nums text-amber-100">#{entry.rank}</div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-base font-semibold text-cyan-100">{entry.name}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{entry.primaryRatingSourceLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums text-white">{entry.primaryRatingLabel}</div>
                {entry.secondaryRatingLabel ? <div className="text-[10px] text-slate-500">{entry.secondaryRatingLabel}</div> : null}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-white/[0.07] pt-3">
              <WinRate entry={entry} compact />
              <div className="text-right text-xs tabular-nums text-slate-300">
                <div><span className="text-emerald-300">{entry.wins}W</span> · <span className="text-orange-300">{entry.losses}L</span> · {entry.totalMatches} games</div>
                <div className={`mt-1 font-semibold ${streakTone(entry.streakLabel)}`}>{entry.streakLabel || "No streak"}</div>
              </div>
            </div>
            {entry.unknowns > 0 ? <div className="mt-2 text-[10px] text-amber-200/65">{entry.unknowns} unresolved result{entry.unknowns === 1 ? "" : "s"}</div> : null}
          </Link>
        ))}
      </div>
    </>
  );
}
