"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createRadioListenerAnchor,
  radioListenerExpectedElapsedMs,
  radioListenerExpectedOffsetMs,
  radioListenerNextSyncDelayMs,
  radioListenerShouldSeek,
  type RadioWoloListenerAnchor,
  type RadioWoloListenerEnvelope,
  type RadioWoloListenerStation,
} from "@/lib/radioWoloListenerSync";

type ListenerStatus =
  | "idle"
  | "syncing"
  | "ready"
  | "error";

const STATION_URL =
  "/api/radio/station";

function monotonicNow() {
  if (
    typeof performance !==
      "undefined" &&
    typeof performance.now ===
      "function"
  ) {
    return performance.now();
  }

  return 0;
}

function safeSeek(
  audio: HTMLAudioElement,
  targetMs: number,
) {
  if (
    !Number.isFinite(
      targetMs,
    ) ||
    targetMs < 0
  ) {
    return;
  }

  const targetSeconds =
    targetMs / 1_000;

  if (
    Number.isFinite(
      audio.duration,
    ) &&
    audio.duration > 0
  ) {
    audio.currentTime =
      Math.min(
        targetSeconds,
        Math.max(
          0,
          audio.duration -
            0.05,
        ),
      );

    return;
  }

  audio.currentTime =
    targetSeconds;
}

