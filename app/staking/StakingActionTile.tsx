"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { useKeplr } from "@/hooks/use-keplr";
import { useUserAuth } from "@/context/UserAuthContext";
import { stakeWoloOnChain } from "@/lib/clientStaking";

type StakingMe = {
  user: {
    playerName: string;
    walletAddress: string | null;
  };
  position: {
    currentStakedWolo: number;
    pendingRewardsWolo?: number;
    autoCompoundRewards?: boolean;
    compoundedRewardsWolo?: number;
  };
  execution: {
    maxUnstakeWolo?: number;
    totalConfirmedStakedWolo?: number;
    stakingWalletBalanceWolo?: number | null;
    stakingWalletReserveHeadroomWolo?: number;
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
  };
};

type StakingConfig = {
  stakingWalletAddress: string;
  stakingWalletShortAddress: string;
  stakeReady: boolean;
  unstakeReady: boolean;
  unstakeReadyDetail?: string;
  unstakeExecutionMode?: string;
  stakingWalletReserveHeadroomWolo?: number;
  operatorFunding?: {
    walletUnderfunded?: boolean;
    totalConfirmedStakedWolo?: number;
    operatorTopUpNeededWolo?: number;
    requiredStakingWalletBalanceWolo?: number;
    warning?: string | null;
  };
};

const STAKING_WALLET_TOP_UP_DETAIL =
  "Staking wallet reserve top-up needed.";
const STAKING_WALLET_TOP_UP_HELP =
  "This wallet backs app-side staking withdrawals. It needs enough WOLO to cover pending unstake capacity plus fee headroom.";

function formatWholeWolo(value: number | null | undefined) {
  if (value == null) return "--";
  return `${new Intl.NumberFormat("en-US").format(value)} WOLO`;
}

