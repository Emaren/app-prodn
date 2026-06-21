"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Coins,
  ExternalLink,
  Flag,
  Globe2,
  MessageCircle,
  Newspaper,
  Radio,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

const exploreLinks = [
  { href: "/lobby", label: "Lobby", icon: Radio },
  { href: "/players", label: "Players", icon: Users },
  { href: "/rivalries", label: "Rivalries", icon: Swords },
  { href: "/game-stats", label: "Matches", icon: Activity },
  { href: "/tournaments/founders-cup", label: "Tournaments", icon: Trophy },
  { href: "/staking", label: "Staking", icon: Coins },
  { href: "https://aoe2dewarwagers.com/", label: "Play DE", icon: ExternalLink },
];

const woloLinks = [
  { href: "/wolo", label: "$WOLO", icon: Coins },
  { href: "/wolochain", label: "WoloChain", icon: ShieldCheck },
  { href: "https://rpc-mainnet.aoe2war.com", label: "RPC", icon: Radio },
  { href: "https://rest-mainnet.aoe2war.com", label: "REST", icon: Activity },
];

const communityLinks = [
  { href: "https://discord.gg/EfghKZY7U9", label: "Discord", icon: MessageCircle },
  { href: "https://t.me/WoloChain", label: "Telegram", icon: MessageCircle },
  { href: "https://x.com/AoE2WAR", label: "X", icon: Globe2 },
  {
    href: "https://medium.com/@WoloChain/introducing-wolochain-the-dedicated-chain-for-aoe2war-8258113052ee",
    label: "Medium",
    icon: Newspaper,
  },
  {
    href: "https://www.facebook.com/profile.php?id=61578565260603",
    label: "Facebook",
    icon: Flag,
  },
];

function FooterLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
}) {
  const external = href.startsWith("http");

  const className =
    "group flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-amber-200/35 hover:bg-amber-300/10 hover:text-amber-100";

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-sky-100 transition group-hover:border-amber-200/25 group-hover:text-amber-100">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      {external ? (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:text-amber-100" />
      ) : null}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function FooterPanel({
  eyebrow,
  title,
  icon: Icon,
  links,
}: {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  links: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }>;
}) {
  return (
    <section className="rounded-[22px] border border-white/10 bg-slate-950/48 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.34em] text-sky-200/55">
            {eyebrow}
          </div>
          <h3 className="mt-1 text-base font-black text-white">{title}</h3>
        </div>
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-amber-100">
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="grid gap-2">
        {links.map((link) => (
          <FooterLink
            key={`${link.href}-${link.label}`}
            href={link.href}
            label={link.label}
            icon={link.icon}
          />
        ))}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition hover:border-sky-200/25 hover:bg-sky-300/10">
      <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );

  if (!href) return inner;

  return (
    <a href={href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  );
}

export default function AoE2WarFooter() {
  return (
    <footer className="relative mx-auto w-full max-w-6xl px-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-10 sm:px-4 lg:pb-10">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/30 to-transparent" />

      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/76 shadow-[0_34px_130px_rgba(0,0,0,0.46)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_86%_8%,rgba(251,191,36,0.15),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.9))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />

        <div className="relative p-5 sm:p-6 lg:p-8">
          <section className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-amber-200/25 bg-black/45 shadow-[0_0_44px_rgba(251,191,36,0.18)]">
                  <img
                    src="/api/media-assets/logo/footer-wolo?fallback=%2Flegacy%2Fwolo-logo-transparent.webp"
                    alt="WoloChain logo"
                    className="h-full w-full object-contain p-1.5"
                  />
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.46em] text-amber-200/70">
                    AoE2WAR
                  </div>
                </div>
              </div>

              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                Age of Empires II match intelligence, replay proof, rivalry pages, live chat,
                tournaments, staking, rewards, liquidity, and WoloChain-powered challenge activity.
              </p>

              <div className="mt-5 inline-flex rounded-full border border-amber-200/20 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-amber-100 shadow-[0_0_34px_rgba(251,191,36,0.08)]">
                Settled on WoloChain
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <StatCard label="Chain" value="wolo-1" />
              <StatCard label="Symbol" value="WOLO" />
              <StatCard label="Pool" value="Osmosis #3461" />
              <StatCard label="Contact" value="wolo@aoe2war.com" href="mailto:wolo@aoe2war.com" />
            </div>
          </section>

          <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
            <FooterPanel eyebrow="Explore" title="War room" icon={Swords} links={exploreLinks} />
            <FooterPanel eyebrow="Chain" title="WOLO rails" icon={ShieldCheck} links={woloLinks} />
            <FooterPanel
              eyebrow="Community"
              title="Join the signal"
              icon={MessageCircle}
              links={communityLinks}
            />
          </div>
        </div>

        <div className="relative flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            © {new Date().getFullYear()} AoE2WAR. Replay-backed competition and WoloChain economy.
          </div>
          <div className="font-semibold text-slate-400">Aim small. Miss small. ⚔️</div>
        </div>
      </div>
    </footer>
  );
}
