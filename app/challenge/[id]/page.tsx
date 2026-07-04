import Link from "next/link";
import { notFound } from "next/navigation";

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
    case "refund_sent":
      return "Refund sent";
    case "guarantee_forfeited_to_treasury":
      return "Treasury";
    case "scheduled_settlement_completed":
      return "Settled";
    case "scheduled_settlement_failed":
      return "Settlement failed";
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
    default:
      return status.replace(/_/g, " ");
  }
}

function statusTone(status: string) {
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
          walletAddress: true,
        },
      },
      challenged: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          walletAddress: true,
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
      },
      settlements: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!match) {
    notFound();
  }

  const leftName = playerName(match.challenger);
  const rightName = playerName(match.challenged);
  const totalEach = match.wagerAmountWolo + match.guaranteeAmountWolo;
  const headline = statusLabel(match.status, leftName, rightName);
  const moneyRows = buildMoneyRows({
    status: match.status,
    leftName,
    rightName,
    wager: match.wagerAmountWolo,
    guarantee: match.guaranteeAmountWolo,
  });

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
                  {fmtDate(match.scheduledAt)}
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

                {moneyRows.length === 0 ? (
                  <p className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">
                    No settlement consequence recorded yet.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2.5">
                    {moneyRows.map((row) => (
                      <div
                        key={row.label}
                        className={`rounded-[1rem] border p-3 ${
                          row.tone === "treasury"
                            ? "border-amber-100/20 bg-amber-100/[0.08] shadow-[0_0_35px_rgba(245,158,11,0.08)]"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-serif text-[0.98rem] font-semibold tracking-[-0.015em] text-amber-50/84">{row.label}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              {row.tone === "treasury" ? "Treasury route" : "Refund due"}
                            </div>
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

        {!basic ? (
          <section className={`mt-6 grid gap-6 ${extreme ? "xl:grid-cols-[1.15fr_0.85fr]" : "xl:grid-cols-[1fr_0.8fr]"}`}>
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/38">
                Proof Trail
              </p>

              <div className="mt-4 grid gap-3">
                {match.activities.map((activity) => {
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
