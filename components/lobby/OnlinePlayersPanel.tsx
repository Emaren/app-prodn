"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { LobbyOnlineUser } from "@/lib/lobby";

type OnlinePlayersPanelProps = {
  onlineUsers: LobbyOnlineUser[];
};

export function OnlinePlayersPanel({ onlineUsers }: OnlinePlayersPanelProps) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Lobby</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Online Players</h3>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/players"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            Browse Players
          </Link>
          <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            {onlineUsers.length} active
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {onlineUsers.length === 0 ? (
          <p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
            No recent presence yet. Once signed-in players start pinging the site, this becomes the
            real lobby roster.
          </p>
        ) : (
          onlineUsers.map((onlineUser) => <OnlineUserCard key={onlineUser.uid} user={onlineUser} />)
        )}
      </div>
    </div>
  );
}

function OnlineUserCard({ user }: { user: LobbyOnlineUser }) {
  return (
    <Link
      href={`/players/${user.uid}`}
      className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/30 hover:bg-white/10"
    >
      <div>
        <div className="font-medium text-white">{user.in_game_name}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {user.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
          {user.verified ? (
            <MiniIdentityPill>Replay verified</MiniIdentityPill>
          ) : (
            <MiniIdentityPill>New player</MiniIdentityPill>
          )}
        </div>
      </div>
      <div
        className={`rounded-full px-3 py-1 text-xs ${
          user.verified ? "bg-emerald-500/15 text-emerald-200" : "bg-white/8 text-slate-300"
        }`}
      >
        {user.verified ? "Trusted" : "New"}
      </div>
    </Link>
  );
}

function MiniIdentityPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
      {children}
    </span>
  );
}
