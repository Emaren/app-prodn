/* ----------------------------------------------------------------
context/UserAuthContext.tsx (Stabilized Edition)
---------------------------------------------------------------- */
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
  uid?: string;
  in_game_name?: string | null;
  is_admin?: boolean;
  email?: string | null;
};

type SessionEnvelope = {
  uid?: string;
  user?: SessionUser | null;
};

type CtxShape = {
  playerName: string;
  setPlayerName: (n: string) => void;
  uid: string | null;
  setUid: (uid: string | null) => void;
  token: string | null;
  isAdmin: boolean;
  loading: boolean;
  logout(): Promise<void>;
  refreshToken(): Promise<string | null>;
};

const Ctx = createContext<CtxShape | undefined>(undefined);

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [uid, setUidState] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    if (typeof window !== "undefined") {
      if (name) localStorage.setItem("playerName", name);
      else localStorage.removeItem("playerName");
    }
  }, []);

  const setUid = useCallback((nextUid: string | null) => {
    setUidState(nextUid);
    if (typeof window !== "undefined") {
      if (nextUid) localStorage.setItem("uid", nextUid);
      else localStorage.removeItem("uid");
    }
  }, []);

  const refreshToken = useCallback(async () => null, []);

  const ensureSession = useCallback(async () => {
    try {
      const storedEmail =
        typeof window !== "undefined" ? localStorage.getItem("userEmail") : null;
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storedEmail ? { email: storedEmail } : {}),
      });
      if (!response.ok) return null;

      const payload = (await response.json().catch(() => ({}))) as SessionEnvelope;
      const nextUid =
        typeof payload.uid === "string" && payload.uid.trim()
          ? payload.uid
          : typeof payload.user?.uid === "string" && payload.user.uid.trim()
            ? payload.user.uid
            : null;
      if (!nextUid) return null;

      setUidState(nextUid);
      localStorage.setItem("uid", nextUid);

      if (payload.user?.email && !storedEmail) {
        localStorage.setItem("userEmail", payload.user.email);
      }
      if (typeof payload.user?.is_admin === "boolean") {
        setIsAdmin(payload.user.is_admin);
        localStorage.setItem("isAdmin", String(payload.user.is_admin));
      }
      if (typeof payload.user?.in_game_name === "string" && payload.user.in_game_name.trim()) {
        setPlayerNameState(payload.user.in_game_name);
        localStorage.setItem("playerName", payload.user.in_game_name);
      }

      return nextUid;
    } catch (error) {
      console.warn("Failed to ensure session:", error);
      return null;
    }
  }, []);

  const loadUserFromBackend = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const resolvedName = data.in_game_name ?? "";
      setPlayerNameState(resolvedName);
      setIsAdmin(Boolean(data.is_admin));
      if (resolvedName) localStorage.setItem("playerName", resolvedName);
      localStorage.setItem("isAdmin", String(Boolean(data.is_admin)));
    } catch (err) {
      console.warn("Failed to load user profile:", err);
    }
  }, []);

  useEffect(() => {
    const storedName =
      typeof window !== "undefined" ? localStorage.getItem("playerName") : null;
    const storedIsAdmin =
      typeof window !== "undefined" ? localStorage.getItem("isAdmin") : null;

    if (storedName) setPlayerNameState(storedName);
    if (storedIsAdmin) setIsAdmin(storedIsAdmin === "true");

    let cancelled = false;
    (async () => {
      const nextUid = await ensureSession();
      if (cancelled) return;
      if (nextUid) {
        await loadUserFromBackend();
      }
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureSession, loadUserFromBackend]);

  async function logout() {
    setUid(null);
    setToken(null);
    setPlayerNameState("");
    setIsAdmin(false);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch (error) {
      console.warn("Failed to clear server session cookie:", error);
    }
    localStorage.removeItem("uid");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("playerName");
    localStorage.removeItem("userPass");
    localStorage.removeItem("isAdmin");
    router.push("/");
    router.refresh();
  }

  const value: CtxShape = {
    playerName,
    setPlayerName,
    uid,
    setUid,
    token,
    isAdmin,
    loading,
    logout,
    refreshToken,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUserAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUserAuth must be inside UserAuthProvider");
  return ctx;
}
