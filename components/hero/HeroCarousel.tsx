"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { HeroScreenRenderer } from "@/components/hero/HeroScreenRenderer";
import type {
  HeroPlaylistView,
  HeroTransitionStyle,
} from "@/lib/hero/types";

function motionState(
  style: HeroTransitionStyle,
  direction: number,
  phase: "initial" | "animate" | "exit"
) {
  if (style === "cut") return { opacity: phase === "animate" ? 1 : 0 };
  if (style === "banner_wipe") {
    if (phase === "initial") {
      return {
        opacity: 1,
        clipPath:
          direction >= 0
            ? "polygon(0 0,0 0,0 100%,0 100%)"
            : "polygon(100% 0,100% 0,100% 100%,100% 100%)",
      };
    }
    if (phase === "exit") {
      return {
        opacity: 0.55,
        clipPath:
          direction >= 0
            ? "polygon(100% 0,100% 0,100% 100%,100% 100%)"
            : "polygon(0 0,0 0,0 100%,0 100%)",
      };
    }
    return { opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" };
  }
  if (style === "siege_push") {
    if (phase === "initial") return { opacity: 0, x: direction >= 0 ? "8%" : "-8%" };
    if (phase === "exit") return { opacity: 0, x: direction >= 0 ? "-5%" : "5%" };
    return { opacity: 1, x: 0 };
  }
  if (style === "ember_dissolve") {
    if (phase === "initial") return { opacity: 0, scale: 1.018, filter: "blur(12px)" };
    if (phase === "exit") return { opacity: 0, scale: 0.992, filter: "blur(10px)" };
    return { opacity: 1, scale: 1, filter: "blur(0px)" };
  }
  return { opacity: phase === "animate" ? 1 : 0 };
}

export function HeroCarousel({
  playlist,
  preview = false,
}: {
  playlist: HeroPlaylistView;
  preview?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const items = playlist.items;
  const hasMultiple = items.length > 1;
  const current = items[index] || items[0];
  const settings = playlist.playlist;
  const paused =
    pausedByUser || interactionPaused || documentHidden || Boolean(reducedMotion);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const move = useCallback(
    (nextDirection: number) => {
      if (!hasMultiple) return;
      setDirection(nextDirection);
      setIndex((currentIndex) => {
        const next = currentIndex + nextDirection;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
      setCycle((value) => value + 1);
    },
    [hasMultiple, items.length]
  );

  useEffect(() => {
    if (
      preview ||
      !hasMultiple ||
      !settings.autoplay ||
      paused ||
      !current
    ) {
      return;
    }
    const duration = current.durationMs || settings.defaultDurationMs;
    const timer = window.setTimeout(() => move(1), duration);
    return () => window.clearTimeout(timer);
  }, [
    current,
    cycle,
    hasMultiple,
    move,
    paused,
    preview,
    settings.autoplay,
    settings.defaultDurationMs,
  ]);

  if (!current) return null;

  const transitionStyle = reducedMotion ? "cut" : settings.transitionStyle;
  const transitionSeconds =
    transitionStyle === "cut" ? 0 : settings.transitionDurationMs / 1000;
  const pauseForInteraction = settings.pauseOnHover
    ? {
        onMouseEnter: () => setInteractionPaused(true),
        onMouseLeave: () => setInteractionPaused(false),
        onFocusCapture: () => setInteractionPaused(true),
        onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setInteractionPaused(false);
          }
        },
      }
    : {};

  return (
    <section
      {...pauseForInteraction}
      className="relative min-h-[46rem] overflow-hidden rounded-[2.35rem] bg-black shadow-[0_38px_130px_rgba(0,0,0,0.52)] sm:min-h-[48rem] xl:min-h-[51rem]"
      aria-roledescription="carousel"
      aria-label="AoE2WAR Main Stage"
      onPointerDown={(event) => {
        pointerStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (pointerStart.current === null) return;
        const distance = event.clientX - pointerStart.current;
        pointerStart.current = null;
        if (Math.abs(distance) > 72) move(distance > 0 ? -1 : 1);
      }}
    >
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={`${current.screen.id}-${index}`}
          className="absolute inset-0"
          initial={motionState(transitionStyle, direction, "initial")}
          animate={motionState(transitionStyle, direction, "animate")}
          exit={motionState(transitionStyle, direction, "exit")}
          transition={{
            duration: transitionSeconds,
            ease: [0.22, 1, 0.36, 1],
          }}
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${items.length}: ${current.screen.name}`}
        >
          <HeroScreenRenderer item={current} />
        </motion.div>
      </AnimatePresence>

      {hasMultiple ? (
        <>
          {settings.showArrows ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                className="absolute left-3 top-1/2 z-[120] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-white shadow-xl backdrop-blur transition hover:border-amber-200/45 hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:left-5 sm:h-12 sm:w-12"
                aria-label="Show previous Hero screen"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                className="absolute right-3 top-1/2 z-[120] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-white shadow-xl backdrop-blur transition hover:border-amber-200/45 hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:right-5 sm:h-12 sm:w-12"
                aria-label="Show next Hero screen"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          <div className="absolute bottom-4 left-1/2 z-[125] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/58 px-2.5 py-2 shadow-lg backdrop-blur sm:bottom-5">
            {settings.showDots
              ? items.map((item, itemIndex) => (
                  <button
                    key={item.screen.id}
                    type="button"
                    onClick={() => {
                      setDirection(itemIndex >= index ? 1 : -1);
                      setIndex(itemIndex);
                      setCycle((value) => value + 1);
                    }}
                    className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
                      itemIndex === index
                        ? "w-7 bg-amber-200"
                        : "w-1.5 bg-white/38 hover:bg-white/70"
                    }`}
                    aria-label={`Show ${item.screen.name}`}
                    aria-current={itemIndex === index ? "true" : undefined}
                  />
                ))
              : null}
            {settings.autoplay && !reducedMotion ? (
              <button
                type="button"
                onClick={() => setPausedByUser((value) => !value)}
                className="ml-1 grid h-6 w-6 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                aria-label={pausedByUser ? "Resume Hero rotation" : "Pause Hero rotation"}
              >
                {pausedByUser ? (
                  <Play className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Pause className="h-3.5 w-3.5 fill-current" />
                )}
              </button>
            ) : null}
          </div>

          {settings.showProgress && settings.autoplay && !preview ? (
            <div className="absolute inset-x-0 bottom-0 z-[130] h-1 bg-black/45">
              <motion.div
                key={`progress-${current.screen.id}-${cycle}-${paused}`}
                className="h-full origin-left bg-gradient-to-r from-amber-500 via-amber-200 to-sky-300"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: paused ? 0 : 1 }}
                transition={{
                  duration:
                    (current.durationMs || settings.defaultDurationMs) / 1000,
                  ease: "linear",
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
