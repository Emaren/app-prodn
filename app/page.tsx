"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const C = {
  bg: "#121212",
  white: "#FFFFFF",
  white70: "rgba(255,255,255,0.70)",
  white12: "rgba(255,255,255,0.12)",
  gold: "#FFD700",
};

const LS_IGN = "aoe2hdbets_ign";

export default function HomePage() {
  // ✅ draft vs saved (confirmed)
  const [inGameNameDraft, setInGameNameDraft] = useState("");
  const [inGameNameSaved, setInGameNameSaved] = useState("");

  const [opponent, setOpponent] = useState("");

  const stage = useMemo(
    () => (inGameNameSaved.trim() ? "challenge" : "setname"),
    [inGameNameSaved]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_IGN) || "";
      if (saved) {
        setInGameNameSaved(saved);
        setInGameNameDraft(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  function saveName() {
    const v = inGameNameDraft.trim();
    if (!v) return;

    try {
      localStorage.setItem(LS_IGN, v);
    } catch {
      // ignore
    }

    setInGameNameSaved(v);
    // stage computed from saved
  }

  function clearName() {
    try {
      localStorage.removeItem(LS_IGN);
    } catch {
      // ignore
    }
    setOpponent("");
    setInGameNameSaved("");
    setInGameNameDraft("");
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: C.bg, color: C.white }}>
      <div className="flex min-h-screen items-center justify-center">
        {/* Flutter: SingleChildScrollView padding: horizontal 32, vertical 48 */}
        <div className="w-full max-w-xl px-8 py-12">
          <div className="flex flex-col items-center text-center">
            {/* Flutter: GestureDetector -> open explorer */}
            <a
              href="https://explorer.aoe2hdbets.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Open explorer"
              className="inline-flex"
            >
              {/* Flutter: Image.asset width: 120 */}
              <Image
                src="/legacy/wolo_emblem.png"
                alt="WOLO emblem"
                width={120}
                height={120}
                priority
              />
            </a>

            {/* Flutter: const Text('AoE2HD p2p Betting', style: white70) */}
            <div className="mt-2 text-sm" style={{ color: C.white70 }}>
              AoE2HD p2p Betting
            </div>
          </div>

          <div className="h-6" />

          {stage === "setname" ? (
            <div className="space-y-3">
              <FilledField
                label="Your Steam/In-Game Name"
                value={inGameNameDraft}
                onChange={setInGameNameDraft}
                onEnter={saveName}
              />

              <div className="pt-2">
                <button
                  type="button"
                  className="rounded-md px-8 py-3.5 text-sm font-semibold"
                  style={{ backgroundColor: C.gold, color: "#111" }}
                  onClick={saveName}
                >
                  Enter the Arena
                </button>
              </div>

              <DiscordRow />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center text-sm" style={{ color: C.white70 }}>
                Welcome,{" "}
                <span className="font-semibold text-white">{inGameNameSaved.trim()}</span>!
              </div>

              <FilledField
                label="Opponent's Steam Name"
                value={opponent}
                onChange={setOpponent}
                onEnter={() => {}}
              />

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-md px-8 py-3.5 text-sm font-semibold"
                  style={{ backgroundColor: C.gold, color: "#111" }}
                  onClick={() => {}}
                >
                  Challenge
                </button>

                <button
                  type="button"
                  className="text-sm underline"
                  style={{ color: C.white70 }}
                  onClick={clearName}
                >
                  Change name
                </button>
              </div>

              <DiscordRow />
            </div>
          )}

          <div className="h-6" />
        </div>
      </div>
    </main>
  );
}

function FilledField({
  label,
  value,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm" style={{ color: C.white70 }}>
        {label}
      </div>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="w-full px-4 py-3 outline-none"
        style={{
          backgroundColor: C.white12,
          color: C.white,
          border: "none",
          borderRadius: 8,
        }}
        autoComplete="off"
      />
    </label>
  );
}

function DiscordRow() {
  return (
    <div className="pt-2">
      <a
        href="https://discord.gg/EfghKZY7U9"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center"
        aria-label="Join our Discord"
      >
        <Image
          src="/legacy/discord_white.svg"
          alt="Discord"
          width={32}
          height={32}
          style={{ opacity: 0.7 }}
        />
        <span className="ml-2 underline" style={{ color: C.white70, fontSize: 16 }}>
          Join our Discord
        </span>
      </a>
    </div>
  );
}