"use client";

import { useEffect, useMemo, useState } from "react";

import type { BountyAdminSnapshot } from "@/lib/bounties";

type Snapshot = BountyAdminSnapshot;
type HallWarrior = Snapshot["hall"]["warriors"][number];
type Opportunity = Snapshot["opportunities"][number];

type Draft = {
  id: number | null;
  assignedUid: string | null;
  title: string;
  description: string;
  eligibility: string;
  verification: string;
  actionLabel: string;
  actionHref: string;
  rewardWolo: number | null;
  status: string;
  featured: boolean;
  priority: number;
  publishedAt: string;
  expiresAt: string;
  valuationReason: string;
  eventMemo: string;
};

const STATUSES = ["available", "in_progress", "historical"];

function inputDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function outputDate(value: string) {
  if (!value) return "";

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toISOString();
}

function draftFromOpportunity(
  opportunity: Opportunity,
  assignedUid: string | null = opportunity.assignedUser?.uid ?? null,
): Draft {
  return {
    id: opportunity.id,
    assignedUid,
    title: opportunity.title,
    description: opportunity.description,
    eligibility: opportunity.eligibility || "",
    verification: opportunity.verification || "",
    actionLabel: opportunity.actionLabel,
    actionHref: opportunity.actionHref,
    rewardWolo: opportunity.rewardWolo,
    status: opportunity.status,
    featured: opportunity.featured,
    priority: opportunity.priority,
    publishedAt: inputDate(opportunity.publishedAt),
    expiresAt: inputDate(opportunity.expiresAt),
    valuationReason: "",
    eventMemo: "",
  };
}

