"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe2, RefreshCw, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import type { LanguageAudit } from "@/lib/i18n/translationAudit";

type Snapshot = {
  kind: string;
  shippingLocales: number;
  rows: LanguageAudit[];
};
function Count({ lane }: { lane: LanguageAudit["shell"] }) {
  return (
    <div className="space-y-1">
      <div className="font-bold tabular-nums text-white">{lane.coveragePercent.toFixed(1)}%</div>
      <div className="h-1.5 w-32 max-w-full overflow-hidden rounded-full bg-slate-700">
        <div className="h-full bg-amber-300" style={{ width: lane.coveragePercent + "%" }} />
      </div>
      <div className="text-[10px] text-slate-400">{lane.translated}/{lane.expected} keys · {lane.missing} missing</div>
    </div>
  );
}
export default function TranslationCommandPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/translations", { cache: "no-store" });
      const payload = await response.json() as Snapshot & { detail?: string };
      if (!response.ok || payload?.kind !== "aoe2war-translation-control-tower") {
        throw new Error(payload?.detail || "Translation evidence unavailable or admin session required");
      }
      setSnapshot(payload);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Translation evidence unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const rows = useMemo(() =>
    (snapshot?.rows ?? []).filter((row) =>
      [row.code, row.nativeName, row.englishName].join(" ").toLowerCase().includes(query.toLowerCase())
    ), [snapshot, query]);

  return (
    <main className="mx-auto max-w-[94rem] space-y-6 px-4 py-8 text-white sm:px-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/user-list" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-amber-200">
            <ArrowLeft className="h-4 w-4" /> BACK TO COMMAND TOWER
          </Link>
          <p className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.25em] text-amber-200">
            <Globe2 className="h-5 w-5" /> INTERNATIONAL COMMAND / ADMIN ONLY
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Translation Control Tower</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Committed translations measured against canonical English. Missing strings and expansion readiness,
            with unmeasured routes and AI/chat quality explicitly marked unknown.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-amber-100 disabled:opacity-40">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh evidence
        </button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Public languages</p>
          <p className="mt-3 text-2xl font-bold">{snapshot?.shippingLocales ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-400">Committed shell and homepage catalogs</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Expansion priority</p>
          <p className="mt-3 text-xl font-bold">Türkçe · Ελληνικά · Français</p>
          <p className="mt-1 text-xs text-slate-400">Turkish and Greek are not public yet. French is already selectable.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Full-site verified</p>
          <p className="mt-3 text-xl font-bold">NOT AUDITED</p>
          <p className="mt-1 text-xs text-slate-400">Catalog completeness is not whole-site translation quality.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[.05] px-5 py-4 text-xs leading-relaxed text-amber-100">
        <ShieldCheck className="mr-2 inline h-4 w-4" />
        READ ONLY · No user chats, keys, wallets or funds exposed. Coverage is source-key presence,
        not verified native language, full-route coverage, runtime AI availability or freshness.
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#090e19]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold">Language readiness</h2>
            <p className="mt-1 text-xs text-slate-400">Priority languages first. Missing-key regressions are visible immediately after a release.</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-slate-300">
            <Search className="h-4 w-4" />
            <span className="sr-only">Find a language</span>
            <input aria-label="Find a language" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter languages" className="w-40 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[830px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[.04] text-[10px] uppercase tracking-widest text-slate-400">
              <tr><th className="px-4 py-3">Language</th><th className="px-4 py-3">Public status</th><th className="px-4 py-3">Global shell</th><th className="px-4 py-3">Homepage</th><th className="px-4 py-3">Other routes / chat</th><th className="px-4 py-3">Next action</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-white/[.06] align-top hover:bg-white/[.03]">
                  <td className="px-4 py-4">
                    <p className="font-bold text-white">{row.nativeName}</p>
                    <p className="mt-1 text-xs text-slate-400">{row.englishName} · {row.code}</p>
                    {row.priority && <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-amber-200">Priority {row.priority}</p>}
                  </td>
                  <td className="px-4 py-4 text-xs">{row.shipped ? "SHIPPED · catalog" : "PLANNED · gated"}</td>
                  <td className="px-4 py-4"><Count lane={row.shell} /></td>
                  <td className="px-4 py-4"><Count lane={row.home} /></td>
                  <td className="px-4 py-4 text-xs text-slate-400">
                    <div>Whole site: unknown</div>
                    <div className="mt-1">Chat quality: not audited</div>
                    {row.siteCopyEntries !== null && <div className="mt-1 text-amber-100">
                      Site-copy entries: {row.siteCopyEntries.toLocaleString()} (denominator unknown)
                    </div>}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-300">
                    {row.shipped
                      ? row.shell.missing || row.home.missing
                        ? "Repair missing catalog keys"
                        : "Audit routes, native copy and freshness"
                      : "Translate real catalogs, QA and certify before public launch"}
                    {row.shell.missingExamples[0] && <p className="mt-2 break-all text-[10px] text-amber-300">Missing: {row.shell.missingExamples[0]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && snapshot && rows.length === 0 && <p className="p-5 text-sm text-slate-400">No matching languages.</p>}
      </section>
      <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5 text-xs leading-relaxed text-slate-300">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-white">
          <ShieldAlert className="h-5 w-5 text-amber-200" /> Remaining work
        </h2>
        <p className="mt-2">Turkish and Greek need real reviewed catalogs, account preference wiring, key-route migration and tests. French has committed shell/home catalogs but requires route-level completion and native-speaker checks. Dynamic chat translation and AI provider failures need independent diagnostics. A count of translated strings does not attest their age or meaning.</p>
      </div>
    </main>
  );
}
