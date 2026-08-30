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

import {
  RADIO_WOLO_DEFAULT_VOLUME,
  RADIO_WOLO_FADE_IN_MS,
  RADIO_WOLO_FADE_OUT_MS,
  clampRadioWoloVolume,
  radioWoloInterpolatedVolume,
} from "@/lib/radioWoloVolume";

type ListenerStatus =
  | "idle"
  | "syncing"
  | "ready"
  | "error";

const STATION_URL =
  "/api/radio/station";

const VOLUME_STORAGE_KEY =
  "aoe2war:radio-wolo-volume:v1";

function readStoredVolume() {
  if (
    typeof window ===
    "undefined"
  ) {
    return RADIO_WOLO_DEFAULT_VOLUME;
  }

  try {
    const raw =
      window.localStorage.getItem(
        VOLUME_STORAGE_KEY,
      );

    if (raw !== null) {
      return clampRadioWoloVolume(
        Number(raw),
      );
    }
  } catch {
    // Radio volume persistence is optional.
  }

  return RADIO_WOLO_DEFAULT_VOLUME;
}

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

  const volumeRampRef =
    useRef(0);

  const targetVolumeRef =
    useRef(
      RADIO_WOLO_DEFAULT_VOLUME,
    );

  const entranceFadePendingRef =
    useRef(false);

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

  const [
    targetVolume,
    setTargetVolumeState,
  ] =
    useState(
      RADIO_WOLO_DEFAULT_VOLUME,
    );

  useEffect(() => {
    const stored =
      readStoredVolume();

    targetVolumeRef.current =
      stored;

    setTargetVolumeState(
      stored,
    );
  }, []);

  const rampVolume =
    useCallback(
      (
        audio:
          HTMLAudioElement,
        target:
          number,
        durationMs:
          number,
      ) => {
        const token =
          ++volumeRampRef
            .current;

        const from =
          clampRadioWoloVolume(
            audio.volume,
          );

        const to =
          clampRadioWoloVolume(
            target,
          );

        if (
          durationMs <= 0 ||
          Math.abs(
            from - to,
          ) < 0.001
        ) {
          audio.volume =
            to;

          return Promise.resolve(
            true,
          );
        }

        const startedAt =
          monotonicNow();

        return new Promise<boolean>(
          (resolve) => {
            const frame =
              () => {
                if (
                  token !==
                  volumeRampRef
                    .current
                ) {
                  resolve(false);
                  return;
                }

                const elapsed =
                  Math.max(
                    0,
                    monotonicNow() -
                      startedAt,
                  );

                const progress =
                  Math.min(
                    1,
                    elapsed /
                      durationMs,
                  );

                audio.volume =
                  radioWoloInterpolatedVolume(
                    from,
                    to,
                    progress,
                  );

                if (
                  progress >= 1
                ) {
                  resolve(true);
                  return;
                }

                window.requestAnimationFrame(
                  frame,
                );
              };

            window.requestAnimationFrame(
              frame,
            );
          },
        );
      },
      [],
    );

  const updateTargetVolume =
    useCallback(
      (
        next:
          number,
      ) => {
        const normalized =
          clampRadioWoloVolume(
            next,
          );

        targetVolumeRef.current =
          normalized;

        setTargetVolumeState(
          normalized,
        );

        try {
          window.localStorage.setItem(
            VOLUME_STORAGE_KEY,
            String(
              normalized,
            ),
          );
        } catch {
          // Volume persistence is optional.
        }

        const audio =
          audioRef.current;

        if (
          audio &&
          listeningIntentRef
            .current &&
          !audio.paused &&
          !entranceFadePendingRef
            .current
        ) {
          void rampVolume(
            audio,
            normalized,
            160,
          );
        }
      },
      [rampVolume],
    );

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

        const shouldFadeIn =
          entranceFadePendingRef
            .current;

        if (shouldFadeIn) {
          ++volumeRampRef
            .current;

          audio.volume = 0;
        }

        try {
          await audio.play();

          setPlaybackBlocked(
            false,
          );

          if (
            shouldFadeIn &&
            entranceFadePendingRef
              .current
          ) {
            entranceFadePendingRef.current =
              false;

            void rampVolume(
              audio,
              targetVolumeRef
                .current,
              RADIO_WOLO_FADE_IN_MS,
            );
          }

          return true;
        } catch {
          entranceFadePendingRef.current =
            false;

          listeningIntentRef.current =
            false;

          setIsListening(
            false,
          );

          setPlaybackBlocked(
            true,
          );

          return false;
        }
      },
      [rampVolume],
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

            if (
              listeningIntentRef
                .current
            ) {
              void attemptPlay(
                audio,
              );
            }
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

            if (
              nextStation.state ===
              "off_air"
            ) {
              listeningIntentRef.current =
                false;

              setIsListening(
                false,
              );
            }

            const audio =
              audioRef.current;

            if (audio) {
              ++volumeRampRef
                .current;

              audio.volume = 0;
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
        const audio =
          audioRef.current;

        const anchor =
          anchorRef.current;

        const currentStation =
          stationRef.current;

        if (
          !audio ||
          !anchor ||
          currentStation?.state !==
            "on_air"
        ) {
          void syncStation();
          return false;
        }

        ++volumeRampRef
          .current;

        entranceFadePendingRef.current =
          true;

        audio.volume = 0;

        listeningIntentRef.current =
          true;

        setIsListening(
          true,
        );

        setPlaybackBlocked(
          false,
        );

        applyAnchorToAudio(
          anchor,
        );

        // Refresh authoritative truth in parallel.
        void syncStation();

        // Keep play() directly in the caller's activation path when
        // this came from a user click. Automatic attempts may still
        // be rejected by browser autoplay policy.
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

      entranceFadePendingRef.current =
        false;

      setIsListening(
        false,
      );

      setPlaybackBlocked(
        false,
      );

      const audio =
        audioRef.current;

      if (!audio) {
        return;
      }

      void rampVolume(
        audio,
        0,
        RADIO_WOLO_FADE_OUT_MS,
      ).then(
        (completed) => {
          if (
            completed &&
            !listeningIntentRef
              .current
          ) {
            audio.pause();
          }
        },
      );
    }, [rampVolume]);

  useEffect(() => {
    const audio =
      new Audio();

    audio.preload = "none";
    audio.volume = 0;

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

      // Invalidate any outstanding volume animation.
      // This effect is unmounting, so this token cannot be reused.
      volumeRampRef.current = -1;

      audio.volume = 0;
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

    targetVolume,
    setTargetVolume:
      updateTargetVolume,

    startListening,
    stopListening,
    syncStation,
  };
}
