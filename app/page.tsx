// app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import AuthNamePrompt from "@/components/AuthNamePrompt";
import AuthPasswordPrompt from "@/components/AuthPasswordPrompt";
import MainBetUI from "@/components/MainBetUI";
import AdminUserList from "@/components/AdminUserList";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;
console.log("✅", API_BASE);

export default function Page() {
  const { uid, playerName, setPlayerName, setUid, loading, isAdmin } = useUserAuth();

  const [showPwPrompt, setShowPwPrompt] = useState(false);
  const [password, setPassword] = useState("");
  const [opponent, setOpponent] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!uid) setShowPwPrompt(false);
  }, [uid]);

  const savePlayerName = () => {
    if (playerName.trim()) setShowPwPrompt(true);
  };

  const savePasswordAndAuth = async () => {
    if (!password.trim()) return;

    const auth = window.firebase.auth();
    const existingEmail = localStorage.getItem("userEmail");
    const existingPass = localStorage.getItem("userPass");

    let email = existingEmail;
    let firstTime = false;

    try {
      if (existingEmail && existingPass) {
        await auth.signInWithEmailAndPassword(existingEmail, existingPass);
      } else {
        email = `${crypto.randomUUID()}@aoe2hdbets.com`;
        await auth.createUserWithEmailAndPassword(email, password);
        firstTime = true;
      }
    } catch (e) {
      console.error("Firebase auth error:", e);
      return;
    }

    const fbUser = auth.currentUser!;
    const firebaseUid = fbUser.uid;
    const token = await fbUser.getIdToken(true);

    if (firstTime) {
      localStorage.setItem("userPass", password);
      localStorage.setItem("uid", firebaseUid);
      localStorage.setItem("userEmail", email!);
      localStorage.setItem("playerName", playerName.trim());
    }

    const meRes = await fetch(`${API_BASE}/api/user/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid: firebaseUid, email }),
    });

    if (meRes.status === 404) {
      const regRes = await fetch(`${API_BASE}/api/user/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: firebaseUid,
          email,
          in_game_name: playerName.trim(),
        }),
      });
      if (!regRes.ok && regRes.status !== 400) {
        console.error("Register failed:", await regRes.text());
        return;
      }
      if (regRes.ok) {
        const { is_admin } = await regRes.json();
        localStorage.setItem("isAdmin", String(is_admin));
      }
    } else if (meRes.ok) {
      const { is_admin } = await meRes.json();
      localStorage.setItem("isAdmin", String(is_admin));
    }

    setUid(firebaseUid);
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
