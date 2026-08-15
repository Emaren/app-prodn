"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
  normalizeLivingLeaderboardPreferences,
  type LivingLeaderboardPreferences,
} from "@/lib/livingLeaderboardPreferences";
import {
  useUserAuth,
} from "@/context/UserAuthContext";

const STORAGE_PREFIX =
  "aoe2war:living-leaderboard:preferences:v2";

const LEGACY_BOOKMARKS_KEY =
  "aoe2war:living-leaderboard:bookmarks:v1";

function storageKey(
  uid: string | null,
) {
  return `${STORAGE_PREFIX}:${uid || "guest"}`;
}

function readLocalPreferences(
  uid: string | null,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return DEFAULT_LIVING_LEADERBOARD_PREFERENCES;
  }

  try {
    const raw =
      window.localStorage.getItem(
        storageKey(uid),
      );

    if (raw) {
      return normalizeLivingLeaderboardPreferences(
        JSON.parse(raw),
      );
    }

    const legacy =
      window.localStorage.getItem(
        LEGACY_BOOKMARKS_KEY,
      );

    if (legacy) {
      const parsed =
        JSON.parse(legacy);

      return normalizeLivingLeaderboardPreferences(
        {
          ...DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
          bookmarkedPlayerKeys:
            parsed,
        },
      );
    }
  } catch {
    // Preferences are never allowed to block the board.
  }

  return DEFAULT_LIVING_LEADERBOARD_PREFERENCES;
}

function writeLocalPreferences(
  uid: string | null,
  preferences:
    LivingLeaderboardPreferences,
) {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey(uid),
      JSON.stringify(
        preferences,
      ),
    );
  } catch {
    // Keep in-memory interaction alive when storage is unavailable.
  }
}

export function useLivingLeaderboardPreferences() {
  const {
    uid,
    isAuthenticated,
    loading: authLoading,
  } = useUserAuth();

  const [
    preferences,
    setPreferences,
  ] =
    useState<LivingLeaderboardPreferences>(
      DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
    );

  const [
    ready,
    setReady,
  ] =
    useState(false);

  const dirtyRef =
    useRef(false);

  const saveTimerRef =
    useRef<number | null>(
      null,
    );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let active = true;

    setReady(false);
    dirtyRef.current = false;

    const local =
      readLocalPreferences(
        uid,
      );

    setPreferences(local);

    if (!isAuthenticated) {
      setReady(true);
      return;
    }

    void (async () => {
      try {
        const response =
          await fetch(
            "/api/user/leaderboard-preferences",
            {
              cache:
                "no-store",
            },
          );

        if (
          !response.ok
        ) {
          throw new Error(
            `Preference load failed: ${response.status}`,
          );
        }

        const payload =
          (await response.json()) as {
            preferences?: unknown;
            stored?: boolean;
          };

        if (!active) {
          return;
        }

        const next =
          payload.stored
            ? normalizeLivingLeaderboardPreferences(
                payload.preferences,
              )
            : local;

        setPreferences(next);

        writeLocalPreferences(
          uid,
          next,
        );
      } catch (error) {
        console.warn(
          "Living Leaderboard account preferences unavailable; using local state:",
          error,
        );
      } finally {
        if (active) {
          setReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [
    authLoading,
    isAuthenticated,
    uid,
  ]);

  const updatePreferences =
    useCallback(
      (
        patch:
          Partial<LivingLeaderboardPreferences>,
      ) => {
        dirtyRef.current =
          true;

        setPreferences(
          (current) =>
            normalizeLivingLeaderboardPreferences(
              {
                ...current,
                ...patch,
              },
            ),
        );
      },
      [],
    );

  useEffect(() => {
    if (
      !ready ||
      !dirtyRef.current
    ) {
      return;
    }

    dirtyRef.current =
      false;

    writeLocalPreferences(
      uid,
      preferences,
    );

    if (
      !isAuthenticated
    ) {
      return;
    }

    if (
      saveTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        saveTimerRef.current,
      );
    }

    saveTimerRef.current =
      window.setTimeout(
        () => {
          void fetch(
            "/api/user/leaderboard-preferences",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  preferences,
                ),
            },
          ).catch(
            (error) => {
              console.warn(
                "Living Leaderboard preference save failed:",
                error,
              );
            },
          );
        },
        500,
      );

    return () => {
      if (
        saveTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          saveTimerRef.current,
        );
        saveTimerRef.current =
          null;
      }
    };
  }, [
    isAuthenticated,
    preferences,
    ready,
    uid,
  ]);

  return {
    preferences,
    updatePreferences,
    ready,
    isAuthenticated,
  };
}
