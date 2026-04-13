"use client";

import {
  BetBoardSnapshot,
  PendingStakeRecovery,
  CoinMark,
  MiniMetric,
  cardClass,
  edgeButton,
  formatCompact,
  formatSettledTime,
  insetClass,
  shellClass,
  shortTxHash,
} from "@/components/bets/page-shared";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";

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
  return (
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

          {unresolvedStakeIntents.length ? (
            <div className="mt-5 space-y-2">
              {unresolvedStakeIntents.map((intent) => {
                const pendingRecovery =
                  pendingStakeRecoveries.find((entry) => entry.intentId === intent.id) || null;
                const stakeProofUrl = intent.stakeTxHash
                  ? buildWoloRestTxLookupUrl(intent.stakeTxHash)
                  : pendingRecovery?.stakeTxHash
                    ? buildWoloRestTxLookupUrl(pendingRecovery.stakeTxHash)
                    : null;
                const canRecover = Boolean(intent.stakeTxHash || pendingRecovery?.stakeTxHash);

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
                          {intent.side === "left" ? "Left side" : "Right side"} · {formatCompact(intent.amountWolo)} WOLO · {intent.status}
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
                          disabled={!canRecover || recoveringIntentId === intent.id}
                          className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition ${edgeButton("gold")} ${
                            !canRecover || recoveringIntentId === intent.id ? "opacity-60" : ""
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

          <div className="mt-5 space-y-3">
            {board?.yourBook.openWagers.length ? (
              board.yourBook.openWagers.map((wager) => (
                <article
                  key={wager.marketId}
                  className={`${cardClass()} flex items-center justify-between gap-4 px-4 py-4`}
                >
                  <div className="min-w-0">
                    <div className="break-words text-sm uppercase tracking-[0.28em] text-slate-500">
                      {wager.eventLabel}
                    </div>
                    <div className="mt-2 break-words text-lg font-semibold leading-tight text-white">
                      {wager.pickedLabel}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{wager.closeLabel}</div>
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