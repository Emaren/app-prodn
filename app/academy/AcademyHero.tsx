"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import { useMemo, useState } from "react";
import { ChevronRight, Flame, Orbit, Shield, Sparkles } from "lucide-react";

type HeroStyle = {
  id: string;
  label: string;
  titleClassName: string;
  titleStyle: CSSProperties;
  kickerClassName: string;
  leadClassName: string;
  bodyClassName: string;
  dividerClassName: string;
};

function gradientText(backgroundImage: string): CSSProperties {
  return {
    backgroundImage,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    textShadow: "0 14px 38px rgba(0,0,0,0.34)",
  };
}

const HERO_STYLES: HeroStyle[] = [
  {
    id: "imperial",
    label: "Imperial",
    titleClassName:
      "max-w-[9ch] font-serif text-5xl font-semibold leading-[0.9] tracking-[-0.05em] sm:text-7xl lg:text-[5.8rem]",
    titleStyle: gradientText(
      "linear-gradient(180deg, #faf0cf 0%, #f1d489 18%, #d7a44e 40%, #f7f1df 58%, #c8ced7 78%, #f0d58d 100%)"
    ),
    kickerClassName:
      "text-[10px] font-bold uppercase tracking-[0.44em] text-slate-300/68",
    leadClassName:
      "mt-5 max-w-[34rem] text-base font-medium leading-7 text-slate-200/88 sm:text-lg",
    bodyClassName:
      "mt-3 max-w-[37rem] text-sm leading-6 text-slate-300/72",
    dividerClassName:
      "mt-5 h-px w-56 bg-gradient-to-r from-[#f1d489]/80 via-[#d7a44e]/30 to-transparent",
  },
  {
    id: "command",
    label: "Command",
    titleClassName:
      "max-w-[10ch] font-serif text-[2.85rem] font-semibold uppercase leading-[0.92] tracking-[0.03em] sm:text-[4.8rem] lg:text-[5.3rem]",
    titleStyle: gradientText(
      "linear-gradient(180deg, #f4e7bf 0%, #dfc27b 26%, #c7ccd3 54%, #f2dda4 78%, #bb9250 100%)"
    ),
    kickerClassName:
      "text-[10px] font-bold uppercase tracking-[0.52em] text-slate-400/72",
    leadClassName:
      "mt-5 max-w-[34rem] text-base font-medium leading-7 text-slate-200/84 sm:text-lg",
    bodyClassName:
      "mt-3 max-w-[37rem] text-sm leading-6 text-slate-400/78",
    dividerClassName:
      "mt-5 h-px w-56 bg-gradient-to-r from-[#d9c6a0]/75 via-[#b5bcc5]/30 to-transparent",
  },
  {
    id: "spartan",
    label: "Spartan",
    titleClassName:
      "max-w-[9ch] font-serif text-5xl font-semibold leading-[0.88] tracking-[-0.035em] sm:text-[5.3rem] lg:text-[6rem]",
    titleStyle: gradientText(
      "linear-gradient(180deg, #f8efce 0%, #e4c77c 24%, #aeb7c3 52%, #f2e0b0 74%, #b57a44 100%)"
    ),
    kickerClassName:
      "text-[10px] font-bold uppercase tracking-[0.46em] text-slate-300/70",
    leadClassName:
      "mt-5 max-w-[34rem] text-base font-medium leading-7 text-slate-200/86 sm:text-lg",
    bodyClassName:
      "mt-3 max-w-[37rem] text-sm leading-6 text-slate-300/74",
    dividerClassName:
      "mt-5 h-px w-56 bg-gradient-to-r from-[#e7cb85]/75 via-[#c0c7cf]/26 to-transparent",
  },
];

