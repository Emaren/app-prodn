"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type HeroStageTransitionStyle = "fade" | "slide" | "cut";

type HeroStageTakeoverSlide = {
  id: string;
  imageUrl: string;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  filename: string | null;
  createdAt: string;
};

type HeroTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  intervalMs: number;
  transitionMs: number;
  transitionStyle: HeroStageTransitionStyle;
  slides: HeroStageTakeoverSlide[];
};

function safeHref(value: string | null) {
  if (!value) return null;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function rotateIndex(current: number, count: number, direction: 1 | -1) {
  if (count < 1) return 0;
  return (current + direction + count) % count;
}

export default function HeroTakeoverSlot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeroTakeoverState | null>(null);
  const [ready, setReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/hero-stage-takeover", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as HeroTakeoverState | null;

        if (!cancelled && response.ok) {
          setState(payload);
        }
      })
      .catch(() => {
        if (!cancelled) setState(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const slides = useMemo(() => state?.slides?.filter((slide) => slide.imageUrl) || [], [state]);

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (!state?.active || slides.length <= 1) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => rotateIndex(current, slides.length, 1));
    }, Math.max(2500, state.intervalMs || 8000));

    return () => window.clearInterval(interval);
  }, [state?.active, state?.intervalMs, slides.length]);

  if (!ready) {
    return <>{children}</>;
  }

  if (!state?.active || slides.length < 1) {
    return <>{children}</>;
  }

  const currentSlide = slides[activeIndex] || slides[0];
  const href = safeHref(currentSlide.linkUrl || state.linkUrl || "/forum");
  const label = currentSlide.title || state.title || "Open AoE2WAR hero dispatch";
  const transitionMs = state.transitionStyle === "cut" ? 0 : Math.max(0, state.transitionMs ?? 900);

  function rotate(direction: 1 | -1) {
    setActiveIndex((current) => rotateIndex(current, slides.length, direction));
  }

  function openCurrent() {
    if (href) {
      window.location.href = href;
    }
  }

  const visual = (
    <>
      {slides.map((slide, index) => {
        const active = index === activeIndex;
        const previous = index < activeIndex;
        const useSlide = state.transitionStyle === "slide";

        return (
          <img
            key={slide.id || slide.imageUrl}
            src={slide.imageUrl}
            alt={active ? slide.imageAlt || label : ""}
            aria-hidden={!active}
            className={[
              "absolute inset-0 h-full w-full object-cover object-center",
              state.transitionStyle === "cut" ? "" : "transition-all ease-out",
              active ? "z-10 opacity-100" : "z-0 opacity-0",
              useSlide
                ? active
                  ? "translate-x-0"
                  : previous
                    ? "-translate-x-[2%]"
                    : "translate-x-[2%]"
                : "",
            ].join(" ")}
            style={{ transitionDuration: `${transitionMs}ms` }}
            draggable={false}
          />
        );
      })}

      <div className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/10" />

      {slides.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous hero image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              rotate(-1);
            }}
            className="absolute inset-y-0 left-0 z-30 w-[18%] cursor-w-resize bg-transparent"
          />
          <button
            type="button"
            aria-label="Next hero image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              rotate(1);
            }}
            className="absolute inset-y-0 right-0 z-30 w-[18%] cursor-e-resize bg-transparent"
          />
        </>
      ) : null}

      <button
        type="button"
        aria-label={label}
        onClick={openCurrent}
        className="absolute inset-x-[18%] inset-y-0 z-20 cursor-pointer bg-transparent"
      />

      {href ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openCurrent();
          }}
          className="absolute bottom-4 right-4 z-40 rounded-full border border-white/14 bg-black/42 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/88 shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-md transition hover:border-amber-200/40 hover:text-amber-50 sm:bottom-5 sm:right-5"
        >
          Open the dispatch ↗
        </button>
      ) : null}

      {slides.length > 1 ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 gap-1.5">
          {slides.map((slide, index) => (
            <span
              key={slide.id || slide.imageUrl}
              className={`h-1 rounded-full transition-all ${
                index === activeIndex ? "w-7 bg-amber-200/90" : "w-1.5 bg-white/24"
              }`}
            />
          ))}
        </div>
      ) : null}
    </>
  );

  const frameClass =
    "absolute inset-0 z-10 overflow-hidden rounded-[2rem] border border-amber-200/18 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.52)]";

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-0">
        {children}
      </div>

      <div aria-label={label} className={`${frameClass} group`}>
        {visual}
      </div>
    </div>
  );
}
