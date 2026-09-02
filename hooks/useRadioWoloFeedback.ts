"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  RADIO_WOLO_LISTENER_HEARTBEAT_MS,
  radioWoloListenerIdIsValid,
  type RadioWoloRatingStyle,
} from "@/lib/radioWoloFeedbackPolicy";

const FEEDBACK_URL =
  "/api/radio/feedback";

const LISTENER_STORAGE_KEY =
  "aoe2war:radio-wolo-listener-id:v1";

const RATING_STYLE_STORAGE_KEY =
  "aoe2war:radio-wolo-rating-style:v1";

function generatedUuid() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  const bytes =
    new Uint8Array(16);

  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.getRandomValues ===
      "function"
  ) {
    crypto.getRandomValues(
      bytes,
    );
  } else {
    for (
      let index = 0;
      index < bytes.length;
      index += 1
    ) {
      bytes[index] =
        Math.floor(
          Math.random() *
            256,
        );
    }
  }

  bytes[6] =
    (
      bytes[6] &
      0x0f
    ) |
    0x40;

  bytes[8] =
    (
      bytes[8] &
      0x3f
    ) |
    0x80;

  const hex =
    Array.from(
      bytes,
      (value) =>
        value
          .toString(16)
          .padStart(2, "0"),
    );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function readOrCreateListenerId() {
  try {
    const stored =
      window.localStorage.getItem(
        LISTENER_STORAGE_KEY,
      );

    if (
      radioWoloListenerIdIsValid(
        stored,
      )
    ) {
      return stored;
    }

    const created =
      generatedUuid();

    window.localStorage.setItem(
      LISTENER_STORAGE_KEY,
      created,
    );

    return created;
  } catch {
    return generatedUuid();
  }
}

function readRatingStyle():
  RadioWoloRatingStyle {
  try {
    const stored =
      window.localStorage.getItem(
        RATING_STYLE_STORAGE_KEY,
      );

    if (
      stored === "emoji" ||
      stored === "icons"
    ) {
      return stored;
    }
  } catch {
    // Presentation persistence is optional.
  }

  return "emoji";
}

async function postFeedback(
  body: Record<
    string,
    unknown
  >,
) {
  const response =
    await fetch(
      FEEDBACK_URL,
      {
        method: "POST",
        credentials:
          "same-origin",
        cache: "no-store",
        keepalive: true,
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            body,
          ),
      },
    );

  if (!response.ok) {
    const payload =
      (await response
        .json()
        .catch(
          () => ({}),
        )) as {
        detail?: string;
      };

    throw new Error(
      payload.detail ||
        `Radio feedback returned ${response.status}.`,
    );
  }

  return response.json();
}

