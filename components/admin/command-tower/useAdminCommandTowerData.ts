"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ActivityHistoryPayload,
  AdminUserRow,
  AdminUsersLivePayload,
  AdminUsersPayload,
  AdminUsersRailsPayload,
} from "@/components/admin/command-tower/types";
import { mergeUniqueActivities } from "@/components/admin/command-tower/utils";

type ActivityMap = Record<string, AdminUserRow["recentActions"]>;
type NumberMap = Record<string, number>;
type NullableNumberMap = Record<string, number | null>;

type CommandTowerState = {
  data: AdminUsersPayload | null;
  activityByUid: ActivityMap;
  activityTotals: NumberMap;
  activityNextOffsets: NullableNumberMap;
  loading: boolean;
  error: string;
  refreshAll: () => Promise<void>;
  refreshLive: () => Promise<void>;
  refreshRails: () => Promise<void>;
  loadNextActions: (uid: string) => Promise<void>;
};

function buildActivityState(
  payload: AdminUsersPayload,
  currentActivities: ActivityMap
) {
  const nextActivityByUid: ActivityMap = {};
  const nextActivityTotals: NumberMap = {};
  const nextActivityOffsets: NullableNumberMap = {};

  for (const user of payload.users) {
    const mergedActivities = mergeUniqueActivities(
      user.recentActions,
      currentActivities[user.uid] ?? []
    );
    const total = user.recentActionsTotalCount;

    nextActivityByUid[user.uid] = mergedActivities;
    nextActivityTotals[user.uid] = total;
    nextActivityOffsets[user.uid] = mergedActivities.length < total ? mergedActivities.length : null;
  }

  return {
    activityByUid: nextActivityByUid,
    activityTotals: nextActivityTotals,
    activityNextOffsets: nextActivityOffsets,
  };
}

function mergeUsersWithLiveData(users: AdminUserRow[], liveRows: AdminUsersLivePayload["users"]) {
  const liveByUid = new Map(liveRows.map((row) => [row.uid, row] as const));

  return users.map((user) => {
    const live = liveByUid.get(user.uid);
    if (!live) {
      return user;
    }

    return {
      ...user,
      displayName: live.displayName,
      lastSeen: live.lastSeen,
      unreadCount: live.unreadCount,
      userUnreadCount: live.userUnreadCount,
      lastInboxReadAt: live.lastInboxReadAt,
      adminLastInboxReadAt: live.adminLastInboxReadAt,
      recentActionsTotalCount: live.recentActionsTotalCount,
      lastActivityAt: live.lastActivityAt,
      pendingBadgeCount: live.pendingBadgeCount,
      pendingGiftCount: live.pendingGiftCount,
      pendingWoloClaimCount: live.pendingWoloClaimCount,
      pendingWoloClaimAmount: live.pendingWoloClaimAmount,
      giftedWolo: live.giftedWolo,
    };
  });
}

export function useAdminCommandTowerData(): CommandTowerState {
  const [data, setData] = useState<AdminUsersPayload | null>(null);
  const [activityByUid, setActivityByUid] = useState<ActivityMap>({});
  const [activityTotals, setActivityTotals] = useState<NumberMap>({});
  const [activityNextOffsets, setActivityNextOffsets] = useState<NullableNumberMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyBootstrap = useCallback((payload: AdminUsersPayload) => {
    setData(payload);
    setActivityByUid((currentActivities) => {
      const nextState = buildActivityState(payload, currentActivities);
      setActivityTotals(nextState.activityTotals);
      setActivityNextOffsets(nextState.activityNextOffsets);
      return nextState.activityByUid;
    });
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Admin bootstrap failed: ${response.status}`);
      }
      const payload = (await response.json()) as AdminUsersPayload;
      applyBootstrap(payload);
    } catch (nextError) {
      console.error("Failed to load admin command tower:", nextError);
      setError(nextError instanceof Error ? nextError.message : "Admin data unavailable.");
    } finally {
      setLoading(false);
    }
  }, [applyBootstrap]);

  const refreshLive = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users/live", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Admin live refresh failed: ${response.status}`);
      }

      const payload = (await response.json()) as AdminUsersLivePayload;
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          overview: payload.overview,
          users: mergeUsersWithLiveData(current.users, payload.users),
        };
      });

      setActivityByUid((current) => {
        const next = { ...current };
        const nextTotals = { ...activityTotals };
        const nextOffsets = { ...activityNextOffsets };
        for (const user of payload.users) {
          const mergedActivities = mergeUniqueActivities(user.recentActions, next[user.uid] ?? []);
          next[user.uid] = mergedActivities;
          const total = Math.max(nextTotals[user.uid] ?? 0, user.recentActionsTotalCount);
          nextTotals[user.uid] = total;
          nextOffsets[user.uid] = mergedActivities.length < total ? mergedActivities.length : null;
        }
        setActivityTotals(nextTotals);
        setActivityNextOffsets(nextOffsets);
        return next;
      });
    } catch (nextError) {
      console.warn("Failed to refresh admin live data:", nextError);
    }
  }, [activityNextOffsets, activityTotals]);

  const refreshRails = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users/rails", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Admin rail refresh failed: ${response.status}`);
      }

      const payload = (await response.json()) as AdminUsersRailsPayload;
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          marketRail: payload.marketRail,
          settlementRail: payload.settlementRail,
          watcherDownloads: payload.watcherDownloads,
        };
      });
    } catch (nextError) {
      console.warn("Failed to refresh admin rails:", nextError);
    }
  }, []);

  const loadNextActions = useCallback(async (uid: string) => {
    const offset = activityNextOffsets[uid];
    if (offset == null) {
      return;
    }

    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(uid)}/activity?offset=${offset}&take=50`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(`Activity history failed: ${response.status}`);
    }

    const payload = (await response.json()) as ActivityHistoryPayload;
    setActivityByUid((current) => {
      const mergedActivities = mergeUniqueActivities(current[uid] ?? [], payload.items);
      setActivityTotals((currentTotals) => ({
        ...currentTotals,
        [uid]: payload.total,
      }));
      setActivityNextOffsets((currentOffsets) => ({
        ...currentOffsets,
        [uid]: mergedActivities.length < payload.total ? mergedActivities.length : null,
      }));
      return {
        ...current,
        [uid]: mergedActivities,
      };
    });
  }, [activityNextOffsets]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshLive();
      void refreshRails();
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [data, refreshLive, refreshRails]);

  return useMemo(
    () => ({
      data,
      activityByUid,
      activityTotals,
      activityNextOffsets,
      loading,
      error,
      refreshAll,
      refreshLive,
      refreshRails,
      loadNextActions,
    }),
    [
      activityByUid,
      activityNextOffsets,
      activityTotals,
      data,
      error,
      loadNextActions,
      loading,
      refreshAll,
      refreshLive,
      refreshRails,
    ]
  );
}
