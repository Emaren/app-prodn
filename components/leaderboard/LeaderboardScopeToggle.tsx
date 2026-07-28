"use client";

import {
  UserRound,
  UsersRound,
} from "lucide-react";

import type { LeaderboardScope } from "@/lib/leaderboardScope";

const OPTIONS: ReadonlyArray<{
  scope: LeaderboardScope;
  eyebrow: string;
  label: string;
  Icon: typeof UsersRound;
}> = [
  {
    scope: "all",
    eyebrow: "Warriors",
    label: "All players",
    Icon: UsersRound,
  },
  {
    scope: "claimed",
    eyebrow: "Kingdom",
    label: "AoE2WAR users",
    Icon: UserRound,
  },
];

export function LeaderboardScopeToggle({
  value,
  claimedCount,
  onChange,
}: {
  value: LeaderboardScope;
  claimedCount: number;
  onChange: (scope: LeaderboardScope) => void;
}) {
  return (
    <section
      className="group relative isolate overflow-hidden rounded-[1.18rem] border border-white/[0.13] bg-[#030610]/94 p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_22px_70px_rgba(0,0,0,0.42)] before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_18%_0%,rgba(255,215,106,0.08),transparent_34%),radial-gradient(circle_at_82%_100%,rgba(34,211,238,0.08),transparent_36%)] after:absolute after:inset-x-10 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/34 after:to-transparent"
      aria-label="Leaderboard players"
    >
      <div className="relative rounded-[1.1rem] bg-gradient-to-b from-white/[0.065] via-white/[0.022] to-black/40 p-1.5">
        <div className="pointer-events-none absolute inset-2 rounded-[1.05rem] border border-white/[0.055]" />

        <div className="relative grid grid-cols-2 gap-2">
          {OPTIONS.map((option) => {
            const active = value === option.scope;
            const Icon = option.Icon;

            return (
              <button
                key={option.scope}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(option.scope)}
                className={`relative min-h-[3.45rem] cursor-pointer overflow-hidden rounded-[1rem] border px-3 py-2.5 text-left transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030610] ${
                  active
                    ? "border-amber-200/25 bg-[linear-gradient(145deg,rgba(214,169,72,0.22),rgba(255,255,255,0.055)_40%,rgba(0,0,0,0.42)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_0_34px_rgba(201,155,60,0.13)]"
                    : "border-white/[0.075] bg-black/18 text-slate-500 hover:border-white/14 hover:bg-white/[0.045]"
                }`}
              >
                {active ? (
                  <>
                    <span className="absolute inset-0 rounded-[1rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.11),transparent_44%)]" />
                    <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/75 to-transparent" />
                    <span className="absolute inset-x-7 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
                  </>
                ) : null}

                <span className="relative flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span
                      className={`block text-[0.52rem] font-black uppercase tracking-[0.3em] ${
                        active ? "text-amber-100/50" : "text-slate-600"
                      }`}
                    >
                      {option.eyebrow}
                    </span>
                    <span
                      className={`mt-1 block whitespace-nowrap text-[0.72rem] font-black uppercase tracking-[0.13em] ${
                        active ? "text-amber-50" : "text-slate-400"
                      }`}
                    >
                      {option.label}
                    </span>
                    {option.scope === "claimed" ? (
                      <span className="mt-0.5 block text-[9px] tabular-nums text-slate-500">
                        {claimedCount.toLocaleString()} claimed
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${
                      active
                        ? "border-amber-100/20 bg-black/28 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_18px_rgba(251,191,36,0.12)]"
                        : "border-white/[0.08] bg-white/[0.025] text-slate-600"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
