// app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import AuthNamePrompt from "@/components/AuthNamePrompt";
import AuthPasswordPrompt from "@/components/AuthPasswordPrompt";
import MainBetUI from "@/components/MainBetUI";

export default function Page() {
  const { uid, playerName, setPlayerName, setUid, loading } = useUserAuth();

  const [showPwPrompt, setShowPwPrompt] = useState(false);
  const [password, setPassword] = useState("");
  const [opponent, setOpponent] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!uid) setShowPwPrompt(false);
  }, [uid]);

  const savePlayerName = () => {
    if ((playerName || "").trim()) setShowPwPrompt(true);
  };

  const savePasswordAndAuth = async () => {
    if (!password.trim()) return;

    const name = (playerName || "").trim();
    if (!name) return;

    const existingEmail = localStorage.getItem("userEmail");
    const fallbackEmail = existingEmail || `guest-${crypto.randomUUID()}@aoe2hdbets.local`;

    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fallbackEmail }),
    });
    if (!sessionRes.ok) {
      console.error("Failed to create/refresh session:", sessionRes.status, await sessionRes.text());
      return;
    }

    const sessionPayload = (await sessionRes.json().catch(() => ({}))) as { uid?: string };
    const sessionUid = typeof sessionPayload.uid === "string" ? sessionPayload.uid : null;
    if (!sessionUid) {
      console.error("Session response missing uid");
      return;
    }

    const regRes = await fetch("/api/user/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: fallbackEmail,
        in_game_name: name,
      }),
    });
    if (!regRes.ok) {
      const msg = await regRes.text();
      console.error("Register failed:", msg);
      return;
    }

    const payload = await regRes.json().catch(() => ({}));
    localStorage.setItem("isAdmin", String(Boolean(payload?.is_admin)));
    localStorage.setItem("userEmail", fallbackEmail);
    localStorage.setItem("userPass", password);
    localStorage.setItem("uid", sessionUid);
    localStorage.setItem("playerName", name);

    if (!payload?.in_game_name) {
      const meRes = await fetch("/api/user/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: fallbackEmail }),
      });
      if (meRes.ok) {
        const mePayload = await meRes.json().catch(() => ({}));
        localStorage.setItem("isAdmin", String(Boolean(mePayload?.is_admin)));
      }
    }

    setUid(sessionUid);
    setShowPwPrompt(false);
    window.dispatchEvent(new Event("storage"));
  };

  if (!uid && !showPwPrompt) {
    return (
      <AuthNamePrompt
        playerName={playerName}
        setPlayerName={setPlayerName}
        savePlayerName={savePlayerName}
        loading={loading}
      />
    );
  }

  if (!uid && showPwPrompt) {
    return (
      <AuthPasswordPrompt
        password={password}
        setPassword={setPassword}
        onSubmit={savePasswordAndAuth}
        mode="register"
        loading={loading}
      />
    );
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto p-4 bg-gray-900 text-white min-h-screen space-y-8">
      <MainBetUI
        opponent={opponent}
        setOpponent={setOpponent}
        betPending={false}
        betAmount={0}
        challenger=""
        betStatus=""
        showButtons={false}
        handleAccept={() => {}}
        handleDecline={() => {}}
        handleChallenge={() => alert(`Challenged ${opponent}`)}
        pendingBets={[]}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        router={null}
        playerName={playerName}
      />

      {/* {isAdmin && <AdminUserList />} */}

    </main>
  );
}
