"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { LobbyOnlineUser } from "@/lib/lobby";

export const PUBLIC_PRESENCE_REFRESH_MS = 5_000;

type PublicPresenceState = {
  activePlayers: number;
  onlineUidSet: Set<string>;
  onlineUsers: LobbyOnlineUser[];
};

function presenceFingerprint(users: LobbyOnlineUser[]) {
  return users
    .map(
      (user) =>
        `${user.uid}:${user.in_game_name}:${Number(user.verified)}:${user.verificationLevel}`,
    )
    .join("|");
}

function isLobbyOnlineUser(value: unknown): value is LobbyOnlineUser {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<LobbyOnlineUser>;

  return (
    typeof candidate.uid === "string" &&
    candidate.uid.length > 0 &&
    typeof candidate.in_game_name === "string" &&
    typeof candidate.verified === "boolean" &&
    typeof candidate.verificationLevel === "number"
  );
}

export function usePublicPresence(
  initialOnlineUsers: LobbyOnlineUser[],
): PublicPresenceState {
  const [onlineUsers, setOnlineUsers] =
    useState<LobbyOnlineUser[]>(initialOnlineUsers);
  const refreshInFlightRef = useRef(false);

  const refreshPresence = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;

    try {
      const response = await fetch(
        `/api/user/online_users?refresh=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        },
      );

      if (!response.ok) return;

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) return;

      const nextOnlineUsers = payload.filter(isLobbyOnlineUser);

      setOnlineUsers((current) =>
        presenceFingerprint(current) === presenceFingerprint(nextOnlineUsers)
          ? current
          : nextOnlineUsers,
      );
    } catch (error) {
      console.warn("Failed to refresh public presence:", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPresence();
      }
    };

    const interval = window.setInterval(
      refreshIfVisible,
      PUBLIC_PRESENCE_REFRESH_MS,
    );

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshPresence]);

  const onlineUidSet = useMemo(
    () => new Set(onlineUsers.map((user) => user.uid)),
    [onlineUsers],
  );

  return {
    activePlayers: onlineUsers.length,
    onlineUidSet,
    onlineUsers,
  };
}

const PublicPresenceContext =
  createContext<PublicPresenceState | null>(null);

export function PublicPresenceProvider({
  children,
  initialOnlineUsers,
}: {
  children: ReactNode;
  initialOnlineUsers: LobbyOnlineUser[];
}) {
  const presence = usePublicPresence(initialOnlineUsers);

  return (
    <PublicPresenceContext.Provider value={presence}>
      {children}
    </PublicPresenceContext.Provider>
  );
}

export function usePublicPresenceContext() {
  const presence = useContext(PublicPresenceContext);

  if (!presence) {
    throw new Error(
      "usePublicPresenceContext must be inside PublicPresenceProvider",
    );
  }

  return presence;
}
