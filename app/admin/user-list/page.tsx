"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import { DEFAULT_BADGE_LABELS } from "@/lib/communityHonors";

type Badge = {
  id: number;
  label: string;
  note: string | null;
  createdAt: string;
};

type Gift = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
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
  gifts: Gift[];
  unreadCount: number;
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

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
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
      const data = (await res.json()) as AdminUserRow[];
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((left, right) => {
        if (left.unreadCount !== right.unreadCount) {
          return right.unreadCount - left.unreadCount;
        }

        const leftSeen = left.lastSeen ? new Date(left.lastSeen).getTime() : 0;
        const rightSeen = right.lastSeen ? new Date(right.lastSeen).getTime() : 0;
        return rightSeen - leftSeen;
      }),
    [users]
  );

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
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || `Request failed: ${response.status}`);
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
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="max-w-4xl space-y-4">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Community Control</div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">User Honors + Private Lines</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            This is where the first AoE2HDBets citizens become more than rows in a table. You can
            mark them as `OG`, `Contributor`, or `Founder`, grant WOLO or other gifts, and jump
            directly into their private thread when someone reaches out.
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {sortedUsers.map((user) => {
          const draft = getDraft(user.uid);
          return (
            <article
              key={user.uid}
              className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-semibold text-white">{user.displayName}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      {user.verified
                        ? `verified profile · level ${user.verificationLevel}`
                        : user.steamId
                          ? `steam linked · level ${user.verificationLevel}`
                          : "claimed account"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user.isAdmin ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                        Admin
                      </span>
                    ) : null}
                    {user.unreadCount > 0 ? (
                      <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs text-red-100">
                        {user.unreadCount} unread
                      </span>
                    ) : null}
                    {user.giftedWolo > 0 ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                        {user.giftedWolo} WOLO granted
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/contact-emaren?user=${encodeURIComponent(user.uid)}`}
                    className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    Message
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

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.95fr_0.95fr]">
                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Identity</div>
                  <dl className="mt-4 grid gap-3 text-sm text-slate-200">
                    <IdentityRow label="UID" value={user.uid} />
                    <IdentityRow label="Email" value={user.email || "—"} />
                    <IdentityRow label="Steam Persona" value={user.steamPersonaName || "—"} />
                    <IdentityRow label="Steam ID" value={user.steamId || "—"} />
                    <IdentityRow label="Created" value={formatDate(user.createdAt)} />
                    <IdentityRow label="Last Seen" value={formatDate(user.lastSeen)} />
                  </dl>
                </section>

                <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Badges</div>
                    <div className="text-xs text-slate-400">{user.badges.length} live</div>
                  </div>

                  <div className="mt-4 flex min-h-14 flex-wrap gap-2">
                    {user.badges.length > 0 ? (
                      user.badges.map((badge) => (
                        <button
                          key={badge.id}
                          type="button"
                          onClick={() => {
                            void runCommunityAction(user.uid, {
                              action: "remove_badge",
                              badgeId: badge.id,
                            });
                          }}
                          className="transition hover:scale-[1.02]"
                          title="Remove badge"
                        >
                          <CommunityBadgePill label={badge.label} />
                        </button>
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
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Gifts</div>
                    <div className="text-xs text-slate-400">{user.giftedWolo} WOLO total</div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {user.gifts.length > 0 ? (
                      user.gifts.slice(0, 4).map((gift) => (
                        <div
                          key={gift.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">
                              {gift.amount ? `${gift.amount} ` : ""}
                              {gift.kind}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {gift.note || "No note"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void runCommunityAction(user.uid, {
                                action: "delete_gift",
                                giftId: gift.id,
                              });
                            }}
                            className="text-xs text-red-300 transition hover:text-red-200"
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
