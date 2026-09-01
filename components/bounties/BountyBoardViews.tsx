"use client";

import Link from "next/link";

import BountyAdvisor from "@/components/bounties/BountyAdvisor";
import BountyWarriorCarousel from "@/components/bounties/BountyWarriorCarousel";
import { isPublicBountyContract } from "@/lib/bountyHall";
import type { BountyBoardSnapshot } from "@/lib/bounties";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

type Opportunity =
  BountyBoardSnapshot["opportunities"][number];

type LedgerEntry =
  BountyBoardSnapshot["ledger"][number];

const STATUS_LABELS: Record<
  string,
  string
> = {
  available: "Available",
  in_progress: "In Progress",
  locked: "Awaiting Payout",
  paid: "Paid",
  historical: "Legendary",
  rescinded: "Rescinded",
};

const VIEW_LABELS: Record<
  TileViewMode,
  string
> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

function statusTone(
  status: string,
) {
  if (status === "paid") {
    return "border-emerald-200/20 bg-emerald-300/10 text-emerald-100";
  }

  if (
    status === "locked" ||
    status === "in_progress"
  ) {
    return "border-amber-200/20 bg-amber-300/10 text-amber-100";
  }

  if (
    status === "available"
  ) {
    return "border-sky-200/20 bg-sky-300/10 text-sky-100";
  }

  if (
    status === "rescinded"
  ) {
    return "border-rose-200/20 bg-rose-300/10 text-rose-100";
  }

  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function formatReward(
  value: number | null,
) {
  return value === null
    ? "Reward not published"
    : `${value.toLocaleString()} WOLO`;
}

function contractEyebrow(
  item: Opportunity,
) {
  const text = [
    item.title,
    item.description,
  ].join(" ");

  const match = text.match(
    /bounty\s*#?\s*(\d+)/i
  );

  if (match?.[1]) {
    return `Bounty #${match[1]}`;
  }

  return item.category ||
    "Bounty Contract";
}

function BountyViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: TileViewMode;
  setViewMode:
    (mode: TileViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-amber-200/28 bg-[#050910]/92 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.48),0_0_28px_rgba(251,191,36,0.10)] backdrop-blur-xl"
      role="group"
      aria-label="Bounty Board view"
    >
      {TILE_VIEW_MODES.map(
        (mode) => (
          <button
            key={mode}
            type="button"
            onClick={() =>
              setViewMode(mode)
            }
            aria-pressed={
              viewMode === mode
            }
            aria-label={`${
              VIEW_LABELS[mode]
            } Bounty Board view`}
            title={`${
              VIEW_LABELS[mode]
            } view`}
            className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
              viewMode === mode
                ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.24)]"
                : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
            }`}
          >
            {mode[0].toUpperCase()}
          </button>
        )
      )}
    </div>
  );
}

export default function BountyBoardViews({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  // B/A remain deliberately preserved in source for a possible future return.
  void BasicBountyView;
  void AdvancedBountyView;
  void BountyViewToggle;

  return (
    <div
      className="relative"
      data-bounty-view="extreme"
    >
      <ExtremeBountyView board={board} />
    </div>
  );
}

function BasicBountyView({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  const contracts = board.opportunities.filter(
    isPublicBountyContract,
  );

  const featured =
    contracts.filter(
      (item) =>
        item.featured &&
        [
          "available",
          "in_progress",
        ].includes(
          item.status
        )
    );

  return (
    <main className="space-y-7 py-7 text-white">
      <section className="overflow-hidden rounded-[2.2rem] border border-amber-100/14 bg-[radial-gradient(circle_at_14%_0%,rgba(251,191,36,0.2),transparent_33%),radial-gradient(circle_at_88%_12%,rgba(239,68,68,0.12),transparent_29%),linear-gradient(145deg,#151008,#080b12_58%)] p-7 sm:p-11">
        <div className="text-xs font-bold uppercase tracking-[0.42em] text-amber-100/65">
          The Bounty Board
        </div>

        <h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none sm:text-7xl">
          What can you do next?
        </h1>

        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
          Open opportunities,
          locked rewards, paid
          legends, and the complete
          memo trail. An opportunity
          is not a payment promise.
          WOLO is paid only when the
          settlement rail shows real
          proof.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          <Metric
            label="Open"
            value={String(
              board.totals
                .available
            )}
          />
          <Metric
            label="In progress"
            value={String(
              board.totals
                .inProgress
            )}
          />
          <Metric
            label="Awaiting payout"
            value={String(
              board.totals.locked
            )}
          />
          <Metric
            label="Verified bounty payouts"
            value={`${Math.round(
              board.totals
                .paidWolo
            ).toLocaleString()} WOLO`}
          />
        </div>
      </section>

      <section className="overflow-x-auto pb-2 [scrollbar-width:thin]">
        <div className="flex min-w-max gap-4">
          {featured.map(
            (item) => (
              <BasicBountyCard
                key={item.id}
                item={item}
                featured
              />
            )
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contracts.map(
          (item) => (
            <BasicBountyCard
              key={item.id}
              item={item}
            />
          )
        )}
      </section>

      <BountyAdvisor />

      <BasicLedger
        board={board}
      />
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">
        {value}
      </div>
    </div>
  );
}

function BasicBountyCard({
  item,
  featured = false,
}: {
  item: Opportunity;
  featured?: boolean;
}) {
  return (
    <article
      className={`${
        featured
          ? "w-[min(82vw,25rem)]"
          : ""
      } flex h-full flex-col rounded-[1.6rem] border border-white/9 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-5`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100/55">
          {item.category}
        </span>

        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
          {STATUS_LABELS[
            item.status
          ] || item.status}
        </span>
      </div>

      <h3 className="mt-4 text-2xl font-semibold">
        {item.title}
      </h3>

      <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">
        {item.description}
      </p>

      <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-slate-400">
        <span className="text-slate-200">
          Proof:
        </span>{" "}
        {item.verification ||
          "Operator verification required."}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-amber-100">
          {formatReward(
            item.rewardWolo
          )}
        </span>

        <Link
          href={
            item.actionHref
          }
          className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950"
        >
          {item.actionLabel}
        </Link>
      </div>
    </article>
  );
}

function BasicLedger({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">
            Authoritative Memo
            Ledger
          </div>
          <h2 className="mt-2 text-3xl font-semibold">
            The full record
          </h2>
        </div>

        <div className="text-xs text-slate-500">
          {board.ledger.length}{" "}
          recent rows · generated{" "}
          {new Date(
            board.generatedAt
          ).toLocaleString()}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {board.ledger.length ? (
          board.ledger.map(
            (entry) => (
              <article
                key={
                  entry.key
                }
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusTone(
                        entry.status
                      )}`}
                    >
                      {STATUS_LABELS[
                        entry
                          .status
                      ] ||
                        entry.status}
                    </span>

                    <span className="text-sm font-semibold text-white">
                      {entry.actor ||
                        entry
                          .opportunity
                          ?.title ||
                        "Kingdom ledger"}
                    </span>

                    {entry.amountWolo !==
                    null ? (
                      <span className="text-sm text-amber-100">
                        {entry.amountWolo.toLocaleString()}{" "}
                        WOLO
                      </span>
                    ) : null}
                  </div>

                  <time className="text-xs text-slate-500">
                    {new Date(
                      entry.occurredAt
                    ).toLocaleString()}
                  </time>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                  {entry.memo}
                </p>

                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>
                    {entry.source}
                  </span>

                  {entry.txHash ? (
                    <span className="break-all">
                      tx{" "}
                      {
                        entry.txHash
                      }
                    </span>
                  ) : (
                    <span>
                      No payout tx
                      recorded
                    </span>
                  )}

                  {entry.errorState ? (
                    <span className="text-rose-300">
                      {
                        entry.errorState
                      }
                    </span>
                  ) : null}
                </div>
              </article>
            )
          )
        ) : (
          <div className="rounded-2xl border border-white/8 p-6 text-slate-500">
            No bounty ledger rows
            have been recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================================================
   A — CONTRACTS OF THE REALM
   ============================================================ */

function AdvancedBountyView({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  const contracts = board.opportunities.filter(
    isPublicBountyContract,
  );

  const active =
    contracts.filter(
      (item) =>
        [
          "available",
          "in_progress",
        ].includes(
          item.status
        )
    );

  const archived =
    contracts.filter(
      (item) =>
        ![
          "available",
          "in_progress",
        ].includes(
          item.status
        )
    );

  const featured =
    active.find(
      (item) =>
        item.featured
    ) ||
    active[0] ||
    contracts[0];

  return (
    <main className="space-y-7 py-5 text-white">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-100/16 bg-[radial-gradient(circle_at_8%_0%,rgba(251,191,36,0.20),transparent_30%),radial-gradient(circle_at_92%_8%,rgba(190,24,93,0.13),transparent_30%),linear-gradient(135deg,#171006,#080b13_60%,#060812)] px-7 py-10 shadow-[0_36px_130px_rgba(0,0,0,0.38)] sm:px-11 sm:py-12">
        <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent" />

        <div className="relative max-w-5xl">
          <div className="text-[10px] font-bold uppercase tracking-[0.45em] text-amber-100/65">
            The Bounty Board ·
            Contracts of the Realm
          </div>

          <h1 className="mt-5 max-w-5xl font-serif text-5xl leading-[0.95] tracking-[-0.035em] text-white sm:text-7xl">
            Deeds wanted.
            <br />
            Proof required.
          </h1>

          <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300">
            Take a contract,
            complete the deed, and
            bring proof back to the
            Kingdom. The board shows
            opportunity truth. The
            settlement rail decides
            whether WOLO was actually
            paid.
          </p>
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-4">
          <PrestigeMetric
            label="Open Contracts"
            value={String(
              board.totals
                .available
            )}
          />
          <PrestigeMetric
            label="In the Field"
            value={String(
              board.totals
                .inProgress
            )}
          />
          <PrestigeMetric
            label="Awaiting Payout"
            value={String(
              board.totals.locked
            )}
          />
          <PrestigeMetric
            label="Verified Bounty WOLO"
            value={Math.round(
              board.totals
                .paidWolo
            ).toLocaleString()}
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <FeaturedContract
          item={featured}
          mode="advanced"
        />

        <RealmPulse
          entries={
            board.ledger
          }
        />
      </section>

      <SectionHeading
        eyebrow="Open Contracts"
        title="Choose your next deed."
        body={`${active.length} live opportunity${active.length === 1 ? "" : "ies"} currently posted to the board.`}
      />

      <section className="grid gap-5 md:grid-cols-2">
        {active.length ? (
          active.map(
            (item) => (
              <ContractCard
                key={item.id}
                item={item}
                mode="advanced"
              />
            )
          )
        ) : (
          <EmptyBoard />
        )}
      </section>

      {archived.length ? (
        <>
          <SectionHeading
            eyebrow="The Old Wall"
            title="Closed, paid, and legendary."
            body="Contracts that have moved beyond the open board remain part of the record."
          />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {archived.map(
              (item) => (
                <ContractCard
                  key={item.id}
                  item={item}
                  mode="archive"
                />
              )
            )}
          </section>
        </>
      ) : null}

      <BountyAdvisor />

      <PremiumLedger
        board={board}
        eyebrow="Bounty Chronicle"
        title="The verified bounty trail."
      />
    </main>
  );
}

/* ============================================================
   E — GRAND PREMIUM WAR BOARD
   ============================================================ */

function ExtremeBountyView({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  const contracts = board.opportunities.filter(
    isPublicBountyContract,
  );

  const active =
    contracts.filter(
      (item) =>
        [
          "available",
          "in_progress",
        ].includes(
          item.status
        )
    );

  const retired =
    contracts.filter(
      (item) =>
        ![
          "available",
          "in_progress",
        ].includes(
          item.status
        )
    );

  const featured =
    active.find(
      (item) =>
        item.featured
    ) ||
    active[0] ||
    contracts[0];

  const paid =
    board.ledger.filter(
      (entry) =>
        entry.status ===
        "paid"
    );

  return (
    <main className="space-y-8 py-3 text-white">
      <BountyWarriorCarousel
        board={board}
      />

      <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-100/14 bg-[radial-gradient(circle_at_6%_0%,rgba(251,191,36,0.14),transparent_34%),linear-gradient(138deg,#120d05_0%,#070910_58%,#040611_100%)] px-7 py-8 shadow-[0_34px_120px_rgba(0,0,0,0.44)] sm:px-10 lg:px-12 lg:py-10">
        <div className="pointer-events-none absolute -left-24 top-4 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-28 top-0 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/75 to-transparent" />

        <div className="relative grid gap-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(25rem,0.95fr)] xl:items-end">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.52em] text-amber-100/70">
              AoE2WAR · The Royal
              Bounty Exchange
            </div>

            <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.95] tracking-[-0.04em] text-white sm:text-6xl">
              Open Contracts.
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              The public contract wall sits beneath the Hall. Choose a deed, follow its proof requirement, and treat the posted WOLO as real only when the canonical payout rail proves it.
            </p>

            <div className="mt-8 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.22em]">
              <span className="rounded-full border border-amber-200/20 bg-amber-300/8 px-4 py-2 text-amber-100">
                Contracts
              </span>
              <span className="rounded-full border border-sky-200/15 bg-sky-300/7 px-4 py-2 text-sky-100">
                Watcher Proof
              </span>
              <span className="rounded-full border border-emerald-200/15 bg-emerald-300/7 px-4 py-2 text-emerald-100">
                Chain Receipts
              </span>
            </div>
          </div>

          <FeaturedContract
            item={featured}
            mode="extreme"
          />
        </div>

        <div className="relative mt-11 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PrestigeMetric
            label="Open Contracts"
            value={String(
              board.totals
                .available
            )}
            extreme
          />
          <PrestigeMetric
            label="Warriors in Motion"
            value={String(
              board.totals
                .inProgress
            )}
            extreme
          />
          <PrestigeMetric
            label="Awaiting Payout"
            value={String(
              board.totals.locked
            )}
            extreme
          />
          <PrestigeMetric
            label="Verified Bounty WOLO"
            value={`${Math.round(
              board.totals
                .paidWolo
            ).toLocaleString()} WOLO`}
            extreme
          />
        </div>
      </section>

      <LedgerTicker
        entries={
          board.ledger
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-5">
        <SectionHeading
          eyebrow="Open Contracts"
          title="The wall is live."
          body="Choose a deed. Follow its proof requirement. The reward becomes real only when the payout rail proves it."
          flush
        />

        <div className="rounded-full border border-amber-200/16 bg-amber-300/[0.055] px-5 py-2 text-xs font-bold uppercase tracking-[0.24em] text-amber-100/75">
          {active.length} posted
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {active.length ? (
          active.map(
            (item) => (
              <ContractCard
                key={item.id}
                item={item}
                mode="extreme"
              />
            )
          )
        ) : (
          <EmptyBoard />
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[2.4rem] border border-amber-100/13 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.12),transparent_35%),linear-gradient(145deg,rgba(18,15,10,0.97),rgba(5,8,15,0.98))] p-6 sm:p-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.38em] text-amber-100/55">
            Legendary Bounties
          </div>

          <h2 className="mt-3 font-serif text-4xl text-white sm:text-5xl">
            The old contracts still
            have names.
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
            Completed, historical,
            rescinded, and payout-stage
            contracts remain visible
            instead of disappearing
            behind the treasury door.
          </p>

          <div className="mt-6 space-y-3">
            {retired.length ? (
              retired
                .slice(0, 8)
                .map(
                  (item) => (
                    <LegendRow
                      key={
                        item.id
                      }
                      item={item}
                    />
                  )
                )
            ) : (
              <div className="rounded-2xl border border-white/8 bg-black/18 p-5 text-sm text-slate-500">
                The live opportunity
                board currently holds
                the field.
              </div>
            )}
          </div>
        </div>

        <PaidHall
          entries={paid}
          totalPaid={
            board.totals
              .paidWolo
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <BountyAdvisor />

        <div className="rounded-[1.8rem] border border-amber-200/12 bg-[radial-gradient(circle_at_100%_0%,rgba(251,191,36,0.10),transparent_36%),rgba(5,8,15,0.9)] p-6 sm:p-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-100/55">
            The Law of the Board
          </div>

          <h2 className="mt-3 font-serif text-4xl">
            A notice is not a payout.
          </h2>

          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-400">
            <p>
              An available contract
              tells you what can be
              attempted.
            </p>
            <p>
              Verification tells you
              what evidence the Kingdom
              expects.
            </p>
            <p>
              A recorded payout becomes
              final only when the
              settlement rail carries
              real proof.
            </p>
          </div>
        </div>
      </section>

      <PremiumLedger
        board={board}
        eyebrow="Hall of Records"
        title="Every verified bounty. Every receipt."
        extreme
      />
    </main>
  );
}

/* ============================================================
   SHARED PREMIUM PIECES
   ============================================================ */

function PrestigeMetric({
  label,
  value,
  extreme = false,
}: {
  label: string;
  value: string;
  extreme?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.35rem] border border-white/10 bg-black/25 ${
        extreme
          ? "p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
          : "p-4"
      }`}
    >
      <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>

      <div
        className={`mt-2 font-semibold text-white ${
          extreme
            ? "text-2xl"
            : "text-xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FeaturedContract({
  item,
  mode,
}: {
  item?: Opportunity;
  mode:
    | "advanced"
    | "extreme";
}) {
  if (!item) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-black/25 p-7 text-slate-500">
        No featured bounty is
        currently posted.
      </div>
    );
  }

  const extreme =
    mode === "extreme";

  return (
    <article
      className={`relative overflow-hidden border border-amber-200/22 bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,0.18),transparent_38%),linear-gradient(145deg,rgba(28,20,7,0.98),rgba(6,9,16,0.98))] ${
        extreme
          ? "rounded-[2.5rem] p-7 shadow-[0_32px_100px_rgba(0,0,0,0.45),0_0_60px_rgba(251,191,36,0.08)] sm:p-9"
          : "rounded-[2rem] p-7"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/65 to-transparent" />

      <div className="relative flex items-center justify-between gap-4">
        <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-100/65">
          {contractEyebrow(
            item
          )}
        </div>

        <StatusPill
          status={item.status}
        />
      </div>

      <div
        className={`relative mt-5 font-serif leading-[0.95] text-white ${
          extreme
            ? "text-4xl sm:text-5xl"
            : "text-4xl"
        }`}
      >
        {item.title}
      </div>

      <p className="relative mt-5 text-sm leading-7 text-slate-300">
        {item.description}
      </p>

      <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-black/22 p-4">
          <div className="text-[9px] uppercase tracking-[0.24em] text-slate-500">
            Reward
          </div>
          <div className="mt-2 text-lg font-bold text-amber-100">
            {formatReward(
              item.rewardWolo
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-black/22 p-4">
          <div className="text-[9px] uppercase tracking-[0.24em] text-slate-500">
            Proof
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-300">
            {item.verification ||
              "Operator verification required."}
          </div>
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs leading-5 text-slate-500">
          {item.eligibility ||
            "Eligibility defined by the posted contract."}
        </div>

        <Link
          href={
            item.actionHref
          }
          className={`inline-flex min-h-11 items-center justify-center rounded-full bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 ${
            extreme
              ? "shadow-[0_12px_32px_rgba(251,191,36,0.18)]"
              : ""
          }`}
        >
          {item.actionLabel}
        </Link>
      </div>
    </article>
  );
}

function ContractCard({
  item,
  mode,
}: {
  item: Opportunity;
  mode:
    | "advanced"
    | "extreme"
    | "archive";
}) {
  const extreme =
    mode === "extreme";

  const archive =
    mode === "archive";

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden border transition duration-300 ${
        extreme
          ? "min-h-[25rem] rounded-[2.2rem] border-amber-100/14 bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(150deg,rgba(15,18,28,0.98),rgba(5,8,15,0.99))] p-6 shadow-[0_26px_80px_rgba(0,0,0,0.34)] hover:-translate-y-1 hover:border-amber-100/28 hover:shadow-[0_34px_100px_rgba(0,0,0,0.46),0_0_55px_rgba(251,191,36,0.07)] sm:p-7"
          : archive
            ? "rounded-[1.7rem] border-white/8 bg-white/[0.025] p-5 opacity-90"
            : "min-h-[21rem] rounded-[1.9rem] border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-6 hover:border-amber-100/20"
      }`}
    >
      {extreme ? (
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />
      ) : null}

      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-100/55">
          {contractEyebrow(
            item
          )}
        </span>

        <StatusPill
          status={item.status}
        />
      </div>

      <h3
        className={`relative mt-5 font-semibold tracking-[-0.025em] text-white ${
          extreme
            ? "text-3xl"
            : "text-2xl"
        }`}
      >
        {item.title}
      </h3>

      <p className="relative mt-4 flex-1 text-sm leading-7 text-slate-400">
        {item.description}
      </p>

      <div className="relative mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Proof required
        </div>
        <p className="mt-2 text-xs leading-6 text-slate-300">
          {item.verification ||
            "Operator verification required."}
        </p>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-5">
        <span
          className={`font-bold text-amber-100 ${
            extreme
              ? "text-lg"
              : "text-sm"
          }`}
        >
          {formatReward(
            item.rewardWolo
          )}
        </span>

        <Link
          href={
            item.actionHref
          }
          className="inline-flex min-h-10 items-center rounded-full bg-amber-300 px-4 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
        >
          {item.actionLabel}
        </Link>
      </div>
    </article>
  );
}

function StatusPill({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${statusTone(
        status
      )}`}
    >
      {STATUS_LABELS[
        status
      ] || status}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  flush = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  flush?: boolean;
}) {
  return (
    <div
      className={
        flush
          ? ""
          : "pt-2"
      }
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.36em] text-amber-100/55">
        {eyebrow}
      </div>

      <h2 className="mt-2 font-serif text-4xl text-white sm:text-5xl">
        {title}
      </h2>

      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
        {body}
      </p>
    </div>
  );
}

function RealmPulse({
  entries,
}: {
  entries: LedgerEntry[];
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(13,18,30,0.96),rgba(4,7,13,0.98))] p-6">
      <div className="text-[10px] font-bold uppercase tracking-[0.34em] text-sky-100/55">
        Realm Pulse
      </div>

      <h2 className="mt-3 text-3xl font-semibold">
        The board is moving.
      </h2>

      <div className="mt-5 space-y-3">
        {entries
          .slice(0, 5)
          .map(
            (entry) => (
              <CompactLedgerRow
                key={
                  entry.key
                }
                entry={entry}
              />
            )
          )}
      </div>
    </section>
  );
}

function CompactLedgerRow({
  entry,
}: {
  entry: LedgerEntry;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusPill
          status={
            entry.status
          }
        />

        {entry.amountWolo !==
        null ? (
          <span className="text-xs font-bold text-amber-100">
            {entry.amountWolo.toLocaleString()}{" "}
            WOLO
          </span>
        ) : null}
      </div>

      <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
        {entry.memo}
      </div>

      <div className="mt-2 text-[10px] text-slate-600">
        {new Date(
          entry.occurredAt
        ).toLocaleString()}
      </div>
    </div>
  );
}

function LedgerTicker({
  entries,
}: {
  entries: LedgerEntry[];
}) {
  return (
    <section className="overflow-x-auto rounded-[1.5rem] border border-amber-100/10 bg-black/24 p-3 [scrollbar-width:thin]">
      <div className="flex min-w-max items-center gap-3">
        <div className="px-3 text-[9px] font-black uppercase tracking-[0.32em] text-amber-100/55">
          Live Ledger
        </div>

        {entries
          .slice(0, 8)
          .map(
            (entry) => (
              <div
                key={
                  entry.key
                }
                className="flex max-w-[26rem] items-center gap-3 rounded-full border border-white/8 bg-white/[0.035] px-4 py-2"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    entry.status ===
                    "paid"
                      ? "bg-emerald-300"
                      : entry.status ===
                          "locked"
                        ? "bg-amber-300"
                        : "bg-sky-300"
                  }`}
                />

                <span className="truncate text-xs text-slate-300">
                  {entry.memo}
                </span>

                {entry.amountWolo !==
                null ? (
                  <span className="shrink-0 text-xs font-bold text-amber-100">
                    {entry.amountWolo.toLocaleString()}
                  </span>
                ) : null}
              </div>
            )
          )}
      </div>
    </section>
  );
}

