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
import {
  getAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebaseClient";

type CtxShape = {
  playerName: string | null;
  setPlayerName: (n: string) => void;
  uid: string | null;
  token: string | null;
  isAdmin: boolean;
  loading: boolean;
  logout(): Promise<void>;
  refreshToken(): Promise<string | null>;
};

const Ctx = createContext<CtxShape | undefined>(undefined);

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const auth = typeof window !== "undefined" ? getAuth(getFirebaseApp()) : undefined as any;

  const [uid, setUid] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
  };

  /* ----------  Firebase boot-strap  ---------- */
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const t = await user.getIdToken(true);
        setToken(t);
        await loadUserFromBackend(t);
      } else {
        setUid(null);
        setToken(null);
        setPlayerNameState(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    const unsubToken = onIdTokenChanged(auth, async (user) => {
      if (user) setToken(await user.getIdToken());
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  const refreshToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    const fresh = await auth.currentUser.getIdToken(true);
    setToken(fresh);
    return fresh;
  }, [auth]);

  async function loadUserFromBackend(jwt: string) {
    try {
      const res = await fetch("/api/user/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setPlayerNameState(null); // Not yet registered in backend
        }
        return;
      }
      const data = await res.json();
      setPlayerNameState(data.in_game_name ?? null);
      setIsAdmin(Boolean(data.is_admin));
    } catch (err) {
      console.warn("Failed to load user profile:", err);
    }
  }

  async function savePlayerName(newName: string) {
    if (!auth.currentUser || !newName) return;

    try {
      const jwt = await auth.currentUser.getIdToken();
      const res = await fetch("/api/user/me", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ in_game_name: newName }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlayerNameState(data.in_game_name || newName);
      } else {
        console.error("Failed to save player name:", await res.text());
      }
    } catch (err) {
      console.error("Network error:", err);
    }
  }

  async function logout() {
    await signOut(auth);
    router.push("/");
    router.refresh();
  }

  const value: CtxShape = {
    playerName,
    setPlayerName,
    uid,
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
