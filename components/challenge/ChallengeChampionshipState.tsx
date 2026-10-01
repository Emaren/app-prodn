"use client";

import { Clock3, Crown, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { ScheduledMatchTile } from "@/lib/challenges";
import { challengeCountdown, championshipPhaseLabel } from "@/lib/challengePresentation";

export default function ChallengeChampionshipState({ championship, nowMs, defender = false, compact = false }: {
  championship: NonNullable<ScheduledMatchTile["championship"]>;
  nowMs: number; defender?: boolean; compact?: boolean;
}) {
  const [failedBeltUris, setFailedBeltUris] = useState<Set<string>>(() => new Set());
  const inDefense = championship.phase === "defense_in_progress";
  const grace = championship.phase === "default_grace";
  const countdown = challengeCountdown(grace ? championship.commissionerGraceDeadline : championship.challengeDeadline, nowMs);
  const stopped = inDefense || ["completed", "settled", "cancelled", "canceled", "expired", "defaulted", "disputed", "commissioner_review", "commissioner_vetoed", "declined"].includes(championship.phase);
  const urgent = !stopped && !grace && countdown.finalHour;
  const winnerNames = championship.winnerSide ? championship.participants.filter((member) => member.side === championship.winnerSide).map((member) => member.name).join(" + ") : null;
  const challengerNames = championship.participants.filter((member) => member.side === "challenger").map((member) => member.name).join(" + ");
  const defenderNames = championship.participants.filter((member) => member.side === "defender").map((member) => member.name).join(" + ");
  const custodyLabels: Record<string, string> = { transferred: "Championship custody transferred", holder_retained: "Champion retained title", disputed: "Title in dispute", review: "Custody under Commissioner review", pending: "Title custody pending proof" };
  const paymentLabels: Record<string, string> = { unfunded: "Purse not funded", pending: "Payment awaiting chain proof", partial: "Payment partially confirmed", failed: "Payment needs attention", proven: "Chain payment proof recorded" };
  const bountyLabels: Record<string, string> = { pending: "Dethrone bounty queued", partial: "Dethrone bounty partially paid", failed: "Dethrone bounty needs attention", paid: "Dethrone bounty paid with chain proof" };
  const nftLabels: Record<string, string> = { not_started: "Belt NFT transfer awaits result", not_required: "Belt NFT custody retained", pending: "Belt NFT transfer pending", blocked: "Belt NFT transfer awaiting chain capability", partial: "Belt NFT seats partially transferred", failed: "Belt NFT transfer needs attention", confirmed: "Belt NFT seats confirmed on chain" };
  const resultState = ["completed", "settled", "defaulted", "disputed", "commissioner_review", "cancelled", "canceled", "expired", "declined"].includes(championship.phase);
  const refunds = ["defaulted", "disputed", "cancelled", "canceled", "expired", "declined"].includes(championship.phase);
  const label = inDefense || grace || stopped ? championshipPhaseLabel(championship.phase, Boolean(championship.titleName)).toUpperCase() : defender && urgent && championship.titleName ? "YOUR TITLE DEFENSE EXPIRES IN" : "ALL CHALLENGES REMAIN OPEN FOR 24 HOURS";
  return (
    <div className={`rounded-xl border ${compact ? "px-3 py-2" : "p-4"} ${urgent ? "border-amber-200/60 bg-amber-950/35 shadow-[0_0_24px_rgba(245,158,11,0.12)]" : grace ? "border-amber-200/30 bg-amber-950/20" : "border-emerald-200/20 bg-emerald-950/35"}`} data-championship-phase={championship.phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-emerald-100/80">{inDefense ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <Clock3 className="h-3.5 w-3.5 shrink-0" />}{label}</div>{championship.titleName ? <div className="mt-1 flex items-center gap-2 text-xs font-bold text-amber-100">{championship.titleImageUri && !failedBeltUris.has(championship.titleImageUri) ? <Image src={championship.titleImageUri} alt="" width={48} height={32} unoptimized onError={() => setFailedBeltUris((current) => new Set([...current, championship.titleImageUri!]))} className="h-8 w-12 shrink-0 object-contain" /> : <Crown className="h-3 w-3 shrink-0" />}{championship.titleName}</div> : null}</div>
        {!stopped ? <time dateTime={grace ? championship.commissionerGraceDeadline : championship.challengeDeadline} aria-label={`${grace ? "Commissioner grace" : "Challenge deadline"} remaining ${countdown.label}`} className={`${compact ? "text-xl" : "text-3xl sm:text-4xl"} font-black tabular-nums tracking-[0.06em] ${urgent ? "text-amber-100" : "text-white"}`}>{nowMs > 0 ? countdown.label : "—"}</time> : null}
      </div>
      <p className="mt-2 break-words text-xs font-semibold text-white">{challengerNames} <span className="font-normal text-slate-500">vs</span> {defenderNames}{championship.mode ? <span className="ml-2 text-[10px] uppercase text-slate-400">{championship.teamSize ?? 1}v{championship.teamSize ?? 1} {championship.mode}</span> : null}</p>
      {championship.currentHolderNames?.length ? <p className="mt-1 text-[11px] leading-5 text-amber-100/75">Current {championship.currentHolderNames.length > 1 ? "champions" : "champion"}: {championship.currentHolderNames.join(" + ")}</p> : null}
      {!resultState ? <p className="mt-1 text-[10px] leading-5 text-slate-400">{championship.participants.filter((member) => member.accepted).length}/{championship.participants.length} accepted · {championship.participants.filter((member) => member.funded).length}/{championship.participants.length} chain funding verified</p> : null}
      <p className={`${compact ? "mt-1.5 text-[11px]" : "mt-3 text-sm"} leading-5 text-slate-300`}>{championship.nextInstruction}</p>
      {urgent ? <p className="mt-1 text-xs font-bold text-amber-100">Final hour — respond and start the qualifying {championship.titleName ? "defense" : "battle"} before expiry.</p> : null}
      {winnerNames && resultState ? <p className="mt-2 text-sm font-bold text-white">{championship.resultStatus === "default" ? "Default awarded" : "Verified winner"}: {winnerNames}</p> : null}
      {resultState ? <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-300">
        {[championship.titleName && custodyLabels[championship.titleCustodyStatus || "pending"], paymentLabels[championship.paymentStatus || "pending"], bountyLabels[championship.bountyStatus || "none"], championship.titleName && nftLabels[championship.nftStatus || "pending"]].filter(Boolean).map((text) => <span key={String(text)} className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1">{text}</span>)}
        {championship.paymentTxHashes?.map((hash) => <code key={hash} title={hash} className="rounded-full border border-emerald-200/15 bg-emerald-950/40 px-2.5 py-1 text-emerald-100">Tx {hash.slice(0,8)}…{hash.slice(-6)}</code>)}
      </div> : null}
      {resultState && (championship.purseFundedWolo ?? 0) > 0 ? <p className="mt-2 text-[11px] text-slate-300">{refunds ? "Funded deposits" : "Purse"}: {(championship.pursePaidWolo ?? 0).toLocaleString()} of {championship.purseFundedWolo?.toLocaleString()} WOLO {refunds ? "returned" : "paid"} with chain proof</p> : null}
      {resultState && (championship.bountyAmountWolo ?? 0) > 0 ? <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-100/80"><span>Dethrone bounty: {championship.bountyAmountWolo?.toLocaleString()} WOLO</span>{championship.bountyTxHashes?.map((hash) => <code key={hash} title={hash} className="break-all text-[10px]">Bounty tx {hash.slice(0,8)}…{hash.slice(-6)}</code>)}</div> : null}
    </div>
  );
}
