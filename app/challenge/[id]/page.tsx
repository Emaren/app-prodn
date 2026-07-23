import Link from "next/link";
import { notFound } from "next/navigation";

import ChallengeRoomControls from "@/components/challenge/ChallengeRoomControls";
import ChallengeRoomConversation from "@/components/challenge/ChallengeRoomConversation";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ view?: string }>;

type RoomView = "basic" | "advanced" | "extreme";

type MoneyRow = {
  label: string;
  amount: number;
  tone: "refund" | "treasury";
  side: "left" | "right" | "system";
};

function playerName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function fmtWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "Pending";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case "scheduled":
      return "Scheduled";
    case "challenge_created":
      return "Challenge issued";
    case "expired":
      return "Expired";
    case "funding_expired":
      return "Funding expired";
    case "wager_awarded":
      return "Winner paid";
    case "accepted":
      return "Accepted";
    case "terms_accepted":
      return "Terms accepted";
    case "creator_funded":
      return "Creator funded";
    case "opponent_funded":
      return "Opponent funded";
    case "left_checked_in":
    case "right_checked_in":
      return "Checked in";
    case "no_show_left":
    case "no_show_right":
    case "double_no_show":
      return "No-show";
    case "time_proposed":
      return "Time proposed";
    case "time_confirmed":
      return "Time confirmed";
    case "refund_sent":
      return "Refund sent";
    case "guarantee_forfeited_to_treasury":
      return "Treasury";
    case "guarantee_awarded":
      return "Guarantee awarded";
    case "scheduled_settlement_completed":
      return "Settled";
    case "scheduled_settlement_failed":
      return "Settlement failed";
    case "title_vetoed":
      return "Commissioner veto";
    case "title_disputed":
      return "Title disputed";
    case "title_cancelled":
      return "Title cancelled";
    case "title_result_verified":
      return "Title result verified";
    case "title_result_pending_review":
      return "Title result pending review";
    case "title_settlement_dry_run":
      return "Title settlement preview";
    case "title_chain_intent":
      return "Title transfer pending chain";
    case "title_settled":
      return "Title settled";
    case "commissioner_notice_delivered":
      return "Commissioner notified";
    case "desync_human_confirmed":
      return "⚡ DESYNCED confirmed";
    case "desync_human_corrected":
      return "Desync correction appended";
    case "desync_rematch_reopened":
      return "Desync rematch ordered";
    case "desync_void_refund_requested":
      return "Desync void & refund";
    case "challenge_protocol_notice_delivered":
      return "Players notified";
    default:
      return eventType.replace(/_/g, " ");
  }
}

function statusLabel(status: string, leftName: string, rightName: string) {
  switch (status) {
    case "no_show_left":
      return `${leftName} missed check-in`;
    case "no_show_right":
      return `${rightName} missed check-in`;
    case "double_no_show":
      return "Double no-show";
    case "completed":
      return "Completed";
    case "live":
      return "Live";
    case "funded":
      return "Funded";
    case "accepted":
      return "Accepted";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "funding_expired":
      return "Funding expired";
    case "refunded":
      return "Refunded";
    case "desync_review":
      return "⚡ DESYNCED! ⚡";
    default:
      return status.replace(/_/g, " ");
  }
}

function statusTone(status: string) {
  if (status === "desync_review") {
    return "border-fuchsia-200/32 bg-fuchsia-400/[0.13] text-fuchsia-50 shadow-[0_0_48px_rgba(217,70,239,0.16)]";
  }

  if (status.includes("no_show")) {
    return "border-rose-200/22 bg-rose-500/[0.11] text-rose-50 shadow-[0_0_45px_rgba(244,63,94,0.12)]";
  }

  if (status === "completed" || status === "live") {
    return "border-emerald-200/22 bg-emerald-400/[0.10] text-emerald-50 shadow-[0_0_45px_rgba(16,185,129,0.12)]";
  }

  return "border-amber-100/20 bg-amber-300/[0.09] text-amber-50 shadow-[0_0_45px_rgba(245,158,11,0.10)]";
}

function viewFromSearch(value: string | undefined): RoomView {
  if (value === "basic" || value === "advanced" || value === "extreme") return value;
  return "extreme";
}

