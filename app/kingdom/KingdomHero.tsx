"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowRight, Crown, ExternalLink, Flame, Landmark } from "lucide-react";

type KingdomStat = {
  label: string;
  value: string;
};

type KingdomHeroProps = {
  featuredStats: KingdomStat[];
};

const TITLE_STORAGE_KEY = "aoe2war.kingdom.heroTitleVariant";

const titleStyles = ["movieSoft", "movieClear", "movieFull"] as const;
type TitleStyle = (typeof titleStyles)[number];

function getNextStyle(current: TitleStyle): TitleStyle {
  const index = titleStyles.indexOf(current);
  return titleStyles[(index + 1) % titleStyles.length];
}

function HeroChip({
  icon,
  children,
  tone = "amber",
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: "amber" | "green" | "stone";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200/[0.10] bg-emerald-300/[0.035] text-emerald-100/70"
      : tone === "stone"
        ? "border-stone-100/[0.10] bg-stone-100/[0.035] text-stone-100/68"
        : "border-amber-200/[0.10] bg-amber-200/[0.035] text-amber-100/70";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-md ${toneClass}`}
    >
      {icon}
      {children}
    </span>
  );
}

function StatTile({ label, value }: KingdomStat) {
  return (
    <div className="rounded-[1.15rem] border border-amber-100/[0.105] bg-black/[0.26] px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400/58">
        {label}
      </div>
      <div className="mt-2 text-lg font-black leading-tight text-slate-100/88">{value}</div>
    </div>
  );
}


function MovieKingdomTitle({ haze = "soft" }: { haze?: "clear" | "soft" | "full" }) {
  const hazeClass =
    haze === "full"
      ? "opacity-100"
      : haze === "soft"
        ? "opacity-55"
        : "opacity-0";

  return (
    <div className="relative max-w-[46rem]">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -left-16 top-8 h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.28)_0%,rgba(245,158,11,0.18)_24%,rgba(245,158,11,0.10)_40%,rgba(245,158,11,0.05)_54%,transparent_74%)] blur-3xl transition-opacity duration-300 ${hazeClass}`}
      />

      <div className="relative">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          Royal Chronicle
        </div>

        <div className="mt-5 font-serif text-[clamp(1.15rem,1.8vw,1.55rem)] italic tracking-[0.18em] text-amber-50/80">
          the first fire
        </div>

        <div className="mt-3">
          <div className="mb-2 text-[clamp(2rem,3.1vw,2.7rem)] font-semibold uppercase tracking-[0.48em] text-amber-50/90">
            THE
          </div>

          <div className="font-serif text-[clamp(4.2rem,10vw,8.25rem)] font-semibold uppercase leading-[0.88] tracking-[-0.045em] bg-[linear-gradient(180deg,#fff4cc_0%,#f3d27a_28%,#d39a31_62%,#8b5616_100%)] bg-clip-text text-transparent drop-shadow-[0_10px_22px_rgba(0,0,0,0.88)]">
            KINGDOM
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="h-px w-14 bg-gradient-to-r from-amber-100/0 via-amber-100/45 to-amber-100/0" />
          <span className="font-serif text-[clamp(0.95rem,1.45vw,1.1rem)] italic tracking-[0.08em] text-amber-50/80">
            founded in fire · remembered on chain
          </span>
        </div>
      </div>
    </div>
  );
}





function TitleVariant({ style }: { style: TitleStyle }) {
  if (style === "movieClear") {
    return <MovieKingdomTitle haze="clear" />;
  }

  if (style === "movieFull") {
    return <MovieKingdomTitle haze="full" />;
  }

  return <MovieKingdomTitle haze="soft" />;
}