export function useRadioWoloListener() {
  const audioRef =
    useRef<HTMLAudioElement | null>(
      null,
    );

  const stationRef =
    useRef<RadioWoloListenerStation | null>(
      null,
    );

  const anchorRef =
    useRef<RadioWoloListenerAnchor | null>(
      null,
    );

  const mediaKeyRef =
    useRef<string | null>(
      null,
    );

  const listeningIntentRef =
    useRef(false);

  const requestSequenceRef =
    useRef(0);

  const [station, setStation] =
    useState<RadioWoloListenerStation | null>(
      null,
    );

  const [status, setStatus] =
    useState<ListenerStatus>(
      "idle",
    );

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [
    isListening,
    setIsListening,
  ] = useState(false);

  const [
    isActuallyPlaying,
    setIsActuallyPlaying,
  ] = useState(false);

  const [
    playbackBlocked,
    setPlaybackBlocked,
  ] = useState(false);

  const [
    liveOffsetMs,
    setLiveOffsetMs,
  ] = useState(0);

  const [
    liveElapsedMs,
    setLiveElapsedMs,
  ] = useState(0);

  const attemptPlay =
    useCallback(
      async (
        audio:
          HTMLAudioElement,
      ) => {
        if (
          !listeningIntentRef
            .current
        ) {
          return false;
        }

        try {
          await audio.play();

          setPlaybackBlocked(
            false,
          );

          return true;
        } catch {
          setPlaybackBlocked(
            true,
          );

          return false;
        }
      },
      [],
    );

  const applyAnchorToAudio =
    useCallback(
      (
        anchor:
          RadioWoloListenerAnchor,
      ) => {
        const audio =
          audioRef.current;

        if (!audio) {
          return;
        }

        const now =
          monotonicNow();

        const expectedOffsetMs =
          radioListenerExpectedOffsetMs(
            anchor,
            now,
          );

        const mediaChanged =
          mediaKeyRef.current !==
          anchor.mediaKey;

        if (mediaChanged) {
          mediaKeyRef.current =
            anchor.mediaKey;

          audio.pause();
          audio.src =
            anchor.mediaUrl;
          audio.preload =
            "auto";

          const expectedKey =
            anchor.mediaKey;

          const prepare =
            () => {
              if (
                mediaKeyRef
                  .current !==
                expectedKey
              ) {
                return;
              }

              const latestAnchor =
                anchorRef.current;

              if (
                !latestAnchor ||
                latestAnchor
                  .mediaKey !==
                  expectedKey
              ) {
                return;
              }

              safeSeek(
                audio,
                radioListenerExpectedOffsetMs(
                  latestAnchor,
                  monotonicNow(),
                ),
              );

              if (
                listeningIntentRef
                  .current
              ) {
                void attemptPlay(
                  audio,
                );
              }
            };

          if (
            audio.readyState >= 1
          ) {
            prepare();
          } else {
            audio.addEventListener(
              "loadedmetadata",
              prepare,
              {
                once: true,
              },
            );

            audio.load();
          }

          return;
        }

        if (
          audio.readyState >= 1 &&
          radioListenerShouldSeek(
            audio.currentTime,
            expectedOffsetMs,
          )
        ) {
          safeSeek(
            audio,
            expectedOffsetMs,
          );
        }

        if (
          listeningIntentRef
            .current &&
          audio.paused
        ) {
          void attemptPlay(
            audio,
          );
        }
      },
      [attemptPlay],
    );

  const syncStation =
    useCallback(
      async () => {
        const sequence =
          ++requestSequenceRef
            .current;

        const requestStartedAt =
          monotonicNow();

        setStatus(
          stationRef.current
            ? "ready"
            : "syncing",
        );

        try {
          const response =
            await fetch(
              STATION_URL,
              {
                method: "GET",
                credentials:
                  "same-origin",
                cache: "no-store",
                headers: {
                  Accept:
                    "application/json",
                },
              },
            );

          if (!response.ok) {
            throw new Error(
              `Radio WOLO station returned ${response.status}.`,
            );
          }

          const payload =
            (await response.json()) as
              RadioWoloListenerEnvelope;

          if (
            sequence !==
            requestSequenceRef
              .current
          ) {
            return null;
          }

          const receivedAt =
            monotonicNow();

          const roundTripMs =
            Math.max(
              0,
              receivedAt -
                requestStartedAt,
            );

          const nextStation =
            payload.station;

          stationRef.current =
            nextStation;

          setStation(
            nextStation,
          );

          setError(null);
          setStatus("ready");

          const nextAnchor =
            createRadioListenerAnchor(
              nextStation,
              receivedAt,
              roundTripMs,
            );

          anchorRef.current =
            nextAnchor;

          if (!nextAnchor) {
            mediaKeyRef.current =
              null;

            setLiveOffsetMs(0);

            setLiveElapsedMs(
              nextStation.clock
                ?.elapsedMs ??
                0,
            );

            const audio =
              audioRef.current;

            if (audio) {
              audio.pause();
              audio.removeAttribute(
                "src",
              );
              audio.load();
            }

            setPlaybackBlocked(
              false,
            );

            return nextStation;
          }

          setLiveOffsetMs(
            radioListenerExpectedOffsetMs(
              nextAnchor,
              receivedAt,
            ),
          );

          setLiveElapsedMs(
            radioListenerExpectedElapsedMs(
              nextAnchor,
              receivedAt,
            ),
          );

          applyAnchorToAudio(
            nextAnchor,
          );

          return nextStation;
        } catch (
          caught
        ) {
          if (
            sequence !==
            requestSequenceRef
              .current
          ) {
            return null;
          }

          const message =
            caught instanceof
            Error
              ? caught.message
              : "Radio WOLO sync failed.";

          setError(message);
          setStatus("error");

          return null;
        }
      },
      [applyAnchorToAudio],
    );

  const startListening =
    useCallback(
      async () => {
        listeningIntentRef.current =
          true;

        setIsListening(
          true,
        );

        setPlaybackBlocked(
          false,
        );

        const nextStation =
          await syncStation();

        if (
          nextStation?.state !==
          "on_air"
        ) {
          return false;
        }

        const audio =
          audioRef.current;

        if (!audio) {
          return false;
        }

        const anchor =
          anchorRef.current;

        if (anchor) {
          applyAnchorToAudio(
            anchor,
          );
        }

        return attemptPlay(
          audio,
        );
      },
      [
        applyAnchorToAudio,
        attemptPlay,
        syncStation,
      ],
    );

  const stopListening =
    useCallback(() => {
      listeningIntentRef.current =
        false;

      setIsListening(
        false,
      );

      setPlaybackBlocked(
        false,
      );

      audioRef.current?.pause();
    }, []);

  useEffect(() => {
    const audio =
      new Audio();

    audio.preload = "none";

    audioRef.current =
      audio;

    const handlePlay =
      () => {
        setIsActuallyPlaying(
          true,
        );
      };

    const handlePause =
      () => {
        setIsActuallyPlaying(
          false,
        );
      };

    const handleEnded =
      () => {
        setIsActuallyPlaying(
          false,
        );

        void syncStation();
      };

    audio.addEventListener(
      "play",
      handlePlay,
    );

    audio.addEventListener(
      "pause",
      handlePause,
    );

    audio.addEventListener(
      "ended",
      handleEnded,
    );

    let cancelled =
      false;

    let pollTimer:
      | ReturnType<
          typeof setTimeout
        >
      | null = null;

    const schedule =
      async () => {
        await syncStation();

        if (cancelled) {
          return;
        }

        pollTimer =
          setTimeout(
            () => {
              void schedule();
            },
            radioListenerNextSyncDelayMs(
              stationRef.current,
              anchorRef.current,
              monotonicNow(),
            ),
          );
      };

    void schedule();

    return () => {
      cancelled = true;

      if (pollTimer) {
        clearTimeout(
          pollTimer,
        );
      }

      requestSequenceRef
        .current += 1;

      audio.removeEventListener(
        "play",
        handlePlay,
      );

      audio.removeEventListener(
        "pause",
        handlePause,
      );

      audio.removeEventListener(
        "ended",
        handleEnded,
      );

      audio.pause();
      audio.removeAttribute(
        "src",
      );
      audio.load();

      audioRef.current =
        null;
    };
  }, [syncStation]);

  useEffect(() => {
    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void syncStation();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
    };
  }, [syncStation]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          const anchor =
            anchorRef.current;

          if (!anchor) {
            return;
          }

          const now =
            monotonicNow();

          setLiveOffsetMs(
            radioListenerExpectedOffsetMs(
              anchor,
              now,
            ),
          );

          setLiveElapsedMs(
            radioListenerExpectedElapsedMs(
              anchor,
              now,
            ),
          );
        },
        250,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, []);

  return {
    station,
    status,
    error,

    isListening,
    isActuallyPlaying,
    playbackBlocked,

    liveOffsetMs,
    liveElapsedMs,

    startListening,
    stopListening,
    syncStation,
  };
}