export function useRadioWoloFeedback(
  input: {
    trackKey:
      | string
      | null;
    soundEnabled:
      boolean;
  },
) {
  const [
    listenerId,
    setListenerId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    rating,
    setRating,
  ] =
    useState<
      number | null
    >(null);

  const [
    ratingStyle,
    setRatingStyleState,
  ] =
    useState<RadioWoloRatingStyle>(
      "emoji",
    );

  const [
    ratingSaving,
    setRatingSaving,
  ] =
    useState(false);

  const [
    ratingError,
    setRatingError,
  ] =
    useState<string | null>(
      null,
    );

  const previousSoundEnabledRef =
    useRef(false);

  const initializedListenerRef =
    useRef<string | null>(
      null,
    );

  const ratingLoadSequenceRef =
    useRef(0);

  const ratingMutationRef =
    useRef(0);

  const ratingQueueRef =
    useRef<Promise<void>>(
      Promise.resolve(),
    );

  useEffect(() => {
    setListenerId(
      readOrCreateListenerId(),
    );

    setRatingStyleState(
      readRatingStyle(),
    );
  }, []);

  const sendSignal =
    useCallback(
      (
        event:
          | "on"
          | "off"
          | "heartbeat",
      ) => {
        if (!listenerId) {
          return Promise.resolve();
        }

        return postFeedback({
          listenerId,
          event,
        }).then(
          () => undefined,
        );
      },
      [listenerId],
    );

  useEffect(() => {
    if (!listenerId) {
      return;
    }

    const initial =
      initializedListenerRef
        .current !==
      listenerId;

    initializedListenerRef.current =
      listenerId;

    const previous =
      previousSoundEnabledRef
        .current;

    previousSoundEnabledRef.current =
      input.soundEnabled;

    if (initial) {
      void sendSignal(
        input.soundEnabled
          ? "on"
          : "off",
      );

      return;
    }

    if (
      input.soundEnabled &&
      !previous
    ) {
      void sendSignal(
        "on",
      );

      return;
    }

    if (
      !input.soundEnabled &&
      previous
    ) {
      void sendSignal(
        "off",
      );
    }
  }, [
    input.soundEnabled,
    listenerId,
    sendSignal,
  ]);

  useEffect(() => {
    if (
      !listenerId ||
      !input.soundEnabled
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void sendSignal(
            "heartbeat",
          );
        },
        RADIO_WOLO_LISTENER_HEARTBEAT_MS,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    input.soundEnabled,
    listenerId,
    sendSignal,
  ]);

  useEffect(() => {
    if (!listenerId) {
      return;
    }

    const handlePageHide =
      () => {
        if (
          !previousSoundEnabledRef
            .current
        ) {
          return;
        }

        void postFeedback({
          listenerId,
          event: "off",
        });
      };

    window.addEventListener(
      "pagehide",
      handlePageHide,
    );

    return () => {
      window.removeEventListener(
        "pagehide",
        handlePageHide,
      );
    };
  }, [listenerId]);

  useEffect(() => {
    const sequence =
      ++ratingLoadSequenceRef
        .current;

    setRatingError(null);

    if (
      !listenerId ||
      !input.trackKey
    ) {
      setRating(null);
      return;
    }

    setRating(null);

    void fetch(
      `${FEEDBACK_URL}?listenerId=${encodeURIComponent(
        listenerId,
      )}`,
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
    )
      .then(
        async (
          response,
        ) => {
          if (!response.ok) {
            throw new Error(
              `Radio rating returned ${response.status}.`,
            );
          }

          return response.json();
        },
      )
      .then(
        (
          payload: {
            feedback?: {
              rating?:
                | number
                | null;
            };
          },
        ) => {
          if (
            sequence !==
            ratingLoadSequenceRef
              .current
          ) {
            return;
          }

          const next =
            payload.feedback
              ?.rating;

          setRating(
            typeof next ===
                "number"
              ? next
              : null,
          );
        },
      )
      .catch(
        (
          caught,
        ) => {
          if (
            sequence !==
            ratingLoadSequenceRef
              .current
          ) {
            return;
          }

          setRatingError(
            caught instanceof Error
              ? caught.message
              : "Rating unavailable.",
          );
        },
      );
  }, [
    input.trackKey,
    listenerId,
  ]);

  const saveRating =
    useCallback(
      (
        nextRating:
          number,
      ) => {
        if (
          !listenerId ||
          !Number.isInteger(
            nextRating,
          ) ||
          nextRating < 1 ||
          nextRating > 10
        ) {
          return;
        }

        const previousRating =
          rating;

        const mutation =
          ++ratingMutationRef
            .current;

        setRating(
          nextRating,
        );

        setRatingSaving(
          true,
        );

        setRatingError(
          null,
        );

        const job =
          ratingQueueRef.current
            .catch(
              () => undefined,
            )
            .then(
              async () => {
                await postFeedback(
                  {
                    listenerId,
                    event:
                      "rate",
                    rating:
                      nextRating,
                  },
                );
              },
            );

        ratingQueueRef.current =
          job.then(
            () => undefined,
            () => undefined,
          );

        void job.then(
          () => {
            if (
              mutation ===
              ratingMutationRef
                .current
            ) {
              setRatingSaving(
                false,
              );

              setRatingError(
                null,
              );
            }
          },
          (
            caught,
          ) => {
            if (
              mutation !==
              ratingMutationRef
                .current
            ) {
              return;
            }

            setRating(
              previousRating,
            );

            setRatingSaving(
              false,
            );

            setRatingError(
              caught instanceof Error
                ? caught.message
                : "Rating save failed.",
            );
          },
        );
      },
      [
        listenerId,
        rating,
      ],
    );

  const setRatingStyle =
    useCallback(
      (
        next:
          RadioWoloRatingStyle,
      ) => {
        setRatingStyleState(
          next,
        );

        try {
          window.localStorage.setItem(
            RATING_STYLE_STORAGE_KEY,
            next,
          );
        } catch {
          // Presentation persistence is optional.
        }
      },
      [],
    );

  return {
    listenerId,
    rating,
    ratingStyle,
    ratingSaving,
    ratingError,
    saveRating,
    setRatingStyle,
  };
}
