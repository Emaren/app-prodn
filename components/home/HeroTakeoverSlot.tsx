"use client";

import type { ReactNode } from "react";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";
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

type CrossfadeLayer = {
  slide: HeroStageTakeoverSlide;
  phase: "entering" | "visible" | "leaving";
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

function layerOpacity(layer: CrossfadeLayer) {
  if (layer.phase === "visible") return "opacity-100";
  if (layer.phase === "entering") return "opacity-0";
  return "opacity-0";
}

function layerTransform(layer: CrossfadeLayer, transitionStyle: HeroStageTransitionStyle) {
  if (transitionStyle !== "slide") return "translate-x-0 scale-100";
  if (layer.phase === "entering") return "translate-x-[1.15%] scale-[1.004]";
  if (layer.phase === "leaving") return "-translate-x-[1.15%] scale-[1.004]";
  return "translate-x-0 scale-100";
}

function HeroLayer({
  layer,
  label,
  transitionMs,
  transitionStyle,
  active,
  onLoad,
}: {
  layer: CrossfadeLayer;
  label: string;
  transitionMs: number;
  transitionStyle: HeroStageTransitionStyle;
  active: boolean;
  onLoad: () => void;
}) {
  const slide = layer.slide;
  const srcSet = heroImageSrcSet(slide.imageUrl);
  const duration = transitionStyle === "cut" ? 0 : transitionMs;

  return (
    <picture key={slideKey(slide)}>
      {srcSet ? (
        <source type="image/webp" srcSet={srcSet} sizes="min(100vw, 1840px)" />
      ) : null}
      <img
        src={heroImageUrl(slide.imageUrl, 1840, 94)}
        alt={active ? slide.imageAlt || label : ""}
        aria-hidden={!active}
        className={[
          "absolute inset-0 h-full w-full object-contain object-center will-change-[opacity,transform]",
          transitionStyle === "cut" ? "" : "transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)]",
          layerOpacity(layer),
          layerTransform(layer, transitionStyle),
        ].join(" ")}
        style={{ transitionDuration: `${duration}ms` }}
        loading="eager"
        decoding="async"
        onLoad={onLoad}
        draggable={false}
      />
    </picture>
  );
}

export default function HeroTakeoverSlot({ children }: { children: ReactNode }) {
  const h = useHomeCopy();
  const [state, setState] = useState<HeroTakeoverState | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedByKey, setLoadedByKey] = useState<Record<string, boolean>>({});
  const [displayIndex, setDisplayIndex] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [layers, setLayers] = useState<CrossfadeLayer[]>([]);
  const transitionTimerRef = useRef<number | null>(null);
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
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    setDisplayIndex(0);
    setPendingIndex(null);
    setPaused(false);
    setLayers([]);
  }, [slides.length]);

  useEffect(() => {
    if (!slides.length) return;

    preloadSlide(slides[0], true);
    preloadSlide(slides[1], false);
  }, [preloadSlide, slides]);

  const currentSlide = slides[displayIndex] || slides[0] || null;
  const currentReady = currentSlide ? Boolean(loadedByKey[slideKey(currentSlide)]) : false;

  useEffect(() => {
    if (!currentSlide || !currentReady || layers.length) return;
    setLayers([{ slide: currentSlide, phase: "visible" }]);
  }, [currentReady, currentSlide, layers.length]);

  const commitIndex = useCallback(
    (nextIndex: number) => {
      if (!slides[nextIndex] || nextIndex === displayIndex) return;

      const nextSlide = slides[nextIndex];
      const activeTransitionMs =
        state?.transitionStyle === "cut" ? 0 : Math.max(0, state?.transitionMs ?? 900);

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      const currentVisibleSlide =
        layers.find((layer) => layer.phase === "visible")?.slide ||
        slides[displayIndex] ||
        currentSlide;

      setDisplayIndex(nextIndex);
      setPendingIndex(null);

      setLayers([
        ...(currentVisibleSlide
          ? [{ slide: currentVisibleSlide, phase: "visible" as const }]
          : []),
        { slide: nextSlide, phase: "entering" as const },
      ]);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setLayers([
            ...(currentVisibleSlide
              ? [{ slide: currentVisibleSlide, phase: "leaving" as const }]
              : []),
            { slide: nextSlide, phase: "visible" as const },
          ]);
        });
      });

      transitionTimerRef.current = window.setTimeout(() => {
        setLayers([{ slide: nextSlide, phase: "visible" }]);
        transitionTimerRef.current = null;
      }, activeTransitionMs + 180);

      preloadSlide(slides[rotateIndex(nextIndex, slides.length, 1)], false);
    },
    [currentSlide, displayIndex, layers, preloadSlide, slides, state?.transitionMs, state?.transitionStyle]
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
    if (!state?.active || slides.length <= 1 || !currentReady || paused) return;

    const interval = window.setInterval(() => {
      queueRotate(1);
    }, Math.max(2500, state.intervalMs || 8000));

    return () => window.clearInterval(interval);
  }, [currentReady, paused, queueRotate, slides.length, state?.active, state?.intervalMs]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  if (!ready) {
    return <>{children}</>;
  }

  if (!state?.active || slides.length < 1 || !currentSlide || !currentReady || !layers.length) {
    return <>{children}</>;
  }

  const href = safeHref(currentSlide.linkUrl || state.linkUrl || "/forum");
  const label = currentSlide.title || state.title || "Open AoE2WAR hero dispatch";
  const transitionMs = state.transitionStyle === "cut" ? 0 : Math.max(0, state.transitionMs ?? 900);

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

      <div
        aria-label={label}
        className={`${frameClass} group`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {layers.map((layer, index) => (
          <div
            key={`${slideKey(layer.slide)}-${index}`}
            className={index === layers.length - 1 ? "absolute inset-0 z-20" : "absolute inset-0 z-10"}
          >
            <HeroLayer
              layer={layer}
              label={label}
              transitionMs={transitionMs}
              transitionStyle={state.transitionStyle}
              active={slideKey(layer.slide) === slideKey(currentSlide)}
              onLoad={() => markLoaded(layer.slide)}
            />
          </div>
        ))}

        <div className="pointer-events-none absolute inset-0 z-30 ring-1 ring-inset ring-white/10" />

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              aria-label={h("Previous hero image")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                queueRotate(-1);
              }}
              className="absolute inset-y-0 left-0 z-40 w-[18%] cursor-w-resize bg-transparent"
            />
            <button
              type="button"
              aria-label={h("Next hero image")}
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
