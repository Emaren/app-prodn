"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "aoe2hdbets.watch.previewDisabled";

type Props = {
  title: string;
  mediaKey: string;
  videoUrl?: string | null;
  posterUrl?: string | null;
  liveEmbedUrl?: string | null;
  large?: boolean;
  badge?: string;
};

export default function WatchPreviewScreen({
  title,
  mediaKey,
  videoUrl,
  posterUrl,
  liveEmbedUrl,
  large = false,
  badge = "BEST OF",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [ready, setReady] = useState(false);

  const storageKey = useMemo(() => mediaKey || title, [mediaKey, title]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      setDisabled(Boolean(parsed[storageKey]));
    } catch {
      setDisabled(false);
    }

    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    if (disabled) {
      video.pause();
      return;
    }

    video.muted = true;
    video.play().catch(() => {
      // Browser may block occasionally; the user can tap play.
    });
  }, [disabled, ready, videoUrl]);

  function togglePlayback() {
    const nextDisabled = !disabled;
    setDisabled(nextDisabled);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};

      if (nextDisabled) {
        parsed[storageKey] = true;
      } else {
        delete parsed[storageKey];
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // Non-fatal.
    }
  }

  const showHostedVideo = Boolean(videoUrl);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {showHostedVideo ? (
        <video
          ref={videoRef}
          src={videoUrl || undefined}
          poster={posterUrl || "/watch/aoe2hd-screen.svg"}
          muted
          loop
          playsInline
          preload={large ? "auto" : "metadata"}
          autoPlay={!disabled}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : liveEmbedUrl ? (
        <iframe
          title={`${title} live preview`}
          src={liveEmbedUrl}
          loading={large ? "eager" : "lazy"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0 bg-black"
        />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-95"
          style={{ backgroundImage: `url('${posterUrl || "/watch/aoe2hd-screen.svg"}')` }}
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.06)_48%,rgba(0,0,0,0.62)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/84 via-black/38 to-transparent" />

      <div
        className={`pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 font-semibold text-white ${
          large ? "text-xs" : "text-[10px]"
        }`}
      >
        AOE2HD
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          togglePlayback();
        }}
        className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 font-semibold transition ${
          disabled
            ? "border-white/20 bg-black/55 text-white"
            : "border-red-300/25 bg-red-500/25 text-red-100"
        } ${large ? "text-xs" : "text-[10px]"}`}
        title={disabled ? "Autoplay off for this tile" : "Autoplay on for this tile"}
      >
        {disabled ? "PAUSED" : badge}
      </button>

      {disabled && showHostedVideo ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePlayback();
          }}
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-2xl transition hover:bg-black/70"
          title="Play preview"
        >
          ▶
        </button>
      ) : null}
    </div>
  );
}
