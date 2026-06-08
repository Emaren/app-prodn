"use client";

import Image from "next/image";
import Link from "next/link";

const exploreLinks = [
  { href: "/lobby", label: "Lobby" },
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/game-stats", label: "Matches" },
  { href: "/tournaments/founders-cup", label: "Tournaments" },
  { href: "/staking", label: "Staking" },
];

const woloLinks = [
  { href: "/wolo", label: "$WOLO" },
  { href: "/wolochain", label: "WoloChain" },
  { href: "https://rpc-mainnet.aoe2war.com", label: "RPC" },
  { href: "https://rest-mainnet.aoe2war.com", label: "REST" },
];

const communityLinks = [
  { href: "https://discord.gg/EfghKZY7U9", label: "Discord" },
  { href: "https://t.me/WoloChain", label: "Telegram" },
  { href: "https://x.com/AoE2WAR", label: "X" },
  {
    href: "https://medium.com/@WoloChain/introducing-wolochain-the-dedicated-chain-for-aoe2war-8258113052ee",
    label: "Medium",
  },
];

function FooterLink({ href, label }: { href: string; label: string }) {
  const external = href.startsWith("http");

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="group inline-flex items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-200/35 hover:bg-sky-300/10 hover:text-sky-100"
      >
        <span>{label}</span>
        <span className="text-[10px] text-slate-600 transition group-hover:text-sky-200">↗</span>
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-200/35 hover:bg-amber-300/10 hover:text-amber-100"
    >
      {label}
    </Link>
  );
}

function FooterGroup({
  eyebrow,
  title,
  links,
}: {
  eyebrow: string;
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <section className="rounded-[18px] border border-white/10 bg-slate-950/45 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="mb-3">
        <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
          {eyebrow}
        </div>
        <h3 className="mt-1 text-sm font-semibold text-white">{title}</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <FooterLink key={`${link.href}-${link.label}`} href={link.href} label={link.label} />
        ))}
      </div>
    </section>
  );
}

export default function AoE2WarFooter() {
  return (
    <footer className="relative mx-auto w-full max-w-6xl px-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-8 sm:px-4 lg:pb-10">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/30 to-transparent" />

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/72 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(251,191,36,0.15),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.88))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />

        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1.8fr] lg:p-7">
          <section className="flex flex-col justify-between gap-6">
            <div>
              <div className="mb-5 flex items-center gap-4">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-amber-200/25 bg-black/45 shadow-[0_0_40px_rgba(251,191,36,0.16)]">
                  <Image
                    src="/legacy/wolo-logo-transparent.png"
                    alt="WoloChain logo"
                    fill
                    sizes="56px"
                    className="object-contain p-1.5"
                  />
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.42em] text-amber-200/70">
                    AoE2WAR
                  </div>
                </div>
              </div>

              <p className="max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                Age of Empires II match intelligence, replay proof, rivalry pages, live chat,
                tournaments, staking, rewards, liquidity, and WoloChain-powered challenge activity.
              </p>

              <div className="mt-5 inline-flex rounded-full border border-amber-200/20 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.26em] text-amber-100 shadow-[0_0_34px_rgba(251,191,36,0.08)]">
                Settled on WoloChain
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  Chain
                </div>
                <div className="mt-1 font-semibold text-white">wolo-1</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  Symbol
                </div>
                <div className="mt-1 font-semibold text-white">WOLO</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  Pool
                </div>
                <div className="mt-1 font-semibold text-white">Osmosis #3461</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  Contact
                </div>
                <a
                  href="mailto:wolo@aoe2war.com"
                  className="mt-1 block truncate font-semibold text-sky-100 transition hover:text-white"
                >
                  wolo@aoe2war.com
                </a>
              </div>
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            <FooterGroup eyebrow="Explore" title="War room" links={exploreLinks} />
            <FooterGroup eyebrow="Chain" title="WOLO rails" links={woloLinks} />
            <FooterGroup eyebrow="Community" title="Join the signal" links={communityLinks} />
          </div>
        </div>

        <div className="relative flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7">
          <div>
            © {new Date().getFullYear()} AoE2WAR. Replay-backed competition and WoloChain economy.
          </div>
          <div className="font-semibold text-slate-400">
            Aim small. Miss small. ⚔️
          </div>
        </div>
      </div>
    </footer>
  );
}