"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Swords,
  Trophy,
} from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type { BetBattleHistoryGroup } from "@/lib/betBattleHistoryProjection";

type BattleOutcome = BetBattleHistoryGroup["winnerOutcome"];
type BattleSlip = BetBattleHistoryGroup["slips"][number];
type BattleTimelineEvent = BetBattleHistoryGroup["timeline"][number];

const STATUS_COPY: Record<
  BetBattleHistoryGroup["status"],
  { label: string; className: string }
> = {
  live: {
    label: "Battle live",
    className: "border-sky-300/18 bg-sky-400/[0.07] text-sky-100",
  },
  settled: {
    label: "Result settled",
    className: "border-emerald-300/18 bg-emerald-400/[0.07] text-emerald-100",
  },
  paid: {
    label: "Payout confirmed",
    className: "border-emerald-300/18 bg-emerald-400/[0.07] text-emerald-100",
  },
  refunded: {
    label: "Refund confirmed",
    className: "border-sky-300/18 bg-sky-400/[0.07] text-sky-100",
  },
  awaiting_settlement: {
    label: "Awaiting settlement",
    className: "border-amber-300/18 bg-amber-400/[0.07] text-amber-100",
  },
  needs_attention: {
    label: "Needs attention",
    className: "border-rose-300/18 bg-rose-400/[0.07] text-rose-100",
  },
};

const FUNDING_COPY: Record<
  BattleSlip["fundingStatus"],
  { label: string; className: string }
> = {
  chain_verified: {
    label: "Chain verified",
    className: "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-100",
  },
  app_recorded: {
    label: "App recorded",
    className: "border-slate-300/12 bg-white/[0.035] text-slate-300",
  },
  awaiting_verification: {
    label: "Awaiting verification",
    className: "border-amber-300/16 bg-amber-400/[0.06] text-amber-100",
  },
};

export type BetBattleHistoryCardDensity =
  | "b1"
  | "a1"
  | "a2";

