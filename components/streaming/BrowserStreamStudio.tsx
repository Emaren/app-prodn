"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Clock3,
  Copy,
  Link2,
  Monitor,
  Play,
  Radio,
  Square,
  Video,
} from "lucide-react";

import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type LiveGamesSuggestion = {
  sessionKey: string;
  title: string;
  mapName: string | null;
  state?: string;
};

type Props = {
  sessionKey?: string | null;
  title?: string | null;
  playerLabel?: string | null;
  compact?: boolean;
  watcherIntent?: boolean;
};

const CHUNK_TIMESLICE_MS = 2_000;
const HEARTBEAT_MS = 8_000;
const ACTIVE_STREAM_REFRESH_MS = 12_000;
const MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "video/webm";
}

function buildFreeSessionKey() {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return `free:${id}`;
}

function matchTitle(session: LiveGamesSuggestion | null, fallback: string | null | undefined) {
  if (session?.title) return session.title;
  if (fallback?.trim()) return fallback.trim();
  return "AoE2WAR live";
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as (T & { detail?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.detail || "Request failed.");
  }
  return payload;
}

function isActiveStream(stream: WatchStreamPayload | null) {
  return stream?.status === "live" || stream?.status === "starting";
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 1) return "0s";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (minutes < 1) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes % 60}m`;
}

function secondsSince(value: string | null | undefined, now: number) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((now - timestamp) / 1000));
}

function isWatcherBound(sessionKeyValue: string) {
  return Boolean(sessionKeyValue) && !sessionKeyValue.startsWith("free:");
}

function watchHref(sessionKeyValue: string) {
  return `/watch/${encodeURIComponent(sessionKeyValue)}`;
}

export default function BrowserStreamStudio({
  sessionKey,
  title,
  playerLabel,
  compact = false,
  watcherIntent = false,
}: Props) {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const [captureReady, setCaptureReady] = useState(false);
  const [stream, setStream] = useState<WatchStreamPayload | null>(null);
  const [suggestions, setSuggestions] = useState<LiveGamesSuggestion[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(sessionKey || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [mediaMimeType, setMediaMimeType] = useState("video/webm");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const selectedSuggestion = useMemo(
    () => suggestions.find((entry) => entry.sessionKey === selectedSessionKey) || null,
    [selectedSessionKey, suggestions]
  );
  const activeTitle = matchTitle(selectedSuggestion, title);
  const isLive = isActiveStream(stream);
  const streamSessionKey = selectedSessionKey || stream?.sessionKey || "";
  const hasWatcherBinding = isWatcherBound(streamSessionKey);
  const uptimeSeconds = secondsSince(stream?.startedAt, now);
  const heartbeatAgeSeconds = secondsSince(stream?.lastHeartbeatAt, now);
  const theatreHref = hasWatcherBinding ? watchHref(streamSessionKey) : "";

  const streamStats = useMemo(
    () => [
      {
        label: "Binding",
        value: hasWatcherBinding ? "Watcher match" : selectedSessionKey ? "Free stream" : "Auto",
      },
      {
        label: "Signal",
        value: isLive
          ? (stream?.latestChunkSeq ?? -1) >= 0
            ? "Live edge"
            : "Warming"
          : captureReady
            ? "Ready"
            : "Idle",
      },
      {
        label: "Uptime",
        value: isLive && uptimeSeconds !== null ? formatDuration(uptimeSeconds) : "0s",
      },
      {
        label: "Chunks",
        value: String(stream?.chunkCount ?? 0),
      },
    ],
    [
      captureReady,
      hasWatcherBinding,
      isLive,
      selectedSessionKey,
      stream?.chunkCount,
      stream?.latestChunkSeq,
      uptimeSeconds,
    ]
  );

  useEffect(() => {
    setSelectedSessionKey(sessionKey || "");
  }, [sessionKey]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMine() {
      try {
        const params = new URLSearchParams({ mine: "1" });
        if (sessionKey) params.set("sessionKey", sessionKey);
        const payload = await fetchJson<{ streams: WatchStreamPayload[] }>(
          `/api/streams/active?${params.toString()}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        const mine = payload.streams[0] || null;
        if (!mine) return;
        setStream((current) => (isActiveStream(current) ? current : mine));
        setSelectedSessionKey((current) => current || mine.sessionKey);
      } catch {
        // Active-stream recovery is best effort; starting a new stream still works.
      }
    }

    void loadMine();
    const interval = window.setInterval(() => {
      void loadMine();
    }, ACTIVE_STREAM_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionKey]);

  useEffect(() => {
    if (sessionKey) return;

    let cancelled = false;
    async function loadSuggestions() {
      try {
        const payload = (await fetch("/api/live-games", { cache: "no-store" }).then((response) =>
          response.ok ? response.json() : null
        )) as {
          activeSessions?: Array<{
            sessionKey: string;
            mapName: string | null;
            state: string;
            players: Array<{ name: string }>;
            originalFilename: string | null;
          }>;
          recentlyCompletedSessions?: Array<{
            sessionKey: string;
            mapName: string | null;
            state: string;
            players: Array<{ name: string }>;
            originalFilename: string | null;
          }>;
        } | null;

        if (cancelled || !payload) return;

        const rows = [...(payload.activeSessions || []), ...(payload.recentlyCompletedSessions || [])]
          .slice(0, 6)
          .map((entry) => ({
            sessionKey: entry.sessionKey,
            title:
              entry.players.length > 0
                ? entry.players.map((player) => player.name).join(" vs ")
                : entry.originalFilename || "AoE2WAR live",
            mapName: entry.mapName,
            state: entry.state,
          }));

        setSuggestions(rows);
        setSelectedSessionKey((current) => current || rows[0]?.sessionKey || "");
      } catch {
        setSuggestions([]);
      }
    }

    void loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.srcObject = mediaStreamRef.current;
  }, [captureReady]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const captureThumbnail = useCallback(() => {
    const video = previewRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.58);
  }, []);

  const pickSource = useCallback(async () => {
    setError("");
    setNotice("");

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen capture is not available in this browser.");
      return;
    }

    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = nextStream;
      nextStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (!recorderRef.current) {
            setCaptureReady(false);
          }
        });
      });
      setCaptureReady(true);
      setMediaMimeType(chooseRecorderMimeType());
      setNotice("Source locked.");
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Could not open screen capture.");
    }
  }, []);

  const uploadChunk = useCallback(async (streamId: number, sequence: number, blob: Blob, mimeType: string) => {
    if (!blob.size) return;
    const response = await fetch(`/api/streams/${streamId}/chunks?sequence=${sequence}`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || mimeType,
        "x-stream-sequence": String(sequence),
      },
      body: blob,
    });
    const payload = (await response.json().catch(() => null)) as {
      stream?: WatchStreamPayload;
      detail?: string;
    } | null;
    if (!response.ok) {
      throw new Error(payload?.detail || "Stream upload missed a beat.");
    }
    if (payload?.stream) {
      setStream(payload.stream);
    }
  }, []);

  const sendHeartbeat = useCallback(
    async (streamId: number, status = "live") => {
      const thumbnailUrl = captureThumbnail();
      const response = await fetch(`/api/streams/${streamId}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          mediaMimeType,
          thumbnailUrl,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        stream?: WatchStreamPayload;
      } | null;
      if (response.ok && payload?.stream) {
        setStream(payload.stream);
      }
    },
    [captureThumbnail, mediaMimeType]
  );

  const goLive = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const capture = mediaStreamRef.current;
      if (!capture) {
        throw new Error("Pick the AoE2 window first.");
      }

      const effectiveSessionKey = selectedSessionKey || sessionKey || buildFreeSessionKey();
      const thumbnailUrl = captureThumbnail();
      const payload = await fetchJson<{ stream: WatchStreamPayload }>("/api/streams/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionKey: effectiveSessionKey,
          title: activeTitle,
          label: "AoE2WAR Live",
          playerLabel,
          thumbnailUrl,
          mediaMimeType,
        }),
      });

      setStream(payload.stream);
      sequenceRef.current = 0;

      const recorder = new MediaRecorder(capture, { mimeType: mediaMimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;
        void uploadChunk(payload.stream.id, sequence, event.data, mediaMimeType).catch((chunkError) => {
          setError(chunkError instanceof Error ? chunkError.message : "Stream upload missed a beat.");
        });
      };
      recorder.onstop = () => {
        stopHeartbeat();
      };
      recorder.start(CHUNK_TIMESLICE_MS);

      await sendHeartbeat(payload.stream.id, "live");
      heartbeatRef.current = window.setInterval(() => {
        void sendHeartbeat(payload.stream.id, "live");
      }, HEARTBEAT_MS);
      setNotice("Live.");
    } catch (goLiveError) {
      setError(goLiveError instanceof Error ? goLiveError.message : "Could not start stream.");
    } finally {
      setBusy(false);
    }
  }, [
    activeTitle,
    captureThumbnail,
    mediaMimeType,
    playerLabel,
    selectedSessionKey,
    sendHeartbeat,
    sessionKey,
    stopHeartbeat,
    uploadChunk,
  ]);

  const stopStream = useCallback(async () => {
    setBusy(true);
    setError("");
    stopHeartbeat();

    const activeStream = stream;
    recorderRef.current?.stop();
    recorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setCaptureReady(false);

    try {
      if (activeStream) {
        const payload = await fetchJson<{ stream: WatchStreamPayload }>(
          `/api/streams/${activeStream.id}/end`,
          { method: "POST" }
        );
        setStream(payload.stream);
      }
      setNotice("Stream ended.");
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Could not stop stream.");
    } finally {
      setBusy(false);
    }
  }, [stopHeartbeat, stream]);

  const copyWatchLink = useCallback(async () => {
    if (!theatreHref) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${theatreHref}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setError("Could not copy stream link.");
    }
  }, [theatreHref]);

  useEffect(() => {
    return () => {
      stopHeartbeat();
      recorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopHeartbeat]);

  return (
    <div
      className={[
        "rounded-[1.35rem] border bg-white/[0.035] p-4",
        watcherIntent || hasWatcherBinding
          ? "border-sky-300/20 shadow-[0_0_50px_rgba(56,189,248,0.08)]"
          : "border-white/10",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-slate-500">
            <Video className="h-4 w-4 text-sky-100" aria-hidden="true" />
            Streaming
          </div>
          <div className="mt-2 text-lg font-semibold text-white">AoE2WAR Live</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm text-slate-300">{activeTitle}</span>
            {hasWatcherBinding ? (
              <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                Watcher-linked
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs ${
            isLive
              ? "border-red-300/25 bg-red-400/10 text-red-100"
              : captureReady
                ? "border-sky-300/25 bg-sky-400/10 text-sky-100"
                : "border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {isLive ? "Live" : captureReady ? "Ready" : "Idle"}
        </span>
      </div>

      {!sessionKey && suggestions.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={selectedSessionKey}
            onChange={(event) => setSelectedSessionKey(event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-sky-300/45"
          >
            {suggestions.map((entry) => (
              <option key={entry.sessionKey} value={entry.sessionKey}>
                {entry.title}
                {entry.mapName ? ` · ${entry.mapName}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSelectedSessionKey("")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 transition hover:border-white/25 hover:text-white"
          >
            Free Stream
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {streamStats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">{stat.label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        {captureReady || isLive ? (
          <div className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-black">
            {isLive && stream ? (
              <LiveStreamFrame stream={stream} title={activeTitle} compact={compact} />
            ) : (
              <video
                ref={previewRef}
                className="aspect-video w-full bg-black object-cover"
                muted
                autoPlay
                playsInline
              />
            )}
          </div>
        ) : (
          <div className="grid aspect-video place-items-center rounded-[1.1rem] border border-white/10 bg-[radial-gradient(circle_at_35%_25%,rgba(56,189,248,0.18),transparent_32%),linear-gradient(135deg,#020617,#08111f)] text-white/70">
            <Monitor className="h-12 w-12" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!captureReady && !isLive ? (
          <button
            type="button"
            onClick={pickSource}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-sky-200 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Monitor className="h-4 w-4" aria-hidden="true" />
            Start Stream
          </button>
        ) : null}

        {captureReady && !isLive ? (
          <button
            type="button"
            onClick={goLive}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Go Live
          </button>
        ) : null}

        {isLive ? (
          <button
            type="button"
            onClick={stopStream}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-red-300/25 bg-red-400/10 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </button>
        ) : null}

        {hasWatcherBinding ? (
          <Link
            href={theatreHref}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:text-white"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Theatre
          </Link>
        ) : null}

        {hasWatcherBinding ? (
          <button
            type="button"
            onClick={copyWatchLink}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:text-white"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy Link"}
          </button>
        ) : null}

        {captureReady && !isLive ? (
          <button
            type="button"
            onClick={pickSource}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Radio className="h-4 w-4" aria-hidden="true" />
            Change Source
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}
      {isLive ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            <Activity className="h-4 w-4 text-emerald-200" aria-hidden="true" />
            {(stream?.latestChunkSeq ?? -1) >= 0 ? "Publishing" : "Signal warming"}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            <Clock3 className="h-4 w-4 text-sky-100" aria-hidden="true" />
            {heartbeatAgeSeconds === null ? "Heartbeat pending" : `Heartbeat ${heartbeatAgeSeconds}s ago`}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
