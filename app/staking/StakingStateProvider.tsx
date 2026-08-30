"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useUserAuth } from "@/context/UserAuthContext";

export type StakingMeSnapshot = {
  user: {
    id?: number;
    uid?: string;
    playerName: string;
    walletAddress: string | null;
  };
  position: {
    currentStakedWolo: number;
    stakingWeight: string;
    pendingRewardsWolo: number;
    lifetimeRewardsWolo: number;
    claimedRewardsWolo?: number;
    autoCompoundRewards: boolean;
    compoundedRewardsWolo: number;
    lifetimeTxFeesWolo: number;
    status?: string;
    lastWeightUpdateAt?: string | null;
    lastRewardPaymentAt: string | null;
    lastRewardAmountWolo: number;
  };
  execution: {
    status?: "READY" | "DEGRADED";
    detail: string;
    maxUnstakeWolo?: number;
    totalConfirmedStakedWolo?: number;
    stakingWalletBalanceWolo?: number | null;
    stakingWalletReserveHeadroomWolo?: number;
    stakingWalletOperatingReserveWolo?: number | null;
    stakingWalletReserveTargetWolo?: number;
    stakingWalletReserveSurplusWolo?: number | null;
    operationalReserveHealthy?: boolean | null;
    unstakeHeadroomWolo?: number;
    requiredStakingWalletBalanceWolo?: number;
    operatorTopUpNeededWolo?: number;
    walletUnderfunded?: boolean;
    currentUnstakeExecutable?: boolean;
    currentUnstakeReserveCheck?: {
      executable: boolean;
      requestedUnstakeWolo: number;
      userConfirmedStakeWolo: number;
      totalConfirmedStakedWolo: number;
      stakingWalletBalanceWolo: number | null;
      operatorReserveWolo: number;
      remainingStakeAfterUnstakeWolo: number;
      requiredBalanceAfterUnstakeWolo: number;
      availableAfterUnstakeWolo: number | null;
      operatorTopUpNeededWolo: number;
    };
    operatorWarning?: string | null;
    balanceLookupError?: string | null;
    balanceLookupErrorCode?: "wallet_unconfigured" | "upstream_unavailable" | null;
    stakingWalletBalanceSource?: "rest" | "cli" | null;
    stakingWalletBalanceObservedAt?: string | null;
  };
};

type SnapshotUpdater = (
  current: StakingMeSnapshot | null,
) => StakingMeSnapshot | null;

type RefreshStakingStateOptions = {
  force?: boolean;
};

type StakingStateContextValue = {
  stakingState: StakingMeSnapshot | null;
  stakingLoading: boolean;
  refreshStakingState: (
    options?: RefreshStakingStateOptions,
  ) => Promise<StakingMeSnapshot | null>;
  updateStakingState: (updater: SnapshotUpdater) => void;
};

const StakingStateContext = createContext<StakingStateContextValue | null>(
  null,
);

export function StakingStateProvider({ children }: { children: ReactNode }) {
  const { uid, loading: authLoading } = useUserAuth();
  const [stakingState, setStakingState] =
    useState<StakingMeSnapshot | null>(null);
  const [stakingLoading, setStakingLoading] = useState(false);
  const snapshotRef = useRef<StakingMeSnapshot | null>(null);
  const sessionUidRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const inFlightRef = useRef<Promise<StakingMeSnapshot | null> | null>(null);
  const inFlightTokenRef = useRef<symbol | null>(null);

  const commitSnapshot = useCallback((next: StakingMeSnapshot | null) => {
    snapshotRef.current = next;
    setStakingState(next);
  }, []);

  const updateStakingState = useCallback(
    (updater: SnapshotUpdater) => {
      const next = updater(snapshotRef.current);
      commitSnapshot(next);
    },
    [commitSnapshot],
  );

  const refreshStakingState = useCallback(async (
    options: RefreshStakingStateOptions = {},
  ) => {
    if (!uid) {
      commitSnapshot(null);
      setStakingLoading(false);
      return null;
    }

    if (options.force) {
      requestGenerationRef.current += 1;
      inFlightRef.current = null;
      inFlightTokenRef.current = null;
    }

    if (inFlightRef.current) return inFlightRef.current;

    const requestUid = uid;
    const requestGeneration = requestGenerationRef.current;
    const requestToken = Symbol("staking-snapshot");
    if (!snapshotRef.current) setStakingLoading(true);

    const request = (async () => {
      try {
        const response = await fetch("/api/staking/me", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Staking snapshot failed: ${response.status}`);
        }

        const payload = (await response.json()) as StakingMeSnapshot;
        if (
          requestGenerationRef.current === requestGeneration &&
          sessionUidRef.current === requestUid
        ) {
          commitSnapshot(payload);
        }
        return payload;
      } catch (error) {
        console.warn("Failed to refresh staking snapshot:", error);
        return null;
      } finally {
        if (inFlightTokenRef.current === requestToken) {
          inFlightRef.current = null;
          inFlightTokenRef.current = null;
        }
        if (
          requestGenerationRef.current === requestGeneration &&
          sessionUidRef.current === requestUid
        ) {
          setStakingLoading(false);
        }
      }
    })();

    inFlightRef.current = request;
    inFlightTokenRef.current = requestToken;
    return request;
  }, [commitSnapshot, uid]);

  useEffect(() => {
    if (authLoading) return;

    if (sessionUidRef.current !== uid) {
      sessionUidRef.current = uid;
      requestGenerationRef.current += 1;
      inFlightRef.current = null;
      inFlightTokenRef.current = null;
      commitSnapshot(null);
    }

    if (!uid) {
      setStakingLoading(false);
      return;
    }

    void refreshStakingState();
  }, [authLoading, commitSnapshot, refreshStakingState, uid]);

  const value = useMemo<StakingStateContextValue>(
    () => ({
      stakingState,
      stakingLoading,
      refreshStakingState,
      updateStakingState,
    }),
    [
      refreshStakingState,
      stakingLoading,
      stakingState,
      updateStakingState,
    ],
  );

  return (
    <StakingStateContext.Provider value={value}>
      {children}
    </StakingStateContext.Provider>
  );
}

export function useStakingState() {
  const value = useContext(StakingStateContext);
  if (!value) {
    throw new Error("useStakingState must be used inside StakingStateProvider.");
  }
  return value;
}
