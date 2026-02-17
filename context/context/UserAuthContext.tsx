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

  async function loadUserFromBackend(uidValue: string, email?: string) {
    try {
      const res = await fetch("/api/user/me", {
        method: "GET",
        headers: {
          "x-user-uid": uidValue,
          ...(email ? { "x-user-email": email } : {}),
        },
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
  }

  useEffect(() => {
    const storedUid = localStorage.getItem("uid");
    const storedName = localStorage.getItem("playerName");
    const storedEmail = localStorage.getItem("userEmail") || undefined;
    const storedIsAdmin = localStorage.getItem("isAdmin");

    if (storedName) setPlayerNameState(storedName);
    if (storedIsAdmin) setIsAdmin(storedIsAdmin === "true");

    if (storedUid) {
      setUidState(storedUid);
      loadUserFromBackend(storedUid, storedEmail).finally(() => setLoading(false));
      return;
    }

    setLoading(false);
  }, []);

  async function logout() {
    setUid(null);
    setToken(null);
    setPlayerNameState("");
    setIsAdmin(false);
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
