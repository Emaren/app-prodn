// app/page.tsx
"use client";

import React, { useState } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import AuthNamePrompt from "@/components/AuthNamePrompt";
import AuthPasswordPrompt from "@/components/AuthPasswordPrompt";
import MainBetUI from "@/components/MainBetUI";
import AdminUserList from "@/components/AdminUserList";

export default function Page() {
  const { uid, playerName, setPlayerName, setUid, loading, isAdmin } =
    useUserAuth();

  /* local UI state */
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [returningUser, setReturningUser] = useState(false);
  const [password, setPassword] = useState("");
  const [opponent, setOpponent] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  /* ───────────────── name → password prompt ───────────────── */
  const savePlayerName = async () => {
    if (!playerName.trim()) return;

    const res = await fetch(
      `/api/user/exists?name=${encodeURIComponent(playerName.trim())}`
    );
    const { exists } = await res.json();

    setReturningUser(exists);
    setShowPasswordPrompt(true);
  };

  /* ───────────────── sign-in OR sign-up ───────────────────── */
  const finishPasswordStep = async () => {
    if (!password.trim()) return;
    const name = playerName.trim();
    if (!name) return;

    const existingEmail = localStorage.getItem("userEmail");
    const fallbackEmail = existingEmail || `guest-${crypto.randomUUID()}@aoe2hdbets.local`;

    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: fallbackEmail }),
    });
    if (!sessionRes.ok) {
      throw new Error(`Failed session setup: ${sessionRes.status}`);
    }

    const sessionPayload = (await sessionRes.json().catch(() => ({}))) as { uid?: string };
    const sessionUid = typeof sessionPayload.uid === "string" ? sessionPayload.uid : null;
    if (!sessionUid) throw new Error("Session response missing uid");

    /* 4. ask backend */
    const meRes = await fetch("/api/user/me", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: fallbackEmail,
        in_game_name: returningUser ? undefined : name,
      }),
    });

    if (meRes.status === 404 && !returningUser) {
      // brand-new user – register
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
        throw new Error(`Register failed: ${regRes.status} ${msg}`);
      }
    }

    /* 5. success */
    localStorage.setItem("uid", sessionUid);
    localStorage.setItem("userEmail", fallbackEmail);
    localStorage.setItem("playerName", name);
    setUid(sessionUid);
    window.dispatchEvent(new Event("storage"));
  };

  /* ───────────────── conditional UI ───────────────────────── */
  if (!uid && !showPasswordPrompt) {
    return (
      <AuthNamePrompt
        playerName={playerName}
        setPlayerName={setPlayerName}
        savePlayerName={savePlayerName}
        loading={loading}
      />
    );
  }

  if (!uid && showPasswordPrompt) {
    return (
      <AuthPasswordPrompt
        password={password}
        setPassword={setPassword}
        onSubmit={finishPasswordStep}
        mode={returningUser ? "login" : "register"}
        loading={loading}
      />
    );
  }

  /* ───────────────── main page ─────────────────────────────── */
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

      {isAdmin && <AdminUserList />}
    </main>
  );
}
