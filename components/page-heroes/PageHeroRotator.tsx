"use client";

import { useEffect, useMemo, useState } from "react";

import type { PageHeroChain } from "@/lib/pageHeroes";

export default function PageHeroRotator({
  chain,
  className = "",
}: {
  chain: PageHeroChain;
  className?: string;
}) {
  const items = useMemo(
    () => chain.items.filter((item) => item.asset?.url),
    [chain.items]
  );
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (!chain.playlist.autoplay || reducedMotion || items.length <= 1) return;
    const current = items[index] || items[0];
    const dwell = current.durationMs || chain.playlist.defaultDurationMs;
    const timer = window.setTimeout(
      () => setIndex((currentIndex) => (currentIndex + 1) % items.length),
      Math.max(4000, dwell)
    );
    return () => window.clearTimeout(timer);
  }, [chain.playlist.autoplay, chain.playlist.defaultDurationMs, index, items, reducedMotion]);

  useEffect(() => {
    if (items.length <= 1) return;
    const next = items[(index + 1) % items.length]?.asset?.url;
    if (!next) return;
    const image = new Image();
    image.src = next;
  }, [index, items]);

  if (!items.length) return null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {items.map((item, itemIndex) => {
        const asset = item.asset;
        if (!asset) return null;
        const active = itemIndex === index;

        return (
          <div
            key={item.id}
            className="absolute inset-0"
            style={{
              opacity: active ? 1 : 0,
              transitionProperty: "opacity, transform",
              transitionDuration: reducedMotion
                ? "0ms"
                : `${chain.playlist.transitionDurationMs}ms`,
              transitionTimingFunction: "ease-in-out",
              transform: active ? "scale(1.012)" : "scale(1)",
            }}
          >
            <img
              src={asset.url}
              alt=""
              loading={itemIndex <= 1 ? "eager" : "lazy"}
              fetchPriority={itemIndex === 0 ? "high" : "auto"}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${item.focalX}% ${item.focalY}%` }}
            />
            <div
              className="absolute inset-0 bg-slate-950"
              style={{ opacity: item.overlayOpacity }}
            />
          </div>
        );
      })}
    </div>
  );
}
