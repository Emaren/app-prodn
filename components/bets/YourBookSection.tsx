"use client";

import Link from "next/link";

import {
  BetBoardSnapshot,
  BetBookEntry,
  PendingStakeRecovery,
  CoinMark,
  MiniMetric,
  cardClass,
  buildBetMarketHistoryHref,
  edgeButton,
  formatCompact,
  formatSettledTime,
  insetClass,
  isRecoveryBookOpen,
  shellClass,
  shortTxHash,
} from "@/components/bets/page-shared";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";

function formatRecoveryIntentStatus(status: string) {
  switch (status) {
    case "verified_unrecorded":
      return "verified, not recorded";
    case "broadcast_submitted":
      return "broadcast submitted";
    default:
      return status.replace(/_/g, " ");
  }
}

type BookLifecycle = "current" | "awaiting" | "proof";

function bookLifecycle(wager: BetBookEntry): BookLifecycle {
  if (["Won", "Lost", "Refund recorded", "Voided"].includes(wager.closeLabel)) {
    return "proof";
  }
  if (
    ["closing", "settled"].includes(wager.status) &&
    /slip locked|awaiting|review|verdict/i.test(wager.closeLabel)
  ) {
    return "awaiting";
  }
  return "current";
}

function proofAmountLabel(wager: BetBookEntry) {
  if (wager.closeLabel === "Won") {
    return `${formatCompact(wager.projectedReturnWolo)} WOLO paid`;
  }
  if (wager.closeLabel === "Refund recorded") {
    return `${formatCompact(wager.projectedReturnWolo || wager.amountWolo)} WOLO refund`;
  }
  if (wager.closeLabel === "Lost") {
    return `${formatCompact(wager.amountWolo)} WOLO staked`;
  }
  return "No payout recorded";
}