export default function AcademyHero() {
  const [styleIndex, setStyleIndex] = useState(0);
  const activeStyle = HERO_STYLES[styleIndex];

  const nextStyle = () => {
    setStyleIndex((current) => (current + 1) % HERO_STYLES.length);
  };

  const sectionStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage:
        "linear-gradient(90deg, rgba(3,7,18,0.68) 0%, rgba(3,7,18,0.44) 30%, rgba(3,7,18,0.12) 58%, rgba(3,7,18,0.02) 100%), linear-gradient(180deg, rgba(3,7,18,0.04) 0%, rgba(3,7,18,0.02) 54%, rgba(3,7,18,0.22) 100%), url('/academy/academy-gates-red.webp')",
      backgroundPosition: "center, center, 62% center",
      backgroundSize: "cover, cover, cover",
    }),
    []
  );

  function handleCycle(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a,button,[data-hero-stop='true']")) {
      return;
    }
    nextStyle();
  }

  return (
    <section
      className="relative isolate min-h-[34rem] cursor-pointer overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#05070d] bg-cover shadow-[0_38px_120px_rgba(0,0,0,0.42)] sm:min-h-[40rem]"
      style={sectionStyle}
      onClick={handleCycle}
      aria-label="Cycle Academy hero title styles"
      title="Click hero to cycle title styles"
    >
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(168,36,52,0.14),transparent_28%),radial-gradient(circle_at_71%_77%,rgba(227,186,97,0.10),transparent_22%)]" />

      <div className="relative flex min-h-[34rem] flex-col px-6 py-10 sm:min-h-[40rem] sm:px-10 lg:px-14">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/22 bg-black/24 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100 backdrop-blur-md">
            <Flame className="h-3.5 w-3.5" />
            The gate is open
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-100/18 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-red-100/88 backdrop-blur-md">
            <Shield className="h-3.5 w-3.5" />
            War counsel
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-100/16 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100/88 backdrop-blur-md">
            <Orbit className="h-3.5 w-3.5" />
            First advisor seated
          </span>

          <span
            data-hero-stop="true"
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/26 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300/72 backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-200/70" />
            Click hero • {styleIndex + 1}/3 • {activeStyle.label}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-8 pb-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[41rem]">
            <p className={activeStyle.kickerClassName}>AoE2WAR · The Academy</p>

            <h1 className="mt-16">
              <span
                className={`block ${activeStyle.titleClassName}`}
                style={activeStyle.titleStyle}
              >
                The Academy
              </span>
            </h1>

            <div className={activeStyle.dividerClassName} />

            <p className={activeStyle.leadClassName}>
              Read the field. Move with intent. Raise your ELO.
            </p>

            <p className={activeStyle.bodyClassName}>
              Replay study, battlefield judgment, and proven advice from real
              players. A cleaner war school for players who want to improve
              before they wager.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#advisors"
                className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-100/24 bg-[linear-gradient(135deg,rgba(92,64,18,0.26),rgba(3,7,18,0.52))] px-5 py-2.5 text-xs font-semibold text-amber-50 shadow-[0_16px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/40 hover:bg-amber-100/[0.075]"
              >
                Meet the advisors
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>

              <Link
                href="#zodiac"
                className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-100/16 bg-[linear-gradient(135deg,rgba(99,28,38,0.26),rgba(3,7,18,0.52))] px-5 py-2.5 text-xs font-semibold text-slate-100 shadow-[0_16px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-red-100/30 hover:bg-red-100/[0.06]"
              >
                Train under the Zodiac
                <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
              </Link>
            </div>
          </div>

          <div className="w-full max-w-[22rem] self-end">
            <div className="grid grid-cols-3 overflow-hidden rounded-[1.15rem] border border-white/12 bg-[linear-gradient(180deg,rgba(12,19,31,0.58),rgba(5,9,17,0.38))] backdrop-blur-xl">
              <div className="border-r border-white/10 px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400/70">
                  Doctrine
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-200/92">
                  Field reads
                </p>
              </div>
              <div className="border-r border-white/10 px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400/70">
                  Command
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-200/92">
                  Timing
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400/70">
                  Proof
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-200/92">
                  Replay war
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
