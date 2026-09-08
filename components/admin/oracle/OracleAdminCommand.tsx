"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleGauge,
  Eye,
  FileClock,
  Gauge,
  Orbit,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  OracleMarketView,
  OracleProposalView,
  OracleSnapshot,
} from "@/lib/oracle";

type AdminEvent = {
  id: number;
  marketId: number | null;
  proposalId: number | null;
  eventType: string;
  detail: string;
  metadata: unknown;
  createdAt: string;
  actorLabel: string | null;
};

type OracleAdminPayload = {
  snapshot: OracleSnapshot;
  admin: {
    previewReadOnly: boolean;
    legacyStockSlugs: string[];
    legacyStockCount: number;
    totalPositions: number;
    totalEvents: number;
    pendingProposals: number;
  };
  recentEvents: AdminEvent[];
};

type MarketDraft = {
  question: string;
  summary: string;
  category: string;
  closesAt: string;
  resolvesAt: string;
  sourceLabel: string;
  resolutionRule: string;
  voidRule: string;
  maxPoolWolo: string;
  seedYesMarks: string;
  seedNoMarks: string;
};

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

function number(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(parsed)
    : String(value);
}

function percent(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function datetimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function draftFor(market: OracleMarketView): MarketDraft {
  return {
    question: market.question,
    summary: market.summary,
    category: market.category,
    closesAt: datetimeLocal(market.closesAt),
    resolvesAt: datetimeLocal(market.resolvesAt),
    sourceLabel: market.sourceLabel,
    resolutionRule: market.resolutionRule,
    voidRule: market.voidRule,
    maxPoolWolo: market.maxPoolWolo ?? "100000",
    seedYesMarks: String(market.seedYesMarks),
    seedNoMarks: String(market.seedNoMarks),
  };
}

function tone(status: string) {
  if (["settled", "approved", "trading"].includes(status)) {
    return "border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100";
  }
  if (["paused", "locked", "resolving", "challenge", "rule_review", "proposed"].includes(status)) {
    return "border-amber-300/20 bg-amber-400/[0.07] text-amber-100";
  }
  if (["voided", "rejected"].includes(status)) {
    return "border-rose-300/20 bg-rose-400/[0.07] text-rose-100";
  }
  return "border-white/10 bg-white/[0.035] text-slate-300";
}

export default function OracleAdminCommand() {
  const [payload, setPayload] = useState<OracleAdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarketDraft | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/admin/oracle", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as
        | OracleAdminPayload
        | { detail?: string };
      if (!response.ok || !("snapshot" in data)) {
        throw new Error(
          "detail" in data && typeof data.detail === "string"
            ? data.detail
            : "Oracle Command could not load.",
        );
      }
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Oracle Command could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(async (
    method: "PATCH" | "DELETE",
    body: Record<string, unknown>,
    success: string,
  ) => {
    try {
      setBusy(String(body.slug ?? body.publicId ?? body.kind ?? body.action ?? "oracle"));
      setError(null);
      setNotice(null);
      const response = await fetch("/api/admin/oracle", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as
        | OracleAdminPayload
        | { detail?: string };
      if (!response.ok || !("snapshot" in data)) {
        throw new Error(
          "detail" in data && typeof data.detail === "string"
            ? data.detail
            : "Oracle command failed.",
        );
      }
      setPayload(data);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Oracle command failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const markets = payload?.snapshot.markets ?? [];
  const proposals = payload?.snapshot.proposals ?? [];
  const legacySet = useMemo(
    () => new Set(payload?.admin.legacyStockSlugs ?? []),
    [payload?.admin.legacyStockSlugs],
  );

  async function deleteMarket(market: OracleMarketView) {
    const phrase = `DELETE ${market.slug}`;
    const confirmation = window.prompt(
      `Permanently delete "${market.question}" and its paper positions?\n\nType exactly:\n${phrase}`,
    );
    if (confirmation !== phrase) return;
    await mutate(
      "DELETE",
      { kind: "market", slug: market.slug, confirmation },
      `Deleted ${market.slug}.`,
    );
  }

  async function deleteLegacyStock() {
    const confirmation = window.prompt(
      "This removes only the five original seeded Oracle markets.\n\nType exactly:\nDELETE LEGACY STOCK",
    );
    if (confirmation !== "DELETE LEGACY STOCK") return;
    await mutate(
      "DELETE",
      { kind: "legacy_stock", confirmation },
      "Legacy seeded Oracle markets removed.",
    );
  }

  async function reviewProposal(
    proposal: OracleProposalView,
    decision: "approved" | "rejected",
  ) {
    const reviewNote =
      decision === "rejected"
        ? window.prompt("Short rejection reason:", "") ?? ""
        : "Exact-rule market approved from Oracle Command.";
    if (decision === "rejected" && reviewNote.trim().length < 3) return;
    await mutate(
      "PATCH",
      {
        action: "review_proposal",
        publicId: proposal.publicId,
        decision,
        reviewNote,
      },
      `${decision === "approved" ? "Approved" : "Rejected"} proposal.`,
    );
  }

  async function moveMarket(market: OracleMarketView, status: string) {
    const body: Record<string, unknown> = {
      action: "market_status",
      slug: market.slug,
      status,
    };

    if (status === "settled") {
      const outcome = window.prompt("Terminal result: type YES or NO", "YES")?.trim().toUpperCase();
      if (outcome !== "YES" && outcome !== "NO") return;
      const resultEvidence = window.prompt(
        "Paste the exact resolution evidence / authoritative result note:",
        "",
      )?.trim();
      if (!resultEvidence || resultEvidence.length < 20) return;
      body.resultOutcome = outcome;
      body.resultEvidence = resultEvidence;
    }

    if (status === "voided") {
      const resultEvidence = window.prompt(
        "Explain exactly why the market is VOID:",
        "",
      )?.trim();
      if (!resultEvidence || resultEvidence.length < 20) return;
      body.resultOutcome = "VOID";
      body.resultEvidence = resultEvidence;
    }

    await mutate("PATCH", body, `${market.slug} → ${status}.`);
  }

  function beginEdit(market: OracleMarketView) {
    setEditingSlug(market.slug);
    setDraft(draftFor(market));
  }

  async function saveEdit(market: OracleMarketView) {
    if (!draft) return;
    const ok = await mutate(
      "PATCH",
      {
        action: "edit_market",
        slug: market.slug,
        ...draft,
        closesAt: new Date(draft.closesAt).toISOString(),
        resolvesAt: new Date(draft.resolvesAt).toISOString(),
      },
      `Saved ${market.slug} contract.`,
    );
    if (ok) {
      setEditingSlug(null);
      setDraft(null);
    }
  }

  if (loading && !payload) {
    return (
      <main className="min-h-screen bg-[#060d19] px-5 py-10 text-white">
        <div className="mx-auto max-w-[118rem] rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="flex items-center gap-3 text-slate-300">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Reading the Oracle ledger…
          </div>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[#060d19] px-5 py-10 text-white">
        <div className="mx-auto max-w-[118rem] rounded-[2rem] border border-rose-300/20 bg-rose-400/[0.06] p-8 text-rose-100">
          {error ?? "Oracle Command is unavailable."}
        </div>
      </main>
    );
  }

  const { snapshot, admin, recentEvents } = payload;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.10),transparent_32%),#060d19] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[118rem] space-y-6">
        <header className="overflow-hidden rounded-[2.2rem] border border-violet-200/14 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.16),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(34,211,238,0.09),transparent_30%),linear-gradient(145deg,#080b14,#050811_62%,#120a12)] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-violet-100/70">
                <Orbit className="h-4 w-4" />
                Admin · Oracle Command
              </div>
              <h1 className="mt-3 font-serif text-4xl text-white sm:text-5xl">
                Command the future market.
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
                Markets, citizen proposals, lifecycle gates, exact resolution, legacy cleanup, audit history, and public-page controls from one operator cockpit.
              </p>
            </div>

            <nav className="flex flex-wrap gap-2">
              <Link href="/oracle" className="rounded-full border border-violet-200/18 bg-violet-300/[0.06] px-4 py-2 text-sm text-violet-100 hover:bg-violet-300/10">
                Open public Oracle
              </Link>
              <Link href="/admin/hero-studio" className="rounded-full border border-cyan-200/18 bg-cyan-300/[0.05] px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10">
                Hero Studio
              </Link>
              <Link href="/admin" className="rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 hover:bg-white/[0.05]">
                Admin home
              </Link>
            </nav>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {[
              ["Markets", markets.length],
              ["Active", snapshot.pulse.activeMarkets],
              ["Forecasters", snapshot.pulse.forecasters],
              ["Positions", admin.totalPositions],
              ["Pending", admin.pendingProposals],
              ["Legacy stock", admin.legacyStockCount],
              ["Events", admin.totalEvents],
              ["Stage", snapshot.stage === "oracle_marks" ? "Marks" : snapshot.stage],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </header>

        {admin.previewReadOnly ? (
          <div className="flex items-start gap-3 rounded-[1.5rem] border border-amber-300/18 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Read-only production preview.</strong>
              <div className="mt-1 text-amber-100/70">
                You can inspect the complete Oracle cockpit locally, but mutation buttons are intentionally blocked until this code is deployed to production.
              </div>
            </div>
          </div>
        ) : null}

        {(error || notice) ? (
          <div className={`rounded-[1.35rem] border p-4 text-sm ${
            error
              ? "border-rose-300/20 bg-rose-400/[0.06] text-rose-100"
              : "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100"
          }`}>
            {error ?? notice}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/68 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.26em] text-violet-100/55">
                  Market command
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Every prediction market.</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Published contracts are immutable after trading begins. Lifecycle and deletion remain explicit operator actions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/[0.05]"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="mt-5 grid gap-4 2xl:grid-cols-2">
              {markets.length ? markets.map((market) => {
                const legacy = legacySet.has(market.slug);
                const editable = ["draft", "review", "approved"].includes(market.status) && market.uniqueForecasters === 0;
                const isEditing = editingSlug === market.slug;
                return (
                  <article key={market.publicId} className="rounded-[1.6rem] border border-white/8 bg-white/[0.025] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${tone(market.status)}`}>
                            {pretty(market.status)}
                          </span>
                          <span className="rounded-full border border-white/8 bg-white/[0.025] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                            {market.category}
                          </span>
                          {legacy ? (
                            <span className="rounded-full border border-rose-300/18 bg-rose-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100">
                              legacy stock
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 max-w-4xl text-lg font-semibold text-white">{market.question}</h3>
                        <div className="mt-2 font-mono text-[11px] text-slate-600">{market.slug}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => beginEdit(market)}
                            className="rounded-full border border-cyan-200/16 bg-cyan-300/[0.05] px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10"
                          >
                            Edit contract
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void deleteMarket(market)}
                          disabled={Boolean(busy)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-300/18 bg-rose-400/[0.05] px-3 py-2 text-xs text-rose-100 hover:bg-rose-400/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                      {[
                        ["YES", percent(market.yesProbabilityBps)],
                        ["NO", percent(10_000 - market.yesProbabilityBps)],
                        ["Forecasters", market.uniqueForecasters],
                        ["Placed", number(market.placedMarks)],
                        ["Close", time(market.closesAt)],
                        ["Source", market.sourceLabel],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-xl border border-white/7 bg-black/20 p-3">
                          <div className="text-[9px] uppercase tracking-[0.18em] text-slate-600">{label}</div>
                          <div className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</div>
                        </div>
                      ))}
                    </div>

                    {market.availableAdminStatuses.length ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/7 pt-4">
                        <span className="mr-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
                          Next lifecycle
                        </span>
                        {market.availableAdminStatuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => void moveMarket(market, status)}
                            disabled={Boolean(busy)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-40 ${tone(status)}`}
                          >
                            {pretty(status)}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {isEditing && draft ? (
                      <div className="mt-5 rounded-[1.4rem] border border-cyan-200/12 bg-cyan-300/[0.025] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-cyan-50">Edit pre-trading contract</div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSlug(null);
                              setDraft(null);
                            }}
                            className="text-xs text-slate-500 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Field label="Question" wide>
                            <input value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="Summary" wide>
                            <input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="Category">
                            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="admin-oracle-input">
                              {["growth","games","streaming","economy","forge","community"].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </Field>
                          <Field label="Resolution source">
                            <input value={draft.sourceLabel} onChange={(event) => setDraft({ ...draft, sourceLabel: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="Trading closes">
                            <input type="datetime-local" value={draft.closesAt} onChange={(event) => setDraft({ ...draft, closesAt: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="Resolve by">
                            <input type="datetime-local" value={draft.resolvesAt} onChange={(event) => setDraft({ ...draft, resolvesAt: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="YES seed">
                            <input inputMode="numeric" value={draft.seedYesMarks} onChange={(event) => setDraft({ ...draft, seedYesMarks: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="NO seed">
                            <input inputMode="numeric" value={draft.seedNoMarks} onChange={(event) => setDraft({ ...draft, seedNoMarks: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="Future WOLO ceiling" wide>
                            <input inputMode="numeric" value={draft.maxPoolWolo} onChange={(event) => setDraft({ ...draft, maxPoolWolo: event.target.value })} className="admin-oracle-input" />
                          </Field>
                          <Field label="YES rule" wide>
                            <textarea value={draft.resolutionRule} onChange={(event) => setDraft({ ...draft, resolutionRule: event.target.value })} className="admin-oracle-input min-h-28" />
                          </Field>
                          <Field label="VOID rule" wide>
                            <textarea value={draft.voidRule} onChange={(event) => setDraft({ ...draft, voidRule: event.target.value })} className="admin-oracle-input min-h-24" />
                          </Field>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void saveEdit(market)}
                            disabled={Boolean(busy)}
                            className="rounded-full bg-cyan-200 px-5 py-2 text-xs font-black text-slate-950 hover:bg-cyan-100 disabled:opacity-40"
                          >
                            Save exact contract
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
                  No Oracle markets exist.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-[2rem] border border-rose-300/12 bg-[radial-gradient(circle_at_100%_0%,rgba(244,63,94,0.10),transparent_35%),rgba(2,6,23,0.72)] p-6">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-rose-100/65">
                <Trash2 className="h-4 w-4" />
                Legacy cleanup
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Remove the original stock markets.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                This control knows the five exact seed slugs from the original Oracle migration. It cannot sweep future citizen-created markets.
              </p>
              <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="text-3xl font-semibold text-white">{admin.legacyStockCount}</div>
                <div className="mt-1 text-xs text-slate-500">legacy markets still present</div>
              </div>
              <button
                type="button"
                onClick={() => void deleteLegacyStock()}
                disabled={admin.legacyStockCount === 0 || Boolean(busy)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300/24 bg-rose-400/[0.08] px-5 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-400/14 disabled:opacity-35"
              >
                <Trash2 className="h-4 w-4" />
                Delete all legacy stock
              </button>
            </section>

            <section className="rounded-[2rem] border border-cyan-200/10 bg-slate-950/68 p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/55">
                Page command
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Public Oracle controls.</h2>
              <div className="mt-4 grid gap-3">
                <CommandLink href="/oracle" icon={Eye} title="Public Oracle" copy="Inspect the live market floor and B/A/E presentation." />
                <CommandLink href="/admin/hero-studio" icon={Sparkles} title="Hero Studio" copy="Control the visual hero and page artwork." />
                <CommandLink href="/admin" icon={Gauge} title="B/A/E analytics" copy="See signed-in users' explicit and effective page-view choices." />
              </div>
              <div className="mt-5 rounded-2xl border border-amber-300/12 bg-amber-400/[0.04] p-4">
                <div className="text-xs font-semibold text-amber-100">Settlement stage</div>
                <div className="mt-1 text-sm text-slate-400">
                  This build is still <strong className="text-white">Oracle Marks</strong>, not final wallet-signed WOLO settlement. The cockpit makes that state visible so paper probability cannot be mistaken for chain truth.
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/68 p-6">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/60">
            <FileClock className="h-4 w-4" />
            Citizen proposal queue
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Approve the questions worth trading.</h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {proposals.length ? proposals.map((proposal) => {
              const reviewable = ["proposed", "rule_review"].includes(proposal.status);
              return (
                <article key={proposal.publicId} className="rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${tone(proposal.status)}`}>
                        {pretty(proposal.status)}
                      </span>
                      <h3 className="mt-3 text-base font-semibold text-white">{proposal.question}</h3>
                      <p className="mt-2 text-xs text-slate-500">
                        {proposal.creatorLabel} · {proposal.category} · closes {time(proposal.closesAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3 text-xs leading-5 text-slate-400">
                    <strong className="text-slate-200">{proposal.sourceLabel}</strong>
                    <div className="mt-2">{proposal.resolutionRule}</div>
                  </div>
                  {reviewable ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void reviewProposal(proposal, "approved")}
                        disabled={Boolean(busy)}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-300/18 bg-emerald-400/[0.06] px-4 py-2 text-xs text-emerald-100 hover:bg-emerald-400/12 disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewProposal(proposal, "rejected")}
                        disabled={Boolean(busy)}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-300/18 bg-rose-400/[0.06] px-4 py-2 text-xs text-rose-100 hover:bg-rose-400/12 disabled:opacity-40"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 p-8 text-sm text-slate-500">
                No citizen proposals yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/68 p-6">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
            <CircleGauge className="h-4 w-4" />
            Oracle audit wire
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">Recent operator and citizen events.</h2>
          <div className="mt-5 divide-y divide-white/6 overflow-hidden rounded-[1.5rem] border border-white/8">
            {recentEvents.slice(0, 40).map((event) => (
              <div key={event.id} className="grid gap-2 bg-black/15 px-4 py-3 md:grid-cols-[10rem_1fr_auto] md:items-center">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-100/60">{pretty(event.eventType)}</div>
                  <div className="mt-1 text-[10px] text-slate-600">{event.actorLabel ?? "system"}</div>
                </div>
                <div className="text-xs leading-5 text-slate-300">{event.detail}</div>
                <div className="text-[10px] text-slate-600">{time(event.createdAt)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx global>{`
        .admin-oracle-input {
          margin-top: 0.45rem;
          min-height: 2.75rem;
          width: 100%;
          border-radius: 0.8rem;
          border: 1px solid rgba(255,255,255,0.10);
          background: #030711;
          padding: 0.7rem 0.85rem;
          color: white;
          outline: none;
        }
        .admin-oracle-input:focus {
          border-color: rgba(165,243,252,0.35);
          box-shadow: 0 0 0 3px rgba(34,211,238,0.05);
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function CommandLink({
  href,
  icon: Icon,
  title,
  copy,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  copy: string;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 hover:border-cyan-200/18 hover:bg-cyan-300/[0.04]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.05] text-cyan-100">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{copy}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-100" />
    </Link>
  );
}
