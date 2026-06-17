"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Monitor, Play, Radio } from "lucide-react";

import type { WatchStreamPayload } from "@/lib/watchStreams";

type Props = {
  stream?: WatchStreamPayload | null;
  title: string;
  compact?: boolean;
  className?: string;
  fallbackLabel?: string;
};

type StreamManifest = {
  status: string;
  stale: boolean;
  mediaMimeType: string;
  latestSeq: number;
  newestAvailableSeq?: number;
  chunkCount?: number;
  initSeq: number | null;
  recommendedStartSeq: number | null;
  availableSeqs?: number[];
  availableMediaSeqs?: number[];
  chunkUrlTemplate: string;
};

const ROLLING_WINDOW_CHUNKS = 36;
const ROLLING_COMPACT_WINDOW_CHUNKS = 14;
const ROLLING_REFRESH_ADVANCE = 6;
const ROLLING_COMPACT_REFRESH_ADVANCE = 5;

function providerLabel(stream: WatchStreamPayload) {
  if (stream.provider === "aoe2war") return "AoE2WAR";
  if (stream.provider === "twitch") return "Twitch";
  if (stream.provider === "youtube") return "YouTube";
  if (stream.provider === "steam") return "Steam";
  if (stream.provider === "discord") return "Discord";
  return "External";
}

