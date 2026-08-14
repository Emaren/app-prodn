"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { BattleLoopPreview } from "@/components/media/BattleLoopPreview";

type WatchPreviewScreenProps = {
  title: string;
  mediaKey: string;
  videoUrl?: string | null;
  posterUrl?: string | null;
  liveEmbedUrl?: string | null;
  large?: boolean;
  badge?: string | null;
};

function safePoster(url?: string | null) {
  if (!url) return null;
  if (url.includes("/watch/aoe2hd-screen.svg")) return null;
  return url;
}

function BroadcastPlaceholder({ showLabel }: { showLabel: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_72%_42%,rgba(168,85,247,0.13),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.05)_36%,rgba(0,0,0,0.56)_100%)]" />

      {showLabel ? (
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-5">
          <div className="whitespace-nowrap rounded-full border border-white/12 bg-white/10 px-7 py-2.5 text-[11px] font-black uppercase leading-none tracking-[0.34em] text-slate-200 shadow-[0_0_48px_rgba(125,211,252,0.18)] backdrop-blur-md">
            Broadcast ready
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WatchPreviewScreen({
  title,
  mediaKey,
  videoUrl,
  posterUrl,
  liveEmbedUrl,
  large = false,
  badge,
}: WatchPreviewScreenProps) {
  const [showLive, setShowLive] = useState(false);
  const [loopReady, setLoopReady] = useState(false);
  const [loopFailed, setLoopFailed] = useState(false);
  const [nearViewport, setNearViewport] = useState(large);
  const [hovered, setHovered] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowLive(false);
    setLoopReady(false);
    setLoopFailed(false);
  }, [mediaKey, videoUrl, liveEmbedUrl]);

  useEffect(() => {
    if (large) {
      setNearViewport(true);
      return;
    }

    const node = previewRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextNearViewport = entries.some((entry) => entry.isIntersecting);
        setNearViewport(nextNearViewport);
        if (!nextNearViewport) setLoopReady(false);
      },
      { rootMargin: "900px 0px", threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [large, mediaKey]);

  const hasLoop = Boolean(videoUrl);
  const hasLive = Boolean(liveEmbedUrl);
  const shouldShowLive = hasLive && showLive;
  const poster = safePoster(posterUrl);
  const shouldLoadLoop = large || nearViewport || hovered;

  const shouldShowPendingLabel = !shouldShowLive && (!hasLoop || loopFailed) && !hasLive;

  return (
    <div
      ref={previewRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        "group relative isolate overflow-hidden rounded-[1.35rem] border border-white/10 bg-black shadow-2xl",
        large ? "aspect-video min-h-[360px]" : "aspect-video min-h-[120px]",
      ].join(" ")}
      data-media-key={mediaKey}
    >
      {!large ? <BroadcastPlaceholder showLabel={shouldShowPendingLabel} /> : null}

      {poster && (!shouldLoadLoop || !loopReady || loopFailed) ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading={large ? "eager" : "lazy"}
          decoding="async"
        />
      ) : null}

      {hasLoop && shouldLoadLoop && !shouldShowLive ? (
        <video
          key={videoUrl}
          className={[
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            loopReady && !loopFailed ? "opacity-100" : "opacity-0",
          ].join(" ")}
          src={videoUrl || undefined}
          poster={poster || undefined}
          muted
          autoPlay
          loop
          playsInline
          preload={large ? "auto" : "metadata"}
          onLoadedData={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onCanPlay={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onError={() => {
            setLoopReady(false);
            setLoopFailed(true);
          }}
        />
      ) : null}

      {shouldShowLive ? (
        <BattleLoopPreview
          seed="aoe2war-public-battle-loop"
          className="absolute inset-0 h-full w-full rounded-none border-0"
          label="AoE2WAR battle loop"
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/78 via-black/12 to-black/20" />

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2">
        <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur">
          AOE2HD
        </span>

        {badge ? (
          <span className="rounded-full border border-sky-200/25 bg-sky-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-100 shadow-lg backdrop-blur">
            {badge}
          </span>
        ) : null}
      </div>

      {hasLive && !shouldShowLive ? (
        <button
          type="button"
          onClick={() => setShowLive(true)}
          className={[
            "absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
            "border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md transition duration-200",
            "hover:scale-105 hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-sky-300",
            large ? "h-20 w-20" : "h-14 w-14",
          ].join(" ")}
          aria-label={`Play live stream for ${title}`}
        >
          <span
            className={[
              "ml-1 block h-0 w-0 border-y-transparent border-l-white",
              large ? "border-y-[16px] border-l-[25px]" : "border-y-[11px] border-l-[17px]",
            ].join(" ")}
          />
        </button>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30">
        <div className="truncate text-sm font-black text-white drop-shadow-lg">
          {title}
        </div>
      </div>
    </div>
  );
}

export default WatchPreviewScreen;
