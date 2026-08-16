"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Castle,
  Crown,
  Flame,
  Landmark,
  Shield,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";

type WarhouseLink = {
  href: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

const clanHalls: readonly WarhouseLink[] = [
  {
    href: "/clans/mystikal",
    label: "Mystikal Clan",
    detail: "The founding warhouse",
    icon: Shield,
  },
  {
    href: "/clans/jims-clan",
    label: "Jim's Clan",
    detail: "The American Champion's hall",
    icon: Crown,
  },
  {
    href: "/clans/legend-clan",
    label: "Legend Clan",
    detail: "The Sultan's palace-hall",
    icon: Castle,
  },
];

const warPaths: readonly WarhouseLink[] = [
  {
    href: "/leaderboard",
    label: "Leaderboard",
    detail: "Know every warrior's standing",
    icon: Trophy,
  },
  {
    href: "/rivalries",
    label: "Rivalries",
    detail: "Old scores and unfinished wars",
    icon: Swords,
  },
  {
    href: "/challenge",
    label: "Challenge Hall",
    detail: "Call another warrior forward",
    icon: Shield,
  },
];

function WarhousePanel({
  eyebrow,
  title,
  links,
}: {
  eyebrow: string;
  title: string;
  links: readonly WarhouseLink[];
}) {
  return (
    <section className="clan-warhouse-footer__panel rounded-[1.45rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="clan-theme-label text-[9px] font-black uppercase tracking-[0.32em]">
        {eyebrow}
      </div>

      <h3 className="mt-1 font-serif text-xl text-stone-100">
        {title}
      </h3>

      <div className="mt-4 grid gap-2">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className="clan-warhouse-footer__link group flex cursor-pointer items-center gap-3 rounded-[1rem] border border-stone-400/10 bg-black/25 px-3 py-3 transition"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-300/[0.045] text-amber-100/80 transition group-hover:border-amber-200/30 group-hover:text-amber-100">
                <Icon className="h-4 w-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-stone-200 transition group-hover:text-white">
                  {link.label}
                </span>

                <span className="mt-0.5 block truncate text-[11px] text-stone-600 transition group-hover:text-stone-400">
                  {link.detail}
                </span>
              </span>

              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-700 transition group-hover:translate-x-0.5 group-hover:text-amber-100" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function ClanWarhouseFooter() {
  return (
    <footer className="clan-warhouse-footer relative mx-auto w-full max-w-[90rem] px-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-10 sm:px-4 lg:pb-10">
      <div className="clan-theme-accent-line pointer-events-none absolute inset-x-8 top-0 h-px" />

      <div className="clan-warhouse-footer__shell relative isolate overflow-hidden rounded-[2.25rem] border shadow-[0_42px_150px_rgba(0,0,0,0.62)]">
        <div className="clan-warhouse-footer__wash pointer-events-none absolute inset-0 -z-10" />

        <div className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:repeating-linear-gradient(93deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_49px),repeating-linear-gradient(0deg,transparent_0_43px,rgba(255,255,255,0.02)_44px,transparent_45px)]" />

        <div className="clan-warhouse-footer__glow pointer-events-none absolute left-[8%] top-0 h-48 w-40 -translate-y-1/2 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute right-[7%] top-0 h-44 w-36 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/38 to-transparent" />

        <div className="relative p-5 sm:p-7 lg:p-9">
          <section className="grid gap-8 border-b border-stone-400/12 pb-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="flex items-center gap-4">
                <div className="clan-warhouse-footer__shield relative grid h-16 w-16 place-items-center overflow-hidden rounded-[1.25rem] border text-amber-100 shadow-[0_0_45px_rgba(0,0,0,0.20)]">
                  <Shield
                    className="h-8 w-8"
                    strokeWidth={1.35}
                  />
                  <Flame className="clan-theme-label absolute bottom-2 right-2 h-3.5 w-3.5" />
                </div>

                <div>
                  <div className="clan-theme-label text-[9px] font-black uppercase tracking-[0.42em]">
                    AoE2WAR · Clan Warhouse
                  </div>

                  <h2 className="mt-2 font-serif text-3xl tracking-[-0.025em] text-stone-50 sm:text-4xl">
                    The fire stays lit.
                  </h2>
                </div>
              </div>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-400">
                Before the game, after the war, and deep into the
                night—the houses of AoE2WAR gather here beneath their
                own banners.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="clan-theme-chip rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]">
                  Granite halls
                </span>

                <span className="rounded-full border border-amber-200/15 bg-amber-300/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/65">
                  Torchlit tables
                </span>

                <span className="rounded-full border border-stone-300/12 bg-stone-300/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-stone-300/55">
                  Warrior ground
                </span>
              </div>
            </div>

            <div className="clan-warhouse-footer__cta rounded-[1.5rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-amber-100/55">
                <Landmark className="h-4 w-4" />
                Raise another banner
              </div>

              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="font-serif text-2xl text-white">
                    Found your own house
                  </div>

                  <p className="mt-2 max-w-lg text-xs leading-6 text-stone-500">
                    A verified 100 WOLO Clan Hall purchase opens the
                    road to your banner, crest library and leadership
                    seat.
                  </p>
                </div>

                <Link
                  href="/clans#buy-clan-hall"
                  className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-stone-950 transition hover:bg-amber-200"
                >
                  Buy a Clan Hall
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_0.78fr]">
            <WarhousePanel
              eyebrow="Standing banners"
              title="Enter the halls"
              links={clanHalls}
            />

            <WarhousePanel
              eyebrow="Beyond the fire"
              title="Return to war"
              links={warPaths}
            />

            <section className="clan-warhouse-footer__house-card rounded-[1.45rem] border p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="clan-theme-icon-tile mx-auto grid h-14 w-14 place-items-center rounded-2xl border">
                <UsersRound className="h-6 w-6" />
              </div>

              <div className="clan-theme-label mt-4 text-[9px] font-black uppercase tracking-[0.32em]">
                Houses of AoE2WAR
              </div>

              <div className="mt-2 font-serif text-2xl text-stone-100">
                Three banners stand.
              </div>

              <p className="mt-3 text-xs leading-6 text-stone-600">
                Mystikal. Jim’s Clan. Legend. Every great hall began
                when someone decided to claim ground.
              </p>
            </section>
          </div>
        </div>

        <div className="relative flex flex-col gap-2 border-t border-stone-400/12 bg-black/20 px-5 py-4 text-[11px] text-stone-700 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
          <span>
            © {new Date().getFullYear()} AoE2WAR · Clan Warhouse
          </span>

          <span className="font-semibold uppercase tracking-[0.18em] text-stone-600">
            Claim ground · Rally your own
          </span>
        </div>
      </div>
    </footer>
  );
}
