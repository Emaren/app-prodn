/* ----------------------------------------------------------------
   components/AuthNamePrompt.tsx
   ---------------------------------------------------------------- */
"use client";

import { useState } from "react";
import { useUserAuth } from "@/context/UserAuthContext";

export default function AuthNamePrompt() {
  const { playerName, setPlayerName, token, refreshToken } = useUserAuth();
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (playerName) return null; // already registered

  const handleSubmit = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const jwt = token ?? (await refreshToken());
      if (!jwt) throw new Error("No JWT");

      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ in_game_name: trimmed }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || res.statusText);
      }

      setPlayerName(trimmed);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      <input
        className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 w-72 text-center"
        placeholder="Enter your in-game name"
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        disabled={submitting}
      />

      <button
        onClick={handleSubmit}
        className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Submitting…" : "Continue"}
      </button>

      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
