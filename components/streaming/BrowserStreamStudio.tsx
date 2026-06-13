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

type CaptureModeKey = "sharp" | "stable" | "fallback";

const CHUNK_TIMESLICE_MS = 1_000;
const HEARTBEAT_MS = 5_000;
const KEYFRAME_INTERVAL_MS = 1_000;
const ACTIVE_STREAM_REFRESH_MS = 12_000;
const CAPTURE_MODES: Array<{
  key: CaptureModeKey;
  label: string;
  detail: string;
  audio: boolean;
  video: MediaTrackConstraints;
}> = [
  {
    key: "sharp",
    label: "Sharp",
    detail: "30 fps",
    audio: true,
    video: {
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  },
  {
    key: "stable",
    label: "Stable",
    detail: "15 fps",
    audio: false,
    video: {
      frameRate: { ideal: 15, max: 15 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  },
  {
    key: "fallback",
    label: "Display",
    detail: "10 fps",
    audio: false,
    video: {
      frameRate: { ideal: 10, max: 10 },
      width: { ideal: 960 },
      height: { ideal: 540 },
    },
  },
];
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

function getCaptureMode(key: CaptureModeKey) {
  return CAPTURE_MODES.find((mode) => mode.key === key) || CAPTURE_MODES[0];
}

function readBrowserPlatform() {
  if (typeof navigator === "undefined") return "browser";
  return navigator.platform || "browser";
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
  const streamRef = useRef<WatchStreamPayload | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const captureStartedAtRef = useRef<number | null>(null);
  const manualStopRef = useRef(false);
  const sequenceRef = useRef(0);
  const [captureReady, setCaptureReady] = useState(false);
  const [stream, setStream] = useState<WatchStreamPayload | null>(null);
  const [suggestions, setSuggestions] = useState<LiveGamesSuggestion[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(sessionKey || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lastErrorDetail, setLastErrorDetail] = useState("");
  const [lastStreamOutput, setLastStreamOutput] = useState("");
  const [readoutOpen, setReadoutOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureModeKey>("sharp");
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
  const activeCaptureMode = getCaptureMode(captureMode);

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

  const readoutLine =
    lastStreamOutput ||
    (error
      ? error
      : isLive
        ? (stream?.latestChunkSeq ?? -1) >= 0
          ? `Publishing chunk ${stream?.latestChunkSeq}.`
          : "Waiting for the first video chunk."
        : captureReady
          ? `${activeCaptureMode.label} source ready.`
          : "Idle.");

  useEffect(() => {
    setSelectedSessionKey(sessionKey || "");
  }, [sessionKey]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

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

  const sendStreamEvent = useCallback(
    async (eventType: string, metadata: Record<string, unknown> = {}) => {
      await fetch("/api/streams/client-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType,
          sessionKey: selectedSessionKey || sessionKey || streamRef.current?.sessionKey || "",
          streamId: streamRef.current?.id ? String(streamRef.current.id) : "",
          platform: readBrowserPlatform(),
          captureMode,
          mediaMimeType,
          metadata: {
            title: activeTitle,
            ...metadata,
          },
        }),
      }).catch(() => undefined);
    },
    [activeTitle, captureMode, mediaMimeType, selectedSessionKey, sessionKey]
  );

  const surfaceStreamError = useCallback(
    (eventType: string, message: string, metadata: Record<string, unknown> = {}) => {
      setNotice("");
      setError(message);
      setLastStreamOutput(message);
      setReadoutOpen(true);
      setLastErrorDetail(
        metadata.detail && typeof metadata.detail === "string" ? metadata.detail : ""
      );
      void sendStreamEvent(eventType, {
        ...metadata,
        errorMessage: message,
      });
    },
    [sendStreamEvent]
  );

  const pickSource = useCallback(async () => {
    setError("");
    setLastErrorDetail("");
    setNotice("");

    if (!navigator.mediaDevices?.getDisplayMedia) {
      surfaceStreamError("stream_error", "Screen capture is not available in this browser.");
      return;
    }

    try {
      void sendStreamEvent("stream_capture_requested", {
        mode: activeCaptureMode.key,
        detail: activeCaptureMode.detail,
      });
      setLastStreamOutput(`Opening ${activeCaptureMode.label} capture.`);
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: activeCaptureMode.video,
        audio: activeCaptureMode.audio,
      });

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = nextStream;
      captureStartedAtRef.current = Date.now();
      nextStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          const elapsedMs = captureStartedAtRef.current
            ? Date.now() - captureStartedAtRef.current
            : null;
          const activeStream = streamRef.current;
          manualStopRef.current = true;
          try {
            recorderRef.current?.stop();
          } catch {
            // Recorder may already be stopped.
          }
          recorderRef.current = null;
          stopHeartbeat();
          setCaptureReady(false);
          if (activeStream) {
            void fetch(`/api/streams/${activeStream.id}/end`, { method: "POST" }).catch(() => undefined);
          }
          surfaceStreamError(
            "stream_track_ended",
            elapsedMs !== null && elapsedMs < 3_000
              ? "Screen capture stopped immediately. Try Stable or Display mode."
              : "Screen capture stopped.",
            {
              elapsedMs,
              mode: activeCaptureMode.key,
              detail: track.label || "display track ended",
            }
          );
        });
      });
      setCaptureReady(true);
      setMediaMimeType(chooseRecorderMimeType());
      setNotice(`${activeCaptureMode.label} source locked.`);
      setLastStreamOutput(
        `${activeCaptureMode.label} source ready${nextStream.getVideoTracks()[0]?.label ? `: ${nextStream.getVideoTracks()[0].label}` : "."}`
      );
      void sendStreamEvent("stream_source_ready", {
        mode: activeCaptureMode.key,
        trackCount: nextStream.getTracks().length,
        videoTrackLabels: nextStream.getVideoTracks().map((track) => track.label).filter(Boolean),
      });
    } catch (pickError) {
      surfaceStreamError(
        "stream_error",
        pickError instanceof Error ? pickError.message : "Could not open screen capture.",
        {
          mode: activeCaptureMode.key,
          detail: pickError instanceof Error ? pickError.name : null,
        }
      );
    }
  }, [activeCaptureMode, sendStreamEvent, stopHeartbeat, surfaceStreamError]);

  const uploadChunk = useCallback(
    async (streamId: number, sequence: number, blob: Blob, mimeType: string) => {
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
      setLastStreamOutput(`Chunk ${sequence} published (${Math.round(blob.size / 1024)} KB).`);
      if (sequence === 0 || sequence % 10 === 0) {
        void sendStreamEvent("stream_chunk_uploaded", {
          streamId,
          sequence,
          blobSize: blob.size,
        });
      }
    },
    [sendStreamEvent]
  );

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
        detail?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.detail || "Stream heartbeat failed.");
      }
      if (response.ok && payload?.stream) {
        setStream(payload.stream);
      }
      setLastStreamOutput(
        status === "live" ? "Heartbeat OK. Stream is visible on AoE2WAR." : "Heartbeat sent."
      );
      void sendStreamEvent("stream_heartbeat", {
        streamId,
        status,
        thumbnailUpdated: Boolean(thumbnailUrl),
      });
    },
    [captureThumbnail, mediaMimeType, sendStreamEvent]
  );

  const goLive = useCallback(async () => {
    setBusy(true);
    setError("");
    setLastErrorDetail("");
    setNotice("");

    try {
      const capture = mediaStreamRef.current;
      if (!capture) {
        throw new Error("Pick the AoE2 window or display first.");
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
          sourceType: "browser",
        }),
      });

      setStream(payload.stream);
      streamRef.current = payload.stream;
      sequenceRef.current = 0;
      manualStopRef.current = false;

      const recorder = new MediaRecorder(capture, {
        mimeType: mediaMimeType,
        videoKeyFrameIntervalDuration: KEYFRAME_INTERVAL_MS,
      } as MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number });
      const recorderStartedAt = Date.now();
      recorderRef.current = recorder;
      recorder.onerror = (event) => {
        const mediaError = (event as Event & { error?: DOMException }).error;
        surfaceStreamError(
          "stream_recorder_error",
          mediaError?.message || "Stream recorder stopped unexpectedly.",
          {
            mode: captureMode,
            detail: mediaError?.name || "MediaRecorder error",
            elapsedMs: Date.now() - recorderStartedAt,
          }
        );
      };
      recorder.ondataavailable = (event) => {
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;
        void uploadChunk(payload.stream.id, sequence, event.data, mediaMimeType).catch((chunkError) => {
          surfaceStreamError(
            "stream_chunk_failed",
            chunkError instanceof Error ? chunkError.message : "Stream upload missed a beat.",
            {
              sequence,
              blobSize: event.data.size,
            }
          );
        });
      };
      recorder.onstop = () => {
        stopHeartbeat();
        if (!manualStopRef.current && Date.now() - recorderStartedAt < 5_000) {
          surfaceStreamError("stream_recorder_error", "Stream stopped immediately. Try Stable or Display mode.", {
            elapsedMs: Date.now() - recorderStartedAt,
            mode: captureMode,
          });
        }
      };
      recorder.start(CHUNK_TIMESLICE_MS);
      setLastStreamOutput(`Recorder started in ${captureMode} mode.`);

      await sendHeartbeat(payload.stream.id, "live");
      heartbeatRef.current = window.setInterval(() => {
        void sendHeartbeat(payload.stream.id, "live").catch((heartbeatError) => {
          surfaceStreamError(
            "stream_heartbeat_failed",
            heartbeatError instanceof Error ? heartbeatError.message : "Stream heartbeat failed."
          );
        });
      }, HEARTBEAT_MS);
      void sendStreamEvent("stream_started", {
        streamId: payload.stream.id,
        mode: captureMode,
      });
      setNotice("Live.");
      setLastStreamOutput("Live. First chunks are publishing now.");
    } catch (goLiveError) {
      surfaceStreamError(
        "stream_error",
        goLiveError instanceof Error ? goLiveError.message : "Could not start stream.",
        {
          mode: captureMode,
        }
      );
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
    sendStreamEvent,
    sessionKey,
    stopHeartbeat,
    surfaceStreamError,
    uploadChunk,
    captureMode,
  ]);

  const stopStream = useCallback(async () => {
    setBusy(true);
    setError("");
    setLastErrorDetail("");
    stopHeartbeat();

    const activeStream = stream;
    manualStopRef.current = true;
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
      void sendStreamEvent("stream_stopped", {
        streamId: activeStream?.id || null,
      });
      setNotice("Stream ended.");
      setLastStreamOutput("Stream ended cleanly.");
    } catch (stopError) {
      surfaceStreamError(
        "stream_error",
        stopError instanceof Error ? stopError.message : "Could not stop stream."
      );
    } finally {
      setBusy(false);
    }
  }, [sendStreamEvent, stopHeartbeat, stream, surfaceStreamError]);

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

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {CAPTURE_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => setCaptureMode(mode.key)}
            disabled={busy || isLive}
            className={[
              "rounded-2xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
              captureMode === mode.key
                ? "border-sky-300/35 bg-sky-300/12 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25",
            ].join(" ")}
          >
            <span className="block text-sm font-semibold">{mode.label}</span>
            <span className="mt-0.5 block text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {mode.detail}
            </span>
          </button>
        ))}
      </div>

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

      <details
        className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300"
        open={readoutOpen}
        onToggle={(event) => setReadoutOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none text-slate-200 [&::-webkit-details-marker]:hidden">
          {readoutLine}
        </summary>
        <div className="mt-2 text-xs leading-5 text-slate-400">
          {lastErrorDetail || `Mode ${captureMode}. MIME ${mediaMimeType}. Heartbeat ${
            heartbeatAgeSeconds === null ? "pending" : `${heartbeatAgeSeconds}s ago`
          }.`}
        </div>
      </details>

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
          {lastErrorDetail ? (
            <div className="mt-1 text-xs text-red-100/70">{lastErrorDetail}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
