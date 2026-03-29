"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { LobbyOnlineUser } from "@/lib/lobby";

type OnlinePlayersPanelProps = {
  onlineUsers: LobbyOnlineUser[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
};

export function OnlinePlayersPanel({
  onlineUsers,
  themeKey,
  viewMode,
}: OnlinePlayersPanelProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div className={`rounded-[1.75rem] border p-6 ${tone.panelShell}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Lobby</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Online Players</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/players"
            className={`rounded-full border px-3 py-1 text-xs transition ${tone.secondaryButton}`}
          >
            Browse Players
          </Link>
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.activeBadge}`}>
            {onlineUsers.length} active
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {onlineUsers.length === 0 ? (
          <p className={`rounded-2xl border px-4 py-5 text-sm text-slate-300 ${tone.card}`}>
            No recent presence yet. Once signed-in players start pinging the site, this becomes the
            real lobby roster.
          </p>
        ) : (
          onlineUsers.map((onlineUser) => (
            <OnlineUserCard key={onlineUser.uid} user={onlineUser} themeKey={themeKey} viewMode={viewMode} />
          ))
        )}
      </div>
    </div>
  );
}

function OnlineUserCard({
  user,
  themeKey,
  viewMode,
}: {
  user: LobbyOnlineUser;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
}) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <Link
      href={`/players/${user.uid}`}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
    >
      <div>
        <div className="font-medium text-white">{user.in_game_name}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {user.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
          {user.verified ? (
            <MiniIdentityPill toneClassName={tone.neutralPill}>Replay verified</MiniIdentityPill>
          ) : (
            <MiniIdentityPill toneClassName={tone.neutralPill}>New player</MiniIdentityPill>
          )}
        </div>
      </div>
      <div
        className={`rounded-full px-3 py-1 text-xs ${
          user.verified ? tone.activeBadge : tone.neutralPill
        }`}
      >
        {user.verified ? "Trusted" : "New"}
      </div>
    </Link>
  );
}

function MiniIdentityPill({
  children,
  toneClassName,
}: {
  children: ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}