function buildMoneyRows(input: {
  status: string;
  leftName: string;
  rightName: string;
  wager: number;
  guarantee: number;
  leftFunded: boolean;
  rightFunded: boolean;
}) {
  const rows: MoneyRow[] = [];

  function refund(label: string, amount: number, side: MoneyRow["side"]) {
    if (amount <= 0) return;
    rows.push({ label, amount, tone: "refund", side });
  }

  function treasury(label: string, amount: number, side: MoneyRow["side"]) {
    if (amount <= 0) return;
    rows.push({ label, amount, tone: "treasury", side });
  }

  if (input.status === "no_show_left") {
    refund(`${input.leftName} Wolo Wager refund due`, input.wager, "left");
    refund(`${input.rightName} Wolo Wager refund due`, input.wager, "right");
    refund(`${input.rightName} Match Guarantee return due`, input.guarantee, "right");
    refund(`${input.leftName} missed Match Guarantee → ${input.rightName}`, input.guarantee, "right");
  }

  if (input.status === "no_show_right") {
    refund(`${input.rightName} Wolo Wager refund due`, input.wager, "right");
    refund(`${input.leftName} Wolo Wager refund due`, input.wager, "left");
    refund(`${input.leftName} Match Guarantee return due`, input.guarantee, "left");
    refund(`${input.rightName} missed Match Guarantee → ${input.leftName}`, input.guarantee, "left");
  }

  if (["canceled", "cancelled", "expired", "funding_expired"].includes(input.status)) {
    if (input.leftFunded) {
      refund(`${input.leftName} challenge funding return`, input.wager + input.guarantee, "left");
    }
    if (input.rightFunded) {
      refund(`${input.rightName} challenge funding return`, input.wager + input.guarantee, "right");
    }
  }

  if (input.status === "double_no_show") {
    refund(`${input.leftName} Wolo Wager refund due`, input.wager, "left");
    treasury(`${input.leftName} Match Guarantee → Treasury`, input.guarantee, "system");
    refund(`${input.rightName} Wolo Wager refund due`, input.wager, "right");
    treasury(`${input.rightName} Match Guarantee → Treasury`, input.guarantee, "system");
  }

  return rows;
}

function metadataUrl(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.startsWith("http") ? value : null;
}

function metadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function roomHref(id: number, view: RoomView) {
  return view === "extreme" ? `/challenge/${id}` : `/challenge/${id}?view=${view}`;
}

