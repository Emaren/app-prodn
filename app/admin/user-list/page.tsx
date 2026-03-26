"use client";

import Link from "next/link";
import { BellDot, Eye, Gift, MessageSquareMore, Palette, Shield, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import { DEFAULT_BADGE_LABELS } from "@/lib/communityHonors";

type Badge = {
  id: number;
  label: string;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

type GiftRow = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

type Appearance = {
  themeKey: string;
  viewMode: string;
  updatedAt: string | null;
};

type Activity = {
  id: number;
  type: string;
  path: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AdminUserRow = {
  uid: string;
  email: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
  steamId: string | null;
  displayName: string;
  verified: boolean;
  verificationLevel: number;
  createdAt: string;
  lastSeen: string | null;
  isAdmin: boolean;
  badges: Badge[];
  giftedWolo: number;
  gifts: GiftRow[];
  unreadCount: number;
  userUnreadCount: number;
  lastInboxReadAt: string | null;
  adminLastInboxReadAt: string | null;
  appearance: Appearance | null;
  recentActions: Activity[];
  pendingBadgeCount: number;
  pendingGiftCount: number;
};

type AdminOverview = {
  totalUsers: number;
  activeUsers24h: number;
  unreadForAdmin: number;
  unreadForUsers: number;
  pendingHonors: number;
  themeBreakdown: Array<{ themeKey: string; count: number }>;
  viewBreakdown: Array<{ viewMode: string; count: number }>;
};

type AdminUsersPayload = {
  users: AdminUserRow[];
  overview: AdminOverview;
};

type DraftState = {
  customBadge: string;
  giftKind: string;
  giftAmount: string;
  giftNote: string;
};

const EMPTY_DRAFT: DraftState = {
  customBadge: "",
  giftKind: "WOLO",
  giftAmount: "",
  giftNote: "",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatShortDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivityType(value: string) {
  return value.replace(/_/g, " ");
}

function summarizeActivity(activity: Activity) {
  const label = activity.label ? ` · ${activity.label}` : "";
  if (activity.path) {
    return `${formatActivityType(activity.type)}${label} · ${activity.path}`;
  }
  return `${formatActivityType(activity.type)}${label}`;
}

function findLatestPageView(actions: Activity[]) {
  return actions.find((action) => action.type === "page_view")?.path ?? null;
}

function statusTone(status: string) {
  if (status === "accepted") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "declined") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
}

function unreadTone(count: number) {
  return count > 0
    ? "border-red-400/30 bg-red-500/12 text-red-100"
    : "border-white/10 bg-white/5 text-slate-400";
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      {sublabel ? <div className="mt-2 text-sm text-slate-400">{sublabel}</div> : null}
    </div>
  );
}

export default function UsersPage() {
  const [payload, setPayload] = useState<AdminUsersPayload | null>(null);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const getDraft = useCallback(
    (uid: string) => drafts[uid] ?? EMPTY_DRAFT,
    [drafts]
  );

  const updateDraft = useCallback((uid: string, patch: Partial<DraftState>) => {
    setDrafts((current) => ({
      ...current,
      [uid]: {
        ...(current[uid] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setError("");
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as AdminUsersPayload;
      setPayload(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchUsers();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchUsers]);

  const sortedUsers = useMemo(() => {
    const users = payload?.users ?? [];
    return [...users].sort((left, right) => {
      if (left.userUnreadCount !== right.userUnreadCount) {
        return right.userUnreadCount - left.userUnreadCount;
      }

      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      const leftSeen = left.lastSeen ? new Date(left.lastSeen).getTime() : 0;
      const rightSeen = right.lastSeen ? new Date(right.lastSeen).getTime() : 0;
      return rightSeen - leftSeen;
    });
  }, [payload?.users]);

  async function runCommunityAction(uid: string, body: Record<string, unknown>) {
    setBusyKey(`${uid}:${String(body.action)}`);
    try {
      const response = await fetch(`/api/admin/users/${uid}/community`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const actionPayload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(actionPayload.detail || `Request failed: ${response.status}`);
      }

      await fetchUsers();
    } catch (actionError) {
      console.error("Community action failed:", actionError);
      alert(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteUser(uid: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    setBusyKey(`${uid}:delete`);
    try {
      const res = await fetch(`/api/admin/delete_user/${uid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchUsers();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="max-w-4xl space-y-4">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
            Community Command Tower
          </div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">
            Admin dashboard for the real player experience
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Theme choices, unread surprises, direct-line reads, badge acceptance, WOLO gift state,
            and recent actions now sit together so you can see who is engaged, who is drifting, and
            where the product needs love next.
          </p>
        </div>
      </section>

      {payload?.overview ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Users" value={payload.overview.totalUsers} sublabel={`${payload.overview.activeUsers24h} active in 24h`} />
          <StatCard label="Needs Reply" value={payload.overview.unreadForAdmin} sublabel="Unread from players to you" />
          <StatCard label="Player Surprise" value={payload.overview.unreadForUsers} sublabel="Unread items currently showing for players" />
          <StatCard label="Pending Honors" value={payload.overview.pendingHonors} sublabel="Badges + gifts waiting on acceptance" />
        </section>
      ) : null}

      {payload?.overview ? (
        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Palette className="h-4 w-4" />
              Theme Mix
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {payload.overview.themeBreakdown.map((entry) => (
                <div key={entry.themeKey} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{entry.themeKey}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{entry.count}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Sparkles className="h-4 w-4" />
              Tile Skin Split
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {payload.overview.viewBreakdown.map((entry) => (
                <div key={entry.viewMode} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{entry.viewMode}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{entry.count}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {sortedUsers.map((user) => {
          const draft = getDraft(user.uid);
          const latestPath = findLatestPageView(user.recentActions);

          return (
            <article
              key={user.uid}
              className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-2xl font-semibold text-white">{user.displayName}</div>
                      {user.isAdmin ? (
                        <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                          Admin
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        level {user.verificationLevel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      {user.verified
                        ? "verified profile"
                        : user.steamId
                          ? "steam linked profile"
                          : "claimed account"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs ${unreadTone(user.unreadCount)}`}>
                      {user.unreadCount} needs your reply
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs ${unreadTone(user.userUnreadCount)}`}>
                      {user.userUnreadCount} on their red icon
                    </span>
                    {user.pendingBadgeCount + user.pendingGiftCount > 0 ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                        {user.pendingBadgeCount + user.pendingGiftCount} honors pending
                      </span>
                    ) : null}
                    {user.giftedWolo > 0 ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                        {user.giftedWolo} accepted WOLO live
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/contact-emaren?user=${encodeURIComponent(user.uid)}`}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    <MessageSquareMore className="h-4 w-4" />
                    Message
                    {user.userUnreadCount > 0 ? (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {user.userUnreadCount}
                      </span>
                    ) : null}
                  </Link>
                  <Link
                    href={`/players/${encodeURIComponent(user.uid)}`}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
                  >
                    Public Page
                  </Link>
                  <button
                    type="button"
                    className="rounded-full border border-red-400/30 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
                    onClick={() => {
                      void deleteUser(user.uid);
                    }}
                    disabled={busyKey === `${user.uid}:delete`}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr_0.95fr]">
                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                    <Shield className="h-4 w-4" />
                    Identity + Experience
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                    <IdentityRow label="UID" value={user.uid} />
                    <IdentityRow label="Email" value={user.email || "—"} />
                    <IdentityRow label="Steam Persona" value={user.steamPersonaName || "—"} />
                    <IdentityRow label="Steam ID" value={user.steamId || "—"} />
                    <IdentityRow label="Created" value={formatDate(user.createdAt)} />
                    <IdentityRow label="Last Seen" value={formatDate(user.lastSeen)} />
                    <IdentityRow
                      label="Theme / Skin"
                      value={
                        user.appearance
                          ? `${user.appearance.themeKey} / ${user.appearance.viewMode}`
                          : "midnight / steel"
                      }
                    />
                    <IdentityRow label="Theme Updated" value={formatDate(user.appearance?.updatedAt ?? null)} />
                    <IdentityRow label="Last Route" value={latestPath || "No tracked page yet"} />
                    <IdentityRow label="Inbox Read" value={formatShortDate(user.lastInboxReadAt)} />
                  </dl>
                </section>

                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                    <BellDot className="h-4 w-4" />
                    Direct Line State
                  </div>
                  <div className="mt-4 grid gap-3">
                    <MiniStat
                      label="They See"
                      value={String(user.userUnreadCount)}
                      tone={user.userUnreadCount > 0 ? "alert" : "neutral"}
                      sublabel="Unread count on their chat icon"
                    />
                    <MiniStat
                      label="You See"
                      value={String(user.unreadCount)}
                      tone={user.unreadCount > 0 ? "alert" : "neutral"}
                      sublabel="Unread messages from this user"
                    />
                    <MiniStat
                      label="They Read"
                      value={formatShortDate(user.lastInboxReadAt)}
                      tone="neutral"
                      sublabel="Last time they opened or read the thread"
                    />
                    <MiniStat
                      label="Honors Pending"
                      value={String(user.pendingBadgeCount + user.pendingGiftCount)}
                      tone={user.pendingBadgeCount + user.pendingGiftCount > 0 ? "alert" : "neutral"}
                      sublabel="Waiting for accept / display decision"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                    <Eye className="h-4 w-4" />
                    Recent Actions
                  </div>
                  <div className="mt-4 space-y-3">
                    {user.recentActions.length > 0 ? (
                      user.recentActions.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                        >
                          <div className="text-sm text-white">{summarizeActivity(activity)}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {formatShortDate(activity.createdAt)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                        No tracked activity yet.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Badges</div>
                    <div className="text-xs text-slate-400">{user.badges.length} total</div>
                  </div>

                  <div className="mt-4 flex min-h-16 flex-wrap gap-2">
                    {user.badges.length > 0 ? (
                      user.badges.map((badge) => (
                        <div
                          key={badge.id}
                          className="rounded-2xl border border-white/8 bg-slate-900/70 px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <CommunityBadgePill label={badge.label} />
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(badge.status)}`}>
                              {badge.status}
                            </span>
                            {badge.displayOnProfile ? (
                              <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-100">
                                public
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-slate-400">
                            {badge.note || "No note"} · {formatShortDate(badge.acceptedAt || badge.createdAt)}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void runCommunityAction(user.uid, {
                                action: "remove_badge",
                                badgeId: badge.id,
                              });
                            }}
                            className="mt-2 text-xs text-red-300 transition hover:text-red-200"
                            title="Remove badge"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No honors added yet.</div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {DEFAULT_BADGE_LABELS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          void runCommunityAction(user.uid, {
                            action: "add_badge",
                            label,
                          });
                        }}
                        disabled={busyKey === `${user.uid}:add_badge`}
                        className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                      >
                        + {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      value={draft.customBadge}
                      onChange={(event) =>
                        updateDraft(user.uid, { customBadge: event.target.value })
                      }
                      placeholder="Custom badge"
                      className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void runCommunityAction(user.uid, {
                          action: "add_badge",
                          label: draft.customBadge,
                        });
                        updateDraft(user.uid, { customBadge: "" });
                      }}
                      className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                    >
                      Add
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                      <Gift className="h-4 w-4" />
                      Gifts
                    </div>
                    <div className="text-xs text-slate-400">{user.giftedWolo} accepted WOLO</div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {user.gifts.length > 0 ? (
                      user.gifts.map((gift) => (
                        <div
                          key={gift.id}
                          className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white">
                                {gift.amount ? `${gift.amount} ` : ""}
                                {gift.kind}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {gift.note || "No note"}
                              </div>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(gift.status)}`}>
                              {gift.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                            <span>{formatShortDate(gift.acceptedAt || gift.createdAt)}</span>
                            <span>{gift.displayOnProfile ? "public" : "private"}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void runCommunityAction(user.uid, {
                                action: "delete_gift",
                                giftId: gift.id,
                              });
                            }}
                            className="mt-2 text-xs text-red-300 transition hover:text-red-200"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No gifts recorded yet.</div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-[0.85fr_0.65fr]">
                    <input
                      value={draft.giftKind}
                      onChange={(event) => updateDraft(user.uid, { giftKind: event.target.value })}
                      placeholder="Gift type"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
                    />
                    <input
                      value={draft.giftAmount}
                      onChange={(event) => updateDraft(user.uid, { giftAmount: event.target.value })}
                      placeholder="Amount"
                      inputMode="numeric"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={draft.giftNote}
                      onChange={(event) => updateDraft(user.uid, { giftNote: event.target.value })}
                      placeholder="Note or reason"
                      className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void runCommunityAction(user.uid, {
                          action: "add_gift",
                          kind: draft.giftKind,
                          amount: draft.giftAmount,
                          note: draft.giftNote,
                        });
                        updateDraft(user.uid, {
                          giftKind: "WOLO",
                          giftAmount: "",
                          giftNote: "",
                        });
                      }}
                      className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                    >
                      Grant
                    </button>
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-1 break-all text-sm text-slate-200">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel: string;
  tone: "neutral" | "alert";
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        tone === "alert"
          ? "border-red-400/20 bg-red-500/10"
          : "border-white/8 bg-slate-900/70"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}
