"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { toast } from "sonner";

import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import {
  WOLO_BASE_DENOM,
  WOLO_BET_ESCROW_ADDRESS,
  WOLO_CHAIN_ID,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  toUwoLoAmount,
} from "@/lib/woloChain";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";
const STAKE_OPTIONS = [10, 25, 50, 100] as const;
const BETS_POLL_INTERVAL_MS = 5_000;
const ONCHAIN_BET_ESCROW_ENABLED = Boolean(WOLO_BET_ESCROW_ADDRESS);

type BetSide = "left" | "right";
type BetStatus = "open" | "closing" | "live" | "settled";

type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

type BetBoardMarket = {
  id: number;
  slug: string;
  title: string;
  eventLabel: string;
  status: BetStatus;
  featured: boolean;
  closeLabel: string;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  viewerWager: {
    side: BetSide;
    amountWolo: number;
    executionMode: "app_only" | "onchain_escrow";
    stakeTxHash: string | null;
    stakeWalletAddress: string | null;
    stakeLockedAt: string | null;
  } | null;
  winnerSide: BetSide | null;
};

type BetBookEntry = {
  marketId: number;
  marketSlug: string;
  title: string;
  eventLabel: string;
  side: BetSide;
  pickedLabel: string;
  amountWolo: number;
  projectedReturnWolo: number;
  closeLabel: string;
  status: BetStatus;
};

type BetSettledResult = {
  id: number;
  title: string;
  eventLabel: string;
  winner: string;
  mapName: string;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
};

type BetBoardSnapshot = {
  generatedAt: string;
  viewerName: string | null;
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
  settledResults: BetSettledResult[];
  yourBook: {
    activeCount: number;
    stakedWolo: number;
    projectedReturnWolo: number;
    openWagers: BetBookEntry[];
  };
  heat: {
    biggestPot: {
      label: string;
      potWolo: number;
    } | null;
    bestReturn: {
      label: string;
      returnMultiplier: number;
    } | null;
    liveCount: number;
  };
};

type SelectionState = {
  marketId: number;
  side: BetSide;
  stake: number;
};

type LockWorkflow = {
  marketId: number;
  phase: "awaiting_wallet" | "confirming_chain" | "recording_wager";
  stakeTxHash: string | null;
};

function shortTxHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function isOnchainViewerWager(
  wager: BetBoardMarket["viewerWager"]
): wager is NonNullable<BetBoardMarket["viewerWager"]> {
  return Boolean(wager && wager.executionMode === "onchain_escrow");
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatSettledTime(value: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function projectReturn(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function statusPill(status: BetStatus) {
  if (status === "live") {
    return "border-red-300/18 bg-[linear-gradient(135deg,rgba(127,29,29,0.58),rgba(185,28,28,0.20))] text-red-100";
  }
  if (status === "closing") {
    return "border-amber-300/18 bg-[linear-gradient(135deg,rgba(146,64,14,0.50),rgba(217,119,6,0.16))] text-amber-50";
  }
  if (status === "settled") {
    return "border-emerald-300/18 bg-[linear-gradient(135deg,rgba(6,95,70,0.50),rgba(16,185,129,0.14))] text-emerald-50";
  }
  return "border-sky-300/16 bg-[linear-gradient(135deg,rgba(30,64,175,0.34),rgba(59,130,246,0.12))] text-sky-100";
}

function sideSurface(selected: boolean, emphasis: "warm" | "cool") {
  if (selected && emphasis === "warm") {
    return "border-amber-200/18 bg-[linear-gradient(155deg,rgba(251,191,36,0.32),rgba(180,83,9,0.18)_58%,rgba(15,23,42,0.72))] text-white shadow-[0_16px_38px_rgba(245,158,11,0.18)]";
  }
  if (selected) {
    return "border-sky-200/18 bg-[linear-gradient(155deg,rgba(125,211,252,0.22),rgba(37,99,235,0.18)_58%,rgba(15,23,42,0.72))] text-white shadow-[0_16px_38px_rgba(37,99,235,0.18)]";
  }
  return "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] text-slate-100 hover:border-white/10 hover:bg-white/[0.06]";
}

function edgeButton(kind: "gold" | "blue" | "glass") {
  if (kind === "gold") {
    return "border border-amber-200/14 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.18)] hover:brightness-105";
  }
  if (kind === "blue") {
    return "border border-sky-200/12 bg-[linear-gradient(135deg,#dbeafe_0%,#93c5fd_26%,#3b82f6_68%,#1d4ed8_100%)] text-slate-950 shadow-[0_14px_34px_rgba(59,130,246,0.16)] hover:brightness-105";
  }
  return "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 hover:border-white/14 hover:bg-white/[0.08]";
}

function shellClass() {
  return "rounded-[1.9rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_30%),linear-gradient(180deg,rgba(13,20,36,0.98),rgba(8,13,24,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.36)]";
}

function insetClass() {
  return "rounded-[1.55rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.024))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
}

function cardClass() {
  return "rounded-[1.45rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.02))] shadow-[0_18px_42px_rgba(2,6,23,0.22)]";
}

function CoinMark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src={WOLO_LOGO_SRC}
      alt=""
      width={small ? 18 : 22}
      height={small ? 18 : 22}
      className={small ? "h-[18px] w-[18px] object-contain" : "h-[22px] w-[22px] object-contain"}
    />
  );
}

export default function BetsPage() {
  const { isAuthenticated, loading, loginWithSteam, user } = useUserAuth();
  const { address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const [board, setBoard] = useState<BetBoardSnapshot | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [lockWorkflow, setLockWorkflow] = useState<LockWorkflow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBoard(quiet = false) {
      try {
        const response = await fetch("/api/bets", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Bet board failed to load.");
        }
        const payload = (await response.json()) as BetBoardSnapshot;
        if (!cancelled) {
          setBoard(payload);
        }
      } catch (error) {
        console.error("Failed to load bet board:", error);
        if (!cancelled && !quiet) {
          toast.error("The book is quiet right now.");
        }
      } finally {
        if (!cancelled) {
          setLoadingBoard(false);
        }
      }
    }

    function handleForegroundRefresh() {
      if (document.visibilityState === "visible") {
        void loadBoard(true);
      }
    }

    void loadBoard();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBoard(true);
      }
    }, BETS_POLL_INTERVAL_MS);

    window.addEventListener("focus", handleForegroundRefresh);
    document.addEventListener("visibilitychange", handleForegroundRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleForegroundRefresh);
      document.removeEventListener("visibilitychange", handleForegroundRefresh);
    };
  }, []);

  const featuredMarket = board?.featuredMarket ?? null;
  const openMarkets = useMemo(
    () =>
      (board?.openMarkets || []).filter((market) => !featuredMarket || market.id !== featuredMarket.id),
    [board?.openMarkets, featuredMarket]
  );
  const totalBookPot = useMemo(
    () => (board?.openMarkets || []).reduce((sum, market) => sum + market.totalPotWolo, 0),
    [board?.openMarkets]
  );
  const liveCount = board?.heat.liveCount || 0;
  const openCount = board?.openMarkets.length || 0;

  async function refreshBoard(nextPayload?: BetBoardSnapshot) {
    if (nextPayload) {
      setBoard(nextPayload);
      return;
    }

    const response = await fetch("/api/bets", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Book refresh failed.");
    }
    const payload = (await response.json()) as BetBoardSnapshot;
    setBoard(payload);
  }

  function requireSignIn() {
    if (isAuthenticated) return true;
    loginWithSteam("/bets");
    return false;
  }

  function handleSelect(market: BetBoardMarket, side: BetSide) {
    if (!requireSignIn()) return;
    const viewerWager = market.viewerWager;
    if (viewerWager?.executionMode === "onchain_escrow") {
      toast.message("This slip is already live in WOLO escrow.");
      return;
    }
    const existingStake = viewerWager?.amountWolo || 25;
    setSelection({
      marketId: market.id,
      side,
      stake: STAKE_OPTIONS.includes(existingStake as (typeof STAKE_OPTIONS)[number])
        ? existingStake
        : 25,
    });
  }

  async function ensureWalletAddress() {
    if (!ONCHAIN_BET_ESCROW_ENABLED) {
      return null;
    }

    if (connectedWalletAddress) {
      return connectedWalletAddress;
    }

    return connectKeplr();
  }

  async function lockStakeOnChain(market: BetBoardMarket, amountWolo: number) {
    if (!ONCHAIN_BET_ESCROW_ENABLED) {
      return {
        walletAddress: null as string | null,
        stakeTxHash: null as string | null,
        executionMode: "app_only" as const,
      };
    }

    setLockWorkflow({
      marketId: market.id,
      phase: "awaiting_wallet",
      stakeTxHash: null,
    });

    const walletAddress = await ensureWalletAddress();
    if (!walletAddress) {
      throw new Error("Connect Keplr before locking a real WOLO stake.");
    }

    const keplrWindow = window as Window & {
      getOfflineSigner?: (chainId: string) => unknown;
      keplr?: {
        getOfflineSignerAuto?: (chainId: string) => Promise<unknown>;
      };
    };

    const signer = (keplrWindow.keplr?.getOfflineSignerAuto
      ? await keplrWindow.keplr.getOfflineSignerAuto(WOLO_CHAIN_ID)
      : keplrWindow.getOfflineSigner?.(WOLO_CHAIN_ID)) as unknown as
      | OfflineSigner
      | undefined;

    if (!signer) {
      throw new Error("Keplr offline signer was not found in this browser.");
    }

    setLockWorkflow({
      marketId: market.id,
      phase: "confirming_chain",
      stakeTxHash: null,
    });

    const [{ GasPrice, SigningStargateClient }] = await Promise.all([
      import("@cosmjs/stargate"),
    ]);

    const client = await SigningStargateClient.connectWithSigner(WOLO_RPC_URL, signer, {
      gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
    });

    const result = await client.sendTokens(
      walletAddress,
      WOLO_BET_ESCROW_ADDRESS,
      [{ amount: toUwoLoAmount(amountWolo), denom: WOLO_BASE_DENOM }],
      "auto",
      `AoE2HDBets bet stake · market ${market.id}`
    );

    return {
      walletAddress,
      stakeTxHash: result.transactionHash,
      executionMode: "onchain_escrow" as const,
    };
  }

  async function handleLock(market: BetBoardMarket) {
    if (!selection || selection.marketId !== market.id) return;
    if (!requireSignIn()) return;
    if (isOnchainViewerWager(market.viewerWager)) {
      toast.message("This slip is already live in WOLO escrow.");
      return;
    }

    setWorkingKey(`lock-${market.id}`);
    try {
      const stakeExecution = await lockStakeOnChain(market, selection.stake);
      setLockWorkflow({
        marketId: market.id,
        phase: "recording_wager",
        stakeTxHash: stakeExecution.stakeTxHash,
      });
      const response = await fetch("/api/bets/wager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: stakeExecution.walletAddress,
          stakeTxHash: stakeExecution.stakeTxHash,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not lock the wager.");
      }

      await refreshBoard(payload);
      setSelection(null);
      if (stakeExecution.executionMode === "onchain_escrow" && stakeExecution.stakeTxHash) {
        toast.success(`Escrow confirmed for ${selection.stake} WOLO on ${selection.side === "left" ? market.left.name : market.right.name}. ${shortTxHash(stakeExecution.stakeTxHash)}`);
      } else {
        toast.success(`Locked ${selection.stake} WOLO on ${selection.side === "left" ? market.left.name : market.right.name}.`);
      }
    } catch (error) {
      console.error("Failed to lock wager:", error);
      toast.error(error instanceof Error ? error.message : "Could not lock the wager.");
    } finally {
      setWorkingKey(null);
      setLockWorkflow(null);
    }
  }

  async function handleClear(marketId: number) {
    if (!requireSignIn()) return;

    const market = board?.openMarkets.find((entry) => entry.id === marketId) || null;
    if (market && isOnchainViewerWager(market.viewerWager)) {
      toast.error("Escrowed WOLO slips cannot be cleared from the app.");
      return;
    }

    setWorkingKey(`clear-${marketId}`);
    try {
      const response = await fetch(`/api/bets/wager?marketId=${marketId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear the wager.");
      }
      await refreshBoard(payload);
      if (selection?.marketId === marketId) {
        setSelection(null);
      }
      toast.success("Slip cleared.");
    } catch (error) {
      console.error("Failed to clear wager:", error);
      toast.error(error instanceof Error ? error.message : "Could not clear the wager.");
    } finally {
      setWorkingKey(null);
    }
  }

  const viewerName = board?.viewerName || user?.inGameName || user?.steamPersonaName || "Your book";

  return (
    <main className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-5">
      <section className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
        <div className={`${shellClass()} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200/12 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.35em] text-amber-100">
              Bets
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {openCount} books
            </span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {liveCount} live
            </span>
          </div>

          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-[0.38em] text-slate-400">The War Book</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
              Bets
            </h1>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Open" value={String(openCount)} />
            <MiniMetric label="In Play" value={String(liveCount)} />
            <MiniMetric label="Book Pot" value={`${formatCompact(totalBookPot || 0)} WOLO`} />
            <MiniMetric
              label="Your Slips"
              value={isAuthenticated ? String(board?.yourBook.activeCount || 0) : "Sign in"}
            />
          </div>

          <div className={`mt-5 ${insetClass()} px-4 py-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Your Book</div>
                <div className="mt-2 text-lg font-semibold text-white">{viewerName}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">If Right</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {isAuthenticated
                    ? `${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`
                    : "Open"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className={`${shellClass()} relative overflow-hidden p-5 sm:p-6`}>
          <div className="pointer-events-none absolute right-[-1.25rem] top-[-1.25rem] opacity-[0.08]">
            <Image
              src={WOLO_LOGO_SRC}
              alt=""
              width={260}
              height={265}
              className="h-[12rem] w-[12rem] object-contain sm:h-[14rem] sm:w-[14rem]"
            />
          </div>

          {loadingBoard ? (
            <LoadingMarket />
          ) : featuredMarket ? (
            <MarketFeature
              market={featuredMarket}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              isAuthenticated={isAuthenticated}
              loadingAuth={loading}
              onSelect={handleSelect}
              onStakeChange={(stake) =>
                setSelection((current) =>
                  current && current.marketId === featuredMarket.id ? { ...current, stake } : current
                )
              }
              onLock={() => handleLock(featuredMarket)}
              onClear={() => handleClear(featuredMarket.id)}
            />
          ) : (
            <EmptyShell label="No books armed yet." />
          )}
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <section className={`${shellClass()} p-5 sm:p-6`}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Open Books</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Pick a side.</h2>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {openMarkets.length} more
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {loadingBoard ? (
              <>
                <LoadingCard />
                <LoadingCard />
              </>
            ) : openMarkets.length > 0 ? (
              openMarkets.map((market, index) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  selection={selection}
                  workingKey={workingKey}
                  lockWorkflow={lockWorkflow}
                  onSelect={handleSelect}
                  onStakeChange={(stake) =>
                    setSelection((current) =>
                      current && current.marketId === market.id ? { ...current, stake } : current
                    )
                  }
                  onLock={() => handleLock(market)}
                  onClear={() => handleClear(market.id)}
                  accent={index % 2 === 0 ? "warm" : "cool"}
                />
              ))
            ) : (
              <EmptyShell label="No open books right now." />
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section id="your-book" className={`${shellClass()} p-5 sm:p-6`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Your Book</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Slips</h2>
              </div>
              {isAuthenticated ? (
                <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  {board?.yourBook.activeCount || 0}
                </div>
              ) : null}
            </div>

            {isAuthenticated ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Active" value={String(board?.yourBook.activeCount || 0)} />
                  <MiniMetric
                    label="Staked"
                    value={`${formatCompact(board?.yourBook.stakedWolo || 0)} WOLO`}
                  />
                  <MiniMetric
                    label="If Right"
                    value={`${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`}
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {board?.yourBook.openWagers.length ? (
                    board.yourBook.openWagers.map((wager) => (
                      <article
                        key={wager.marketId}
                        className={`${cardClass()} flex items-center justify-between gap-4 px-4 py-4`}
                      >
                        <div className="min-w-0">
                        <div className="text-sm uppercase tracking-[0.28em] text-slate-500 break-words">
                          {wager.eventLabel}
                        </div>
                        <div className="mt-2 text-lg font-semibold leading-tight text-white break-words">
                          {wager.pickedLabel}
                        </div>
                          <div className="mt-1 text-sm text-slate-400">{wager.closeLabel}</div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center justify-end gap-2 text-sm font-semibold text-white">
                            <CoinMark small />
                            <span>{formatCompact(wager.amountWolo)}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {formatCompact(wager.projectedReturnWolo)} back
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className={`${insetClass()} px-4 py-5`}>
                      <div className="text-base font-semibold text-white">No slips yet.</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={`${insetClass()} mt-5 px-4 py-5`}>
                <div className="text-base font-semibold text-white">Sign in to lock slips.</div>
                <button
                  type="button"
                  onClick={() => loginWithSteam("/bets")}
                  className={`mt-4 inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${edgeButton("blue")}`}
                >
                  {loading ? "Loading..." : "Steam Sign In"}
                </button>
              </div>
            )}
          </section>

          <section className={`${shellClass()} p-5 sm:p-6`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                  Payout Proof
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Settled</h2>
              </div>
              <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                {board?.settledResults.length || 0}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {board?.settledResults.length ? (
                board.settledResults.map((result) => {
                  const content = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm uppercase tracking-[0.28em] text-slate-500 break-words">
                          {result.mapName}
                        </div>
                        <div className="mt-2 text-lg font-semibold leading-tight text-white break-words">
                          {result.title}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">{result.winner} took it</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                          {formatSettledTime(result.settledAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                        <CoinMark small />
                        <span>{formatCompact(result.payoutWolo)}</span>
                      </div>
                    </div>
                  );

                  return result.href ? (
                    <Link
                      key={result.id}
                      href={result.href}
                      className={`${cardClass()} block px-4 py-4 transition hover:border-white/14 hover:bg-white/[0.05]`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <article key={result.id} className={`${cardClass()} px-4 py-4`}>
                      {content}
                    </article>
                  );
                })
              ) : (
                <EmptyShell label="No proof landed yet." />
              )}
            </div>
          </section>

          <section className={`${shellClass()} p-5 sm:p-6`}>
            <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Heat</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">What’s moving.</h2>

            <div className="mt-5 space-y-3">
              <HeatRow
                label="Biggest pot"
                value={board?.heat.biggestPot?.label || "Market arming"}
                detail={
                  board?.heat.biggestPot
                    ? `${formatCompact(board.heat.biggestPot.potWolo)} WOLO`
                    : "Quiet"
                }
              />
              <HeatRow
                label="Best return"
                value={board?.heat.bestReturn?.label || "Reading the board"}
                detail={
                  board?.heat.bestReturn
                    ? `${board.heat.bestReturn.returnMultiplier.toFixed(2)}x`
                    : "Waiting"
                }
              />
              <HeatRow
                label="Latest proof"
                value={board?.settledResults[0]?.title || "No result yet"}
                detail={
                  board?.settledResults[0]
                    ? `${board.settledResults[0].winner} · ${formatSettledTime(board.settledResults[0].settledAt)}`
                    : "Pending"
                }
              />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function MarketFeature({
  market,
  selection,
  workingKey,
  lockWorkflow,
  isAuthenticated,
  loadingAuth,
  onSelect,
  onStakeChange,
  onLock,
  onClear,
}: {
  market: BetBoardMarket;
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  isAuthenticated: boolean;
  loadingAuth: boolean;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (stake: number) => void;
  onLock: () => void;
  onClear: () => void;
}) {
  const activeSelection =
    selection && selection.marketId === market.id
      ? selection
      : market.viewerWager
        ? {
            marketId: market.id,
            side: market.viewerWager.side,
            stake: market.viewerWager.amountWolo,
          }
        : null;
  const marketWorkflow = lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager) ? market.viewerWager : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip = !onchainLocked && !marketWorkflow;

  const selectedPool = activeSelection
    ? activeSelection.side === "left"
      ? market.left.poolWolo - (market.viewerWager?.side === "left" ? market.viewerWager.amountWolo : 0)
      : market.right.poolWolo - (market.viewerWager?.side === "right" ? market.viewerWager.amountWolo : 0)
    : 0;
  const oppositePool = activeSelection
    ? activeSelection.side === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(activeSelection.stake, Math.max(0, selectedPool), oppositePool)
    : 0;
  const statusCopy = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Keplr to approve the WOLO stake."
    : marketWorkflow.phase === "confirming_chain"
        ? "Stake submitted. Waiting for chain confirmation."
        : `Escrow confirmed${marketWorkflow.stakeTxHash ? ` · ${shortTxHash(marketWorkflow.stakeTxHash)}` : ""}. Recording slip...`
    : onchainLocked
      ? `Escrow confirmed${onchainViewerWager?.stakeTxHash ? ` · ${shortTxHash(onchainViewerWager.stakeTxHash)}` : ""}`
      : market.viewerWager
        ? `Locked on ${market.viewerWager.side === "left" ? market.left.name : market.right.name}`
        : activeSelection
          ? `Selected ${activeSelection.stake} WOLO on ${activeSelection.side === "left" ? market.left.name : market.right.name}`
          : isAuthenticated
            ? "Pick a side"
            : loadingAuth
              ? "Loading"
              : "Steam sign-in required";
  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Confirming Chain..."
        : "Recording Slip..."
    : onchainLocked
      ? "Escrow Confirmed"
      : activeSelection
        ? `Lock ${activeSelection.stake}`
        : "Lock";

  return (
    <div className="relative">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Featured Market</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
            {market.title}
          </h2>
          <div className="mt-2 text-sm text-slate-400">{market.eventLabel}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusPill(market.status)}`}>
          {market.closeLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <SideChoice
          side={market.left}
          selected={activeSelection?.side === "left"}
          emphasis="warm"
          disabled={!canEditSlip}
          onSelect={() => onSelect(market, "left")}
        />

        <div className={`${insetClass()} px-5 py-5 text-center`}>
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500" title="Total WOLO already sitting in the book.">
            Pot
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-3xl font-semibold text-white">
            <CoinMark />
            <span>{formatCompact(market.totalPotWolo)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">{market.left.crowdPercent}% / {market.right.crowdPercent}%</div>
        </div>

        <SideChoice
          side={market.right}
          selected={activeSelection?.side === "right"}
          emphasis="cool"
          disabled={!canEditSlip}
          onSelect={() => onSelect(market, "right")}
        />
      </div>

      <div className={`${insetClass()} mt-5 px-4 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STAKE_OPTIONS.map((stake) => (
              <button
                key={stake}
                type="button"
                onClick={() => activeSelection && onStakeChange(stake)}
                disabled={!activeSelection || !canEditSlip}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm transition ${
                  activeSelection?.stake === stake ? edgeButton("gold") : edgeButton("glass")
                } ${!activeSelection || !canEditSlip ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {stake}
              </button>
            ))}
          </div>

          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500" title="Projected book return if this side wins right now.">
              If Right
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {activeSelection ? `${formatCompact(projectedReturn)} WOLO` : "Pick a side"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">{statusCopy}</div>

          <div className="flex flex-wrap gap-2">
            {market.viewerWager && !onchainLocked ? (
              <button
                type="button"
                onClick={onClear}
                disabled={workingKey === `clear-${market.id}`}
                className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm transition ${edgeButton("glass")} ${
                  workingKey === `clear-${market.id}` ? "opacity-60" : ""
                }`}
              >
                {workingKey === `clear-${market.id}` ? "Clearing..." : "Clear"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onLock}
              disabled={!activeSelection || !canEditSlip || workingKey === `lock-${market.id}`}
              className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${edgeButton("gold")} ${
                !activeSelection || !canEditSlip || workingKey === `lock-${market.id}` ? "opacity-60" : ""
              }`}
            >
              {lockLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketCard({
  market,
  selection,
  workingKey,
  lockWorkflow,
  onSelect,
  onStakeChange,
  onLock,
  onClear,
  accent,
}: {
  market: BetBoardMarket;
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (stake: number) => void;
  onLock: () => void;
  onClear: () => void;
  accent: "warm" | "cool";
}) {
  const activeSelection =
    selection && selection.marketId === market.id
      ? selection
      : market.viewerWager
        ? {
            marketId: market.id,
            side: market.viewerWager.side,
            stake: market.viewerWager.amountWolo,
          }
        : null;
  const marketWorkflow = lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager) ? market.viewerWager : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip = !onchainLocked && !marketWorkflow;

  const selectedPool = activeSelection
    ? activeSelection.side === "left"
      ? market.left.poolWolo - (market.viewerWager?.side === "left" ? market.viewerWager.amountWolo : 0)
      : market.right.poolWolo - (market.viewerWager?.side === "right" ? market.viewerWager.amountWolo : 0)
    : 0;
  const oppositePool = activeSelection
    ? activeSelection.side === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(activeSelection.stake, Math.max(0, selectedPool), oppositePool)
    : 0;
  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Chain..."
        : "Saving..."
    : onchainLocked
      ? "Escrow Live"
      : activeSelection
        ? `Lock ${activeSelection.stake}`
        : "Lock";

  return (
    <article className={`${cardClass()} overflow-hidden p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500 break-words">
            {market.eventLabel}
          </div>
          <div className="mt-2 text-[1.65rem] font-semibold leading-[1.05] text-white break-words">
            {market.title}
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusPill(market.status)}`}>
          {market.closeLabel}
        </span>
      </div>

      <div className={`${insetClass()} mt-4 px-4 py-3`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Pot</div>
            <div className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
              <CoinMark small />
              <span>{formatCompact(market.totalPotWolo)} WOLO</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{market.left.crowdPercent}% left</div>
            <div>{market.right.crowdPercent}% right</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SideMiniChoice
          side={market.left}
          selected={activeSelection?.side === "left"}
          emphasis={accent === "warm" ? "warm" : "cool"}
          disabled={!canEditSlip}
          onSelect={() => onSelect(market, "left")}
        />
        <SideMiniChoice
          side={market.right}
          selected={activeSelection?.side === "right"}
          emphasis={accent === "warm" ? "cool" : "warm"}
          disabled={!canEditSlip}
          onSelect={() => onSelect(market, "right")}
        />
      </div>

      <div className={`${insetClass()} mt-4 px-4 py-4`}>
        <div className="flex flex-wrap gap-2">
          {STAKE_OPTIONS.map((stake) => (
            <button
            key={stake}
            type="button"
            onClick={() => activeSelection && onStakeChange(stake)}
            disabled={!activeSelection || !canEditSlip}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              activeSelection?.stake === stake ? edgeButton("gold") : edgeButton("glass")
            } ${!activeSelection || !canEditSlip ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {stake}
          </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">If Right</div>
            <div className="mt-2 text-base font-semibold text-white">
              {activeSelection ? `${formatCompact(projectedReturn)} WOLO` : "Pick"}
            </div>
          </div>

          <div className="flex gap-2">
            {market.viewerWager && !onchainLocked ? (
              <button
                type="button"
                onClick={onClear}
                disabled={workingKey === `clear-${market.id}`}
                className={`rounded-full px-3 py-2 text-xs transition ${edgeButton("glass")} ${
                  workingKey === `clear-${market.id}` ? "opacity-60" : ""
                }`}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={onLock}
              disabled={!activeSelection || !canEditSlip || workingKey === `lock-${market.id}`}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${edgeButton(
                accent === "warm" ? "gold" : "blue"
              )} ${!activeSelection || !canEditSlip || workingKey === `lock-${market.id}` ? "opacity-60" : ""}`}
            >
              {lockLabel}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function SideChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.45rem] border px-4 py-4 text-left transition ${sideSurface(
        selected,
        emphasis
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Pick</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-white">{side.name}</div>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-black/10 px-3 py-1 text-xs text-slate-200">
          {side.crowdPercent}%
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-200">
        <div className="flex items-center gap-2">
          <CoinMark small />
          <span>{formatCompact(side.poolWolo)}</span>
        </div>
        <span>{side.slips} slips</span>
      </div>
    </button>
  );
}

function SideMiniChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.15rem] border px-3 py-3 text-left transition ${sideSurface(
        selected,
        emphasis
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="min-h-[2.5rem] text-sm font-semibold leading-snug text-white break-words">
        {side.name}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>{side.crowdPercent}%</span>
        <span>{formatCompact(side.poolWolo)}</span>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardClass()} px-4 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function HeatRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={`${cardClass()} px-4 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function LoadingMarket() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-32 rounded-full bg-white/10" />
      <div className="h-12 w-72 rounded-2xl bg-white/10" />
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
      </div>
      <div className="h-24 rounded-[1.4rem] bg-white/10" />
    </div>
  );
}

function LoadingCard() {
  return <div className={`${cardClass()} h-[18rem] animate-pulse bg-white/[0.03]`} />;
}

function EmptyShell({ label }: { label: string }) {
  return (
    <div className={`${insetClass()} px-4 py-5 text-sm text-slate-300`}>{label}</div>
  );
}
