"use client";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { preload } from "react-dom";
import type { KeyboardEvent, MouseEvent } from "react";
import { ArrowRight, Flame, Orbit, Shield, Sparkles } from "lucide-react";
type AcademyHeroVariant = "a" | "b" | "e";

const ACADEMY_HERO_BG_IMAGE = "/academy/academy-gates-red.webp";
const ACADEMY_HERO_E_BG_IMAGE =
  "/academy/academy-hero-e-f2b3eaff-lossless.webp";
const ACADEMY_HERO_TITLE_IMAGE =
  "/academy/the-academy-title-fresh-23fc015f-lossless.webp";

const DEFAULT_ACADEMY_HERO_VARIANT: AcademyHeroVariant = "e";
const ACADEMY_HERO_STORAGE_KEY = "aoe2war.academy.heroVariant.v1";
const ACADEMY_HERO_ANON_KEY = "aoe2war.academy.heroAnon.v1";

const HERO_VARIANTS: Array<{
  key: AcademyHeroVariant;
  label: string;
  name: string;
  line: string;
}> = [
  {
    key: "b",
    label: "B",
    name: "Base",
    line: "Scholarly gold title",
  },
  {
    key: "a",
    label: "A",
    name: "Antique",
    line: "Integrated brass title",
  },
  {
    key: "e",
    label: "E",
    name: "Epic",
    line: "Alternate full hero art",
  },
];

const CYCLE_ORDER: AcademyHeroVariant[] = ["e", "b", "a"];

const ACADEMY_HERO_TO_TILE_VIEW = {
  b: "basic",
  a: "advanced",
  e: "extreme",
} as const;

const TILE_VIEW_TO_ACADEMY_HERO = {
  basic: "b",
  advanced: "a",
  extreme: "e",
} as const;

const isHeroVariant = (value: unknown): value is AcademyHeroVariant =>
  value === "a" || value === "b" || value === "e";