function BookWagerRow({
  wager,
  lifecycle,
  rowKey,
}: {
  wager: BetBookEntry;
  lifecycle: BookLifecycle;
  rowKey: string;
}) {
  const marketHistoryHref = buildBetMarketHistoryHref(wager.marketId);
  const statusLabel =
    lifecycle === "awaiting" ? "Awaiting verdict" : wager.closeLabel;
  const amountLabel =
    lifecycle === "proof"
      ? proofAmountLabel(wager)
      : lifecycle === "awaiting"
        ? `${formatCompact(wager.amountWolo)} WOLO committed`
        : `${formatCompact(wager.projectedReturnWolo)} WOLO if right`;

  return (
    <article
      key={rowKey}
      className={`${cardClass()} flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="min-w-0">
        <div className="break-words text-sm uppercase tracking-[0.28em] text-slate-500">
          {wager.eventLabel}
        </div>
        {marketHistoryHref ? (
          <Link
            href={marketHistoryHref}
            className="mt-2 inline-flex break-words text-lg font-semibold leading-tight text-white transition hover:text-amber-100"
          >
            {wager.title}
          </Link>
        ) : (
          <div className="mt-2 break-words text-lg font-semibold leading-tight text-white">
            {wager.title}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">
          Pick · <span className="font-semibold text-slate-300">{wager.pickedLabel}</span>
        </div>
        <div
          className={`mt-2 text-sm ${
            lifecycle === "awaiting"
              ? "text-amber-100"
              : lifecycle === "proof"
                ? "text-emerald-100"
                : "text-slate-400"
          }`}
        >
          {statusLabel}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span>{wager.slipCount} slip{wager.slipCount === 1 ? "" : "s"}</span>
          <span>
            {wager.executionMode === "onchain_escrow"
              ? "verified escrow"
              : "app-side fallback"}
          </span>
          {wager.stakeTxHash ? (
            <span className="font-mono text-slate-400">{shortTxHash(wager.stakeTxHash)}</span>
          ) : null}
          {wager.stakeProofUrl ? (
            <a
              href={wager.stakeProofUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-200 transition hover:text-cyan-100"
            >
              proof
            </a>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-left sm:text-right">
        <div className="flex items-center gap-2 text-sm font-semibold text-white sm:justify-end">
          <CoinMark small />
          <span>{formatCompact(wager.amountWolo)} staked</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">{amountLabel}</div>
      </div>
    </article>
  );
}

export default function YourBookSection({
  board,
  isAuthenticated,
  loadingAuth,
  loginWithSteam,
  unresolvedStakeIntents,
  pendingStakeRecoveries,
  recoveringIntentId,
  onRecover,
}: {
  board: BetBoardSnapshot | null;
  isAuthenticated: boolean;
  loadingAuth: boolean;
  loginWithSteam: (returnTo?: string) => void;
  unresolvedStakeIntents: BetBoardSnapshot["recovery"]["unresolvedStakeIntents"];
  pendingStakeRecoveries: PendingStakeRecovery[];
  recoveringIntentId: number | null;
  onRecover: (intentId: number) => Promise<void>;
}) {
  const actionableStakeIntents = unresolvedStakeIntents.filter((intent) => {
    const pendingRecovery =
      pendingStakeRecoveries.find((entry) => entry.intentId === intent.id) || null;
    return Boolean(
      isRecoveryBookOpen(intent.marketStatus) &&
        (intent.stakeTxHash || pendingRecovery?.stakeTxHash)
    );
  });
  const pendingProofStakeIntents = unresolvedStakeIntents.filter((intent) => {
    const pendingRecovery =
      pendingStakeRecoveries.find((entry) => entry.intentId === intent.id) || null;
    return Boolean(
      isRecoveryBookOpen(intent.marketStatus) &&
        !intent.stakeTxHash &&
        !pendingRecovery?.stakeTxHash
    );
  });
  const bookWagers = board?.yourBook.openWagers ?? [];
  const currentSlips = bookWagers.filter((wager) => bookLifecycle(wager) === "current");
  const awaitingVerdict = bookWagers.filter((wager) => bookLifecycle(wager) === "awaiting");
  const recentProof = bookWagers.filter((wager) => bookLifecycle(wager) === "proof");

  return (
    <section id="your-book" className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Your Book</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Slip lifecycle</h2>
        </div>
        {isAuthenticated ? (
          <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
            {board?.yourBook.activeCount || 0}
          </div>
        ) : null}
      </div>

      {isAuthenticated ? (
        <>
          <div className="mt-5 rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
                  Current Slips
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Open positions
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {board?.yourBook.activeCount || 0} active
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
            <div className="mt-4 space-y-3">
              {currentSlips.length ? (
                currentSlips.map((wager, index) => (
                  <BookWagerRow
                    key={`current-${wager.marketId}-${index}`}
                    rowKey={`current-${wager.marketId}-${index}`}
                    wager={wager}
                    lifecycle="current"
                  />
                ))
              ) : (
                <div className={`${insetClass()} px-4 py-5`}>
                  <div className="text-base font-semibold text-white">
                    No active slips right now.
                  </div>
                </div>
              )}
            </div>
          </div>

          {actionableStakeIntents.length ? (
            <div className="mt-5 space-y-2">
              {actionableStakeIntents.map((intent) => {
                const pendingRecovery =
                  pendingStakeRecoveries.find((entry) => entry.intentId === intent.id) || null;
                const stakeProofUrl = intent.stakeTxHash
                  ? buildWoloRestTxLookupUrl(intent.stakeTxHash)
                  : pendingRecovery?.stakeTxHash
                    ? buildWoloRestTxLookupUrl(pendingRecovery.stakeTxHash)
                    : null;

                return (
                  <div
                    key={intent.id}
                    className={`${cardClass()} border-amber-300/15 bg-amber-500/[0.06] px-4 py-4`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          Signed stake recovery · {intent.title}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          {intent.side === "left" ? "Left side" : "Right side"} · {formatCompact(intent.amountWolo)} WOLO · {formatRecoveryIntentStatus(intent.status)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Pools and settlement exclude this stake until it is safely recorded.
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {formatSettledTime(intent.updatedAt)}
                        </div>
                        {intent.errorDetail ? (
                          <div className="mt-2 text-xs text-amber-100">{intent.errorDetail}</div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {stakeProofUrl ? (
                          <a
                            href={stakeProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center rounded-full px-3 py-2 text-xs transition ${edgeButton("glass")}`}
                          >
                            Stake Proof
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            void onRecover(intent.id);
                          }}
                          disabled={recoveringIntentId === intent.id}
                          className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition ${edgeButton("gold")} ${
                            recoveringIntentId === intent.id ? "opacity-60" : ""
                          }`}
                        >
                          {recoveringIntentId === intent.id ? "Recovering..." : "Recover"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {pendingProofStakeIntents.length ? (
            <div className="mt-5 space-y-2">
              {pendingProofStakeIntents.map((intent) => (
                <div
                  key={intent.id}
                  className={`${cardClass()} border-cyan-300/15 bg-cyan-500/[0.05] px-4 py-4`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        Stake proof pending · {intent.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-300">
                        {intent.side === "left" ? "Left side" : "Right side"} · {formatCompact(intent.amountWolo)} WOLO · {formatRecoveryIntentStatus(intent.status)}
                      </div>
                      <div className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
                        No usable stake tx is attached yet. If the wallet broadcast landed,
                        AoE2HDBets keeps scanning WoloChain escrow deposits for this intent.
                        Pools and settlement exclude it until proof lands.
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {formatSettledTime(intent.updatedAt)}
                      </div>
                      {intent.errorDetail ? (
                        <div className="mt-2 text-xs text-cyan-100">{intent.errorDetail}</div>
                      ) : null}
                    </div>

                    <div className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100">
                      Watching chain
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {awaitingVerdict.length ? (
            <div className="mt-5 rounded-[1.4rem] border border-amber-300/14 bg-amber-400/[0.045] p-4 sm:p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/65">
                Awaiting Verdict
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Final proof is under review
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                These slips remain separate from settled proof while the parser or
                commissioner verdict is unresolved.
              </p>
              <div className="mt-4 space-y-3">
                {awaitingVerdict.map((wager, index) => (
                  <BookWagerRow
                    key={`awaiting-${wager.marketId}-${index}`}
                    rowKey={`awaiting-${wager.marketId}-${index}`}
                    wager={wager}
                    lifecycle="awaiting"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-[1.4rem] border border-emerald-300/10 bg-emerald-400/[0.025] p-4 sm:p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/55">
              Recent Proof
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              Settled and recorded
            </div>
            <div className="mt-4 space-y-3">
              {recentProof.length ? (
                recentProof.map((wager, index) => (
                  <BookWagerRow
                    key={`proof-${wager.marketId}-${index}`}
                    rowKey={`proof-${wager.marketId}-${index}`}
                    wager={wager}
                    lifecycle="proof"
                  />
                ))
              ) : (
                <div className={`${insetClass()} px-4 py-5`}>
                  <div className="text-base font-semibold text-white">
                    No recent proof yet.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className={`${insetClass()} mt-5 flex min-h-[320px] flex-col px-4 py-5`}>
          <div>
            <div className="text-base font-semibold text-white">Sign in to lock slips.</div>
            <div className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
              Keep active picks, stake recovery proofs, and projected return on one calmer rail the moment you sign in.
            </div>
            <button
              type="button"
              onClick={() => loginWithSteam("/bets")}
              className={`mt-4 inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${edgeButton("blue")}`}
            >
              {loadingAuth ? "Loading..." : "Steam Sign In"}
            </button>
          </div>

          <div className="mt-auto pt-6">
            <div className={`${cardClass()} overflow-hidden border-white/[0.08] bg-white/[0.03]`}>
              <div className="grid gap-0 sm:grid-cols-[1.2fr_0.9fr]">
                <div className="px-4 py-4 sm:px-5">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Locked rail</div>
                  <div className="mt-2 text-base font-semibold text-white">Your slips stay gathered here.</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                    Track every side you backed, keep recovery proofs close, and stop losing the board when the action shifts.
                  </div>
                </div>

                <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">What unlocks</div>
                  <div className="mt-3 space-y-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Active slips</span>
                      <span className="font-semibold text-white">Live</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Projected return</span>
                      <span className="font-semibold text-white">Instant</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Recovery rail</span>
                      <span className="font-semibold text-white">Ready</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
