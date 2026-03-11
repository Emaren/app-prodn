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
  const [loading, setLoading] = useState(true);

  const syncUserState = useCallback((nextUser: SessionUser | null) => {
    setUser(nextUser);
    setUidState(nextUser?.uid ?? null);
    setIsAdmin(Boolean(nextUser?.isAdmin));
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
    if (!uid) return;

    let active = true;

    const ping = async () => {
      try {
        await fetch("/api/user/ping", { method: "POST" });
      } catch (error) {
        if (active) {
          console.warn("Presence ping failed:", error);
        }
      }
    };

    void ping();
    const interval = window.setInterval(ping, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
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
