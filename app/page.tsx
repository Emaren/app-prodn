// app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import AuthNamePrompt from "@/components/AuthNamePrompt";
import AuthPasswordPrompt from "@/components/AuthPasswordPrompt";
import MainBetUI from "@/components/MainBetUI";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;
console.log("✅", API_BASE);

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

    const existingUid = localStorage.getItem("uid");
    const existingEmail = localStorage.getItem("userEmail");
    const sessionUid = existingUid || crypto.randomUUID();
    const sessionEmail = existingEmail || `guest-${sessionUid}@aoe2hdbets.local`;

    const meRes = await fetch(`${API_BASE}/api/user/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": sessionUid,
        "x-user-email": sessionEmail,
      },
      body: JSON.stringify({ uid: sessionUid, email: sessionEmail }),
    });

    if (meRes.status === 404) {
      const regRes = await fetch(`${API_BASE}/api/user/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": sessionUid,
          "x-user-email": sessionEmail,
        },
        body: JSON.stringify({
          uid: sessionUid,
          email: sessionEmail,
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
    } else if (meRes.ok) {
      const payload = await meRes.json().catch(() => ({}));
      localStorage.setItem("isAdmin", String(Boolean(payload?.is_admin)));
    } else {
      console.error("Failed /api/user/me:", meRes.status, await meRes.text());
      return;
    }

    localStorage.setItem("userPass", password);
    localStorage.setItem("uid", sessionUid);
    localStorage.setItem("userEmail", sessionEmail);
    localStorage.setItem("playerName", name);

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
        mode={localStorage.getItem("uid") ? "login" : "register"}
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
