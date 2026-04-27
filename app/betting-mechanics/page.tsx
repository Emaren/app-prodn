import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  Coins,
  Radio,
  ShieldCheck,
  Swords,
  Trophy,
  Wallet,
} from "lucide-react";

const rules = [
  {
    icon: <Coins className="h-5 w-5" />,
    title: "Wager",
    value: "Winner takes both wagers.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Guarantee",
    value: "Show-up bond. Returned when both play.",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: "Escrow",
    value: "Both players sign Wager + Guarantee.",
  },
  {
    icon: <Bell className="h-5 w-5" />,
    title: "Check-in",
    value: "Window opens 10 minutes before start.",
  },
  {
    icon: <Radio className="h-5 w-5" />,
    title: "Watcher",
    value: "One watcher links the played game.",
  },
  {
    icon: <Trophy className="h-5 w-5" />,
    title: "Fee",
    value: "0% beta. Future fee only on completed wager wins.",
  },
];

const outcomes = [
  {
    title: "Both play",
    rows: ["Winner gets both wagers.", "Guarantees return."],
  },
  {
    title: "One no-show",
    rows: ["Wagers return.", "Showing player gets both guarantees."],
  },
  {
    title: "Double no-show",
    rows: ["Wagers return.", "Guarantees go to Community Treasury."],
  },
];

export const metadata = {
  title: "Betting Mechanics | AoE2HDBets",
};

export default function BettingMechanicsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 py-8 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_24%),linear-gradient(135deg,_#101828,_#0f172a_50%,_#020617)] p-6 sm:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.36em] text-amber-100/75">
              <Swords className="h-4 w-4" />
              Betting mechanics
            </div>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
              Wager. Guarantee. Play.
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                Wallet funded
              </span>
              <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                10 min check-in
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-200">
                0% beta fee
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-[1.4rem] border border-amber-300/18 bg-slate-950/40 px-5 py-4">
            <Image
              src="/legacy/wolo-logo-transparent.png"
              alt="WOLO"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
            />
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-amber-100/70">Total lock</div>
              <div className="mt-1 text-xl font-semibold">Wager + Guarantee</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((rule) => (
          <div
            key={rule.title}
            className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-5"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/18 bg-amber-300/10 text-amber-100">
                {rule.icon}
              </span>
              <div>
                <div className="text-sm font-semibold text-white">{rule.title}</div>
                <div className="mt-1 text-sm text-slate-300">{rule.value}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {outcomes.map((outcome) => (
          <div
            key={outcome.title}
            className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-5"
          >
            <div className="text-lg font-semibold text-white">{outcome.title}</div>
            <div className="mt-4 space-y-2">
              {outcome.rows.map((row) => (
                <div key={row} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                  {row}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/challenge"
          className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Schedule Match
        </Link>
        <Link
          href="/bets"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Bet Rail
        </Link>
      </div>
    </main>
  );
}
