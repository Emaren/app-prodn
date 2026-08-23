import { ArrowRight, Hammer, Radio, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import WorkshopShellReady from "@/components/workshop/WorkshopShellReady";

import "./workshop-polish.css";
import "./workshop-chronicle-gap-fill.css";

const HERO = "/workshop/workshop-observatory-hero.webp";

export default function WorkshopLoading() {
  return (
    <main
      className="space-y-7 py-7 text-white"
      data-workshop-instant-shell="true"
    >
      <WorkshopShellReady />

      <section className="workshop-basic-market-hero relative isolate min-h-[42rem] overflow-hidden rounded-[2.35rem] border border-amber-100/16 bg-[#03060c] shadow-[0_40px_125px_rgba(0,0,0,0.48)] sm:min-h-[45rem]">
        <div
          className="workshop-hero-banner workshop-hero-banner--basic"
          role="img"
          aria-label="The AoE2WAR Workshop observatory"
        >
          <Image
            src={HERO}
            alt=""
            fill
            priority
            className="object-cover object-center"
            sizes="(max-width: 1024px) 100vw, 1200px"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.14)_48%,rgba(2,6,23,0.72)_100%)]" />
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(2,5,13,0.88)_0%,rgba(2,5,13,0.73)_30%,rgba(2,5,13,0.34)_60%,rgba(2,5,13,0.10)_100%),linear-gradient(180deg,rgba(2,5,13,0.08),rgba(2,5,13,0.18)_55%,rgba(2,5,13,0.96)_100%)]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 z-20 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

        <div className="absolute right-5 top-5 z-40">
          <div
            className="inline-flex items-center rounded-full border border-amber-200/20 bg-[#050910]/90 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl"
            aria-label="Workshop view"
          >
            {["B", "A", "E"].map((label, index) => (
              <span
                key={label}
                className={[
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em]",
                  index === 0
                    ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
                    : "text-slate-400",
                ].join(" ")}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-20 flex min-h-[42rem] max-w-[55rem] flex-col px-6 pb-36 pt-8 sm:min-h-[45rem] sm:px-10 sm:pb-36 sm:pt-11 lg:px-14">
          <div>
            <div className="flex max-w-[calc(100%-8rem)] flex-wrap gap-2">
              <span className="inline-flex items-center gap-3 rounded-full border border-amber-100/16 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-50">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.6)]" />
                The Workshop
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100/18 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-50 backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" />
                Living history
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-50 backdrop-blur-md">
                <ShieldCheck className="h-3.5 w-3.5" />
                Public observatory
              </span>
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.42em] text-slate-400">
              AoE2WAR · The Workshop
            </p>
          </div>
        </div>

        <div className="workshop-basic-market-title absolute left-6 top-[31%] z-20 max-w-[40rem] sm:left-10 lg:left-14">
          <h1 className="market-display-title market-display-gold market-hero-title pb-2 font-serif text-5xl font-normal leading-[1.01] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            The Workshop
          </h1>

          <div className="mt-3 h-px w-36 bg-gradient-to-r from-amber-100/62 via-amber-100/20 to-transparent" />

          <p className="mt-5 max-w-[31rem] font-serif text-2xl leading-tight text-slate-100 drop-shadow-[0_3px_18px_rgba(0,0,0,0.85)] sm:text-3xl">
            The strange machine is forged in public.
          </p>

          <p className="mt-3 max-w-[34rem] text-sm leading-6 text-slate-300 sm:text-[15px]">
            The Workshop is already here. Live evidence and deeper history fill in around it.
          </p>
        </div>

        <div className="absolute bottom-6 left-6 right-6 z-30 max-w-[38rem] sm:left-10 sm:right-auto lg:left-14">
          <div className="mb-4 flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-50 backdrop-blur-lg">
              <Hammer className="h-4 w-4" />
              Build culture made visible
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="#workbench"
              className="market-gold-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Enter the Forge
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/radio"
              className="market-iron-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Workshop Radio
              <Radio className="h-4 w-4 text-amber-100" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
