"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellDot,
  Coins,
  Gift,
  MessageSquareMore,
  ScrollText,
  Shield,
  Swords,
  Ticket,
} from "lucide-react";

import type {
  Activity,
  AdminUserRow,
  DraftState,
} from "@/components/admin/command-tower/types";
import {
  findLatestPageView,
  formatWolo,
  INITIAL_ACTIVITY_BATCH,
  shortHash,
  statusTone,
  summarizeActivity,
  unreadTone,
} from "@/components/admin/command-tower/utils";
import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { DEFAULT_BADGE_LABELS } from "@/lib/communityHonors";

type AdminUserCardProps = {
  user: AdminUserRow;
  draft: DraftState;
  busyKey: string | null;
  renderedActions: Activity[];
  activityTotal: number;
  nextOffset: number | null;
  onDraftChange: (uid: string, patch: Partial<DraftState>) => void;
  onLoadNextActions: (uid: string) => Promise<void>;
  onRunCommunityAction: (uid: string, body: Record<string, unknown>) => Promise<void>;
  onDeleteUser: (uid: string) => Promise<void>;
};

export default function AdminUserCard({
  user,
  draft,
  busyKey,
  renderedActions,
  activityTotal,
  nextOffset,
  onDraftChange,
  onLoadNextActions,
  onRunCommunityAction,
  onDeleteUser,
}: AdminUserCardProps) {
  const latestPath = findLatestPageView(renderedActions);

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
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
            {user.pendingWoloClaimCount > 0 ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                {formatWolo(user.pendingWoloClaimAmount)} WOLO unclaimed
              </span>
            ) : null}
            {user.giftedWolo > 0 ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                {user.giftedWolo} accepted WOLO live
              </span>
            ) : null}
            {user.betStats.activeCount > 0 ? (
              <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                {user.betStats.activeCount} live bets
              </span>
            ) : null}
            {user.scheduledMatches.length > 0 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {user.scheduledMatches.length} scheduled games
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
              void onDeleteUser(user.uid);
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
            <IdentityRow label="Created" value={<AdminTime value={user.createdAt} />} />
            <IdentityRow label="Last Seen" value={<AdminTime value={user.lastSeen} emptyValue="Never" />} />
            <IdentityRow
              label="Theme / Skin"
              value={
                user.appearance
                  ? `${user.appearance.themeKey} / ${user.appearance.viewMode} / ${user.appearance.timeDisplayMode}`
                  : "midnight / steel"
              }
            />
            <IdentityRow
              label="Theme Updated"
              value={<AdminTime value={user.appearance?.updatedAt ?? null} emptyValue="Never" />}
            />
            <IdentityRow label="Last Route" value={latestPath || "No tracked page yet"} />
            <IdentityRow label="Last Activity" value={<AdminTime value={user.lastActivityAt} emptyValue="Never" />} />
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
              value={<AdminTime value={user.lastInboxReadAt} emptyValue="Never" />}
              tone="neutral"
              sublabel="Last time they opened or read the thread"
            />
            <MiniStat
              label="Tracked Actions"
              value={String(activityTotal)}
              tone={activityTotal > INITIAL_ACTIVITY_BATCH ? "alert" : "neutral"}
              sublabel="Persisted user activity events on file"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              Recent Actions
            </div>
            <div>
              {renderedActions.length}/{activityTotal}
            </div>
          </div>
          <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {renderedActions.length > 0 ? (
              renderedActions.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                >
                  <div className="text-sm text-white">{summarizeActivity(activity)}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    <AdminTime value={activity.createdAt} />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                No tracked activity yet.
              </div>
            )}
          </div>
          {nextOffset !== null ? (
            <button
              type="button"
              onClick={() => {
                void onLoadNextActions(user.uid);
              }}
              disabled={busyKey === `${user.uid}:next_actions`}
              className="mt-3 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-xs uppercase tracking-[0.24em] text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {busyKey === `${user.uid}:next_actions` ? "Loading..." : "Next 50"}
            </button>
          ) : null}
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
                    {badge.note || "No note"} ·{" "}
                    <AdminTime value={badge.acceptedAt || badge.createdAt} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void onRunCommunityAction(user.uid, {
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
                  void onRunCommunityAction(user.uid, {
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
              onChange={(event) => onDraftChange(user.uid, { customBadge: event.target.value })}
              placeholder="Custom badge"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <button
              type="button"
              onClick={() => {
                void onRunCommunityAction(user.uid, {
                  action: "add_badge",
                  label: draft.customBadge,
                });
                onDraftChange(user.uid, { customBadge: "" });
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
                <div key={gift.id} className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">
                        {gift.amount ? `${gift.amount} ` : ""}
                        {gift.kind}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{gift.note || "No note"}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(gift.status)}`}>
                      {gift.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <AdminTime value={gift.acceptedAt || gift.createdAt} />
                    <span>{gift.displayOnProfile ? "public" : "private"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void onRunCommunityAction(user.uid, {
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
              onChange={(event) => onDraftChange(user.uid, { giftKind: event.target.value })}
              placeholder="Gift type"
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <input
              value={draft.giftAmount}
              onChange={(event) => onDraftChange(user.uid, { giftAmount: event.target.value })}
              placeholder="Amount"
              inputMode="numeric"
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft.giftNote}
              onChange={(event) => onDraftChange(user.uid, { giftNote: event.target.value })}
              placeholder="Note or reason"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35"
            />
            <button
              type="button"
              onClick={() => {
                void onRunCommunityAction(user.uid, {
                  action: "add_gift",
                  kind: draft.giftKind,
                  amount: draft.giftAmount,
                  note: draft.giftNote,
                });
                onDraftChange(user.uid, {
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
              <Coins className="h-4 w-4" />
              WOLO Claim Rail
            </div>
            <div className="text-xs text-slate-400">
              {user.pendingWoloClaimCount} pending · {user.claimedWoloClaimCount} claimed
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {user.pendingWoloClaims.length > 0 ? (
              user.pendingWoloClaims.map((claim) => (
                <div key={claim.id} className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">
                        {formatWolo(claim.amountWolo)} WOLO · {claim.displayPlayerName}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {claim.note || "Pending replay-winner claim"} ·{" "}
                        <AdminTime value={claim.createdAt} />
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        market {claim.sourceMarketId ?? "—"} · game {claim.sourceGameStatsId ?? "—"}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(claim.status)}`}>
                      {claim.status}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={draft.rescindNote}
                      onChange={(event) => onDraftChange(user.uid, { rescindNote: event.target.value })}
                      placeholder="Rescind note"
                      className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/35"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void onRunCommunityAction(user.uid, {
                          action: "rescind_wolo_claim",
                          claimId: claim.id,
                          note: draft.rescindNote,
                        });
                        onDraftChange(user.uid, { rescindNote: "" });
                      }}
                      className="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
                    >
                      Rescind
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                No pending WOLO claims matched to this user yet.
              </div>
            )}

            {user.claimedWoloClaims.length > 0 ? (
              <div className="pt-2">
                <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  Claimed history
                </div>
                <div className="space-y-2">
                  {user.claimedWoloClaims.map((claim) => (
                    <div key={claim.id} className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm text-white">
                          {formatWolo(claim.amountWolo)} WOLO · {claim.displayPlayerName}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(claim.status)}`}>
                          {claim.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        <AdminTime value={claim.claimedAt || claim.createdAt} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/5 p-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                <Swords className="h-4 w-4" />
                Scheduled Games
              </div>
              <div className="mt-4 space-y-2">
                {user.scheduledMatches.length > 0 ? (
                  user.scheduledMatches.map((match) => (
                    <div
                      key={`${user.uid}-match-${match.id}-${match.role}`}
                      className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium text-white">
                            {match.role === "challenger" ? "vs" : "from"} {match.opponentName}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            <AdminTime value={match.activityAt} /> · {match.status}
                          </div>
                          {match.linkedMapName ? (
                            <div className="mt-1 break-words text-[11px] text-slate-500">
                              {match.linkedMapName}
                              {match.linkedWinner ? ` · winner ${match.linkedWinner}` : ""}
                            </div>
                          ) : null}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(match.status)}`}>
                          {match.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                    No tracked scheduled games yet.
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
                <Ticket className="h-4 w-4" />
                Bet Rail
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniStat
                  label="Active"
                  value={String(user.betStats.activeCount)}
                  tone={user.betStats.activeCount > 0 ? "alert" : "neutral"}
                  sublabel="Live positions"
                />
                <MiniStat
                  label="Staked"
                  value={`${formatWolo(user.betStats.stakedWolo)} WOLO`}
                  tone="neutral"
                  sublabel="Total stake on file"
                />
                <MiniStat
                  label="Won"
                  value={String(user.betStats.wonCount)}
                  tone={user.betStats.wonCount > 0 ? "alert" : "neutral"}
                  sublabel="Settled wins"
                />
                <MiniStat
                  label="Paid Out"
                  value={`${formatWolo(user.betStats.paidOutWolo)} WOLO`}
                  tone="neutral"
                  sublabel="Total payout recorded"
                />
              </div>

              <div className="mt-4 space-y-2">
                {user.betLedger.length > 0 ? (
                  user.betLedger.map((wager) => (
                    <div key={wager.id} className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium text-white">{wager.marketTitle}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {wager.eventLabel} · {wager.side} · {formatWolo(wager.amountWolo)} WOLO
                          </div>
                          <div className="mt-1 break-words text-[11px] text-slate-500">
                            <AdminTime value={wager.updatedAt} className="text-slate-400" />
                            {wager.payoutWolo ? ` · payout ${formatWolo(wager.payoutWolo)} WOLO` : ""}
                            {` · ${wager.executionMode}`}
                            {wager.stakeLockedAt ? " · escrow " : ""}
                            {wager.stakeLockedAt ? (
                              <AdminTime value={wager.stakeLockedAt} className="text-slate-400" />
                            ) : null}
                          </div>
                          {wager.stakeTxHash ? (
                            <div className="mt-1 text-[11px] text-slate-500">tx {shortHash(wager.stakeTxHash)}</div>
                          ) : null}
                          {wager.stakeWalletAddress ? (
                            <div className="mt-1 break-all text-[11px] text-slate-500">
                              {wager.stakeWalletAddress}
                            </div>
                          ) : null}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(wager.status)}`}>
                          {wager.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                    No wager history yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

function IdentityRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-white">{value}</dd>
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
  value: ReactNode;
  sublabel: string;
  tone: "neutral" | "alert";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        tone === "alert" ? "border-amber-300/20 bg-amber-400/10" : "border-white/8 bg-slate-900/70"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}

function AdminTime({
  value,
  className = "text-slate-400",
  emptyValue = "—",
}: {
  value: string | null;
  className?: string;
  emptyValue?: string;
}) {
  return (
    <TimeDisplayText
      value={value}
      className={className}
      bubbleClassName="max-w-[16rem] text-center"
      emptyValue={emptyValue}
    />
  );
}
