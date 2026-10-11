"use client";

import { useEffect, useRef, useState } from "react";
import type { WatchStreamPayload } from "@/lib/watchStreams";

// SourceBuffer is bounded independently of the uploader's long-match archive.
const POLL_MS = 1_500;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CATCHUP_CHUNKS = 36;
const KEEP_BEHIND_SECONDS = 45;
const LIVE_MARGIN_SECONDS = 2.5;

type Manifest = {
  status: string;
  stale: boolean;
  mediaMimeType: string;
  initSeq: number | null;
  latestSeq: number;
  newestAvailableSeq: number;
  recommendedStartSeq: number | null;
  availableMediaSeqs: number[];
};

export function supportsContinuousWebm(mime: string) {
  return typeof window !== "undefined" &&
    typeof MediaSource !== "undefined" &&
    typeof MediaSource.isTypeSupported === "function" &&
    /^video\/webm(?:;|$)/i.test(mime.trim()) &&
    MediaSource.isTypeSupported(mime);
}

function bufferedTail(video: HTMLVideoElement): number | null {
  const ranges = video.buffered;
  return ranges.length ? ranges.end(ranges.length - 1) : null;
}

function seekNearEdge(video: HTMLVideoElement) {
  const end = bufferedTail(video);
  if (end === null) return;
  const desired = Math.max(0, end - LIVE_MARGIN_SECONDS);
  // Do not force-seek each second: a normal decoder should play continuously.
  if (!Number.isFinite(video.currentTime) || video.currentTime < desired - 5 ||
      video.currentTime > end + 0.5) {
    try { video.currentTime = desired; } catch { /* Media not seekable yet. */ }
  }
  if (video.paused) void video.play().catch(() => undefined);
}

