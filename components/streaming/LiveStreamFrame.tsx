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
  chunkCount?: number;
  initSeq: number | null;
  recommendedStartSeq: number | null;
  chunkUrlTemplate: string;
};

type QueuedChunk = {
  sequence: number;
  buffer: ArrayBuffer;
};

const LIVE_BACKLOG_CHUNKS = 8;
const MAX_CHUNKS_PER_POLL = 14;

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

function chooseSourceBufferMimeType(raw: string) {
  const candidates = [raw, "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  return candidates.find((candidate) => {
    try {
      return Boolean(candidate) && MediaSource.isTypeSupported(candidate);
    } catch {
      return false;
    }
  });
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
  const [fallback, setFallback] = useState(false);
  const [warming, setWarming] = useState(true);
  const [signalLabel, setSignalLabel] = useState("Catching live edge");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window === "undefined" || !("MediaSource" in window)) {
      setFallback(true);
      return;
    }

    let cancelled = false;
    let sourceBuffer: SourceBuffer | null = null;
    let sourceReady = false;
    let nextSeq: number | null = null;
    const fetched = new Set<number>();
    const failedAttempts = new Map<number, number>();
    const queue: QueuedChunk[] = [];
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const liveLagSeconds = compact ? 1.4 : 2.4;

    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const pump = () => {
      if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;

      const nextChunk = queue.shift() as QueuedChunk;
      try {
        sourceBuffer.appendBuffer(nextChunk.buffer);
      } catch {
        queue.unshift(nextChunk);
        setSignalLabel("Reconnecting live edge");
        setWarming(true);
        try {
          sourceBuffer.abort();
        } catch {
          // The buffer may already be recovering.
        }
      }
    };

    const nudgeLiveEdge = () => {
      if (!video.buffered.length) {
        setWarming(true);
        return;
      }
      const index = video.buffered.length - 1;
      const end = video.buffered.end(index);
      const start = video.buffered.start(index);
      if (!Number.isFinite(end)) return;

      if (
        video.currentTime < start ||
        end - video.currentTime > (compact ? 4 : 7) ||
        video.paused
      ) {
        video.currentTime = Math.max(start, end - liveLagSeconds);
      }
      void video.play().catch(() => undefined);
      if (video.readyState >= 2) {
        setWarming(false);
      }
    };

    const enqueueChunk = async (sequence: number, template: string) => {
      if (fetched.has(sequence)) return true;
      if (cancelled) return false;
      const attempts = failedAttempts.get(sequence) ?? 0;
      if (attempts >= 3) {
        fetched.add(sequence);
        return true;
      }

      const response = await fetch(template.replace("{sequence}", String(sequence)), {
        cache: "no-store",
      });
      if (!response.ok) {
        failedAttempts.set(sequence, attempts + 1);
        return false;
      }

      failedAttempts.delete(sequence);
      fetched.add(sequence);
      queue.push({
        sequence,
        buffer: await response.arrayBuffer(),
      });
      pump();
      return true;
    };

    const firstMediaSequence = (manifest: StreamManifest) => {
      if (manifest.latestSeq <= MAX_CHUNKS_PER_POLL) {
        return manifest.initSeq === null ? 0 : Math.max(1, manifest.initSeq + 1);
      }

      const recommended =
        manifest.recommendedStartSeq ??
        Math.max(0, manifest.latestSeq - LIVE_BACKLOG_CHUNKS);
      return manifest.initSeq === null ? recommended : Math.max(1, recommended);
    };

    const poll = async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`/api/streams/${stream.id}/manifest`, {
          cache: "no-store",
        });
        if (!response.ok) {
          setFallback(true);
          return;
        }

        const manifest = (await response.json()) as StreamManifest;
        if (manifest.latestSeq < 0 || manifest.stale) {
          setWarming(true);
          setSignalLabel(manifest.stale ? "Waiting for streamer" : "Signal warming");
          return;
        }

        if (!sourceBuffer && sourceReady) {
          const mimeType = chooseSourceBufferMimeType(manifest.mediaMimeType);
          if (!mimeType) {
            setFallback(true);
            return;
          }
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          mediaSource.duration = Number.POSITIVE_INFINITY;
          try {
            sourceBuffer.mode = "sequence";
          } catch {
            // Some WebView builds keep the default segments mode. Continue and let MSE decide.
          }
          sourceBuffer.addEventListener("updateend", () => {
            setWarming(false);
            pump();
            nudgeLiveEdge();
          });
          sourceBuffer.addEventListener("error", () => {
            setSignalLabel("Reconnecting live edge");
            setWarming(true);
          });
        }

        if (!sourceBuffer) return;

        if (manifest.initSeq !== null) {
          await enqueueChunk(manifest.initSeq, manifest.chunkUrlTemplate);
        }

        if (nextSeq === null) {
          nextSeq = firstMediaSequence(manifest);
        }

        const fetchThrough = Math.min(manifest.latestSeq, nextSeq + MAX_CHUNKS_PER_POLL - 1);
        let advancedThrough = nextSeq - 1;
        for (let sequence = nextSeq; sequence <= fetchThrough; sequence += 1) {
          const queued = await enqueueChunk(sequence, manifest.chunkUrlTemplate);
          if (!queued) {
            setSignalLabel("Catching live edge");
            setWarming(true);
            break;
          }
          advancedThrough = sequence;
        }

        nextSeq = advancedThrough + 1;
        if (nextSeq <= manifest.latestSeq) {
          setSignalLabel("Catching live edge");
          setWarming(true);
        }
        pump();
        nudgeLiveEdge();
      } catch {
        setSignalLabel("Reconnecting live edge");
        setWarming(true);
      }
    };

    const handleSourceOpen = () => {
      sourceReady = true;
      void poll();
    };

    const handlePlaying = () => {
      setWarming(false);
    };
    const handleWaiting = () => {
      setSignalLabel("Catching live edge");
      setWarming(true);
      nudgeLiveEdge();
    };
    const handleVideoError = () => {
      setSignalLabel("Reconnecting live edge");
      setWarming(true);
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("error", handleVideoError);
    const interval = window.setInterval(() => {
      void poll();
    }, compact ? 2_200 : 1_250);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      mediaSource.removeEventListener("sourceopen", handleSourceOpen);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("error", handleVideoError);
      try {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream();
        }
      } catch {
        // Best-effort cleanup only.
      }
      URL.revokeObjectURL(objectUrl);
    };
  }, [compact, stream.id]);

  if (fallback) {
    return <StreamPoster stream={stream} compact={compact} fallbackLabel="Live" />;
  }

  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-cover"
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
