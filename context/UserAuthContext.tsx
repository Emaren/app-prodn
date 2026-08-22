"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  USER_ONLINE_HEARTBEAT_MS,
  USER_ONLINE_TRAFFIC_SYNC_MS,
} from "@/lib/userOnlinePresenceConfig";

type SessionUser = {
  uid: string;
  email: string | null;
  inGameName: string | null;
  isAdmin: boolean;
  canReviewOwnReplayResults: boolean;
  steamId: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verificationMethod: string;
  verified: boolean;
};

type SessionEnvelope = {
  uid?: string;
  user?: SessionUser | null;
};

type CtxShape = {
  playerName: string;
  setPlayerName: (name: string) => void;
  uid: string | null;
  setUid: (uid: string | null) => void;
  token: string | null;
  isAdmin: boolean;
  canReviewOwnReplayResults: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  user: SessionUser | null;
  loginWithSteam: (returnTo?: string) => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  refreshSession: () => Promise<boolean>;
};

const SESSION_REFRESH_RETRY_MS = 5_000;

const Ctx = createContext<CtxShape | undefined>(undefined);

function getDisplayName(user: SessionUser | null) {
  if (!user) return "";
  return user.inGameName || user.steamPersonaName || "";
}

function ensureTrafficId(storage: Storage, key: string, prefix: string) {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const value = `${prefix}_${suffix}`;
  storage.setItem(key, value);
  return value;
}

function createPresenceClientId() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  return `presence_${suffix}`;
}