export default function ContinuousWebmPlayer({
  stream,
  title,
  onUnsupported,
}: {
  stream: WatchStreamPayload;
  title: string;
  onUnsupported: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState("Connecting live video");

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof window === "undefined") return;
    const failures = new Set<AbortController>();
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    let stopped = false;
    let failed = false;
    let sourceBuffer: SourceBuffer | null = null;
    let timer: number | null = null;
    let lastSeq = -1;
    let busy = false;
    let initialized = false;
    let finalSeen = false;
    let appendedFrames = false;

    video.muted = true;
    video.playsInline = true;

    const fail = () => {
      if (stopped || failed) return;
      failed = true;
      for (const controller of failures) controller.abort();
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      onUnsupported();
    };

    const request = async (url: string, limit: number) => {
      const controller = new AbortController();
      failures.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Video data unavailable");
        const advertised = Number(response.headers.get("content-length"));
        if (advertised > limit) throw new Error("Video chunk exceeds the bounded limit");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > limit) throw new Error("Video payload too large");
        return buffer;
      } finally {
        window.clearTimeout(timeout);
        failures.delete(controller);
      }
    };

    const append = async (data: ArrayBuffer) => {
      const buffer = sourceBuffer;
      if (!buffer || stopped || failed) throw new Error("Decoder closed");
      await new Promise<void>((resolve, reject) => {
        const clean = () => {
          buffer.removeEventListener("updateend", success);
          buffer.removeEventListener("error", problem);
          buffer.removeEventListener("abort", problem);
        };
        const success = () => { clean(); resolve(); };
        const problem = () => { clean(); reject(new Error("Decoder append failed")); };
        buffer.addEventListener("updateend", success, { once: true });
        buffer.addEventListener("error", problem, { once: true });
        buffer.addEventListener("abort", problem, { once: true });
        try { buffer.appendBuffer(data); } catch (error) { clean(); reject(error); }
      });
    };

    const trim = async () => {
      const buffer = sourceBuffer;
      if (!buffer || stopped || failed || !buffer.buffered.length) return;
      const end = buffer.buffered.end(buffer.buffered.length - 1);
      const start = buffer.buffered.start(0);
      const cutoff = Math.max(0, end - KEEP_BEHIND_SECONDS);
      if (cutoff <= start + 5) return;
      await new Promise<void>((resolve, reject) => {
        const clean = () => {
          buffer.removeEventListener("updateend", done);
          buffer.removeEventListener("error", bad);
          buffer.removeEventListener("abort", bad);
        };
        const done = () => { clean(); resolve(); };
        const bad = () => { clean(); reject(new Error("Decoder trim failed")); };
        buffer.addEventListener("updateend", done, { once: true });
        buffer.addEventListener("error", bad, { once: true });
        buffer.addEventListener("abort", bad, { once: true });
        try { buffer.remove(start, cutoff); } catch (error) { clean(); reject(error); }
      });
    };

    const poll = async () => {
      if (stopped || failed || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const manifestBytes = await request(
          `/api/streams/${stream.id}/manifest`, 200_000,
        );
        const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
        if (stopped || failed || document.visibilityState !== "visible") return;
        if (manifest.stale) {
          setState("Waiting for broadcaster");
          return;
        }
        if (manifest.initSeq !== 0) {
          setState("Waiting for video initialization");
          return;
        }
        if (!supportsContinuousWebm(manifest.mediaMimeType) ||
            manifest.mediaMimeType !== stream.mediaMimeType) {
          fail();
          return;
        }
        const newest = manifest.newestAvailableSeq ?? manifest.latestSeq;
        if (newest < 1) {
          setState("Waiting for first video frame");
          return;
        }
        if (!initialized) {
          await append(await request(`/api/streams/${stream.id}/chunks/0`, MAX_CHUNK_BYTES));
          initialized = true;
          lastSeq = Math.max(0, manifest.recommendedStartSeq ?? newest - 10);
          lastSeq = Math.min(lastSeq, newest - 1);
        }
        const backlog = newest - lastSeq;
        if (backlog > MAX_CATCHUP_CHUNKS) {
          // Can't safely skip clusters in an append-only decoder: recover via
          // the certified rolling-window player, not an unbounded download.
          fail();
          return;
        }
        const available = new Set(manifest.availableMediaSeqs || []);
        for (let seq = lastSeq + 1; seq <= newest; seq += 1) {
          if (stopped || failed || document.visibilityState !== "visible") return;
          if (!available.has(seq)) {
            setState("Waiting for missing video chunk");
            return;
          }
          await append(await request(`/api/streams/${stream.id}/chunks/${seq}`, MAX_CHUNK_BYTES));
          lastSeq = seq;
          appendedFrames = true;
          if (seq % 5 === 0) {
            await trim();
            seekNearEdge(video);
          }
        }
        if (appendedFrames) {
          seekNearEdge(video);
          setState("Live");
        }
        if (manifest.status === "ended" && lastSeq === newest && !finalSeen &&
            mediaSource.readyState === "open" && !sourceBuffer?.updating) {
          finalSeen = true;
          mediaSource.endOfStream();
        }
      } catch {
        if (!stopped && document.visibilityState === "visible") {
          // Network retries are bounded by one in-flight poll. MediaSource
          // errors trigger explicit fallback rather than a false healthy badge.
          setState("Recovering live signal");
        }
      } finally {
        busy = false;
      }
    };

    const started = () => {
      if (stopped) return;
      try {
        const mime = stream.mediaMimeType || "video/webm;codecs=vp8,opus";
        if (!supportsContinuousWebm(mime)) return fail();
        sourceBuffer = mediaSource.addSourceBuffer(mime);
        void poll();
        timer = window.setInterval(() => { void poll(); }, POLL_MS);
      } catch { fail(); }
    };
    const decoderFailure = () => { fail(); };
    const resume = () => {
      if (document.visibilityState === "hidden") {
        for (const controller of failures) controller.abort();
        video.pause();
      } else if (!stopped && !failed) {
        void poll();
      }
    };
    const playing = () => setState("Live");
    const waiting = () => { if (!failed) setState("Buffering video"); };
    mediaSource.addEventListener("sourceopen", started, { once: true });
    video.addEventListener("error", decoderFailure);
    video.addEventListener("playing", playing);
    video.addEventListener("waiting", waiting);
    document.addEventListener("visibilitychange", resume);
    video.src = objectUrl;

    return () => {
      stopped = true;
      for (const controller of failures) controller.abort();
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      video.removeEventListener("error", decoderFailure);
      video.removeEventListener("playing", playing);
      video.removeEventListener("waiting", waiting);
      mediaSource.removeEventListener("sourceopen", started);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [onUnsupported, stream.id, stream.mediaMimeType]);

  return (
    <>
      <video ref={ref} className="absolute inset-0 h-full w-full bg-black object-cover"
        autoPlay muted playsInline controls aria-label={`${title} live video`} />
      <span aria-live="polite" className="pointer-events-none absolute bottom-12 left-3 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs text-white">
        {state}
      </span>
    </>
  );
}
