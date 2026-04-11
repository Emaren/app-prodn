"use client";

import { useCallback, useMemo, useState } from "react";
import { Palette, Sparkles } from "lucide-react";

import FounderBonusModal from "@/components/bets/FounderBonusModal";
import AdminUserCard from "@/components/admin/command-tower/AdminUserCard";
import type {
  DraftState,
  FounderComposerState,
  ReconcilePendingClaimsPayload,
} from "@/components/admin/command-tower/types";
import {
  formatWolo,
  pinnedBottomRank,
} from "@/components/admin/command-tower/utils";
import { useAdminCommandTowerData } from "@/components/admin/command-tower/useAdminCommandTowerData";
import { WoloMarketRail } from "@/components/admin/WoloMarketRail";
import { WoloSettlementRail } from "@/components/admin/WoloSettlementRail";
import { WatcherDownloadRail } from "@/components/admin/WatcherDownloadRail";

type DraftStateByUid = Record<string, DraftState>;

const EMPTY_DRAFT: DraftState = {
  customBadge: "",
  giftKind: "WOLO",
  giftAmount: "",
  giftNote: "",
  rescindNote: "",
};

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

export default function AdminCommandTowerPage() {
  const {
    data,
    activityByUid,
    activityTotals,
    activityNextOffsets,
    loading,
    error,
    refreshAll,
    loadNextActions,
  } = useAdminCommandTowerData();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftStateByUid>({});
  const [rescindingSettlementClaimId, setRescindingSettlementClaimId] = useState<number | null>(null);
  const [retryingSettlementClaimId, setRetryingSettlementClaimId] = useState<number | null>(null);
  const [reconcilingPendingClaims, setReconcilingPendingClaims] = useState(false);
  const [founderComposer, setFounderComposer] = useState<FounderComposerState | null>(null);
  const [savingFounderBonus, setSavingFounderBonus] = useState(false);
  const [founderBonusError, setFounderBonusError] = useState<string | null>(null);

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

  const rescindSettlementClaim = useCallback(async (claimId: number) => {
    const confirmed = window.confirm("Rescind this WOLO settlement row?");
    if (!confirmed) return;

    setRescindingSettlementClaimId(claimId);

    try {
      const response = await fetch(`/api/admin/wolo-claims/${claimId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "Rescinded from admin settlement rail",
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to rescind WOLO claim.");
      }

      await refreshAll();
    } catch (nextError) {
      const detail =
        nextError instanceof Error ? nextError.message : "Failed to rescind WOLO claim.";
      window.alert(detail);
    } finally {
      setRescindingSettlementClaimId(null);
    }
  }, [refreshAll]);

  const retrySettlementClaim = useCallback(async (claimId: number) => {
    const confirmed = window.confirm("Retry this failed WOLO payout from the admin rail?");
    if (!confirmed) return;

    setRetryingSettlementClaimId(claimId);

    try {
      const response = await fetch(`/api/admin/wolo-claims/${claimId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "retry_settlement",
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to retry WOLO payout.");
      }

      await refreshAll();
    } catch (nextError) {
      const detail =
        nextError instanceof Error ? nextError.message : "Failed to retry WOLO payout.";
      window.alert(detail);
    } finally {
      setRetryingSettlementClaimId(null);
    }
  }, [refreshAll]);

  const reconcilePendingClaims = useCallback(async () => {
    const confirmed = window.confirm(
      "Sweep pending WOLO claims and auto-settle any rows that now match verified wallet-linked users?"
    );
    if (!confirmed) return;

    setReconcilingPendingClaims(true);

    try {
      const response = await fetch("/api/admin/wolo-claims", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reconcile_pending",
          take: 40,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to reconcile pending WOLO claims.");
      }

      const result = (await response.json()) as ReconcilePendingClaimsPayload;
      await refreshAll();

      window.alert(
        [
          `Scanned ${result.summary.scannedCount} pending claims.`,
          `Settled ${result.summary.claimedCount} for ${formatWolo(result.summary.claimedAmountWolo)} WOLO.`,
          `Failed ${result.summary.failedCount}.`,
          `Still unmatched ${result.summary.skippedUnmatchedCount}.`,
          `Already had tx hash ${result.summary.skippedHasTxHashCount}.`,
        ].join("\n")
      );
    } catch (nextError) {
      const detail =
        nextError instanceof Error ? nextError.message : "Failed to reconcile pending WOLO claims.";
      window.alert(detail);
    } finally {
      setReconcilingPendingClaims(false);
    }
  }, [refreshAll]);

  const openFounderComposer = useCallback((row: { marketId: number | null; marketTitle: string | null; eventLabel: string | null }, bonusType: "participants" | "winner") => {
    if (!row.marketId) {
      return;
    }

    setFounderBonusError(null);
    setFounderComposer({
      marketId: row.marketId,
      marketTitle: row.marketTitle || row.eventLabel || `Market #${row.marketId}`,
      bonusType,
      amountValue: bonusType === "participants" ? "200" : "300",
      noteValue: "",
    });
  }, []);

  const submitFounderBonus = useCallback(async () => {
    if (!founderComposer) {
      return;
    }

    setSavingFounderBonus(true);
    setFounderBonusError(null);

    try {
      const response = await fetch(
        `/api/admin/bets/markets/${founderComposer.marketId}/founders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bonusType: founderComposer.bonusType,
            amountWolo: founderComposer.amountValue,
            note: founderComposer.noteValue || undefined,
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Founder bonus could not be saved.");
      }

      await refreshAll();
      setFounderComposer(null);
    } catch (nextError) {
      setFounderBonusError(
        nextError instanceof Error ? nextError.message : "Founder bonus could not be saved."
      );
    } finally {
      setSavingFounderBonus(false);
    }
  }, [founderComposer, refreshAll]);

  const runCommunityAction = useCallback(async (uid: string, body: Record<string, unknown>) => {
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

      await refreshAll();
    } catch (nextError) {
      console.error("Community action failed:", nextError);
      window.alert(nextError instanceof Error ? nextError.message : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }, [refreshAll]);

  const deleteUser = useCallback(async (uid: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    setBusyKey(`${uid}:delete`);
    try {
      const response = await fetch(`/api/admin/delete_user/${uid}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }
      await refreshAll();
    } catch (nextError) {
      console.error("Delete failed:", nextError);
      window.alert("Delete failed.");
    } finally {
      setBusyKey(null);
    }
  }, [refreshAll]);

  const loadMoreActions = useCallback(async (uid: string) => {
    setBusyKey(`${uid}:next_actions`);
    try {
      await loadNextActions(uid);
    } catch (nextError) {
      console.error("Failed to load activity history:", nextError);
      window.alert(nextError instanceof Error ? nextError.message : "Activity history failed.");
    } finally {
      setBusyKey(null);
    }
  }, [loadNextActions]);

  const sortedUsers = useMemo(() => {
    const users = data?.users ?? [];
    return [...users].sort((left, right) => {
      const leftPinned = pinnedBottomRank(left);
      const rightPinned = pinnedBottomRank(right);
      if (leftPinned !== rightPinned) {
        if (leftPinned === 0) return -1;
        if (rightPinned === 0) return 1;
        return leftPinned - rightPinned;
      }

      const leftActivity = left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0;
      const rightActivity = right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0;
      if (leftActivity !== rightActivity) {
        return rightActivity - leftActivity;
      }

      if (left.recentActionsTotalCount !== right.recentActionsTotalCount) {
        return right.recentActionsTotalCount - left.recentActionsTotalCount;
      }

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
  }, [data?.users]);

  if (!data && loading) {
    return (
      <main className="space-y-6 py-6 text-white">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
          <div className="max-w-4xl space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              Community Command Tower
            </div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">
              Loading operator rails...
            </h1>
          </div>
        </section>
      </main>
    );
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
            Full activity rails, WOLO claim state, schedule pressure, bet history, direct-line
            unread danger, and the product signals that tell you who is alive, who is drifting,
            and where the heat is building.
          </p>
        </div>
      </section>

      {data?.overview ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Users" value={data.overview.totalUsers} sublabel={`${data.overview.activeUsers24h} active in 24h`} />
          <StatCard label="Needs Reply" value={data.overview.unreadForAdmin} sublabel="Unread from players to you" />
          <StatCard label="Player Surprise" value={data.overview.unreadForUsers} sublabel="Unread items currently showing for players" />
          <StatCard label="Pending Honors" value={data.overview.pendingHonors} sublabel="Badges + gifts waiting on acceptance" />
          <StatCard label="Pending Claims" value={data.overview.pendingWoloClaims} sublabel={`${formatWolo(data.overview.pendingWoloClaimAmount)} WOLO unclaimed`} />
          <StatCard label="Claimed Claims" value={data.overview.claimedWoloClaims} sublabel={`${formatWolo(data.overview.claimedWoloClaimAmount)} WOLO resolved`} />
        </section>
      ) : null}

      {data?.overview ? (
        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Palette className="h-4 w-4" />
              Theme Mix
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {data.overview.themeBreakdown.map((entry) => (
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
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {data.overview.viewBreakdown.map((entry) => (
                <div key={entry.viewMode} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{entry.viewMode}</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{entry.count}</div>
                </div>
              ))}
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tracked Actions</div>
                <div className="mt-2 text-3xl font-semibold text-white">{data.overview.totalActionEvents}</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data ? (
        <div className="mt-6">
          <WoloMarketRail summary={data.marketRail.summary} rows={data.marketRail.rows} />
        </div>
      ) : null}

      {data ? (
        <div className="mt-6">
          <WoloSettlementRail
            summary={data.settlementRail.summary}
            rows={data.settlementRail.rows}
            rescindingClaimId={rescindingSettlementClaimId}
            retryingClaimId={retryingSettlementClaimId}
            reconcilingPending={reconcilingPendingClaims}
            onRescind={rescindSettlementClaim}
            onRetry={retrySettlementClaim}
            onReconcilePending={reconcilePendingClaims}
            onAddFounderBonus={openFounderComposer}
          />
        </div>
      ) : null}

      {data ? (
        <div className="mt-6">
          <WatcherDownloadRail
            summary={data.watcherDownloads.summary}
            recent={data.watcherDownloads.recent}
          />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {sortedUsers.map((user) => (
          <AdminUserCard
            key={user.uid}
            user={user}
            draft={getDraft(user.uid)}
            busyKey={busyKey}
            renderedActions={activityByUid[user.uid] ?? user.recentActions}
            activityTotal={activityTotals[user.uid] ?? user.recentActionsTotalCount}
            nextOffset={activityNextOffsets[user.uid] ?? null}
            onDraftChange={updateDraft}
            onLoadNextActions={loadMoreActions}
            onRunCommunityAction={runCommunityAction}
            onDeleteUser={deleteUser}
          />
        ))}
      </section>

      <FounderBonusModal
        open={Boolean(founderComposer)}
        marketTitle={founderComposer?.marketTitle || "Market"}
        bonusType={founderComposer?.bonusType || "participants"}
        amountValue={founderComposer?.amountValue || ""}
        noteValue={founderComposer?.noteValue || ""}
        saving={savingFounderBonus}
        error={founderBonusError}
        onBonusTypeChange={(value) =>
          setFounderComposer((current) => (current ? { ...current, bonusType: value } : current))
        }
        onAmountChange={(value) =>
          setFounderComposer((current) => (current ? { ...current, amountValue: value } : current))
        }
        onNoteChange={(value) =>
          setFounderComposer((current) => (current ? { ...current, noteValue: value } : current))
        }
        onClose={() => {
          if (savingFounderBonus) return;
          setFounderComposer(null);
          setFounderBonusError(null);
        }}
        onSubmit={() => {
          void submitFounderBonus();
        }}
      />
    </main>
  );
}