function currentTrafficPresence(presenceClientId: string) {
  const base = {
    presence_client_id: presenceClientId,
    traffic_path:
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`,
  };

  if (typeof window === "undefined") return base;

  try {
    return {
      ...base,
      traffic_visitor_id: ensureTrafficId(localStorage, "traffic_visitor_id", "v"),
      traffic_session_id: ensureTrafficId(sessionStorage, "traffic_session_id", "s"),
    };
  } catch {
    return base;
  }
}

function persistDisplayState(user: SessionUser | null) {
  if (typeof window === "undefined") return;

  const displayName = getDisplayName(user);
  if (displayName) {
    localStorage.setItem("playerName", displayName);
  } else {
    localStorage.removeItem("playerName");
  }

  if (user?.uid) {
    localStorage.setItem("uid", user.uid);
  } else {
    localStorage.removeItem("uid");
  }

  localStorage.setItem("isAdmin", String(Boolean(user?.isAdmin)));
}

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [uid, setUidState] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [playerName, setPlayerNameState] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canReviewOwnReplayResults, setCanReviewOwnReplayResults] = useState(false);
  const [loading, setLoading] = useState(true);

  const syncUserState = useCallback((nextUser: SessionUser | null) => {
    setUser(nextUser);
    setUidState(nextUser?.uid ?? null);
    setIsAdmin(Boolean(nextUser?.isAdmin));
    setCanReviewOwnReplayResults(Boolean(nextUser?.canReviewOwnReplayResults));
    setPlayerNameState(getDisplayName(nextUser));
    persistDisplayState(nextUser);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401) {
        syncUserState(null);
        return true;
      }

      if (!response.ok) {
        throw new Error(`Session lookup failed: ${response.status}`);
      }

      const payload = (await response.json()) as SessionEnvelope;
      if (!payload.user || !payload.uid) {
        syncUserState(null);
        return true;
      }

      syncUserState({
        ...payload.user,
        uid: payload.uid,
      });
      return true;
    } catch (error) {
      console.warn("Failed to refresh session:", error);
      // A transient session lookup failure must not sign out an already
      // authenticated browser or stop its online heartbeat.
      return false;
    }
  }, [syncUserState]);

  const setPlayerName = useCallback((name: string) => {
    const trimmed = name.trimStart();
    setPlayerNameState(trimmed);
    if (typeof window !== "undefined") {
      if (trimmed) {
        localStorage.setItem("playerName", trimmed);
      } else {
        localStorage.removeItem("playerName");
      }
    }
  }, []);

  const setUid = useCallback((nextUid: string | null) => {
    setUidState(nextUid);
    if (typeof window !== "undefined") {
      if (nextUid) {
        localStorage.setItem("uid", nextUid);
      } else {
        localStorage.removeItem("uid");
      }
    }
  }, []);

  const refreshToken = useCallback(async () => null, []);

  const loginWithSteam = useCallback((returnTo?: string) => {
    const target =
      returnTo ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/");

    window.location.assign(`/api/auth/steam?returnTo=${encodeURIComponent(target)}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const refreshUntilResolved = async () => {
      const resolved = await refreshSession();

      if (cancelled) return;

      setLoading(false);

      if (!resolved) {
        retryTimer = window.setTimeout(
          () => {
            void refreshUntilResolved();
          },
          SESSION_REFRESH_RETRY_MS,
        );
      }
    };

    void refreshUntilResolved();

    return () => {
      cancelled = true;

      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [refreshSession]);

  useEffect(() => {
    if (
      !uid ||
      uid.startsWith(
        "preview:",
      )
    ) {
      return;
    }

    let active = true;
    let pageDeparted = false;
    let pingInFlight = false;
    let pendingPing = false;
    let pendingTrafficIdentity = false;
    let presenceSequence = 0;
    let lastTrafficSyncAttemptAt = 0;
    const presenceClientId = createPresenceClientId();

    const ping = async (forceTrafficIdentity = false) => {
      if (!active || pageDeparted) return;
      if (pingInFlight) {
        // BFCache pageshow/focus can arrive while the pre-pagehide request is
        // still settling. Queue one prompt, sequenced republish instead of
        // waiting up to a full heartbeat interval after the leave mutation.
        pendingPing = true;
        pendingTrafficIdentity =
          pendingTrafficIdentity || forceTrafficIdentity;
        return;
      }

      pingInFlight = true;

      try {
        const attemptedAt = Date.now();
        const reportTrafficIdentity =
          forceTrafficIdentity ||
          attemptedAt - lastTrafficSyncAttemptAt >=
            USER_ONLINE_TRAFFIC_SYNC_MS;

        if (reportTrafficIdentity) {
          lastTrafficSyncAttemptAt = attemptedAt;
        }

        const presence =
          currentTrafficPresence(presenceClientId);
        presenceSequence += 1;

        const response =
          await fetch(
            "/api/user/ping",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              credentials:
                "same-origin",
              body: JSON.stringify(
                {
                  ...presence,
                  presence_sequence: presenceSequence,
                  report_traffic_identity: reportTrafficIdentity,
                },
              ),
            },
          );

        const payload = (
          await response
            .json()
            .catch(() => ({}))
        ) as {
          status?: string;
          traffic_identity?: {
            status?: string;
            http_status?: number;
            session_event_count?: number;
          };
        };

        if (!response.ok) {
          throw new Error(
            `Presence ping failed: ${response.status}`,
          );
        }

        if (payload.status === "stale") {
          return;
        }

        const bridgeStatus =
          payload
            .traffic_identity
            ?.status;

        if (
          reportTrafficIdentity &&
          bridgeStatus !== "stored"
        ) {
          console.warn(
            "Traffic identity presence was not stored:",
            payload
              .traffic_identity ??
              {
                status:
                  "missing-status",
              },
          );
        }
      } catch (error) {
        if (active) {
          console.warn(
            "Presence ping failed:",
            error,
          );
        }
      } finally {
        pingInFlight = false;
        if (active && !pageDeparted && pendingPing) {
          const forcePendingTrafficIdentity = pendingTrafficIdentity;
          pendingPing = false;
          pendingTrafficIdentity = false;
          void ping(forcePendingTrafficIdentity);
        }
      }
    };

    const leave = () => {
      if (pageDeparted) return;

      pageDeparted = true;
      presenceSequence += 1;

      const payload = JSON.stringify({
        action: "leave",
        presence_client_id: presenceClientId,
        presence_sequence: presenceSequence,
      });

      if (navigator.sendBeacon) {
        const accepted = navigator.sendBeacon(
          "/api/user/ping",
          new Blob([payload], {
            type: "application/json",
          }),
        );

        if (accepted) return;
      }

      void fetch("/api/user/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    void ping(true);

    const interval =
      window.setInterval(
        () => {
          void ping();
        },
        USER_ONLINE_HEARTBEAT_MS,
      );

    const onVisibilityChange = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void ping();
      }
    };

    const onFocus = () => {
      void ping();
    };

    const onOnline = () => {
      void ping(true);
    };

    const onPageShow = () => {
      pageDeparted = false;
      void ping(true);
    };

    const onPageHide = () => {
      leave();
    };

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    window.addEventListener(
      "focus",
      onFocus,
    );

    window.addEventListener(
      "online",
      onOnline,
    );

    window.addEventListener(
      "pageshow",
      onPageShow,
    );

    window.addEventListener(
      "pagehide",
      onPageHide,
    );

    return () => {
      active = false;

      window.clearInterval(
        interval,
      );

      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );

      window.removeEventListener(
        "focus",
        onFocus,
      );

      window.removeEventListener(
        "online",
        onOnline,
      );

      window.removeEventListener(
        "pageshow",
        onPageShow,
      );

      window.removeEventListener(
        "pagehide",
        onPageHide,
      );

      leave();
    };
  }, [uid]);

  const logout = useCallback(async () => {
    setUid(null);
    setToken(null);
    syncUserState(null);

    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch (error) {
      console.warn("Failed to clear server session cookie:", error);
    }

    router.push("/");
    router.refresh();
  }, [router, setUid, syncUserState]);

  const value: CtxShape = {
    playerName,
    setPlayerName,
    uid,
    setUid,
    token,
    isAdmin,
    canReviewOwnReplayResults,
    isAuthenticated: Boolean(uid),
    loading,
    user,
    loginWithSteam,
    logout,
    refreshToken,
    refreshSession,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUserAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUserAuth must be inside UserAuthProvider");
  return ctx;
}
