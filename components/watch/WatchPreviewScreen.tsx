"use client";

import { useEffect, useState } from "react";

type WatchPreviewScreenProps = {
  title: string;
  mediaKey: string;
  videoUrl?: string | null;
  posterUrl?: string | null;
  liveEmbedUrl?: string | null;
  large?: boolean;
  badge?: string | null;
};

export default function WatchPreviewScreen({
  title,
  mediaKey,
  videoUrl,
  posterUrl,
  liveEmbedUrl,
  large = false,
  badge = null,
}: WatchPreviewScreenProps) {
  const [showLive, setShowLive] = useState(false);

  useEffect(() => {
    setShowLive(false);
  }, [mediaKey]);

  const shouldShowLive = Boolean(liveEmbedUrl && showLive);
  const canOpenLive = Boolean(liveEmbedUrl && !showLive);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-black shadow-2xl",
        large ? "aspect-video min-h-[360px]" : "aspect-video min-h-[120px]",
      ].join(" ")}
      data-media-key={mediaKey}
    >
      {shouldShowLive ? (
        <iframe
          title={`${title} live stream`}
          src={liveEmbedUrl || ""}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
        />
      ) : videoUrl ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={videoUrl}
          poster={posterUrl || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(125,211,252,0.22),rgba(15,23,42,0.30)_34%,rgba(0,0,0,0.96)_78%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(56,189,248,0.18),transparent_24%,rgba(0,0,0,0.54)_66%,rgba(0,0,0,0.92)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.04)_38%,rgba(0,0,0,0.72))]" />
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-5">
            <div className="whitespace-nowrap rounded-full border border-white/12 bg-white/10 px-7 py-2.5 text-[11px] font-black uppercase leading-none tracking-[0.34em] text-slate-200 shadow-[0_0_48px_rgba(125,211,252,0.18)] backdrop-blur-md">
              Preview pending
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />

      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-full border border-white/10 bg-black/65 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">
          AoE2HD
        </span>
        {badge ? (
          <span className="rounded-full border border-sky-200/20 bg-sky-300/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-sky-50">
            {badge}
          </span>
        ) : null}
      </div>

      {canOpenLive ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setShowLive(true);
          }}
          aria-label={`Play ${title} live stream`}
          className="absolute left-1/2 top-1/2 z-20 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-[0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:scale-105 hover:bg-black/60"
        >
          <span className="ml-1 block h-0 w-0 border-y-[12px] border-l-[18px] border-y-transparent border-l-white" />
        </button>
      ) : null}
    </div>
  );
}
