"use client";

import React from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Crown,
  Eye,
  Flame,
  Gamepad2,
  Medal,
  MessageCircle,
  Play,
  Radio,
  Shield,
  Swords,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

const EVENT_TIMESTAMP = new Date("2026-07-10T20:00:00Z").getTime();

const OFFICIAL_POSTER = "/uploads/managed-assets/wolomania/wolomania.webp";

const ASSETS = {
  belt: {
    src: "/uploads/managed-assets/wolomania/aoe2war_champ.webp",
    fallback: "/uploads/managed-assets/belt/world-1781561316794-0a26a86e.png",
  },
  emaren: {
    src: "/uploads/managed-assets/wolomania/emaren_warrior_2.webp",
    fallback: "/uploads/managed-assets/avatar/emaren-1781569822986-d51b50eb.png",
  },
  jim: {
    src: "/uploads/managed-assets/wolomania/jim_warrior.webp",
    fallback: "/uploads/managed-assets/avatar/jim-1781560436622-52fb61a1.png",
  },
  julio: {
    src: "/uploads/managed-assets/wolomania/julio_warrior.webp",
    fallback: "/uploads/managed-assets/avatar/julio-alvarez-1781569866259-256b2ad7.png",
  },
};

const mapPool = ["Arabia", "Arena", "Hideout", "Nomad", "Gold Rush", "BF", "MegaRandom"];

const chatMessages = [
  ["AgeLord22", "gl hf!"],
  ["VillRush", "Jim looking strong"],
  ["CastleKing", "let’s go Julio!"],
  ["Mangudai", "this is hype"],
  ["AOE2Legend", "best of luck both"],
  ["Conq4Life", "what a match!"],
  ["HD_Fanatic", "history in the making"],
  ["TrueAoE", "love this community"],
] as const;

const footerStats = [
  ["Live events", "1", CalendarDays],
  ["Watching now", "1,248", Eye],
  ["Total players", "469", Users],
  ["Total matches", "1,248", Swords],
  ["WOLO in circulation", "12,450,000", Wallet],
] as const;

function getCountdownParts() {
  const distance = Math.max(0, EVENT_TIMESTAMP - Date.now());
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1_000);

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function AssetImage({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  fallback: string;
  alt: string;
  className: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackUsed === "1") return;
        image.dataset.fallbackUsed = "1";
        image.src = fallback;
      }}
    />
  );
}

