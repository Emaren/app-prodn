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
  initSeq: number | null;
  recommendedStartSeq: number | null;
  chunkUrlTemplate: string;
};

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
    const queue: ArrayBuffer[] = [];
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);

    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const pump = () => {
      if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;

      try {
        sourceBuffer.appendBuffer(queue.shift() as ArrayBuffer);
      } catch {
        setFallback(true);
      }
    };

    const nudgeLiveEdge = () => {
      if (!video.buffered.length) return;
      const index = video.buffered.length - 1;
      const end = video.buffered.end(index);
      const start = video.buffered.start(index);
      if (Number.isFinite(end) && end - video.currentTime > 7) {
        video.currentTime = Math.max(start, end - 4);
      }
      void video.play().catch(() => undefined);
    };

    const enqueueChunk = async (sequence: number, template: string) => {
      if (fetched.has(sequence) || cancelled) return;
      fetched.add(sequence);

      const response = await fetch(template.replace("{sequence}", String(sequence)), {
        cache: "no-store",
      });
      if (!response.ok) return;

      queue.push(await response.arrayBuffer());
      pump();
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
          return;
        }

        if (!sourceBuffer && sourceReady) {
          const mimeType = chooseSourceBufferMimeType(manifest.mediaMimeType);
          if (!mimeType) {
            setFallback(true);
            return;
          }
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          sourceBuffer.mode = "sequence";
          sourceBuffer.addEventListener("updateend", () => {
            setWarming(false);
            pump();
            nudgeLiveEdge();
          });
        }

        if (!sourceBuffer) return;

        if (manifest.initSeq !== null) {
          await enqueueChunk(manifest.initSeq, manifest.chunkUrlTemplate);
        }

        if (nextSeq === null) {
          nextSeq = Math.max(1, manifest.recommendedStartSeq ?? 0);
        }

        for (let sequence = nextSeq; sequence <= manifest.latestSeq; sequence += 1) {
          await enqueueChunk(sequence, manifest.chunkUrlTemplate);
        }

        nextSeq = manifest.latestSeq + 1;
        pump();
      } catch {
        setFallback(true);
      }
    };

    const handleSourceOpen = () => {
      sourceReady = true;
      void poll();
    };

    mediaSource.addEventListener("sourceopen", handleSourceOpen);
    const interval = window.setInterval(() => {
      void poll();
    }, compact ? 2_800 : 1_800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      mediaSource.removeEventListener("sourceopen", handleSourceOpen);
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
            Live
          </div>
        </div>
      ) : null}
    </>
  );
}