function LegendRow({
  item,
}: {
  item: Opportunity;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-amber-100/55">
          {contractEyebrow(
            item
          )}
        </div>

        <StatusPill
          status={item.status}
        />
      </div>

      <div className="mt-3 text-lg font-semibold text-white">
        {item.title}
      </div>

      <div className="mt-2 text-xs text-amber-100/75">
        {formatReward(
          item.rewardWolo
        )}
      </div>
    </div>
  );
}

function PaidHall({
  entries,
  totalPaid,
}: {
  entries: LedgerEntry[];
  totalPaid: number;
}) {
  return (
    <section className="relative overflow-hidden rounded-[2.4rem] border border-emerald-200/12 bg-[radial-gradient(circle_at_100%_0%,rgba(16,185,129,0.12),transparent_35%),linear-gradient(145deg,rgba(4,18,17,0.92),rgba(4,7,13,0.99))] p-6 sm:p-8">
      <div className="text-[10px] font-bold uppercase tracking-[0.38em] text-emerald-100/55">
        Hall of Paid Blood
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-4xl text-white sm:text-5xl">
          The treasury remembers.
        </h2>

        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.23em] text-slate-500">
            Recorded paid
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-100">
            {Math.round(
              totalPaid
            ).toLocaleString()}{" "}
            WOLO
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {entries
          .slice(0, 8)
          .map(
            (entry) => (
              <CompactLedgerRow
                key={
                  entry.key
                }
                entry={entry}
              />
            )
          )}
      </div>
    </section>
  );
}