export default function StakingActionTile() {
  const { address, status, connect } = useKeplr();
  const { isAuthenticated, isAdmin, playerName, loginWithSteam } = useUserAuth();
  const router = useRouter();
  const [stakingState, setStakingState] = useState<StakingMe | null>(null);
  const [stakingConfig, setStakingConfig] = useState<StakingConfig | null>(null);
  const [amountInput, setAmountInput] = useState("1000");
  const [amountTouched, setAmountTouched] = useState(false);
  const [busy, setBusy] = useState<"stake" | "unstake" | null>(null);
  const [autoCompoundBusy, setAutoCompoundBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const currentStakedWolo = stakingState?.position.currentStakedWolo ?? 0;
  const autoCompoundRewards = stakingState?.position.autoCompoundRewards ?? true;
  const compoundedRewardsWolo = stakingState?.position.compoundedRewardsWolo ?? 0;
  const maxUnstakeWolo = Math.max(
    0,
    Math.floor(stakingState?.execution.maxUnstakeWolo ?? currentStakedWolo)
  );
  const currentStakeLabel = useMemo(
    () => formatWholeWolo(currentStakedWolo),
    [currentStakedWolo]
  );
  const reserveHeadroomWolo =
    stakingState?.execution.stakingWalletReserveHeadroomWolo ??
    stakingState?.execution.unstakeHeadroomWolo ??
    stakingConfig?.stakingWalletReserveHeadroomWolo ??
    0;
  const stakingWalletBalanceWolo = stakingState?.execution.stakingWalletBalanceWolo;
  const operatorTopUpNeededWolo =
    stakingState?.execution.operatorTopUpNeededWolo ??
    stakingConfig?.operatorFunding?.operatorTopUpNeededWolo ??
    0;
  const totalConfirmedStakedWolo =
    stakingState?.execution.totalConfirmedStakedWolo ??
    stakingConfig?.operatorFunding?.totalConfirmedStakedWolo ??
    currentStakedWolo;
  const requiredStakingWalletBalanceWolo =
    stakingState?.execution.requiredStakingWalletBalanceWolo ??
    stakingConfig?.operatorFunding?.requiredStakingWalletBalanceWolo ??
    null;
  const walletUnderfunded =
    Boolean(stakingState?.execution.walletUnderfunded) ||
    Boolean(stakingConfig?.operatorFunding?.walletUnderfunded);
  const reserveTopUpVisible = walletUnderfunded && operatorTopUpNeededWolo >= 1;
  const recommendedTopUpWolo = reserveTopUpVisible
    ? Math.ceil(operatorTopUpNeededWolo + Math.max(10, reserveHeadroomWolo))
    : 0;
  const lastCheckedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not checked";
  const actionPill =
    currentStakedWolo > 0 ? `Max ${formatWholeWolo(maxUnstakeWolo)}` : "Ready";

  async function reloadStakingState() {
    if (!isAuthenticated) {
      setStakingState(null);
      setStakingConfig(null);
      return;
    }

    try {
      const [stateResponse, configResponse] = await Promise.all([
        fetch("/api/staking/me", { cache: "no-store" }),
        fetch("/api/staking/config", { cache: "no-store" }),
      ]);
      if (stateResponse.ok) {
        setStakingState((await stateResponse.json()) as StakingMe);
      }
      if (configResponse.ok) {
        setStakingConfig((await configResponse.json()) as StakingConfig);
      }
    } catch {
      setStakingConfig(null);
    } finally {
      setLastCheckedAt(new Date().toISOString());
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isAuthenticated) {
        setStakingState(null);
        return;
      }

      try {
        const [stateResponse, configResponse] = await Promise.all([
          fetch("/api/staking/me", { cache: "no-store" }),
          fetch("/api/staking/config", { cache: "no-store" }),
        ]);
        if (!cancelled && stateResponse.ok) {
          setStakingState((await stateResponse.json()) as StakingMe);
        }
        if (!cancelled && configResponse.ok) {
          setStakingConfig((await configResponse.json()) as StakingConfig);
        }
        if (!cancelled) {
          setLastCheckedAt(new Date().toISOString());
        }
      } catch {
        if (!cancelled) {
          setStakingConfig(null);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (amountTouched || busy || currentStakedWolo <= 0) return;
    const preferred = maxUnstakeWolo > 0 ? Math.min(1000, maxUnstakeWolo) : currentStakedWolo;
    setAmountInput(String(preferred));
  }, [amountTouched, busy, currentStakedWolo, maxUnstakeWolo]);

  function parseAmount() {
    const parsed = Number.parseInt(amountInput.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  useEffect(() => {
    if (message !== STAKING_WALLET_TOP_UP_DETAIL) return;
    if (!reserveTopUpVisible) {
      setMessage(null);
      return;
    }
    const parsed = Number.parseInt(amountInput.trim(), 10);
    const amountWolo = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    if (!amountWolo || stakingWalletBalanceWolo == null) return;
    const availableAfterUnstake = stakingWalletBalanceWolo - amountWolo;
    const requiredAfterUnstake =
      Math.max(0, totalConfirmedStakedWolo - amountWolo) + reserveHeadroomWolo;
    if (availableAfterUnstake >= requiredAfterUnstake) {
      setMessage(null);
    }
  }, [
    amountInput,
    message,
    reserveHeadroomWolo,
    reserveTopUpVisible,
    stakingWalletBalanceWolo,
    totalConfirmedStakedWolo,
  ]);

  function pushActivity(input: {
    type: "STAKE" | "UNSTAKE";
    amountWolo: number;
    txHash?: string | null;
  }) {
    const actor = playerName || stakingState?.user.playerName || "Staker";
    const amountLabel = formatWholeWolo(input.amountWolo);
    const timestampLabel = new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    window.dispatchEvent(
      new CustomEvent("staking:activity", {
        detail: {
          item: {
            key: `staking-live-${input.type}-${input.txHash || Date.now()}`,
            label: `${amountLabel} ${input.type === "STAKE" ? "stake" : "unstake"}: ${actor}`,
            detail: input.txHash
              ? `${input.type === "STAKE" ? "Keplr signed" : "Returned to wallet"} · ${input.txHash.slice(0, 8)}...${input.txHash.slice(-6)}`
              : input.type === "STAKE"
                ? "Keplr signed."
                : "Returned to wallet.",
            meta: timestampLabel,
            eventType: input.type,
            amountLabel,
            timestampLabel,
            tone: input.type === "STAKE" ? "amber" : "emerald",
          },
        },
      })
    );
  }

  async function ensureWallet() {
    if (status === "connected") return address;
    return connect();
  }

  async function handleStake() {
    const amountWolo = parseAmount();
    if (!amountWolo) {
      setMessage("Enter WOLO.");
      return;
    }
    if (!stakingConfig?.stakeReady || !stakingConfig.stakingWalletAddress) {
      setMessage("Staking wallet pending.");
      return;
    }

    setBusy("stake");
    setMessage(null);
    try {
      const walletAddress = await ensureWallet();
      const signed = await stakeWoloOnChain({
        amountWolo,
        stakingWalletAddress: stakingConfig.stakingWalletAddress,
        fallbackWalletAddress: walletAddress,
      });
      const response = await fetch("/api/staking/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountWolo,
          walletAddress: signed.walletAddress,
          txHash: signed.stakingTxHash,
          txFeeWolo: signed.txFeeWolo,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Stake tx could not be confirmed.");
      }
      pushActivity({
        type: "STAKE",
        amountWolo,
        txHash: payload.txHash || signed.stakingTxHash,
      });
      setMessage("Stake confirmed.");
      await reloadStakingState();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stake failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoCompoundToggle() {
    if (!isAuthenticated || autoCompoundBusy) return;

    const nextEnabled = !autoCompoundRewards;
    setAutoCompoundBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/staking/auto-compound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Could not update auto-stake rewards.");
      }

      setStakingState((current) =>
        current
          ? {
              ...current,
              position: {
                ...current.position,
                autoCompoundRewards: Boolean(payload.autoCompoundRewards),
                compoundedRewardsWolo:
                  typeof payload.compoundedRewardsWolo === "number"
                    ? payload.compoundedRewardsWolo
                    : current.position.compoundedRewardsWolo,
              },
            }
          : current
      );
      setMessage(payload.detail || (nextEnabled ? "Auto-stake rewards is on." : "Auto-stake rewards is off."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auto-stake update failed.");
    } finally {
      setAutoCompoundBusy(false);
    }
  }

  async function handleUnstake() {
    let amountWolo = parseAmount();
    if (!amountWolo) {
      setMessage("Enter WOLO.");
      return;
    }
    if (maxUnstakeWolo <= 0) {
      setMessage("No confirmed stake is available for unstake.");
      return;
    }
    if (amountWolo > maxUnstakeWolo) {
      amountWolo = maxUnstakeWolo;
      setAmountInput(String(maxUnstakeWolo));
    }
    if (
      stakingWalletBalanceWolo != null &&
      stakingWalletBalanceWolo - amountWolo <
        Math.max(0, totalConfirmedStakedWolo - amountWolo) + reserveHeadroomWolo
    ) {
      setMessage(STAKING_WALLET_TOP_UP_DETAIL);
      return;
    }

    setBusy("unstake");
    setMessage(null);
    try {
      const walletAddress = await ensureWallet();
      const response = await fetch("/api/staking/unstake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountWolo,
          walletAddress: walletAddress || stakingState?.user.walletAddress,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Unstake could not be executed.");
      }
      pushActivity({
        type: "UNSTAKE",
        amountWolo,
        txHash: payload.txHash,
      });
      setMessage("Unstake sent.");
      await reloadStakingState();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unstake failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <section className="rounded-[1.2rem] border border-amber-300/15 bg-amber-300/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/70">
              Quick Stake
            </div>
            <div className="mt-1 text-lg font-semibold text-white">Sign in to stake WOLO.</div>
          </div>
          <button
            type="button"
            onClick={() => loginWithSteam("/staking")}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Sign In
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Quick Stake</div>
          <div className="mt-1 text-sm font-semibold text-white">My Stake: {currentStakeLabel}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[10px] font-semibold text-slate-400">
          {actionPill}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          void handleAutoCompoundToggle();
        }}
        disabled={autoCompoundBusy}
        className={`mb-3 flex w-full items-center justify-between gap-3 rounded-[0.95rem] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
          autoCompoundRewards
            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-50"
            : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.075]"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em]">
            Auto-stake rewards
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {autoCompoundRewards
              ? `Rewards compound with your principal${compoundedRewardsWolo > 0 ? ` · ${formatWholeWolo(compoundedRewardsWolo)} compounded` : ""}.`
              : "Future rewards wait for wallet payout instead of compounding."}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
            autoCompoundRewards
              ? "bg-emerald-300 text-slate-950"
              : "border border-white/10 bg-black/20 text-slate-400"
          }`}
        >
          {autoCompoundBusy ? "Saving" : autoCompoundRewards ? "On" : "Off"}
        </span>
      </button>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="flex min-h-12 items-center overflow-hidden rounded-[0.95rem] border border-white/10 bg-white/[0.045]">
          <input
            value={amountInput}
            onChange={(event) => {
              setAmountTouched(true);
              setAmountInput(event.target.value.replace(/[^0-9]/g, ""));
            }}
            inputMode="numeric"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600"
            placeholder="1000"
            disabled={Boolean(busy)}
          />
          <span className="border-l border-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            WOLO
          </span>
        </label>
        <ActionButton
          label="Stake"
          busy={busy === "stake"}
          disabled={!stakingConfig?.stakeReady || Boolean(busy)}
          onClick={() => {
            void handleStake();
          }}
        />
        <ActionButton
          label="Unstake"
          busy={busy === "unstake"}
          disabled={
            !stakingConfig?.unstakeReady ||
            Boolean(busy) ||
            currentStakedWolo <= 0 ||
            maxUnstakeWolo <= 0
          }
          tone="ghost"
          onClick={() => {
            void handleUnstake();
          }}
        />
      </div>

      {message ? (
        message === STAKING_WALLET_TOP_UP_DETAIL ? (
          <div className="mt-2 rounded-[0.85rem] border border-amber-300/18 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-50">
            <div className="font-semibold">{STAKING_WALLET_TOP_UP_DETAIL}</div>
            <div className="mt-1 text-amber-50/78">
              Unstake rail needs operator funding before larger withdrawals. User funds are still recorded in the staking ledger.
            </div>
            <div className="mt-1 text-amber-50/62" title={STAKING_WALLET_TOP_UP_HELP}>
              {STAKING_WALLET_TOP_UP_HELP}
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-[0.85rem] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs leading-5 text-slate-300">
            {message}
          </div>
        )
      ) : stakingConfig?.unstakeReady === false && currentStakedWolo > 0 ? (
        <div className="mt-2 rounded-[0.85rem] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs leading-5 text-slate-400">
          {stakingConfig.unstakeReadyDetail || "Staking wallet signer is not configured."}
        </div>
      ) : null}
      {isAdmin && reserveTopUpVisible ? (
        <div className="mt-2 rounded-[0.85rem] border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          <div className="font-semibold">Admin: staking wallet reserve top-up needed.</div>
          <div className="mt-1 text-amber-50/80">{STAKING_WALLET_TOP_UP_HELP}</div>
          <div className="mt-2 grid gap-1 text-amber-50/75 sm:grid-cols-2">
            <div>Wallet: {stakingConfig?.stakingWalletAddress || "not configured"}</div>
            <div>Current balance: {formatWholeWolo(stakingWalletBalanceWolo)}</div>
            <div>Confirmed stake: {formatWholeWolo(totalConfirmedStakedWolo)}</div>
            <div>Required balance: {formatWholeWolo(requiredStakingWalletBalanceWolo)}</div>
            <div>Reserve headroom: {formatWholeWolo(reserveHeadroomWolo)}</div>
            <div>Gap: {formatWholeWolo(operatorTopUpNeededWolo)}</div>
            <div>Recommended top-up: {formatWholeWolo(recommendedTopUpWolo)}</div>
            <div>Last checked: {lastCheckedLabel}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
  tone = "gold",
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  tone?: "gold" | "ghost";
}) {
  const toneClass =
    tone === "gold"
      ? "bg-amber-300 text-slate-950 hover:bg-amber-200 disabled:bg-white/[0.045] disabled:text-slate-500"
      : "border border-white/12 bg-white/[0.045] text-slate-200 hover:border-white/25 hover:bg-white/[0.075] disabled:text-slate-600";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-12 items-center justify-center rounded-[0.95rem] px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${toneClass}`}
    >
      {busy ? "Signing" : label}
    </button>
  );
}