export default function KingdomHero({ featuredStats }: KingdomHeroProps) {
  const [titleStyle, setTitleStyle] = useState<TitleStyle>("movieSoft");

  useEffect(() => {
    const stored = window.localStorage.getItem(TITLE_STORAGE_KEY);
    if (stored && titleStyles.includes(stored as TitleStyle)) {
      setTitleStyle(stored as TitleStyle);
    }
  }, []);

  const titleIndex = useMemo(() => titleStyles.indexOf(titleStyle), [titleStyle]);

  function cycleTitle() {
    setTitleStyle((current) => {
      const next = getNextStyle(current);
      window.localStorage.setItem(TITLE_STORAGE_KEY, next);
      return next;
    });
  }

  function handleHeroClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a,button")) return;
    cycleTitle();
  }

  function handleHeroKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    if (target.closest("a,button")) return;
    event.preventDefault();
    cycleTitle();
  }

  return (
    <section
      className="relative isolate min-h-[38rem] cursor-pointer overflow-hidden rounded-[2.2rem] border border-amber-100/18 bg-[#03060c] shadow-[0_44px_140px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.055] sm:min-h-[43rem] lg:min-h-[46rem]"
      onClick={handleHeroClick}
      onKeyDown={handleHeroKeyDown}
      tabIndex={0}
      aria-label="Cycle Kingdom hero title styles"
    >
      <Image
        src="/kingdom/kingdom-hero-bg.webp"
        alt="The AoE2WAR Kingdom castle rising over a forest campfire at sunset"
        fill
        priority
        sizes="(max-width: 1536px) 100vw, 1536px"
        className="object-cover object-[58%_center]"
      />

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,13,0.97)_0%,rgba(2,5,13,0.86)_30%,rgba(2,5,13,0.38)_62%,rgba(2,5,13,0.20)_100%),linear-gradient(180deg,rgba(2,5,13,0.12),rgba(2,5,13,0.16)_48%,rgba(2,5,13,0.95)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_22%,rgba(251,191,36,0.06),transparent_25%)]" />
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/34 to-transparent" />

      <div className="relative flex min-h-[38rem] max-w-[62rem] flex-col justify-between px-6 pb-8 pt-10 sm:min-h-[43rem] sm:px-10 sm:pb-10 sm:pt-12 lg:min-h-[46rem] lg:px-14">
        <div>
          <div className="flex flex-wrap gap-2">
            <HeroChip icon={<Crown className="h-3.5 w-3.5" />}>AoE2WAR</HeroChip>
            <HeroChip icon={<Flame className="h-3.5 w-3.5" />} tone="green">
              Feudal Age
            </HeroChip>
            <HeroChip icon={<Landmark className="h-3.5 w-3.5" />} tone="stone">
              Chronicle Live
            </HeroChip>
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.40em] text-slate-400/66">
            AoE2WAR · The Kingdom
          </p>
        </div>

        <div className="max-w-[58rem]">
          <TitleVariant style={titleStyle} />

          <p className="mt-4 max-w-[43rem] text-[clamp(0.98rem,1.05vw,1.12rem)] leading-8 text-slate-200/74 drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)]">
            Every kingdom begins with a single fire. The citizens arrive, the first games are
            recorded, and the ledger starts to remember.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="#chronicles"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-amber-100/18 bg-[linear-gradient(135deg,rgba(126,82,23,0.30),rgba(3,7,18,0.42))] px-6 py-3 text-sm font-black text-amber-50/86 shadow-[0_14px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/30 hover:text-amber-50 sm:min-w-[13rem]"
            >
              Read the Chronicle
              <ArrowRight className="h-4 w-4 text-amber-100/56 transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="/wolochain"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-black/[0.16] px-6 py-3 text-sm font-bold text-slate-300/74 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-white/14 hover:text-slate-100/88"
            >
              View On Chain
              <ExternalLink className="h-4 w-4 text-amber-100/52" />
            </Link>
            <Link
              href="/champions"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/[0.075] bg-black/[0.13] px-6 py-3 text-sm font-bold text-slate-300/70 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-amber-100/14 hover:text-slate-100/86"
            >
              Championship Belts
            </Link>
          </div>

          <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500/68">
            {titleStyles.map((style, index) => (
              <button
                key={style}
                type="button"
                aria-label={`Use Kingdom title style ${index + 1}`}
                className={`h-1.5 rounded-full transition ${
                  index === titleIndex
                    ? "w-7 bg-amber-100/48"
                    : "w-1.5 bg-white/15 hover:bg-white/28"
                }`}
                onClick={() => {
                  setTitleStyle(style);
                  window.localStorage.setItem(TITLE_STORAGE_KEY, style);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 right-5 hidden w-[29rem] grid-cols-3 gap-3 xl:grid">
        {featuredStats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </section>
  );
}
