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
  refreshSession: () => Promise<void>;
};

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

function currentTrafficPresence() {
  if (typeof window === "undefined") return null;
  try {
    return {
      traffic_visitor_id: ensureTrafficId(localStorage, "traffic_visitor_id", "v"),
      traffic_session_id: ensureTrafficId(sessionStorage, "traffic_session_id", "s"),
      traffic_path: `${window.location.pathname}${window.location.search}`,
    };
  } catch {
    return null;
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
        return;
      }

      if (!response.ok) {
        throw new Error(`Session lookup failed: ${response.status}`);
      }

      const payload = (await response.json()) as SessionEnvelope;
      if (!payload.user || !payload.uid) {
        syncUserState(null);
        return;
      }

      syncUserState({
        ...payload.user,
        uid: payload.uid,
      });
    } catch (error) {
      console.warn("Failed to refresh session:", error);
      syncUserState(null);
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

    (async () => {
      await refreshSession();
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
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

    const ping = async () => {
      try {
        const presence =
          currentTrafficPresence();

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
                presence ?? {},
              ),
            },
          );

        const payload = (
          await response
            .json()
            .catch(() => ({}))
        ) as {
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

        const bridgeStatus =
          payload
            .traffic_identity
            ?.status;

        if (
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
      }
    };

    void ping();

    const interval =
      window.setInterval(
        ping,
        60_000,
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

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    window.addEventListener(
      "focus",
      onFocus,
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