function buildEmbedSrc(stream: WatchStreamPayload, browserHost: string) {
  if (!stream.embedId || !stream.canEmbed) return null;

  if (stream.provider === "twitch") {
    const parent = encodeURIComponent(browserHost || "aoe2war.com");
    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      stream.embedId
    )}&parent=${parent}&autoplay=false&muted=false`;
  }

  if (stream.provider === "youtube") {
    return `https://www.youtube.com/embed/${encodeURIComponent(
      stream.embedId
    )}?rel=0&modestbranding=1&playsinline=1`;
  }

  return null;
}

export default function LiveStreamFrame({
  stream,
  title,
  compact = false,
  className = "",
  fallbackLabel = "Stream ready",
}: Props) {
  const [browserHost, setBrowserHost] = useState("aoe2war.com");
  const isBrowserStream = stream?.provider === "aoe2war" || stream?.sourceType === "browser";
  const embedSrc = useMemo(
    () => (stream && !isBrowserStream ? buildEmbedSrc(stream, browserHost) : null),
    [browserHost, isBrowserStream, stream]
  );

  useEffect(() => {
    setBrowserHost(window.location.hostname || "aoe2war.com");
  }, []);

  return (
    <div
      className={[
        "group relative isolate overflow-hidden rounded-[1.15rem] border border-white/10 bg-black shadow-[0_20px_70px_rgba(0,0,0,0.34)]",
        compact ? "aspect-video min-h-[8rem]" : "aspect-video min-h-[18rem]",
        className,
      ].join(" ")}
    >
      {isBrowserStream && stream ? (
        <BrowserChunkPlayer stream={stream} title={title} compact={compact} />
      ) : embedSrc ? (
        <iframe
          src={embedSrc}
          title={`${title} stream`}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      ) : (
        <StreamPoster stream={stream} compact={compact} fallbackLabel={fallbackLabel} />
      )}

      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/76 via-black/10 to-black/20" />

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-30" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
        <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/85 backdrop-blur">
          {stream ? providerLabel(stream) : fallbackLabel}
        </span>
      </div>

      {!compact ? (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30">
          <div className="truncate text-base font-black text-white drop-shadow-lg">
            {stream?.title || stream?.label || title}
          </div>
        </div>
      ) : null}

      {stream && !isBrowserStream && !embedSrc ? (
        <a
          href={stream.url}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-3 right-3 z-40 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur transition hover:bg-black/70"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Open
        </a>
      ) : null}
    </div>
  );
}

function StreamPoster({
  stream,
  compact,
  fallbackLabel,
}: {
  stream?: WatchStreamPayload | null;
  compact: boolean;
  fallbackLabel: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_72%_42%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,#020617,#050816_48%,#0f172a)]">
      {stream?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stream.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.055),transparent_36%,rgba(255,255,255,0.035))]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_12px)] opacity-45" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid place-items-center gap-3 text-white/74">
          {stream ? (
            <Play className={compact ? "h-8 w-8" : "h-14 w-14"} aria-hidden="true" />
          ) : (
            <Monitor className={compact ? "h-8 w-8" : "h-14 w-14"} aria-hidden="true" />
          )}
          {!compact ? (
            <span className="rounded-full border border-white/10 bg-black/35 px-4 py-1.5 text-xs uppercase tracking-[0.24em]">
              {stream ? "Signal warming" : fallbackLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BrowserChunkPlayer({
  stream,
  title,
  compact,
}: {
  stream: WatchStreamPayload;
  title: string;
  compact: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastLoadedSeqRef = useRef<number | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const [warming, setWarming] = useState(true);
  const [signalLabel, setSignalLabel] = useState("Catching live edge");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window === "undefined") {
      return;
    }

    lastLoadedSeqRef.current = null;
    let cancelled = false;
    let pollInFlight = false;
    let pendingRefresh = false;
    let durationProbePending = false;
    const liveLagSeconds = compact ? 0.9 : 1.8;
    const windowChunks = compact ? ROLLING_COMPACT_WINDOW_CHUNKS : ROLLING_WINDOW_CHUNKS;
    const refreshAdvance = compact ? ROLLING_COMPACT_REFRESH_ADVANCE : ROLLING_REFRESH_ADVANCE;

    video.muted = true;
    video.playsInline = true;

    const revokeCurrentObjectUrl = () => {
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };

    const nudgeRollingEdge = () => {
      const seekableEnd = video.seekable.length
        ? video.seekable.end(video.seekable.length - 1)
        : null;
      const liveEnd = Number.isFinite(video.duration)
        ? video.duration
        : seekableEnd && Number.isFinite(seekableEnd)
          ? seekableEnd
          : null;

      if (liveEnd && liveEnd > liveLagSeconds + 0.5) {
        durationProbePending = false;
        const target = Math.max(0, liveEnd - liveLagSeconds);
        if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - target) > 1.6) {
          try {
            video.currentTime = target;
          } catch {
            // Some partial WebM windows refuse seeking until a later readyState.
          }
        }
      } else if (!durationProbePending && video.duration === Number.POSITIVE_INFINITY) {
        durationProbePending = true;
        try {
          video.currentTime = 1e9;
        } catch {
          durationProbePending = false;
        }
      }

      void video.play().catch(() => undefined);
    };

    const loadRollingWindow = async (endSeq: number) => {
      const rollingUrl = `/api/streams/${stream.id}/rolling-webm?end=${endSeq}&window=${windowChunks}&v=${Date.now()}`;
      const response = await fetch(rollingUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Rolling stream slice unavailable.");
      }

      const blob = await response.blob();
      if (blob.size <= 0) {
        throw new Error("Rolling stream slice is empty.");
      }

      const objectUrl = URL.createObjectURL(blob);
      revokeCurrentObjectUrl();
      currentObjectUrlRef.current = objectUrl;
      video.src = objectUrl;
      video.load();
      lastLoadedSeqRef.current = endSeq;
      setSignalLabel(stream.status === "ended" ? "Saved Battle Cam" : "Catching live edge");
      setWarming(stream.status !== "ended");
    };

    const poll = async () => {
      if (cancelled || pollInFlight) {
        pendingRefresh = true;
        return;
      }

      pollInFlight = true;
      try {
        const response = await fetch(`/api/streams/${stream.id}/manifest`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const manifest = (await response.json()) as StreamManifest;
        const availableMediaSeqs = (manifest.availableMediaSeqs ?? []).filter((sequence) => sequence > 0);
        const newestAvailableSeq =
          availableMediaSeqs[availableMediaSeqs.length - 1] ??
          manifest.newestAvailableSeq ??
          manifest.latestSeq;

        if (manifest.stale) {
          setWarming(true);
          setSignalLabel(stream.status === "ended" ? "Saved Battle Cam" : "Waiting for streamer");
          return;
        }

        if (manifest.latestSeq < 0 || newestAvailableSeq < 1) {
          setWarming(true);
          setSignalLabel(stream.status === "ended" ? "Replay warming" : "Signal warming");
          return;
        }

        const lastLoadedSeq = lastLoadedSeqRef.current;
        const shouldRefresh =
          lastLoadedSeq === null ||
          newestAvailableSeq - lastLoadedSeq >= refreshAdvance ||
          (video.paused && video.readyState < 2);

        if (shouldRefresh) {
          await loadRollingWindow(newestAvailableSeq);
        } else if (video.readyState >= 2) {
          nudgeRollingEdge();
        }
      } catch {
        setSignalLabel(stream.status === "ended" ? "Saved Battle Cam" : "Reconnecting live edge");
        setWarming(stream.status !== "ended");
      } finally {
        pollInFlight = false;
        if (pendingRefresh && !cancelled) {
          pendingRefresh = false;
          window.setTimeout(() => {
            void poll();
          }, 250);
        }
      }
    };

    const handleLoadedMetadata = () => nudgeRollingEdge();
    const handleCanPlay = () => nudgeRollingEdge();
    const handleDurationChange = () => nudgeRollingEdge();
    const handlePlaying = () => {
      setWarming(false);
    };
    const handleWaiting = () => {
      setSignalLabel(stream.status === "ended" ? "Saved Battle Cam" : "Catching live edge");
      setWarming(stream.status !== "ended");
    };
    const handleVideoError = () => {
      setSignalLabel(stream.status === "ended" ? "Saved Battle Cam" : "Reconnecting live edge");
      setWarming(stream.status !== "ended");
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("error", handleVideoError);
    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, compact ? 4_000 : 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("error", handleVideoError);
      revokeCurrentObjectUrl();
    };
  }, [compact, stream.id]);

  return (
    <>
      <StreamPoster stream={stream} compact={compact} fallbackLabel="Live" />
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-cover"
        poster={stream.thumbnailUrl ?? undefined}
        muted
        autoPlay
        playsInline
        controls={!compact}
        aria-label={`${title} live stream`}
      />
      {warming ? (
        <div className="absolute inset-0 grid place-items-center bg-black/35 text-white/78">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-4 py-2 text-xs uppercase tracking-[0.22em] backdrop-blur">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {signalLabel}
          </div>
        </div>
      ) : null}
    </>
  );
}