function PremiumLedger({
  board,
  eyebrow,
  title,
  extreme = false,
}: {
  board: BountyBoardSnapshot;
  eyebrow: string;
  title: string;
  extreme?: boolean;
}) {
  return (
    <section
      className={`border border-white/10 bg-slate-950/78 ${
        extreme
          ? "rounded-[2.6rem] p-6 sm:p-9"
          : "rounded-[2rem] p-6 sm:p-8"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.34em] text-amber-100/55">
            {eyebrow}
          </div>

          <h2
            className={`mt-2 font-serif text-white ${
              extreme
                ? "text-4xl sm:text-5xl"
                : "text-4xl"
            }`}
          >
            {title}
          </h2>
        </div>

        <div className="text-xs text-slate-500">
          {board.ledger.length}{" "}
          recent rows ·{" "}
          {new Date(
            board.generatedAt
          ).toLocaleString()}
        </div>
      </div>

      <div
        className={`mt-6 grid gap-3 ${
          extreme
            ? "xl:grid-cols-2"
            : ""
        }`}
      >
        {board.ledger.length ? (
          board.ledger.map(
            (entry) => (
              <article
                key={
                  entry.key
                }
                className="rounded-2xl border border-white/8 bg-white/[0.028] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={
                        entry.status
                      }
                    />

                    <span className="text-sm font-semibold text-white">
                      {entry.actor ||
                        entry
                          .opportunity
                          ?.title ||
                        "Kingdom ledger"}
                    </span>
                  </div>

                  {entry.amountWolo !==
                  null ? (
                    <span className="text-sm font-bold text-amber-100">
                      {entry.amountWolo.toLocaleString()}{" "}
                      WOLO
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                  {entry.memo}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-slate-600">
                  <span>
                    {entry.source}
                  </span>

                  <time>
                    {new Date(
                      entry.occurredAt
                    ).toLocaleString()}
                  </time>
                </div>

                <div className="mt-2 text-[10px] text-slate-600">
                  {entry.txHash ? (
                    <span className="break-all">
                      tx{" "}
                      {
                        entry.txHash
                      }
                    </span>
                  ) : (
                    <span>
                      No payout tx
                      recorded
                    </span>
                  )}

                  {entry.errorState ? (
                    <span className="ml-3 text-rose-300">
                      {
                        entry.errorState
                      }
                    </span>
                  ) : null}
                </div>
              </article>
            )
          )
        ) : (
          <EmptyBoard />
        )}
      </div>
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.025] p-7 text-sm text-slate-500">
      No contracts are currently
      posted in this lane.
    </div>
  );
}