function Countdown() {
  const [parts, setParts] = React.useState(() => getCountdownParts());

  React.useEffect(() => {
    const interval = window.setInterval(() => setParts(getCountdownParts()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {[
        ["Days", parts.days],
        ["Hours", parts.hours],
        ["Minutes", parts.minutes],
        ["Seconds", parts.seconds],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-amber-300/20 bg-black/45 px-3 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div className="font-serif text-3xl font-black tracking-tight text-amber-100 sm:text-5xl">
            {value}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-amber-200/65">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniGameplayFrame({
  player,
  civ,
  score,
  align,
}: {
  player: string;
  civ: string;
  score: string;
  align: "left" | "right";
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-300/25 bg-[#0b100b] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-black/55 px-4 py-3 backdrop-blur">
        <div className={`flex items-center gap-3 ${align === "right" ? "order-2" : ""}`}>
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-200/25 bg-amber-400/15 text-xl font-black text-amber-100">
            {score}
          </div>
          <div>
            <div className="text-lg font-black uppercase tracking-[0.12em] text-white">{player}</div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-200">{civ}</div>
          </div>
        </div>
        <div className="rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-red-100">
          Live
        </div>
      </div>

      <div className="aspect-[16/9] bg-[radial-gradient(circle_at_30%_20%,rgba(245,158,11,0.25),transparent_22%),linear-gradient(135deg,#38552d_0%,#6d6a37_32%,#253d29_55%,#8b6d35_100%)]">
        <div className="grid h-full grid-cols-5 grid-rows-4 gap-2 p-8 pt-20 opacity-95">
          {Array.from({ length: 20 }).map((_, index) => (
            <div
              key={index}
              className={`rounded-sm border border-black/25 ${
                index % 7 === 0
                  ? "bg-stone-800/75"
                  : index % 5 === 0
                    ? "bg-amber-900/75"
                    : index % 3 === 0
                      ? "bg-emerald-900/55"
                      : "bg-lime-800/45"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-amber-200/10 bg-black/70 p-3">
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-[0.12em] text-stone-300">
          <span>Food 810</span>
          <span>Wood 542</span>
          <span>Gold 295</span>
          <span>Pop 61/75</span>
        </div>
        <div className="h-14 w-14 rounded-lg border border-amber-200/20 bg-[radial-gradient(circle,#256d3c_0%,#1a5135_42%,#0e1828_43%,#0e1828_100%)]" />
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  title,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-amber-300/18 bg-black/45 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_22px_70px_rgba(0,0,0,0.34)] ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
          {icon}
        </div>
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-100">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function WolomaniaPageClient() {
  return (
    <div className="relative -mx-1 overflow-hidden rounded-[2rem] border border-amber-300/10 bg-[#050505] text-stone-100 shadow-[0_40px_140px_rgba(0,0,0,0.55)] sm:-mx-2 lg:-mx-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.28),transparent_28%),radial-gradient(circle_at_20%_18%,rgba(185,28,28,0.22),transparent_22%),linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.42)_38%,rgba(0,0,0,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative z-10">
        <nav className="sticky top-0 z-50 border-b border-amber-300/15 bg-black/78 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="group flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_0_34px_rgba(245,158,11,0.22)]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <div className="font-serif text-2xl font-black tracking-[0.08em] text-amber-100">
                  AOE2WAR
                </div>
                <div className="text-[9px] uppercase tracking-[0.35em] text-amber-300/65">
                  Where legends are made
                </div>
              </div>
            </Link>

            <div className="hidden items-center gap-5 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-300 lg:flex">
              {["Home", "Watch", "Champions", "Rankings", "Nations", "Artifacts", "Forum", "Shop"].map(
                (item) => (
                  <Link
                    key={item}
                    href={item === "Home" ? "/" : `/${item.toLowerCase()}`}
                    className={`transition hover:text-amber-100 ${
                      item === "Watch" ? "text-amber-200" : ""
                    }`}
                  >
                    {item}
                  </Link>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-2xl border border-amber-300/15 bg-white/[0.04] px-3 py-2 sm:block">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-100">Emaren</div>
                <div className="text-[10px] text-stone-400">469 WOLO</div>
              </div>
              <Link
                href="/watch"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[0_14px_40px_rgba(245,158,11,0.25)] transition hover:scale-[1.02]"
              >
                Watch live <Play className="h-3.5 w-3.5 fill-black" />
              </Link>
            </div>
          </div>
        </nav>


        <section className="relative overflow-hidden border-b border-amber-300/15 bg-black px-4 py-8 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.22),transparent_34%),radial-gradient(circle_at_18%_42%,rgba(127,29,29,0.24),transparent_28%),radial-gradient(circle_at_82%_42%,rgba(22,101,52,0.18),transparent_28%)]" />
          <div className="relative mx-auto max-w-6xl">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
                  Official Event Poster
                </div>
                <h2 className="mt-3 font-serif text-3xl font-black uppercase tracking-[0.08em] text-amber-100 sm:text-5xl">
                  Wolomania I
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                  The flagship fight-night artwork for the first AoE2WAR championship event. The interactive event board continues below.
                </p>
              </div>

              <a
                href={OFFICIAL_POSTER}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_55px_rgba(245,158,11,0.22)]"
              >
                Open Poster
              </a>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-amber-300/18 bg-black/55 shadow-[0_34px_120px_rgba(0,0,0,0.48)]">
              <img
                src={OFFICIAL_POSTER}
                alt="Wolomania I official event poster"
                className="mx-auto block w-full max-w-5xl object-contain"
              />
            </div>
          </div>
        </section>

        <header className="relative min-h-[850px] overflow-hidden border-b border-amber-300/15 px-4 py-10 sm:px-6 lg:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(245,158,11,0.28),transparent_28%),radial-gradient(circle_at_50%_52%,rgba(120,53,15,0.45),transparent_34%),linear-gradient(180deg,#090705_0%,#090705_48%,#050505_100%)]" />
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[linear-gradient(90deg,rgba(127,29,29,0.42),transparent_22%,transparent_78%,rgba(30,64,175,0.34)),radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.32),transparent_40%)]" />
          <div className="absolute left-6 top-24 hidden h-72 w-20 rounded-b-full border border-red-300/20 bg-red-950/45 shadow-[0_0_60px_rgba(127,29,29,0.55)] md:block" />
          <div className="absolute right-6 top-24 hidden h-72 w-20 rounded-b-full border border-blue-300/20 bg-blue-950/45 shadow-[0_0_60px_rgba(30,64,175,0.45)] md:block" />

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
                <Flame className="h-3.5 w-3.5" />
                The greatest battle, the first chapter
              </div>
              <h1 className="font-serif text-6xl font-black uppercase leading-none tracking-tight text-amber-100 drop-shadow-[0_8px_0_rgba(0,0,0,0.65)] sm:text-8xl lg:text-[9.5rem]">
                Wolomania I
              </h1>
              <div className="mx-auto mt-3 max-w-4xl rounded-full border border-amber-300/20 bg-black/50 px-5 py-3 text-sm font-black uppercase tracking-[0.24em] text-amber-100 sm:text-base">
                The World Championship Event
              </div>
              <div className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-300 sm:text-sm">
                July 10, 2026 <span className="text-amber-300">•</span> 8:00 PM UTC{" "}
                <span className="text-amber-300">•</span> Live on AoE2WAR.com
              </div>
            </div>

            <div className="mt-9 grid gap-6 lg:grid-cols-[0.82fr_1.5fr_0.82fr] lg:items-end">
              <aside className="relative overflow-hidden rounded-[2rem] border border-amber-300/18 bg-black/45 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
                <AssetImage
                  src={ASSETS.emaren.src}
                  fallback={ASSETS.emaren.fallback}
                  alt="Emaren, the commissioner"
                  className="mx-auto h-[420px] w-full object-contain object-bottom"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-6 pt-28">
                  <div className="text-4xl font-black uppercase tracking-[0.08em] text-white">Emaren</div>
                  <div className="mt-1 text-sm font-black uppercase tracking-[0.22em] text-amber-200">
                    The Commissioner
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-300/20 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-red-100">
                    🇨🇦 Canada
                  </div>
                  <p className="mt-3 max-w-xs text-xs uppercase tracking-[0.18em] text-amber-100/70">
                    Founder of AoE2WAR · Live host & commentator
                  </p>
                </div>
              </aside>

              <section className="relative">
                <div className="absolute inset-x-0 top-16 mx-auto h-72 max-w-xl rounded-full bg-amber-400/20 blur-3xl" />
                <AssetImage
                  src={ASSETS.belt.src}
                  fallback={ASSETS.belt.fallback}
                  alt="AoE2WAR championship belt"
                  className="relative z-10 mx-auto max-h-[310px] w-full object-contain drop-shadow-[0_30px_80px_rgba(0,0,0,0.8)]"
                />

                <div className="relative z-20 -mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <div className="overflow-hidden rounded-[2rem] border border-amber-300/18 bg-black/50 p-4 text-center shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
                    <AssetImage
                      src={ASSETS.jim.src}
                      fallback={ASSETS.jim.fallback}
                      alt="Jim, the strategist"
                      className="mx-auto h-64 w-full object-contain object-bottom"
                    />
                    <div className="-mt-2 text-4xl font-black uppercase tracking-[0.04em] text-white">
                      Jim
                    </div>
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
                      The Strategist
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-300">
                      🇺🇸 United States
                    </div>
                  </div>

                  <div className="mb-24 font-serif text-6xl font-black text-amber-200 drop-shadow-[0_0_30px_rgba(245,158,11,0.45)]">
                    VS
                  </div>

                  <div className="overflow-hidden rounded-[2rem] border border-amber-300/18 bg-black/50 p-4 text-center shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
                    <AssetImage
                      src={ASSETS.julio.src}
                      fallback={ASSETS.julio.fallback}
                      alt="Julio Alvarez, the conquistador"
                      className="mx-auto h-64 w-full object-contain object-bottom"
                    />
                    <div className="-mt-2 text-4xl font-black uppercase tracking-[0.04em] text-white">
                      Julio Alvarez
                    </div>
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
                      The Conquistador
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-300">
                      🇲🇽 Mexico
                    </div>
                  </div>
                </div>
              </section>

              <aside className="rounded-[2rem] border border-amber-300/20 bg-black/55 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="mb-5 text-center text-sm font-black uppercase tracking-[0.24em] text-amber-100">
                  Event details
                </div>
                <div className="space-y-4">
                  {[
                    ["Date", "July 10, 2026", CalendarDays],
                    ["Time", "8:00 PM UTC", Radio],
                    ["Format", "Best of 7", Swords],
                  ].map(([label, value, Icon]) => {
                    const DetailIcon = Icon as typeof CalendarDays;
                    return (
                      <div key={label as string} className="flex gap-3 border-b border-white/10 pb-4">
                        <DetailIcon className="mt-0.5 h-5 w-5 text-amber-300" />
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-stone-500">
                            {label as string}
                          </div>
                          <div className="mt-1 font-black uppercase tracking-[0.08em] text-white">
                            {value as string}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="border-b border-white/10 pb-4">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-stone-500">
                      Map pool
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mapPool.map((map) => (
                        <span
                          key={map}
                          className="rounded-full border border-amber-300/15 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100"
                        >
                          {map}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5 text-center">
                    <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full border border-amber-200/35 bg-black/45 text-amber-200">
                      <Trophy className="h-7 w-7" />
                    </div>
                    <div className="font-serif text-5xl font-black text-amber-100">100,000</div>
                    <div className="text-2xl font-black uppercase tracking-[0.16em] text-amber-200">
                      WOLO
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-300">
                      Winner takes all
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-emerald-100">
                    On-chain payout · Verifiable · Immutable · Legendary
                  </div>

                  <Link
                    href="/watch"
                    className="flex items-center justify-center gap-2 rounded-2xl border border-red-300/35 bg-gradient-to-b from-red-700 to-red-950 px-5 py-4 text-lg font-black uppercase tracking-[0.12em] text-white shadow-[0_20px_70px_rgba(185,28,28,0.35)] transition hover:scale-[1.02]"
                  >
                    Watch live <Play className="h-5 w-5 fill-white" />
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </header>

        <section className="border-b border-amber-300/12 bg-black px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 text-center font-serif text-3xl font-black uppercase tracking-[0.14em] text-amber-100">
              Live Championship Match
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_12rem_1fr] lg:items-stretch">
              <MiniGameplayFrame player="Julio" civ="Mexicans" score="2" align="left" />

              <div className="rounded-3xl border border-amber-300/20 bg-black/70 p-4 text-center shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
                <div className="text-sm font-black uppercase tracking-[0.22em] text-amber-200">
                  Arabia
                </div>
                <div className="mx-auto mt-4 h-28 w-28 rounded-2xl border border-amber-200/25 bg-[radial-gradient(circle,#2f7a43_0%,#2f7a43_35%,#8b7034_36%,#8b7034_52%,#1a2e45_53%,#1a2e45_100%)] shadow-[inset_0_0_30px_rgba(0,0,0,0.55)]" />
                <div className="mt-5 text-[10px] uppercase tracking-[0.22em] text-stone-500">Game time</div>
                <div className="font-serif text-3xl font-black text-amber-100">18:42</div>
                <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-stone-500">Viewers</div>
                <div className="text-2xl font-black text-white">1,248</div>
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/15 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-red-100">
                  <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.9)]" />
                  Live
                </div>
              </div>

              <MiniGameplayFrame player="Jim" civ="Japanese" score="0" align="right" />
            </div>
          </div>
        </section>

        <section className="border-b border-amber-300/12 bg-[#070504] px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-4">
            <InfoTile icon={<Swords className="h-5 w-5" />} title="About Wolomania">
              <p className="text-sm leading-7 text-stone-300">
                The ultimate test of strategy, skill, pressure, and legacy. One night. One match.
                One player becomes the first name carved into AoE2WAR history.
              </p>
              <Link
                href="/forum"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-100"
              >
                Event guide <ChevronRight className="h-4 w-4" />
              </Link>
            </InfoTile>

            <InfoTile icon={<Trophy className="h-5 w-5" />} title="Prize Pool">
              <div className="font-serif text-5xl font-black text-amber-100">100,000</div>
              <div className="text-2xl font-black uppercase tracking-[0.16em] text-amber-200">WOLO</div>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-300">
                Winner takes all · paid on-chain
              </p>
              <div className="mt-4 flex gap-2 text-amber-200/75">
                {[Crown, Shield, Medal, Gamepad2, Wallet].map((Icon, index) => (
                  <span key={index} className="grid h-8 w-8 place-items-center rounded-full border border-amber-300/20 bg-black/35">
                    <Icon className="h-4 w-4" />
                  </span>
                ))}
              </div>
            </InfoTile>

            <InfoTile icon={<Radio className="h-5 w-5" />} title="Commentary Team">
              <div className="flex items-center gap-4">
                <AssetImage
                  src={ASSETS.emaren.src}
                  fallback={ASSETS.emaren.fallback}
                  alt="Emaren commentary"
                  className="h-20 w-20 rounded-2xl border border-amber-300/20 object-cover"
                />
                <div>
                  <div className="text-2xl font-black uppercase tracking-[0.08em] text-white">Emaren</div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">
                    Founder & host
                  </div>
                  <div className="mt-1 text-xs text-stone-400">The Commissioner</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-stone-300">
                Live commentary, expert analysis, founder’s desk, and the first official Wolomania record.
              </p>
            </InfoTile>

            <InfoTile icon={<MessageCircle className="h-5 w-5" />} title="Live Chat">
              <div className="space-y-2 rounded-2xl border border-white/10 bg-black/35 p-3">
                {chatMessages.map(([user, message]) => (
                  <div key={user} className="text-xs text-stone-300">
                    <span className="font-bold text-amber-200">{user}:</span> {message}
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-stone-500">
                  Say something...
                  <ChevronRight className="h-4 w-4 text-amber-200" />
                </div>
              </div>
            </InfoTile>
          </div>
        </section>

        <section className="relative border-b border-amber-300/12 bg-black px-4 py-8 sm:px-6 lg:px-8">
          <div className="absolute inset-y-0 left-6 hidden w-24 bg-gradient-to-b from-red-900/30 via-red-950/20 to-transparent md:block" />
          <div className="absolute inset-y-0 right-6 hidden w-24 bg-gradient-to-b from-blue-900/30 via-blue-950/20 to-transparent md:block" />
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-4 text-center text-xs font-black uppercase tracking-[0.32em] text-amber-300/75">
              The show starts in
            </div>
            <Countdown />
            <div className="mt-4 text-center text-xs font-black uppercase tracking-[0.22em] text-amber-100/75">
              Set your reminder · Don’t miss history
            </div>
          </div>
        </section>

        <section className="border-b border-amber-300/12 bg-[#060606] px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 text-center font-serif text-2xl font-black uppercase tracking-[0.18em] text-amber-100">
              Founding Figures
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Commissioner", "Emaren", "Canada", "🇨🇦", ASSETS.emaren],
                ["Main Event", "Jim", "United States", "🇺🇸", ASSETS.jim],
                ["Main Event", "Julio Alvarez", "Mexico", "🇲🇽", ASSETS.julio],
              ].map(([role, name, country, flag, asset]) => {
                const img = asset as typeof ASSETS.emaren;
                return (
                  <div key={name as string} className="flex items-center gap-4 rounded-3xl border border-amber-300/15 bg-black/45 p-4">
                    <AssetImage
                      src={img.src}
                      fallback={img.fallback}
                      alt={name as string}
                      className="h-20 w-20 rounded-2xl border border-amber-300/20 object-cover"
                    />
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/70">
                        {role as string}
                      </div>
                      <div className="text-xl font-black uppercase tracking-[0.06em] text-white">
                        {name as string}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-400">
                        {flag as string} {country as string}
                      </div>
                    </div>
                  </div>
                );
              })}

              <Link
                href="/champions"
                className="group flex items-center justify-between rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 transition hover:bg-amber-400/15"
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/70">
                    Legacy
                  </div>
                  <div className="text-xl font-black uppercase tracking-[0.06em] text-white">
                    View all champions
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-400">
                    Belts · reigns · records
                  </div>
                </div>
                <ChevronRight className="h-7 w-7 text-amber-200 transition group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-black px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-5">
              {footerStats.map(([label, value, Icon]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2 text-amber-200">
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">
                      {label}
                    </span>
                  </div>
                  <div className="text-xl font-black text-white">{value}</div>
                </div>
              ))}
            </div>
            <Link
              href="/wolo"
              className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 px-8 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_55px_rgba(245,158,11,0.22)]"
            >
              Buy WOLO <Wallet className="h-4 w-4" />
            </Link>
          </div>

          <footer className="mx-auto mt-7 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-stone-500">
            <div>
              <div className="font-serif text-2xl font-black text-amber-100">AoE2WAR</div>
              <div className="uppercase tracking-[0.24em] text-amber-300/55">Where legends are made</div>
            </div>
            <div className="flex flex-wrap gap-4 uppercase tracking-[0.18em]">
              <Link href="/about" className="hover:text-amber-100">About</Link>
              <Link href="/forum" className="hover:text-amber-100">Forum</Link>
              <Link href="/watch" className="hover:text-amber-100">Watch</Link>
              <Link href="/wolo" className="hover:text-amber-100">WOLO</Link>
            </div>
            <div className="font-black uppercase tracking-[0.22em] text-amber-200">aoe2war.com</div>
          </footer>
        </section>
      </div>
    </div>
  );
}
