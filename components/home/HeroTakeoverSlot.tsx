"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

function isHeroApiImage(url: string) {
  return url.startsWith("/api/hero-stage-takeover/image/");
}

function heroImageUrl(url: string, width = 1840, quality = 94) {
  if (!isHeroApiImage(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}w=${width}&fmt=webp&q=${quality}`;
}

function heroImageSrcSet(url: string) {
  if (!isHeroApiImage(url)) return undefined;

  return [
    [920, 92],
    [1280, 93],
    [1840, 94],
    [2760, 94],
    [3680, 94],
  ]
    .map(([width, quality]) => `${heroImageUrl(url, width, quality)} ${width}w`)
    .join(", ");
}

function slideKey(slide: HeroStageTakeoverSlide) {
  return slide.id || slide.imageUrl;
}

export default function HeroTakeoverSlot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeroTakeoverState | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedByKey, setLoadedByKey] = useState<Record<string, boolean>>({});
  const [displayIndex, setDisplayIndex] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [previousSlide, setPreviousSlide] = useState<HeroStageTakeoverSlide | null>(null);
  const [revealed, setRevealed] = useState(true);
  const inflightRef = useRef<Record<string, boolean>>({});

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

  const slides = useMemo(
    () => state?.slides?.filter((slide) => slide.imageUrl) || [],
    [state]
  );

  const markLoaded = useCallback((slide: HeroStageTakeoverSlide) => {
    const key = slideKey(slide);
    setLoadedByKey((current) => {
      if (current[key]) return current;
      return { ...current, [key]: true };
    });
  }, []);

  const preloadSlide = useCallback(
    (slide: HeroStageTakeoverSlide | null | undefined, priority = false) => {
      if (!slide?.imageUrl || typeof window === "undefined") return;

      const key = slideKey(slide);
      if (loadedByKey[key] || inflightRef.current[key]) return;

      inflightRef.current[key] = true;

      const img = new window.Image();
      img.decoding = "async";
      img.src = heroImageUrl(slide.imageUrl, priority ? 1840 : 1280, priority ? 94 : 92);

      const done = () => {
        markLoaded(slide);
        inflightRef.current[key] = false;
      };

      if (typeof img.decode === "function") {
        img.decode().then(done).catch(done);
      } else {
        img.onload = done;
        img.onerror = done;
      }
    },
    [loadedByKey, markLoaded]
  );

  useEffect(() => {
    setDisplayIndex(0);
    setPendingIndex(null);
    setPreviousSlide(null);
    setRevealed(true);
  }, [slides.length]);

  useEffect(() => {
    if (!slides.length) return;

    preloadSlide(slides[0], true);
    preloadSlide(slides[1], false);
  }, [preloadSlide, slides]);

  const currentSlide = slides[displayIndex] || slides[0] || null;
  const currentReady = currentSlide ? Boolean(loadedByKey[slideKey(currentSlide)]) : false;

  const commitIndex = useCallback(
    (nextIndex: number) => {
      if (!slides[nextIndex]) return;

      const transitionMs =
        state?.transitionStyle === "cut" ? 0 : Math.max(0, state?.transitionMs ?? 900);

      setPreviousSlide(slides[displayIndex] || null);
      setDisplayIndex(nextIndex);
      setPendingIndex(null);
      setRevealed(false);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setRevealed(true));
      });

      window.setTimeout(() => {
        setPreviousSlide(null);
      }, transitionMs + 80);

      preloadSlide(slides[rotateIndex(nextIndex, slides.length, 1)], false);
    },
    [displayIndex, preloadSlide, slides, state?.transitionMs, state?.transitionStyle]
  );

  const queueRotate = useCallback(
    (direction: 1 | -1) => {
      if (slides.length <= 1) return;

      const nextIndex = rotateIndex(displayIndex, slides.length, direction);
      const nextSlide = slides[nextIndex];
      if (!nextSlide) return;

      preloadSlide(nextSlide, true);

      if (loadedByKey[slideKey(nextSlide)]) {
        commitIndex(nextIndex);
      } else {
        setPendingIndex(nextIndex);
      }
    },
    [commitIndex, displayIndex, loadedByKey, preloadSlide, slides]
  );

  useEffect(() => {
    if (pendingIndex === null) return;

    const pendingSlide = slides[pendingIndex];
    if (!pendingSlide) {
      setPendingIndex(null);
      return;
    }

    if (loadedByKey[slideKey(pendingSlide)]) {
      commitIndex(pendingIndex);
    }
  }, [commitIndex, loadedByKey, pendingIndex, slides]);

  useEffect(() => {
    if (!state?.active || slides.length <= 1 || !currentReady) return;

    const interval = window.setInterval(() => {
      queueRotate(1);
    }, Math.max(2500, state.intervalMs || 8000));

    return () => window.clearInterval(interval);
  }, [currentReady, queueRotate, slides.length, state?.active, state?.intervalMs]);

  if (!ready) {
    return <>{children}</>;
  }

  if (!state?.active || slides.length < 1 || !currentSlide || !currentReady) {
    return <>{children}</>;
  }

  const href = safeHref(currentSlide.linkUrl || state.linkUrl || "/forum");
  const label = currentSlide.title || state.title || "Open AoE2WAR hero dispatch";
  const transitionMs = state.transitionStyle === "cut" ? 0 : Math.max(0, state.transitionMs ?? 900);
  const currentSrcSet = heroImageSrcSet(currentSlide.imageUrl);

  function openCurrent() {
    if (href) {
      window.location.href = href;
    }
  }

  const frameClass =
    "absolute inset-0 z-10 overflow-hidden rounded-[2rem] border border-amber-200/18 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.52)]";

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-0">
        {children}
      </div>

      <div aria-label={label} className={`${frameClass} group`}>
        {previousSlide ? (
          <picture>
            {heroImageSrcSet(previousSlide.imageUrl) ? (
              <source
                type="image/webp"
                srcSet={heroImageSrcSet(previousSlide.imageUrl)}
                sizes="min(100vw, 1840px)"
              />
            ) : null}
            <img
              src={heroImageUrl(previousSlide.imageUrl, 1840, 94)}
              alt=""
              aria-hidden="true"
              className={[
                "absolute inset-0 z-10 h-full w-full object-contain object-center transition-all ease-out",
                revealed ? "opacity-0" : "opacity-100",
                state.transitionStyle === "slide" && revealed ? "-translate-x-[1.4%]" : "translate-x-0",
              ].join(" ")}
              style={{ transitionDuration: `${transitionMs}ms` }}
              draggable={false}
            />
          </picture>
        ) : null}

        <picture>
          {currentSrcSet ? (
            <source
              type="image/webp"
              srcSet={currentSrcSet}
              sizes="min(100vw, 1840px)"
            />
          ) : null}
          <img
            src={heroImageUrl(currentSlide.imageUrl, 1840, 94)}
            alt={currentSlide.imageAlt || label}
            className={[
              "absolute inset-0 z-20 h-full w-full object-contain object-center transition-all ease-out",
              revealed ? "opacity-100" : "opacity-0",
              state.transitionStyle === "slide" && !revealed ? "translate-x-[1.4%]" : "translate-x-0",
            ].join(" ")}
            style={{ transitionDuration: `${transitionMs}ms` }}
            loading="eager"
            decoding="async"
            onLoad={() => markLoaded(currentSlide)}
            draggable={false}
          />
        </picture>

        <div className="pointer-events-none absolute inset-0 z-30 ring-1 ring-inset ring-white/10" />

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous hero image"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                queueRotate(-1);
              }}
              className="absolute inset-y-0 left-0 z-40 w-[18%] cursor-w-resize bg-transparent"
            />
            <button
              type="button"
              aria-label="Next hero image"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                queueRotate(1);
              }}
              className="absolute inset-y-0 right-0 z-40 w-[18%] cursor-e-resize bg-transparent"
            />
          </>
        ) : null}

        <button
          type="button"
          aria-label={label}
          onClick={openCurrent}
          className="absolute inset-x-[18%] inset-y-0 z-30 cursor-pointer bg-transparent"
        />

        {href ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openCurrent();
            }}
            className="absolute bottom-4 right-4 z-50 rounded-full border border-white/14 bg-black/42 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/88 shadow-[0_12px_28px_rgba(0,0,0,0.30)] backdrop-blur-md transition hover:border-amber-200/40 hover:text-amber-50 sm:bottom-5 sm:right-5"
          >
            Open the dispatch ↗
          </button>
        ) : null}

        {slides.length > 1 ? (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 gap-1.5">
            {slides.map((slide, index) => (
              <span
                key={slideKey(slide)}
                className={`h-1 rounded-full transition-all ${
                  index === displayIndex ? "w-7 bg-amber-200/90" : "w-1.5 bg-white/24"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