export default function BetBattleHistoryCard({
  group,
  className = "",
  density = "b1",
}: {
  group: BetBattleHistoryGroup;
  className?: string;
  density?: BetBattleHistoryCardDensity;
}) {
  const [expanded, setExpanded] = useState(false);
  const disclosureId = useId().replace(/:/g, "");
  const detailsId = `battle-history-${disclosureId}`;
  const status = STATUS_COPY[group.status];
  const timeline = useMemo(
    () =>
      [...group.timeline].sort((left, right) => {
        const timeDelta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
        if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
        return left.key.localeCompare(right.key);
      }),
    [group.timeline]
  );

  const winnerSummary =
    outcomeValue(
      group.winnerOutcome,
      "Pending",
    );

  const desyncSummary =
    outcomeValue(
      group.desyncOutcome,
      "Not offered",
    );

  const normalizedDesync =
    desyncSummary
      .trim()
      .toLowerCase();

  const desyncCode =
    !group.desyncOutcome
      ? "—"
      : normalizedDesync.startsWith("yes")
        ? "Y"
        : normalizedDesync.startsWith("no")
          ? "N"
          : "•";

  const desyncClassName =
    desyncCode === "Y"
      ? "border-rose-300/20 bg-rose-400/[0.07] text-rose-100"
      : desyncCode === "N"
        ? "border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100"
        : "border-white/[0.07] bg-white/[0.025] text-slate-500";

  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-[1.35rem] border border-cyan-300/16 bg-[radial-gradient(85%_150%_at_0%_50%,rgba(14,116,144,0.14),transparent_54%),linear-gradient(115deg,rgba(3,10,24,0.98),rgba(6,11,24,0.96))] shadow-[inset_3px_0_0_rgba(56,189,248,0.42),0_16px_38px_rgba(0,0,0,0.20)] ${className}`}
      aria-labelledby={`${detailsId}-title`}
    >
      {density === "a2" ? (
      <div
        id={`${detailsId}-title`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${battleLabel(group)} — toggle battle proof`}
        onClick={() =>
          setExpanded(
            (value) => !value,
          )
        }
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" &&
            event.key !== " "
          ) {
            return;
          }

          event.preventDefault();

          setExpanded(
            (value) => !value,
          );
        }}
        className="group/battle w-full min-w-0 cursor-pointer px-4 py-4 outline-none transition duration-150 hover:bg-cyan-300/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200/45 sm:px-5"
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)] lg:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-300/[0.07] text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.10)]">
              <Swords className="h-5 w-5" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.72)]" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px] font-black uppercase tracking-[0.2em]">
                <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.055] px-2.5 py-1 text-cyan-100">
                  {group.publicNumber !== null
                    ? `Battle #${group.publicNumber.toLocaleString()}`
                    : `Market #${group.rootMarketId.toLocaleString()}`}
                </span>
                <span className="text-slate-500">
                  <TimeDisplayText
                    value={group.startedAt}
                    includeZone={false}
                    includeYear
                    interactive={false}
                  />
                </span>
              </div>

              <h3
                className="mt-2 line-clamp-2 break-words text-[1.02rem] font-semibold leading-[1.32] text-[#eee7d8] sm:text-[1.08rem]"
              >
                {battleMatchup(group)}
              </h3>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="font-semibold text-amber-100">
                  {formatWolo(group.coreStakeWolo)} WOLO accepted
                </span>
                <span aria-hidden="true" className="text-slate-700">
                  •
                </span>
                <span>
                  {group.slips.length.toLocaleString()} {group.slips.length === 1 ? "slip" : "slips"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-2">
            <OutcomeSummary
              eyebrow="Winner"
              value={outcomeValue(group.winnerOutcome, "Pending")}
              tone="gold"
            />
            <OutcomeSummary
              eyebrow="Desync"
              value={outcomeValue(group.desyncOutcome, "Not offered")}
              tone="blue"
            />
            <div className="min-w-0 rounded-xl border border-white/[0.065] bg-black/20 px-3 py-2.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                Settlement
              </div>
              <div className="mt-1 truncate text-xs font-semibold text-slate-100">
                {settlementAmount(group)}
              </div>
              <div className={`mt-1.5 inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${status.className}`}>
                {status.label}
              </div>
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="mt-3 flex min-h-11 w-full items-center justify-between border-t border-white/[0.055] pt-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 transition group-hover/battle:text-slate-300"
        >
          <span>
            {expanded
              ? "Hide battle proof"
              : "Battle proof"}
          </span>

          <ChevronDown
            className={`h-4 w-4 text-amber-100/70 transition-transform duration-200 ${
              expanded
                ? "rotate-180"
                : ""
            }`}
            aria-hidden="true"
          />
        </div>
      </div>

      ) : (
        <button
          id={`${detailsId}-title`}
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${battleLabel(group)} — open battle details`}
          onClick={() =>
            setExpanded(
              (value) => !value,
            )
          }
          className={`group/battle grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center text-left outline-none transition duration-150 hover:bg-cyan-300/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200/45 ${
            density === "b1"
              ? "gap-3 px-3 py-2.5 sm:px-4"
              : "gap-3.5 px-4 py-3.5 sm:px-5"
          }`}
        >
          <span
            className={`relative flex shrink-0 items-center justify-center rounded-xl border border-cyan-200/16 bg-cyan-300/[0.055] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.07)] transition group-hover/battle:border-cyan-200/28 group-hover/battle:bg-cyan-300/[0.085] ${
              density === "b1"
                ? "h-9 w-9"
                : "h-10 w-10"
            }`}
          >
            <Swords
              className={
                density === "b1"
                  ? "h-4 w-4"
                  : "h-[1.05rem] w-[1.05rem]"
              }
              aria-hidden="true"
            />
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-slate-950 bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.65)]"
              aria-hidden="true"
            />
          </span>

          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/85">
                {group.publicNumber !== null
                  ? `Battle #${group.publicNumber.toLocaleString()}`
                  : `Market #${group.rootMarketId.toLocaleString()}`}
              </span>

              <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-600">
                <TimeDisplayText
                  value={group.startedAt}
                  includeZone={false}
                  includeYear
                  interactive={false}
                />
              </span>
            </span>

            <span
              className={`mt-1 block min-w-0 truncate font-semibold leading-5 text-[#eee7d8] ${
                density === "b1"
                  ? "text-[13px]"
                  : "text-sm"
              }`}
            >
              {battleMatchup(group)}
            </span>

            {density === "a1" ? (
              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 text-[9px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                <span>{status.label}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {group.slips.length.toLocaleString()}{" "}
                  {group.slips.length === 1
                    ? "slip"
                    : "slips"}
                </span>

                {group.rewardWolo > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-100/70">
                      +{formatWolo(group.rewardWolo)} rewards
                    </span>
                  </>
                ) : null}
              </span>
            ) : null}
          </span>

          <span className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="hidden min-w-0 items-center gap-4 lg:flex">
              <span className="min-w-[5.8rem] border-l border-white/[0.055] pl-3">
                <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
                  Stake
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-amber-100">
                  {formatWolo(group.coreStakeWolo)} WOLO
                </span>
              </span>

              <span className="min-w-[6.5rem] border-l border-white/[0.055] pl-3">
                <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
                  Result
                </span>
                <span className="mt-0.5 block max-w-[8.5rem] truncate text-[11px] font-semibold text-slate-200">
                  {winnerSummary}
                </span>
              </span>

              <span className="min-w-[7rem] border-l border-white/[0.055] pl-3">
                <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
                  Settlement
                </span>
                <span className="mt-0.5 block max-w-[9rem] truncate text-[11px] font-semibold text-emerald-100/90">
                  {settlementAmount(group)}
                </span>
              </span>
            </span>

            <span
              title={`Desync: ${desyncSummary}`}
              aria-label={`Desync: ${desyncSummary}`}
              className={`inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[9px] font-black uppercase tracking-[0.08em] ${desyncClassName}`}
            >
              <span className="opacity-55">
                D
              </span>
              <span>{desyncCode}</span>
            </span>

            <ChevronDown
              className={`h-4 w-4 shrink-0 text-amber-100/55 transition-transform duration-200 group-hover/battle:text-amber-100 ${
                expanded
                  ? "rotate-180"
                  : ""
              }`}
              aria-hidden="true"
            />
          </span>
        </button>
      )}
      {expanded ? (
        <div
          id={detailsId}
          role="region"
          aria-label={`${battleLabel(group)} wager and settlement proof`}
          className="border-t border-cyan-200/[0.09] bg-black/15 px-4 py-4 sm:px-5 sm:py-5"
        >
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
            <section aria-labelledby={`${detailsId}-slips`} className="min-w-0">
              <SectionHeading
                id={`${detailsId}-slips`}
                icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
                label="Accepted slips"
                count={group.slips.length}
              />

              {group.slips.length ? (
                <div className="mt-3 space-y-2.5">
                  {group.slips.map((slip) => (
                    <BattleSlipCard key={slip.key} slip={slip} />
                  ))}
                </div>
              ) : (
                <EmptyProofState>No accepted wager slips were recorded for this battle.</EmptyProofState>
              )}
            </section>

            <section aria-labelledby={`${detailsId}-timeline`} className="min-w-0">
              <SectionHeading
                id={`${detailsId}-timeline`}
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                label="Battle proof timeline"
                count={timeline.length}
              />

              {timeline.length ? (
                <ol className="relative mt-3 space-y-2.5 before:absolute before:bottom-4 before:left-[0.96rem] before:top-4 before:w-px before:bg-white/[0.08]">
                  {timeline.map((event) => (
                    <BattleTimelineRow key={event.key} event={event} />
                  ))}
                </ol>
              ) : (
                <EmptyProofState>No proof events have been recorded yet.</EmptyProofState>
              )}
            </section>
          </div>

          <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.055] pt-4">
            <div className="flex min-w-0 flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
              <SummaryChip label="Stake" value={`${formatWolo(group.coreStakeWolo)} WOLO`} />
              {group.corePayoutWolo > 0 ? (
                <SummaryChip label="Paid" value={`${formatWolo(group.corePayoutWolo)} WOLO`} tone="green" />
              ) : null}
              {group.coreRefundWolo > 0 ? (
                <SummaryChip label="Refunded" value={`${formatWolo(group.coreRefundWolo)} WOLO`} tone="blue" />
              ) : null}
              {group.rewardWolo > 0 ? (
                <SummaryChip label="Rewards" value={`${formatWolo(group.rewardWolo)} WOLO`} tone="gold" />
              ) : null}
            </div>

            {group.href ? (
              <Link
                href={group.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-200/16 bg-amber-300/[0.055] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 outline-none transition hover:border-amber-200/28 hover:bg-amber-300/[0.09] focus-visible:ring-2 focus-visible:ring-amber-200/55"
              >
                Full battle record
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function OutcomeSummary({
  eyebrow,
  value,
  tone,
}: {
  eyebrow: string;
  value: string;
  tone: "gold" | "blue";
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-2.5 ${
        tone === "gold"
          ? "border-amber-200/10 bg-amber-300/[0.035]"
          : "border-sky-200/10 bg-sky-300/[0.035]"
      }`}
    >
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
        {eyebrow}
      </div>
      <div
        className={`mt-1 line-clamp-2 break-words text-xs font-semibold leading-4 ${
          tone === "gold" ? "text-amber-50" : "text-sky-50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function BattleSlipCard({ slip }: { slip: BattleSlip }) {
  const funding = FUNDING_COPY[slip.fundingStatus];
  const proofHref = txProofHref(slip.txHash);

  return (
    <article className="min-w-0 rounded-[1rem] border border-white/[0.065] bg-white/[0.025] px-3.5 py-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#ece5d5]">{slip.bettorName}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <span>{slip.ticketId !== null ? `Ticket #${slip.ticketId}` : "Legacy wager"}</span>
            <span aria-hidden="true">•</span>
            <time dateTime={slip.acceptedAt}>
              <TimeDisplayText
                value={slip.acceptedAt}
                includeZone={false}
                interactive={false}
              />
            </time>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-amber-100">
            {formatWolo(slip.totalStakeWolo)} WOLO
          </div>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${funding.className}`}>
            {funding.label}
          </span>
        </div>
      </div>

      <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
        {slip.legs.map((leg) => (
          <li
            key={leg.key}
            className="min-w-0 rounded-xl border border-white/[0.055] bg-black/20 px-3 py-2"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  {leg.marketType}
                </div>
                <div className="mt-1 line-clamp-2 break-words text-xs font-medium leading-4 text-slate-200">
                  {leg.propositionLabel}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs font-semibold text-amber-100">
                {formatWolo(leg.amountWolo)}
              </div>
            </div>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
              {leg.side ? <span>{friendlyToken(leg.side)}</span> : null}
              {leg.side ? <span aria-hidden="true">•</span> : null}
              <span>{friendlyToken(leg.status)}</span>
            </div>
          </li>
        ))}
      </ul>

      {proofHref ? (
        <div className="mt-3 border-t border-white/[0.05] pt-2.5">
          <a
            href={proofHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/80 outline-none transition hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
          >
            Funding proof {shortHash(slip.txHash || "")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </article>
  );
}

function BattleTimelineRow({ event }: { event: BattleTimelineEvent }) {
  const proofHref = txProofHref(event.txHash);
  const visual = timelineVisual(event.kind);

  return (
    <li className="relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2.5">
      <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border ${visual.className}`}>
        {visual.icon}
      </span>

      <div className="min-w-0 rounded-[0.95rem] border border-white/[0.055] bg-white/[0.022] px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 break-words text-xs font-semibold leading-4 text-slate-100">
            {event.label}
          </div>
          <time
            dateTime={event.occurredAt}
            className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500"
          >
            <TimeDisplayText
              value={event.occurredAt}
              includeZone={false}
              interactive={false}
            />
          </time>
        </div>

        {event.detail ? (
          <p className="mt-1 break-words text-[11px] leading-4 text-slate-400">{event.detail}</p>
        ) : null}

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          {event.actor ? (
            <span className="max-w-full truncate rounded-full border border-white/[0.06] bg-black/20 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-slate-400">
              {event.actor}
            </span>
          ) : null}
          {event.amountWolo !== null ? (
            <span className="rounded-full border border-amber-200/10 bg-amber-300/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
              {formatWolo(event.amountWolo)} WOLO
            </span>
          ) : null}
          {event.payoutDestination ? (
            <span className="max-w-full truncate rounded-full border border-slate-300/8 bg-black/20 px-2 py-1 font-mono text-[9px] text-slate-500">
              Destination {friendlyToken(event.payoutDestination)}
            </span>
          ) : null}
          {proofHref ? (
            <a
              href={proofHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-100/75 outline-none transition hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
            >
              Tx {shortHash(event.txHash || "")}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SectionHeading({
  id,
  icon,
  label,
  count,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h4
        id={id}
        className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400"
      >
        <span className="text-amber-100/70">{icon}</span>
        {label}
      </h4>
      <span className="rounded-full border border-white/[0.06] bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function EmptyProofState({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[1rem] border border-dashed border-white/[0.07] bg-black/15 px-3.5 py-4 text-xs leading-5 text-slate-500">
      {children}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "blue" | "gold";
}) {
  const className =
    tone === "green"
      ? "border-emerald-300/12 bg-emerald-400/[0.055] text-emerald-100"
      : tone === "blue"
        ? "border-sky-300/12 bg-sky-400/[0.055] text-sky-100"
        : tone === "gold"
          ? "border-amber-300/12 bg-amber-400/[0.055] text-amber-100"
          : "border-white/[0.065] bg-white/[0.025] text-slate-300";

  return (
    <span className={`rounded-full border px-2.5 py-1.5 ${className}`}>
      <span className="opacity-60">{label}</span> {value}
    </span>
  );
}

function timelineVisual(kind: BattleTimelineEvent["kind"]) {
  const normalized = String(kind).toLowerCase();
  if (normalized.includes("payout") || normalized.includes("paid")) {
    return {
      className: "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-100",
      icon: <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  if (normalized.includes("refund") || normalized.includes("void")) {
    return {
      className: "border-sky-300/18 bg-sky-400/[0.08] text-sky-100",
      icon: <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  if (normalized.includes("result") || normalized.includes("winner")) {
    return {
      className: "border-amber-300/18 bg-amber-400/[0.08] text-amber-100",
      icon: <Trophy className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  if (normalized.includes("fail") || normalized.includes("attention")) {
    return {
      className: "border-rose-300/18 bg-rose-400/[0.08] text-rose-100",
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  return {
    className: "border-slate-300/14 bg-slate-300/[0.055] text-slate-200",
    icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
  };
}

function outcomeValue(outcome: BattleOutcome, fallback: string) {
  if (!outcome) return fallback;
  return outcome.resultLabel?.trim() || friendlyToken(outcome.status) || outcome.label || fallback;
}

function settlementAmount(group: BetBattleHistoryGroup) {
  if (group.coreRefundWolo > 0) return `${formatWolo(group.coreRefundWolo)} WOLO refunded`;
  if (group.corePayoutWolo > 0) return `${formatWolo(group.corePayoutWolo)} WOLO paid`;
  if (group.status === "settled") return "No payout due";
  if (group.status === "needs_attention") return "Review required";
  return "Not final";
}

function battleMatchup(group: BetBattleHistoryGroup) {
  if (group.leftLabel && group.rightLabel) return `${group.leftLabel} vs ${group.rightLabel}`;
  return group.title;
}

function battleLabel(group: BetBattleHistoryGroup) {
  return group.publicNumber !== null
    ? `Battle ${group.publicNumber.toLocaleString()}`
    : `Market ${group.rootMarketId.toLocaleString()}`;
}

function txProofHref(txHash: string | null) {
  const clean = txHash?.trim();
  if (!clean || !/^[A-Za-z0-9]+$/.test(clean)) return null;
  return `/api/wolo/tx/${encodeURIComponent(clean)}`;
}

function shortHash(value: string) {
  const clean = value.trim();
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}…${clean.slice(-6)}`;
}

function formatWolo(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 6,
  }).format(value);
}

function friendlyToken(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