function getOrCreateAnonId() {
  if (typeof window === "undefined") return "server";

  const existing = window.localStorage.getItem(ACADEMY_HERO_ANON_KEY);
  if (existing) return existing;

  const fresh =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `academy-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(ACADEMY_HERO_ANON_KEY, fresh);
  return fresh;
}

function sendAcademyHeroPreference(
  variant: AcademyHeroVariant,
  source: "hero-click" | "toggle",
  previousVariant?: AcademyHeroVariant,
) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    variant,
    previousVariant,
    source,
    anonymousId: getOrCreateAnonId(),
    path: window.location.pathname,
    at: new Date().toISOString(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/academy/hero-preference", blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  fetch("/api/academy/hero-preference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

const ACADEMY_HERO_WARM_PROMISES = new Map<string, Promise<void>>();

function academyHeroBackgroundImage(variant: AcademyHeroVariant) {
  return variant === "e"
    ? ACADEMY_HERO_E_BG_IMAGE
    : ACADEMY_HERO_BG_IMAGE;
}

function warmAcademyHeroBackground(variant: AcademyHeroVariant) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const src = academyHeroBackgroundImage(variant);
  const existing = ACADEMY_HERO_WARM_PROMISES.get(src);

  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve) => {
    const image = new window.Image();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    image.decoding = "async";
    image.fetchPriority = "high";
    image.onload = finish;
    image.onerror = finish;
    image.src = src;

    if (image.complete) {
      if (typeof image.decode === "function") {
        void image.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    }
  });

  ACADEMY_HERO_WARM_PROMISES.set(src, promise);
  return promise;
}

export default function AcademyHero() {
  preload(ACADEMY_HERO_E_BG_IMAGE, {
    as: "image",
    fetchPriority: "high",
  });

  const {
    appearanceLoaded,
    tileViewPreferences,
    setTileViewPreference,
  } = useLobbyAppearance();

  const [heroVariant, setHeroVariant] = useState<AcademyHeroVariant>(
    DEFAULT_ACADEMY_HERO_VARIANT,
  );

  useEffect(() => {
    const legacyVariant = window.localStorage.getItem(
      ACADEMY_HERO_STORAGE_KEY,
    );

    if (isHeroVariant(legacyVariant)) {
      void warmAcademyHeroBackground(legacyVariant);
    }
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;

    const accountView = tileViewPreferences.academy_hero;
    let nextVariant: AcademyHeroVariant | null = accountView
      ? TILE_VIEW_TO_ACADEMY_HERO[accountView]
      : null;

    if (!nextVariant) {
      const legacyVariant = window.localStorage.getItem(
        ACADEMY_HERO_STORAGE_KEY,
      );

      if (isHeroVariant(legacyVariant)) {
        nextVariant = legacyVariant;

        setTileViewPreference(
          "academy_hero",
          ACADEMY_HERO_TO_TILE_VIEW[legacyVariant],
        );
      }
    }

    if (!nextVariant || nextVariant === heroVariant) {
      return;
    }

    let cancelled = false;

    void warmAcademyHeroBackground(nextVariant).then(() => {
      if (!cancelled) {
        setHeroVariant(nextVariant);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    appearanceLoaded,
    heroVariant,
    setTileViewPreference,
    tileViewPreferences.academy_hero,
  ]);

  const currentVariant =
    HERO_VARIANTS.find((variant) => variant.key === heroVariant) ??
    HERO_VARIANTS[1];

  const heroStyle = useMemo(() => {
    if (heroVariant === "e") {
      return {
        backgroundImage:
          "linear-gradient(90deg, rgba(3,7,18,0.78) 0%, rgba(3,7,18,0.48) 31%, rgba(3,7,18,0.2) 58%, rgba(3,7,18,0.08) 100%), linear-gradient(180deg, rgba(3,7,18,0.06) 0%, rgba(3,7,18,0.08) 55%, rgba(3,7,18,0.34) 100%), url('" +
          ACADEMY_HERO_E_BG_IMAGE +
          "')",
        backgroundPosition: "center, center, 57% 52%",
        backgroundSize: "cover, cover, cover",
      };
    }

    return {
      backgroundImage:
        "linear-gradient(90deg, rgba(3,7,18,0.82) 0%, rgba(3,7,18,0.58) 32%, rgba(3,7,18,0.2) 58%, rgba(3,7,18,0.03) 100%), linear-gradient(180deg, rgba(3,7,18,0.02) 0%, rgba(3,7,18,0.08) 54%, rgba(3,7,18,0.38) 100%), url('" +
        ACADEMY_HERO_BG_IMAGE +
        "')",
      backgroundPosition: "center, center, 62% center",
      backgroundSize: "cover, cover, cover",
    };
  }, [heroVariant]);

  const persistHeroVariant = (
    nextVariant: AcademyHeroVariant,
    source: "hero-click" | "toggle",
  ) => {
    if (heroVariant === nextVariant) return;

    const previousVariant = heroVariant;

    setHeroVariant(nextVariant);

    window.localStorage.setItem(
      ACADEMY_HERO_STORAGE_KEY,
      nextVariant,
    );

    setTileViewPreference(
      "academy_hero",
      ACADEMY_HERO_TO_TILE_VIEW[nextVariant],
    );

    sendAcademyHeroPreference(
      nextVariant,
      source,
      previousVariant,
    );
  };

  const cycleHeroVariant = () => {
    const currentIndex = CYCLE_ORDER.indexOf(heroVariant);
    const nextVariant =
      CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length] ??
      DEFAULT_ACADEMY_HERO_VARIANT;

    persistHeroVariant(nextVariant, "hero-click");
  };

  const handleHeroKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    cycleHeroVariant();
  };

  const handleHeroClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;

    if (
      target?.closest(
        "a, button, [data-academy-hero-control], [data-academy-hero-no-cycle]",
      )
    ) {
      return;
    }

    cycleHeroVariant();
  };

  return (
    <section
      role="button"
      tabIndex={0}
      aria-label={`Academy hero visual test. Current version: ${currentVariant.name}. Click to cycle hero variants.`}
      className="group relative isolate min-h-[34rem] cursor-pointer overflow-hidden rounded-[2.2rem] border border-amber-100/16 bg-[#05070d] bg-cover shadow-[0_38px_120px_rgba(0,0,0,0.42)] outline-none transition duration-500 hover:border-amber-100/22 focus-visible:ring-2 focus-visible:ring-amber-200/40 sm:min-h-[40rem]"
      style={heroStyle}
      onClick={handleHeroClick}
      onKeyDown={handleHeroKeyDown}
    >
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

      <div
        data-academy-hero-control
        className="absolute right-5 top-5 z-10 sm:right-8 sm:top-8"
      >
        <nav className="clan-bae-toggle" aria-label="Academy hero variant">
          {HERO_VARIANTS.map((variant) => {
            const active = variant.key === heroVariant;

            return (
              <button
                key={variant.key}
                type="button"
                title={`${variant.name}: ${variant.line}`}
                aria-pressed={active}
                onClick={() => persistHeroVariant(variant.key, "toggle")}
                className={`clan-bae-toggle__item${
                  active ? " clan-bae-toggle__item--active" : ""
                }`}
              >
                {variant.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="relative flex min-h-[34rem] flex-col px-6 py-10 sm:min-h-[40rem] sm:px-10 lg:px-14">
        <div className="flex flex-wrap gap-2 pr-0 sm:pr-40">
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
        </div>

        <div className="mt-auto max-w-[42rem] pb-2">
          {heroVariant === "b" ? (
            <>
              <p className="mt-16 text-[10px] font-bold uppercase tracking-[0.42em] text-amber-100/52">
                AoE2WAR · The War College
              </p>

              <h1
                data-academy-basic-title
                className="market-display-title market-display-gold market-hero-title mt-4 pb-2 font-serif text-5xl font-normal leading-[1.01] tracking-[-0.045em] sm:text-6xl lg:text-7xl"
              >
                The Academy
              </h1>

              <div className="mt-3 h-px w-36 bg-gradient-to-r from-amber-100/62 via-amber-100/20 to-transparent" />
            </>
          ) : (
            <>
              <h1 className="sr-only">The Academy</h1>

              <div
                className={[
                  "relative h-[7.15rem] w-[min(91%,27.4rem)] max-w-none overflow-visible sm:h-[8.9rem] sm:w-[31.4rem] lg:h-[9.7rem] lg:w-[33rem]",
                  heroVariant === "e"
                    ? "mt-7 sm:mt-8 lg:mt-9"
                    : "mt-6 sm:mt-7 lg:mt-8",
                ].join(" ")}
                aria-hidden="true"
              >
                <div className="pointer-events-none absolute left-[8%] top-[50%] h-[30%] w-[72%] -translate-y-1/2 rounded-full bg-[#8a3b1f]/10 blur-[54px]" />

                <Image
                  src={ACADEMY_HERO_TITLE_IMAGE}
                  alt=""
                  width={1672}
                  height={941}
                  priority
                  sizes="(max-width: 640px) 84vw, (max-width: 1024px) 32rem, 34rem"
                  className={[
                    "absolute left-[-0.5rem] top-[47%] h-auto w-full -translate-y-1/2 select-none object-contain sm:left-[-0.82rem] lg:left-[-0.96rem]",
                    heroVariant === "e"
                      ? "opacity-[0.84] brightness-[0.80] saturate-[1.22] sepia-[0.24] contrast-[1.06] drop-shadow-[0_10px_22px_rgba(0,0,0,0.34)]"
                      : "opacity-[0.9] brightness-[0.9] saturate-[1.24] sepia-[0.18] contrast-[1.16] drop-shadow-[0_12px_26px_rgba(0,0,0,0.5)]",
                  ].join(" ")}
                />

                <div
                  aria-hidden="true"
                  className={[
                    "pointer-events-none absolute left-[-0.5rem] top-[47%] h-full w-full -translate-y-1/2 mix-blend-soft-light sm:left-[-0.82rem] lg:left-[-0.96rem]",
                    heroVariant === "e" ? "opacity-[0.10]" : "opacity-[0.18]",
                  ].join(" ")}
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(230,143,42,0.34) 0%, rgba(112,42,25,0.26) 42%, rgba(30,13,12,0.5) 100%)",
                    WebkitMaskImage: `url(${ACADEMY_HERO_TITLE_IMAGE})`,
                    maskImage: `url(${ACADEMY_HERO_TITLE_IMAGE})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />

                <div
                  aria-hidden="true"
                  className={[
                    "pointer-events-none absolute left-[-0.5rem] top-[47%] h-full w-full -translate-y-1/2 mix-blend-multiply sm:left-[-0.82rem] lg:left-[-0.96rem]",
                    heroVariant === "e" ? "opacity-[0.28]" : "opacity-[0.12]",
                  ].join(" ")}
                  style={{
                    backgroundImage: `url('${
                      heroVariant === "e"
                        ? ACADEMY_HERO_E_BG_IMAGE
                        : ACADEMY_HERO_BG_IMAGE
                    }')`,
                    backgroundSize: heroVariant === "e" ? "250% auto" : "220% auto",
                    backgroundPosition:
                      heroVariant === "e" ? "18% 42%" : "14% 36%",
                    backgroundRepeat: "no-repeat",
                    WebkitMaskImage: `url(${ACADEMY_HERO_TITLE_IMAGE})`,
                    maskImage: `url(${ACADEMY_HERO_TITLE_IMAGE})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />
              </div>

              <div className="mt-2 h-px w-56 bg-gradient-to-r from-amber-200/34 via-amber-100/10 to-transparent" />
            </>
          )}

          <p className="mt-5 max-w-[34rem] text-base font-medium leading-7 text-[#d8d0c2]/[0.74] sm:text-lg">
            Read the field. Move with intent. Raise your ELO.
          </p>

          <p className="mt-3 max-w-[37rem] text-sm leading-6 text-slate-400/[0.58]">
            Replay study, battlefield judgment, and proven advice from real players.
            A cleaner war school for players who want to improve before they wager.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#advisors"
              className="group/meet inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#9c8159]/[0.16] bg-[linear-gradient(135deg,rgba(92,64,18,0.18),rgba(3,7,18,0.54))] px-5 py-2.5 text-xs font-semibold text-[#d2c6b1]/[0.76] shadow-[0_16px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-100/40 hover:bg-amber-100/[0.075]"
            >
              Meet the advisors
              <ArrowRight className="h-3.5 w-3.5 text-[#ab9369]/[0.56] transition group-hover/meet:translate-x-1" />
            </Link>

            <Link
              href="/zodiac"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#948777]/[0.10] bg-black/20 px-5 py-2.5 text-xs font-semibold text-[#bbb3a8]/[0.68] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-violet-100/28 hover:bg-violet-300/[0.07] hover:text-slate-100"
            >
              Train under the Zodiac
              <Sparkles className="h-3.5 w-3.5 text-violet-200/75" />
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 right-6 hidden grid-cols-3 overflow-hidden rounded-[1.1rem] border border-[#8f7555]/[0.10] bg-black/22 text-left shadow-[0_18px_46px_rgba(0,0,0,0.28)] backdrop-blur-md lg:grid">
          <div className="border-r border-[#8d7b66]/[0.08] px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Doctrine
            </div>
            <div className="mt-1 text-sm font-bold text-[#c8bca8]/[0.72]">
              Field reads
            </div>
          </div>

          <div className="border-r border-[#8d7b66]/[0.08] px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Command
            </div>
            <div className="mt-1 text-sm font-bold text-[#c8bca8]/[0.72]">
              Timing
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
              Proof
            </div>
            <div className="mt-1 text-sm font-bold text-[#c8bca8]/[0.72]">
              Replay war
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