function draftForWarrior(warrior: HallWarrior): Draft {
  if (warrior.nextBounty) {
    return draftFromOpportunity(warrior.nextBounty, warrior.uid);
  }

  return {
    id: null,
    assignedUid: warrior.uid,
    title: "",
    description: "",
    eligibility: `${warrior.name} must complete the published deed.`,
    verification: "Verified evidence and operator acceptance required.",
    actionLabel: "Open warrior profile",
    actionHref: warrior.href,
    rewardWolo: null,
    status: "available",
    featured: true,
    priority: 110,
    publishedAt: "",
    expiresAt: "",
    valuationReason: "",
    eventMemo: "",
  };
}

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function BountyCommandCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [warriorDrafts, setWarriorDrafts] = useState<Record<string, Draft>>({});
  const [contractDrafts, setContractDrafts] = useState<Record<number, Draft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/bounties", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Snapshot & {
      detail?: string;
    };

    if (!response.ok) {
      throw new Error(payload.detail || "Could not load bounty operations.");
    }

    setSnapshot(payload);
    setWarriorDrafts(
      Object.fromEntries(
        payload.hall.warriors
          .filter((warrior) => !warrior.mystery && warrior.uid)
          .map((warrior) => [warrior.uid!, draftForWarrior(warrior)]),
      ),
    );
    setContractDrafts(
      Object.fromEntries(
        payload.opportunities
          .filter((opportunity) => opportunity.bountyKind !== "personal")
          .map((opportunity) => [opportunity.id, draftFromOpportunity(opportunity)]),
      ),
    );
  }

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not load bounty operations."),
    );
  }, []);

  const claimedWarriors = useMemo(
    () => snapshot?.hall.warriors.filter((warrior) => !warrior.mystery) ?? [],
    [snapshot],
  );

  async function save(key: string, draft: Draft) {
    setSavingKey(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/bounties", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          publishedAt: outputDate(draft.publishedAt),
          expiresAt: outputDate(draft.expiresAt),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not save bounty.");
      }

      setNotice(`${draft.title || "Bounty"} saved. Economic history remains append-only.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save bounty.");
    } finally {
      setSavingKey(null);
    }
  }

  function updateWarrior(uid: string, change: Partial<Draft>) {
    setWarriorDrafts((current) => ({
      ...current,
      [uid]: { ...current[uid], ...change },
    }));
  }

  function updateContract(id: number, change: Partial<Draft>) {
    setContractDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...change },
    }));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 py-8 text-white">
      <section className="rounded-[2rem] border border-amber-200/15 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.14),transparent_34%),linear-gradient(145deg,#171107,#070a11)] p-7 sm:p-9">
        <div className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/60">
          Operator Settlement Desk
        </div>
        <h1 className="mt-3 font-serif text-4xl">Bounty Command Center</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Publish exact personal contracts, preserve versioned WOLO valuations, review canonical claims, and inspect excluded legacy rails. Paid status comes only from transaction proof.
        </p>
        {snapshot ? (
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{claimedWarriors.length} Hall warriors</span>
            <span>·</span>
            <span>{snapshot.totals.available} open contracts</span>
            <span>·</span>
            <span>{snapshot.totals.paid} verified payouts</span>
            <span>·</span>
            <span>{money(snapshot.totals.paidWolo)} verified WOLO</span>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100">
          {notice}
        </div>
      ) : null}

      <SectionTitle
        eyebrow="Warrior Next Bounties"
        title="Post the exact deed and exact WOLO."
        body="Every claimed profile with a featured avatar appears here automatically. Changing a reward closes the old valuation and appends a new one."
      />

      <section className="grid gap-5 xl:grid-cols-2">
        {claimedWarriors.map((warrior) => {
          const draft = warrior.uid ? warriorDrafts[warrior.uid] : null;
          if (!draft || !warrior.uid) return null;

          return (
            <article
              key={warrior.id}
              className="rounded-[1.7rem] border border-amber-100/10 bg-[linear-gradient(145deg,rgba(20,16,9,0.92),rgba(5,8,15,0.96))] p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
                    Personal Contract
                  </div>
                  <h2 className="mt-1 font-serif text-3xl">{warrior.name}</h2>
                  <div className="mt-1 text-xs text-slate-500">{warrior.battlefieldLabel}</div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {warrior.nextBounty ? "Published" : "No active bounty"}
                </div>
              </div>

              <BountyEditor
                draft={draft}
                onChange={(change) => updateWarrior(warrior.uid!, change)}
                onSave={() => void save(`warrior:${warrior.uid}`, draft)}
                saving={savingKey === `warrior:${warrior.uid}`}
                personal
              />
            </article>
          );
        })}
      </section>

      <SectionTitle
        eyebrow="Open Contracts"
        title="The public contract wall."
        body="These are general opportunities, not personal warrior promises. Paid and locked are intentionally unavailable as manual status choices."
      />

      <section className="grid gap-5 lg:grid-cols-2">
        {Object.values(contractDrafts).map((draft) => (
          <article
            key={draft.id}
            className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"
          >
            <BountyEditor
              draft={draft}
              onChange={(change) => updateContract(draft.id!, change)}
              onSave={() => void save(`contract:${draft.id}`, draft)}
              saving={savingKey === `contract:${draft.id}`}
            />
          </article>
        ))}
      </section>

      <SectionTitle
        eyebrow="Claims and Proof"
        title="Canonical claims only."
        body="Reward snapshots remain frozen even when later bounty valuations change."
      />

      <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/25">
        <div className="max-h-[28rem] overflow-auto">
          {(snapshot?.admin.canonicalClaims ?? []).length ? (
            snapshot!.admin.canonicalClaims.map((claim) => (
              <div
                key={claim.id}
                className="grid gap-2 border-b border-white/7 px-5 py-4 text-sm last:border-0 md:grid-cols-[1.2fr_0.9fr_0.6fr_0.7fr]"
              >
                <div>
                  <div className="font-semibold text-white">{claim.opportunity.title}</div>
                  <div className="text-xs text-slate-500">
                    {claim.playerDisplayNameSnapshot} · {claim.user.uid}
                  </div>
                </div>
                <div className="text-slate-400">{claim.status}</div>
                <div className="font-semibold text-amber-100">
                  {money(claim.rewardSnapshotWolo)} WOLO
                </div>
                <div className="text-xs text-slate-500">
                  {claim.payout?.txHash ? "Transaction proven" : "No payout proof"}
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="No canonical bounty claim has been issued yet." />
          )}
        </div>
      </section>

      <SectionTitle
        eyebrow="Payout Queue"
        title="Payment truth cannot be typed into existence."
        body="A bounty becomes paid publicly only when its payout carries a transaction hash."
      />

      <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/25">
        {(snapshot?.admin.canonicalPayouts ?? []).length ? (
          snapshot!.admin.canonicalPayouts.map((payout) => (
            <div
              key={payout.id}
              className="grid gap-2 border-b border-white/7 px-5 py-4 text-sm last:border-0 md:grid-cols-[1.2fr_0.7fr_0.7fr_1fr]"
            >
              <div>
                <div className="font-semibold text-white">
                  {payout.claim.opportunity.title}
                </div>
                <div className="text-xs text-slate-500">{payout.claim.user.uid}</div>
              </div>
              <div className="font-semibold text-amber-100">
                {money(payout.amountWolo)} WOLO
              </div>
              <div className="text-slate-400">{payout.status}</div>
              <div className="break-all text-xs text-slate-500">
                {payout.txHash || payout.errorDetail || "Awaiting settlement proof"}
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="No canonical payout is queued." />
        )}
      </section>

      <SectionTitle
        eyebrow="Legacy Audit"
        title="Preserved, classified, and excluded from public totals."
        body="Founder rewards, championship tributes, and generic keyword-matched transfers remain visible here without masquerading as bounty claims."
      />

      <section className="grid gap-5 xl:grid-cols-3">
        <AuditCard
          title="Claim Rail"
          rows={snapshot?.admin.legacyAudit.claimSummary ?? []}
          render={(row) => `${row.claimKind} · ${row.status} · ${row._count._all} rows · ${money(row._sum.amountWolo)} WOLO`}
        />
        <AuditCard
          title="Championship Rail"
          rows={snapshot?.admin.legacyAudit.trophySummary ?? []}
          render={(row) => `${row.payoutKind} · ${row.status} · ${row._count._all} rows · ${money(row._sum.amountWolo)} WOLO`}
        />
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
            Generic Chain Matches
          </div>
          <div className="mt-4 text-4xl font-semibold text-white">
            {snapshot?.admin.legacyAudit.keywordTransferCount ?? 0}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Indexed transfers matched only because a memo contained bounty, reward, trophy, belt, or artifact. They are no longer public bounty truth.
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
            Recent Legacy Claims
          </div>
          <div className="mt-4 max-h-[22rem] space-y-2 overflow-auto pr-1">
            {(snapshot?.admin.legacyAudit.claims ?? []).slice(0, 20).map((row) => (
              <div key={row.id} className="rounded-xl border border-white/7 bg-white/[0.025] p-3 text-xs">
                <div className="font-semibold text-slate-300">{row.classification}</div>
                <div className="mt-1 text-slate-500">{row.displayPlayerName} · {row.claimKind} · {money(row.amountWolo)} WOLO</div>
                <div className="mt-1 break-all text-slate-600">{row.payoutTxHash || row.errorState || "No transaction proof"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
            Recent Trophy Payouts
          </div>
          <div className="mt-4 max-h-[22rem] space-y-2 overflow-auto pr-1">
            {(snapshot?.admin.legacyAudit.trophyPayouts ?? []).slice(0, 20).map((row) => (
              <div key={row.id} className="rounded-xl border border-white/7 bg-white/[0.025] p-3 text-xs">
                <div className="font-semibold text-slate-300">{row.classification}</div>
                <div className="mt-1 text-slate-500">{row.recipientDisplayName} · {row.payoutKind} · {money(row.amountWolo)} WOLO</div>
                <div className="mt-1 break-all text-slate-600">{row.txHash || row.errorState || "No transaction proof"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
            Recent Keyword Transfers
          </div>
          <div className="mt-4 max-h-[22rem] space-y-2 overflow-auto pr-1">
            {(snapshot?.admin.legacyAudit.keywordTransfers ?? []).slice(0, 20).map((row) => (
              <div key={`${row.id}:${row.transferIndex}`} className="rounded-xl border border-white/7 bg-white/[0.025] p-3 text-xs">
                <div className="font-semibold text-slate-300">{row.classification}</div>
                <div className="mt-1 text-slate-500">{money(Number(row.amountWoloDisplay))} WOLO · {row.source}</div>
                <div className="mt-1 line-clamp-3 text-slate-600">{row.memo || "No memo"}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function BountyEditor({
  draft,
  onChange,
  onSave,
  saving,
  personal = false,
}: {
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
  onSave: () => void;
  saving: boolean;
  personal?: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" value={draft.title} onChange={(title) => onChange({ title })} />
        <label className="space-y-2 text-sm text-slate-300">
          <span>Status</span>
          <select
            value={draft.status}
            onChange={(event) => onChange({ status: event.target.value })}
            className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-2.5"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Exact reward WOLO"
          type="number"
          min="0"
          step="1"
          value={draft.rewardWolo === null ? "" : String(draft.rewardWolo)}
          onChange={(value) => {
            if (value === "") {
              onChange({ rewardWolo: null });
              return;
            }

            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              onChange({ rewardWolo: parsed });
            }
          }}
        />
        <Field
          label="Valuation reason"
          value={draft.valuationReason}
          onChange={(valuationReason) => onChange({ valuationReason })}
          placeholder="Required when WOLO changes"
        />
        <Field
          label="Published at"
          type="datetime-local"
          value={draft.publishedAt}
          onChange={(publishedAt) => onChange({ publishedAt })}
        />
        <Field
          label="Expires at"
          type="datetime-local"
          value={draft.expiresAt}
          onChange={(expiresAt) => onChange({ expiresAt })}
        />
        {!personal ? (
          <>
            <Field
              label="Action label"
              value={draft.actionLabel}
              onChange={(actionLabel) => onChange({ actionLabel })}
            />
            <Field
              label="Action href"
              value={draft.actionHref}
              onChange={(actionHref) => onChange({ actionHref })}
            />
            <Field
              label="Priority"
              value={String(draft.priority)}
              onChange={(value) => onChange({ priority: Number(value) || 0 })}
            />
            <label className="flex items-end pb-3 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(event) => onChange({ featured: event.target.checked })}
                className="mr-2"
              />
              Featured contract
            </label>
          </>
        ) : null}
      </div>

      <TextField
        label="Description"
        value={draft.description}
        onChange={(description) => onChange({ description })}
      />
      <TextField
        label="Eligibility"
        value={draft.eligibility}
        onChange={(eligibility) => onChange({ eligibility })}
      />
      <TextField
        label="Proof requirement"
        value={draft.verification}
        onChange={(verification) => onChange({ verification })}
      />
      <TextField
        label="Append-only operator memo"
        value={draft.eventMemo}
        onChange={(eventMemo) => onChange({ eventMemo })}
      />

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 cursor-pointer rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"
      >
        {saving ? "Saving…" : personal ? "Publish Warrior Bounty" : "Save Contract"}
      </button>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header>
      <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-100/55">
        {eyebrow}
      </div>
      <h2 className="mt-2 font-serif text-4xl">{title}</h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">{body}</p>
    </header>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  placeholder,
  step,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  step?: string;
  type?: string;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-amber-200/30"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-amber-200/30"
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-sm text-slate-500">{text}</div>;
}

function AuditCard<T>({
  title,
  rows,
  render,
}: {
  title: string;
  rows: T[];
  render: (row: T) => string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-100/50">
        {title}
      </div>
      <div className="mt-4 space-y-2">
        {rows.length ? (
          rows.map((row, index) => (
            <div key={index} className="rounded-xl border border-white/7 bg-black/20 p-3 text-xs text-slate-400">
              {render(row)}
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-600">No rows.</div>
        )}
      </div>
    </div>
  );
}
