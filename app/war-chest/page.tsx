import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { getPrisma } from "@/lib/prisma";
import { loadWarChestSnapshot } from "@/lib/warChest";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatMoment(value: string | null) {
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

function shortTxHash(value: string | null) {
  if (!value) return null;
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function WoloMarkBadge() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <Image
        src={WOLO_LOGO_SRC}
        alt=""
        width={30}
        height={30}
        className="h-[30px] w-[30px] object-contain"
      />
    </div>
  );
}

export default async function WarChestPage() {
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const snapshot = await loadWarChestSnapshot(getPrisma(), claims?.uid ?? null);

  const leader = snapshot.earners.entries[0] ?? null;
  const trackedEntries = snapshot.earners.entries;
  const reserve = snapshot.wolo?.accounts.ecosystembounties?.wolo ?? null;

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_22%),radial-gradient(circle_at_78%_16%,_rgba(59,130,246,0.16),_transparent_24%),radial-gradient(circle_at_60%_82%,_rgba(16,185,129,0.14),_transparent_22%),linear-gradient(135deg,_#07101d,_#0b1425_50%,_#040812)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.42)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.035),transparent)]" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <HeroPill tone="amber">Weekly betting power board</HeroPill>
              <HeroPill tone="emerald">{snapshot.weekly.activeBettors} active bettors</HeroPill>
              <HeroPill tone="sky">{snapshot.lifetime.openMarkets} open markets</HeroPill>
              {claims?.uid ? <HeroPill tone="slate">Signed in as {claims.uid}</HeroPill> : null}
            </div>

            <div className="space-y-4">
              <div className="text-[11px] uppercase tracking-[0.38em] text-amber-200/72">
                Betting analytics command center
              </div>
              <div className="flex items-center gap-3">
                <WoloMarkBadge />
                <h1 className="text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-5xl lg:text-7xl">
                  WAR CHEST
                </h1>
              </div>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Weekly Take is the only rolling number on this board. Settled, Wagered, and the
                full player roster stay all-time so every bettor and claimable player can see
                themselves here and know the site is tracking the full history honestly.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat
                label="Weekly Volume"
                value={`${formatCompact(snapshot.weekly.volumeWolo)} WOLO`}
                helper={`${snapshot.weekly.slips} slips logged`}
              />
              <HeroStat
                label="Paid Out"
                value={`${formatCompact(snapshot.weekly.paidOutWolo)} WOLO`}
                helper="Won + voided outcomes"
              />
              <HeroStat
                label="Pending Claims"
                value={String(snapshot.weekly.pendingClaims)}
                helper={`${formatCompact(snapshot.weekly.pendingWolo)} WOLO still waiting`}
              />
              <HeroStat
                label="Chain Locks"
                value={`${formatCompact(snapshot.weekly.onchainEscrowedWolo)} WOLO`}
                helper="Real signed wager stake"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/bets"
                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Open Bets
              </Link>
              <Link
                href="/lobby"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Back To Lobby
              </Link>
              <Link
                href="/players"
                className="inline-flex items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/38 hover:bg-emerald-500/15"
              >
                Open Player Board
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,24,0.96),rgba(4,7,18,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                    Board captain
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {leader ? leader.name : "Awaiting first earner"}
                  </h2>
                </div>
                <div className="rounded-full border border-amber-300/18 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                  {leader
                    ? leader.weeklyTakeWolo > 0
                      ? `${formatCompact(leader.weeklyTakeWolo)} WOLO`
                      : leader.claimableWolo > 0
                        ? `${formatCompact(leader.claimableWolo)} WOLO`
                        : `${formatCompact(leader.settledWolo)} WOLO`
                    : "Standby"}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricTile
                  label="Weekly Take"
                  value={leader ? `${formatNumber(leader.weeklyTakeWolo)} WOLO` : "0 WOLO"}
                />
                <MetricTile
                  label="Settled"
                  value={leader ? `${formatNumber(leader.settledWolo)} WOLO` : "0 WOLO"}
                />
                <MetricTile
                  label="Wagered"
                  value={leader ? `${formatNumber(leader.wageredWolo)} WOLO` : "0 WOLO"}
                />
              </div>

              {leader?.claimableWolo ? (
                <div className="mt-4">
                  <Tag tone="amber">Claimable now</Tag>
                </div>
              ) : null}

              <div className="mt-5 rounded-[1.4rem] border border-white/8 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                {leader
                  ? `${leader.name} is setting the tone right now. Weekly take reflects this week, while settled and wagered stay all-time so the board remains readable and honest.`
                  : "Once the first payouts and slips land, this page turns into the betting pulse of the site."}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <GlassPanel
                eyebrow="House reserve"
                title={reserve != null ? `${formatCompact(reserve)} WOLO` : "Offline"}
                body="Ecosystem bounties snapshot from the app-side WOLO rail."
                tone="amber"
              />
              <GlassPanel
                eyebrow="Heat leader"
                title={
                  snapshot.betBoard.heat.biggestPot
                    ? `${formatCompact(snapshot.betBoard.heat.biggestPot.potWolo)} WOLO`
                    : "Standby"
                }
                body={
                  snapshot.betBoard.heat.biggestPot?.label ||
                  "No live market has built enough heat yet."
                }
                tone="sky"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel
          eyebrow="Recognition board"
          title="Full earner table"
          count={trackedEntries.length}
          helper={`Weekly window started ${formatMoment(snapshot.earners.weekStartsAt)}`}
        >
          <div className="grid gap-3">
            {trackedEntries.length === 0 ? (
              <EmptyPanel message="No WOLO movement has landed yet." />
            ) : (
              trackedEntries.map((entry) => (
                <Link
                  key={entry.key}
                  href={entry.href}
                  className="block rounded-[1.55rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.024))] px-4 py-4 transition hover:border-amber-300/20 hover:bg-white/10"
                >
                  <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/18 bg-amber-400/10 text-sm font-semibold text-amber-100">
                      {entry.rank}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-white">{entry.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.verified ? (
                          <Tag tone="emerald">Steam linked</Tag>
                        ) : entry.claimed ? (
                          <Tag tone="slate">Profile claimed</Tag>
                        ) : (
                          <Tag tone="slate">Replay profile</Tag>
                        )}
                        {entry.claimableWolo > 0 ? (
                          <Tag tone="amber">Claimable now</Tag>
                        ) : null}
                        {entry.wagerCount > 0 ? (
                          <Tag tone="sky">{entry.wagerCount} slips</Tag>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-2 text-left md:min-w-[10rem] md:text-right">
                      <ScoreLine
                        label="Weekly Take"
                        value={`${
                          formatNumber(
                            entry.weeklyTakeWolo > 0
                              ? entry.weeklyTakeWolo
                              : entry.claimableWolo > 0
                                ? entry.claimableWolo
                                : entry.settledWolo
                          )
                        } WOLO`}
                      />
                      <ScoreLine label="Settled" value={`${formatNumber(entry.settledWolo)} WOLO`} />
                      <ScoreLine label="Wagered" value={`${formatNumber(entry.wageredWolo)} WOLO`} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel eyebrow="Open markets" title="Market radar" count={snapshot.betBoard.openMarkets.length}>
            <div className="grid gap-3">
              {snapshot.betBoard.openMarkets.length === 0 ? (
                <EmptyPanel message="No live betting markets are on the board right now." />
              ) : (
                snapshot.betBoard.openMarkets.slice(0, 5).map((market) => (
                  <div
                    key={market.id}
                    className="rounded-[1.45rem] border border-white/8 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{market.title}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {market.eventLabel}
                        </div>
                      </div>
                      <Tag tone={market.status === "live" ? "rose" : "sky"}>{market.closeLabel}</Tag>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MarketSideCard
                        label={market.left.name}
                        pot={market.left.poolWolo}
                        crowdPercent={market.left.crowdPercent}
                        slips={market.left.slips}
                      />
                      <MarketSideCard
                        label={market.right.name}
                        pot={market.right.poolWolo}
                        crowdPercent={market.right.crowdPercent}
                        slips={market.right.slips}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel eyebrow="Recent betting tape" title="Latest slips" count={snapshot.recentWagers.length}>
            <div className="grid gap-3">
              {snapshot.recentWagers.length === 0 ? (
                <EmptyPanel message="No recent betting activity yet." />
              ) : (
                snapshot.recentWagers.map((wager) => (
                  <Link
                    key={wager.id}
                    href={wager.actorHref}
                    className="block rounded-[1.35rem] border border-white/8 bg-white/5 p-4 transition hover:border-sky-300/20 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-white">{wager.actorName}</div>
                          {wager.verified ? <Tag tone="emerald">Steam linked</Tag> : null}
                          {wager.executionMode === "onchain_escrow" ? (
                            <Tag tone="amber">On-chain lock</Tag>
                          ) : (
                            <Tag tone="slate">Builder rail</Tag>
                          )}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {wager.marketTitle} · {wager.pickedLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {wager.eventLabel} · {formatMoment(wager.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-white">
                          {formatNumber(wager.amountWolo)} WOLO
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {wager.status}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel eyebrow="Payout rail" title="Settlement watch" count={snapshot.recentClaims.length}>
          <div className="grid gap-3">
            {snapshot.recentClaims.length === 0 ? (
              <EmptyPanel message="No claim or payout rows have landed yet." />
            ) : (
              snapshot.recentClaims.map((claim) => (
                <Link
                  key={claim.id}
                  href={claim.href}
                  className="block rounded-[1.4rem] border border-white/8 bg-white/5 p-4 transition hover:border-emerald-300/18 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{claim.playerName}</div>
                        <Tag
                          tone={
                            claim.status === "claimed"
                              ? "emerald"
                              : claim.errorState
                                ? "rose"
                                : "amber"
                          }
                        >
                          {claim.status}
                        </Tag>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">{claim.note || "WOLO claim rail"}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Created {formatMoment(claim.createdAt)}
                        {claim.claimedAt ? ` · Claimed ${formatMoment(claim.claimedAt)}` : ""}
                      </div>
                      {claim.payoutTxHash ? (
                        <div className="mt-2 text-xs text-emerald-100/90">
                          Tx {shortTxHash(claim.payoutTxHash)}
                        </div>
                      ) : null}
                      {claim.errorState ? (
                        <div className="mt-2 text-xs text-rose-100/90">{claim.errorState}</div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">
                        {formatNumber(claim.amountWolo)} WOLO
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <section className="rounded-[1.85rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Big picture</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">How the board reads</h2>
            </div>
            <HeroPill tone="slate">Builder mode</HeroPill>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FactCard
              label="Lifetime wagered"
              value={`${formatCompact(snapshot.lifetime.totalWageredWolo)} WOLO`}
              helper="Every recorded slip in the book."
            />
            <FactCard
              label="Lifetime paid out"
              value={`${formatCompact(snapshot.lifetime.totalPayoutWolo)} WOLO`}
              helper="Won or refunded rails already resolved."
            />
            <FactCard
              label="Tracked participants"
              value={String(snapshot.lifetime.totalParticipants)}
              helper="Earners, bettors, and unclaimed recipients."
            />
            <FactCard
              label="Settled markets"
              value={String(snapshot.lifetime.settledMarkets)}
              helper="Closed books with outcome truth attached."
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <InsightCard
              title="Heat"
              body={
                snapshot.betBoard.heat.biggestPot
                  ? `${snapshot.betBoard.heat.biggestPot.label} is carrying the fattest live pot at ${formatCompact(snapshot.betBoard.heat.biggestPot.potWolo)} WOLO.`
                  : "No single live market has separated itself yet."
              }
            />
            <InsightCard
              title="Edge"
              body={
                snapshot.betBoard.heat.bestReturn
                  ? `${snapshot.betBoard.heat.bestReturn.label} is currently offering the sharpest projected read at ${snapshot.betBoard.heat.bestReturn.returnMultiplier}x.`
                  : "Return edges appear once both sides start attracting real weight."
              }
            />
            <InsightCard
              title="Trust"
              body="Pending claims, tx breadcrumbs, and recent slips all live together here so bettors can read both the excitement and the operational truth."
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  count,
  helper,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.85rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          {helper ? <div className="mt-2 text-sm text-slate-400">{helper}</div> : null}
        </div>
        {typeof count === "number" ? (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {count}
          </div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HeroPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "amber" | "emerald" | "sky" | "slate";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : tone === "sky"
          ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
          : "border-white/10 bg-white/5 text-slate-300";

  return <span className={`rounded-full border px-3 py-1 text-xs ${toneClassName}`}>{children}</span>;
}

function HeroStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-400">{helper}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function GlassPanel({
  eyebrow,
  title,
  body,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "amber" | "sky";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/16 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(8,13,24,0.94))]"
      : "border-sky-300/16 bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(8,13,24,0.94))]";

  return (
    <div className={`rounded-[1.55rem] border p-5 ${toneClassName}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</div>
      <div className="mt-2 text-xl font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "amber" | "emerald" | "rose" | "sky" | "slate";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : tone === "rose"
          ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
          : tone === "sky"
            ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
            : "border-white/10 bg-white/5 text-slate-300";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] ${toneClassName}`}>{children}</span>;
}

function ScoreLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function MarketSideCard({
  label,
  pot,
  crowdPercent,
  slips,
}: {
  label: string;
  pot: number;
  crowdPercent: number;
  slips: number;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/8 bg-slate-950/60 p-4">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Pool</div>
          <div className="mt-1 text-lg font-semibold text-white">{formatNumber(pot)} WOLO</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Crowd</div>
          <div className="mt-1 text-sm font-medium text-slate-200">{crowdPercent}% · {slips} slips</div>
        </div>
      </div>
    </div>
  );
}

function FactCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{helper}</div>
    </div>
  );
}

function InsightCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 p-4">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}