function BaEToggle({ id, view }: { id: number; view: RoomView }) {
  const options: Array<{ key: RoomView; title: string; sub: string }> = [
    { key: "basic", title: "Basic", sub: "Result" },
    { key: "advanced", title: "Advanced", sub: "Ledger" },
    { key: "extreme", title: "Extreme", sub: "War room" },
  ];

  return (
    <div className="inline-grid rounded-full border border-amber-100/13 bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_70px_rgba(0,0,0,0.35)] sm:grid-cols-3">
      {options.map((option) => {
        const active = option.key === view;

        return (
          <Link
            key={option.key}
            href={roomHref(id, option.key)}
            className={`rounded-full px-4 py-2.5 text-center transition ${
              active
                ? "bg-amber-300/18 text-amber-50 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.22),0_0_30px_rgba(245,158,11,0.16)]"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
            }`}
          >
            <div className="text-xs font-black">{option.title}</div>
            <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.22em] opacity-60">
              {option.sub}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default async function ChallengeDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const view = viewFromSearch(resolvedSearch.view);

  const challengeId = Number.parseInt(id, 10);

  if (!Number.isFinite(challengeId) || challengeId <= 0) {
    notFound();
  }

  const prisma = getPrisma();

  const match = await prisma.scheduledMatch.findUnique({
    where: { id: challengeId },
    include: {
      challenger: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      challenged: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      activities: {
        include: {
          actor: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 500,
      },
      settlements: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      },
      trophyChallenges: {
        select: { status: true, settlementStatus: true },
      },
      replayDesyncIncidents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      },
    },
  });

  if (!match) {
    notFound();
  }

  const leftName = playerName(match.challenger);
  const rightName = playerName(match.challenged);
  const totalEach = match.wagerAmountWolo + match.guaranteeAmountWolo;
  const latestDesyncIncident = match.replayDesyncIncidents[0] ?? null;
  const activeDesync = Boolean(
    match.status === "desync_review" &&
      latestDesyncIncident?.desyncOccurred &&
      latestDesyncIncident.settlementDisposition === "commissioner_review"
  );
  const headline = statusLabel(match.status, leftName, rightName);
  const moneyRows = buildMoneyRows({
    status: match.status,
    leftName,
    rightName,
    wager: match.wagerAmountWolo,
    guarantee: match.guaranteeAmountWolo,
    leftFunded: Boolean(match.challengerFundedAt),
    rightFunded: Boolean(match.challengedFundedAt),
  });
  const executedSettlements = match.settlements.filter(
    (settlement) => settlement.status === "executed" && settlement.txHash
  );
  const executedSettlementWolo = executedSettlements.reduce(
    (sum, settlement) => sum + settlement.amountWolo,
    0
  );
  const refundTerminal = ["canceled", "cancelled", "expired", "funding_expired", "refunded"].includes(match.status);
  const fundedSides = Number(Boolean(match.challengerFundedAt)) + Number(Boolean(match.challengedFundedAt));
  const expectedRefundWolo = refundTerminal ? fundedSides * totalEach : 0;
  const refundConfirmed = expectedRefundWolo > 0 && executedSettlementWolo >= expectedRefundWolo;
  const noShowResult = ["no_show_left", "no_show_right", "double_no_show"].includes(match.status);
  const totalIsPositive = totalEach > 0;
  const expectedSettlementTransfers = ["canceled", "cancelled", "expired", "funding_expired"].includes(match.status)
    ? totalIsPositive
      ? fundedSides
      : 0
    : match.status === "completed"
      ? (match.guaranteeAmountWolo > 0 ? 2 : 0) + (match.wagerAmountWolo > 0 ? 1 : 0)
      : match.status === "double_no_show"
        ? (match.wagerAmountWolo > 0 ? fundedSides : 0) + (match.guaranteeAmountWolo > 0 && fundedSides > 0 ? 1 : 0)
        : ["no_show_left", "no_show_right"].includes(match.status)
          ? (match.wagerAmountWolo > 0 ? fundedSides : 0) + (match.guaranteeAmountWolo > 0 ? 2 : 0)
          : 0;
  const settlementComplete =
    expectedSettlementTransfers > 0 &&
    match.settlements.length >= expectedSettlementTransfers &&
    match.settlements.every(
      (settlement) => settlement.status === "executed" && Boolean(settlement.txHash)
    );
  const settlementHeadline = activeDesync
    ? "Halted · commissioner disposition required"
    : refundConfirmed
      ? `${fmtWolo(executedSettlementWolo)} WOLO returned`
      : settlementComplete
        ? `${fmtWolo(executedSettlementWolo)} WOLO settlement confirmed`
        : match.settlements.some((settlement) => settlement.status === "failed")
          ? "Settlement needs attention"
          : match.settlements.length > 0
            ? "Settlement in progress"
            : refundTerminal && expectedRefundWolo > 0
              ? `${fmtWolo(expectedRefundWolo)} WOLO refund due`
              : "No settlement consequence recorded yet";
  const terminalTitleStates = new Set([
    "settled",
    "commissioner_vetoed",
    "disputed",
    "cancelled",
    "canceled",
  ]);
  const titleDecisionComplete =
    match.trophyChallenges.length > 0 &&
    match.trophyChallenges.every((challenge) => terminalTitleStates.has(challenge.status));
  const protocolStopped = [
    "declined",
    "cancelled",
    "canceled",
    "expired",
    "funding_expired",
  ].includes(match.status);
  const protocolSteps = activeDesync
    ? [
        { label: "Challenge issued", done: true },
        { label: "Terms accepted", done: Boolean(match.acceptedAt) },
        {
          label: "Both rails funded",
          done: Boolean(match.challengerFundedAt && match.challengedFundedAt),
        },
        {
          label: "10-minute check-in",
          done: Boolean(match.challengerCheckedInAt && match.challengedCheckedInAt),
        },
        { label: "DESYNC incident confirmed", done: true },
        { label: "Commissioner disposition", done: false },
        { label: "WOLO / title settlement", done: false },
      ]
    : [
        { label: "Challenge issued", done: true },
        { label: "Terms accepted", done: Boolean(match.acceptedAt) },
        {
          label: "Both rails funded",
          done: Boolean(match.challengerFundedAt && match.challengedFundedAt),
        },
        {
          label: "10-minute check-in",
          done:
            noShowResult ||
            Boolean(match.challengerCheckedInAt && match.challengedCheckedInAt),
        },
        {
          label: noShowResult ? "Check-in verdict" : "Watcher result proof",
          done:
            noShowResult ||
            Boolean(
              match.status === "completed" &&
              match.resultAt &&
              match.linkedSessionKey &&
              match.linkedWinner
            ),
        },
        {
          label: "WOLO settlement",
          done: settlementComplete,
        },
        ...(match.trophyChallenges.length > 0
          ? [{ label: "Commissioner title decision", done: titleDecisionComplete }]
          : []),
      ];
  const currentProtocolStep = protocolStopped
    ? -1
    : protocolSteps.findIndex((step) => !step.done);

  const extreme = view === "extreme";
  const basic = view === "basic";

  return (
    <main className="min-h-screen overflow-hidden bg-[#030711] text-white">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(251,191,36,0.18),transparent_32%),radial-gradient(circle_at_14%_26%,rgba(30,64,175,0.28),transparent_34%),radial-gradient(circle_at_92%_24%,rgba(16,185,129,0.11),transparent_30%),linear-gradient(180deg,#0b1628_0%,#050914_48%,#02040a_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden="true"
      />

      <section className={`${extreme ? "max-w-[118rem]" : basic ? "max-w-5xl" : "max-w-[98rem]"} relative mx-auto px-3 pb-24 pt-6 sm:px-5 lg:px-8`}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/challenge"
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-slate-200/86 transition hover:border-amber-100/20 hover:bg-white/[0.07]"
          >
            ← Challenge Hall
          </Link>

          <BaEToggle id={match.id} view={view} />

          <div className="rounded-full border border-amber-100/14 bg-amber-100/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-amber-100/78">
            Match #{match.id}
          </div>
        </div>

        {activeDesync && latestDesyncIncident ? (
          <section
            data-challenge-desync-banner
            className="mb-6 overflow-hidden rounded-[2rem] border border-fuchsia-200/30 bg-[radial-gradient(circle_at_8%_0%,rgba(232,121,249,0.25),transparent_31%),radial-gradient(circle_at_94%_15%,rgba(251,146,60,0.18),transparent_32%),linear-gradient(135deg,rgba(88,28,135,0.56),rgba(31,12,46,0.84)_48%,rgba(3,7,17,0.94))] p-5 shadow-[0_0_65px_rgba(217,70,239,0.13),0_24px_90px_rgba(0,0,0,0.42)] sm:p-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.34em] text-fuchsia-100/70">
                  Human-confirmed incident · Match #{match.id}
                </div>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
                  ⚡ DESYNCED! ⚡
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-fuchsia-50/76">
                  Recorded by {latestDesyncIncident.reviewerDisplayNameSnapshot} on {fmtDate(latestDesyncIncident.createdAt)}.
                  This does not declare a winner. The watcher/parser result remains machine evidence only.
                </p>
              </div>
              <Link
                href={`/game-stats/${latestDesyncIncident.gameStatsId}`}
                className="rounded-full border border-fuchsia-100/24 bg-fuchsia-100/[0.08] px-4 py-2 text-sm font-black text-fuchsia-50 transition hover:bg-fuchsia-100/[0.14]"
              >
                Open replay provenance ↗
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.1rem] border border-white/11 bg-black/26 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Desync occurred</div>
                <div className="mt-2 text-base font-black text-fuchsia-50">Yes · human confirmed</div>
              </div>
              <div className="rounded-[1.1rem] border border-white/11 bg-black/26 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Competitive result</div>
                <div className="mt-2 text-base font-black text-white">Unresolved · no winner</div>
              </div>
              <div className="rounded-[1.1rem] border border-white/11 bg-black/26 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Settlement disposition</div>
                <div className="mt-2 text-base font-black text-orange-50">Commissioner review</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              {latestDesyncIncident.note ? (
                <p className="rounded-[1rem] border border-white/10 bg-black/22 px-4 py-3 text-sm leading-6 text-slate-300">
                  “{latestDesyncIncident.note}”
                </p>
              ) : <div />}
              <div className="rounded-[1rem] border border-white/10 bg-black/22 px-4 py-3 text-xs leading-5 text-slate-400">
                Machine candidate: {latestDesyncIncident.parserDesyncCandidate ? "yes" : "no"}<br />
                Human truth: confirmed
              </div>
            </div>
          </section>
        ) : null}

        <section className="relative overflow-hidden rounded-[2.7rem] border border-amber-100/18 bg-[#070b16]/92 shadow-[0_44px_160px_rgba(0,0,0,0.68)]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.18),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(16,185,129,0.13),transparent_30%),linear-gradient(90deg,rgba(251,191,36,0.08),transparent_30%,rgba(16,185,129,0.07))]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent"
            aria-hidden="true"
          />

          <div className={`${extreme ? "grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10" : "p-6 sm:p-8 lg:p-10"}`}>
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.38em] text-amber-200/56">
                AoE2WAR · Challenge Room
              </p>

              <div className={extreme ? "mt-8" : "mt-5"}>
                <div className={`font-black uppercase tracking-[0.18em] ${extreme ? "text-[clamp(0.8rem,1vw,1rem)] text-rose-100/72" : "text-xs text-slate-400"}`}>
                  Verdict
                </div>

                <h1
                  aria-label={`${leftName} versus ${rightName}`}
                  className={`${extreme ? "mt-3 max-w-7xl font-serif text-[clamp(3.65rem,7.4vw,8.6rem)] leading-[0.82] tracking-[-0.075em]" : "mt-3 font-serif text-[clamp(2.7rem,5.2vw,5.3rem)] leading-[0.9] tracking-[-0.055em]"} font-semibold`}
                >
                  <span className="relative inline-block bg-[linear-gradient(180deg,#fff7d6_0%,#f0cf78_28%,#c18a2d_66%,#74420f_100%)] bg-clip-text text-transparent drop-shadow-[0_14px_30px_rgba(0,0,0,0.9)]">
                    {leftName}
                  </span>
                  <span className="mx-4 inline-block translate-y-[-0.08em] font-sans text-[0.28em] font-black uppercase tracking-[0.22em] text-amber-100/42 drop-shadow-[0_6px_20px_rgba(0,0,0,0.9)]">
                    vs
                  </span>
                  <span className="relative inline-block bg-[linear-gradient(180deg,#fff4c4_0%,#e8bd5f_30%,#a96f20_70%,#5a330e_100%)] bg-clip-text text-transparent drop-shadow-[0_14px_30px_rgba(0,0,0,0.9)]">
                    {rightName}
                  </span>
                </h1>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] ${statusTone(match.status)}`}>
                  {headline}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">
                  {fmtWolo(totalEach)} WOLO each
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">
                  {match.timingMode === "open"
                    ? match.acceptBy
                      ? `Accept by ${fmtDate(match.acceptBy)}`
                      : "Play anytime"
                    : fmtDate(match.matchTime || match.scheduledAt)}
                </span>
              </div>

              {extreme ? (
                <div className="mt-8 rounded-[2rem] border border-white/10 bg-black/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/38">
                        Wager
                      </div>
                      <div className="mt-2 text-3xl font-black">{fmtWolo(match.wagerAmountWolo)} WOLO</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/38">
                        Match Guarantee
                      </div>
                      <div className="mt-2 text-3xl font-black">{fmtWolo(match.guaranteeAmountWolo)} WOLO</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/62">
                        Total rail each
                      </div>
                      <div className="mt-2 text-3xl font-black text-amber-50">{fmtWolo(totalEach)} WOLO</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`${extreme ? "relative grid content-start gap-4" : "mt-8 grid gap-4 lg:grid-cols-2"}`}>
              <div className="rounded-[1.6rem] border border-white/10 bg-black/26 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/38">
                  Duelists
                </p>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                      Challenger
                    </div>
                    <div className="mt-1 text-xl font-black">{leftName}</div>
                  </div>

                  <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                      Opponent
                    </div>
                    <div className="mt-1 text-xl font-black">{rightName}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-amber-100/16 bg-black/30 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/62">
                  Settlement Rail
                </p>

                <div className="mt-4 rounded-[1rem] border border-amber-100/14 bg-amber-100/[0.055] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/55">Current truth</div>
                  <div className="mt-1 text-lg font-black text-amber-50">{settlementHeadline}</div>
                  {activeDesync ? (
                    <div className="mt-1 text-xs leading-5 text-fuchsia-100/75">
                      Winner payout, belts, titles, and artifacts are blocked. Existing funding remains locked until Rematch or authenticated Void &amp; Refund.
                    </div>
                  ) : refundConfirmed ? (
                    <div className="mt-1 text-xs text-emerald-100/75">Net financial impact of the cancelled challenge: 0 WOLO.</div>
                  ) : null}
                </div>

                {match.settlements.length > 0 ? (
                  <div className="mt-3 grid gap-2.5">
                    {match.settlements.map((settlement) => (
                      <div key={settlement.id} className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-serif text-[0.98rem] font-semibold tracking-[-0.015em] text-amber-50/84">
                              {settlement.action.replace(/_/g, " ")}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              {settlement.status}{settlement.txHash ? ` · tx ${settlement.txHash.slice(0, 10)}…${settlement.txHash.slice(-6)}` : ""}
                            </div>
                          </div>
                          <div className="rounded-full border border-amber-100/14 bg-amber-100/[0.06] px-3 py-1 text-xs font-black text-amber-50">
                            {fmtWolo(settlement.amountWolo)} WOLO
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : moneyRows.length === 0 ? (
                  <p className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
                    No settlement transaction is recorded yet.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2.5">
                    {moneyRows.map((row) => (
                      <div key={row.label} className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-serif text-[0.98rem] font-semibold tracking-[-0.015em] text-amber-50/84">{row.label}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Pending chain confirmation</div>
                          </div>
                          <div className="rounded-full border border-amber-100/14 bg-amber-100/[0.06] px-3 py-1 text-xs font-black text-amber-50">
                            {fmtWolo(row.amount)} WOLO
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {match.replayDesyncIncidents.length > 0 ? (
          <section className="mt-6 rounded-[2rem] border border-fuchsia-200/16 bg-slate-950/76 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-100/46">
                  Append-only incident provenance
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-white">
                  DESYNC decision chain
                </h2>
              </div>
              <div className="text-xs text-slate-400">Newest decision first · no row is rewritten</div>
            </div>
            <div className="mt-4 grid gap-3">
              {match.replayDesyncIncidents.map((incident) => (
                <div key={incident.id} className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">
                        Incident #{incident.id} · {incident.desyncOccurred ? "DESYNC confirmed" : "No-desync correction"}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {incident.reviewerDisplayNameSnapshot} · {fmtDate(incident.createdAt)}
                        {incident.supersedesId ? ` · supersedes #${incident.supersedesId}` : " · root decision"}
                      </div>
                    </div>
                    <Link
                      href={`/game-stats/${incident.gameStatsId}`}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-white"
                    >
                      Replay #{incident.gameStatsId} ↗
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="text-xs text-slate-300">Desync: <strong>{incident.desyncOccurred ? "yes" : "no"}</strong></div>
                    <div className="text-xs text-slate-300">Competitive: <strong>{incident.competitiveResultStatus.replace(/_/g, " ")}</strong></div>
                    <div className="text-xs text-slate-300">Settlement: <strong>{incident.settlementDisposition.replace(/_/g, " ")}</strong></div>
                  </div>
                  {incident.note ? <p className="mt-3 text-xs leading-5 text-slate-400">{incident.note}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/44">
                Match protocol
              </p>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-amber-50/90">
                One room, one visible next step
              </h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300">
              Match #{match.id}
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
            {protocolSteps.map((step, index) => {
              const current = index === currentProtocolStep && !step.done;
              return (
                <div
                  key={step.label}
                  className={`rounded-[1rem] border px-3 py-3 ${
                    step.done
                      ? "border-emerald-200/16 bg-emerald-300/[0.07] text-emerald-50"
                      : current
                        ? "border-amber-200/28 bg-amber-300/[0.10] text-amber-50 shadow-[0_0_28px_rgba(245,158,11,0.09)]"
                        : "border-white/8 bg-white/[0.025] text-slate-500"
                  }`}
                >
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">
                    {step.done ? "Complete" : current ? "Next" : protocolStopped ? "Not reached" : `Step ${index + 1}`}
                  </div>
                  <div className="mt-1 text-xs font-bold leading-5">{step.label}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <ChallengeRoomControls challengeId={match.id} />
        </section>

        <section className="mt-6">
          <ChallengeRoomConversation
            challengeId={match.id}
            challengerUid={match.challenger.uid}
            challengedUid={match.challenged.uid}
            challengerName={leftName}
            challengedName={rightName}
            entries={[...match.activities].reverse().map((activity) => ({
              id: activity.id,
              eventType: activity.eventType,
              label: eventLabel(activity.eventType),
              detail: activity.detail,
              message: metadataText(activity.metadata, "message"),
              proofUrl: metadataUrl(activity.metadata, "proofUrl"),
              actorUid: activity.actor?.uid ?? null,
              actorName: activity.actor ? playerName(activity.actor) : null,
              createdAt: activity.createdAt.toISOString(),
            }))}
          />
        </section>

        {!basic ? (
          <section className={`mt-6 grid gap-6 ${extreme ? "xl:grid-cols-[1.15fr_0.85fr]" : "xl:grid-cols-[1fr_0.8fr]"}`}>
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/38">
                Protocol ledger · system audit
              </p>

              <div className="mt-4 grid gap-3">
                {match.activities
                  .filter((activity) => activity.eventType !== "room_message")
                  .map((activity) => {
                  const proofUrl = metadataUrl(activity.metadata, "proofUrl");
                  const actorName = activity.actor ? playerName(activity.actor) : null;

                  return (
                    <div
                      key={activity.id}
                      className="rounded-[1rem] border border-white/10 bg-white/[0.035] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-serif text-[0.98rem] font-semibold tracking-[-0.015em] text-amber-50/82">
                            {activity.detail || eventLabel(activity.eventType)}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            {actorName ? `${actorName} · ` : ""}
                            {fmtDate(activity.createdAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {proofUrl ? (
                            <Link
                              href={proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-emerald-200/14 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-50"
                            >
                              Proof ↗
                            </Link>
                          ) : null}

                          <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                            {eventLabel(activity.eventType)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/38">
                Next Actions
              </p>

              <div className="mt-4 grid gap-3">
                {match.linkedSessionKey ? (
                  <Link
                    href={`/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`}
                    className="rounded-[1rem] border border-emerald-200/16 bg-emerald-300/[0.07] p-4 text-sm font-black text-emerald-50 transition hover:bg-emerald-300/[0.11]"
                  >
                    Open live proof / replay →
                  </Link>
                ) : null}

                {latestDesyncIncident ? (
                  <Link
                    href={`/game-stats/${latestDesyncIncident.gameStatsId}`}
                    className="rounded-[1rem] border border-fuchsia-200/16 bg-fuchsia-300/[0.07] p-4 text-sm font-black text-fuchsia-50 transition hover:bg-fuchsia-300/[0.11]"
                  >
                    Open DESYNC incident provenance →
                  </Link>
                ) : null}

                <Link
                  href="/challenge"
                  className="rounded-[1rem] border border-amber-100/14 bg-amber-100/[0.055] p-4 text-sm font-black text-amber-50 transition hover:bg-amber-100/[0.09]"
                >
                  Create another challenge →
                </Link>

                <Link
                  href="/live-games"
                  className="rounded-[1rem] border border-white/10 bg-white/[0.035] p-4 text-sm font-black text-slate-200 transition hover:bg-white/[0.06]"
                >
                  Back to Live Games →
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {basic ? (
          <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
              Basic Result
            </p>
            <p className="mt-3 text-lg font-black text-slate-100">{headline}</p>
            <Link
              href={roomHref(match.id, "extreme")}
              className="mt-5 inline-flex rounded-full border border-amber-100/16 bg-amber-100/[0.08] px-5 py-3 text-sm font-black text-amber-50"
            >
              Open Extreme War Room →
            </Link>
          </section>
        ) : null}
      </section>
    </main>
  );
}
