"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getRecentSpeedSamples,
  SPEED_SAMPLE_UPDATED_EVENT,
} from "@/lib/speed/clientStore";
import type { SpeedSample } from "@/lib/speed/types";

function formatDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 10) return "<0.01s";
  if (value < 10_000) return `${(value / 1000).toFixed(2)}s`;
  return `${(value / 1000).toFixed(1)}s`;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function navigationLabel(kind: SpeedSample["navigation_kind"]) {
  if (kind === "initial") return "Initial load";
  if (kind === "internal") return "In-site";
  if (kind === "reload") return "Reload";
  if (kind === "back_forward") return "Restore";
  return kind || "Navigation";
}

export default function SpeedObservatory() {
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const [checkMs, setCheckMs] = useState<number | null>(null);
  const [checkBuild, setCheckBuild] = useState("");
  const [checking, setChecking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  const refreshSamples = useCallback(() => {
    setSamples(getRecentSpeedSamples());
  }, []);

  const runLiveCheck = useCallback(async () => {
    setChecking(true);
    const started = performance.now();
    try {
      const response = await fetch(`/api/speed/check?nonce=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as { build_version?: string };
      if (!response.ok) throw new Error("Speed check failed");
      setCheckMs(performance.now() - started);
      setCheckBuild(payload.build_version || "");
    } catch {
      setCheckMs(null);
      setCheckBuild("");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshSamples();
    void runLiveCheck();

    const handleSample = () => refreshSamples();
    window.addEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
    return () => window.removeEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
  }, [refreshSamples, runLiveCheck]);

  const explicit = useMemo(
    () =>
      samples.filter(
        (sample) =>
          sample.ready_source === "explicit" &&
          sample.valid_for_aggregation &&
          !sample.visibility_tainted &&
          typeof sample.ready_ms === "number",
      ),
    [samples],
  );

  const freshExplicit = useMemo(
    () => explicit.filter((sample) => sample.navigation_kind !== "back_forward"),
    [explicit],
  );
  const readyValues = freshExplicit
    .map((sample) => sample.ready_ms)
    .filter((value): value is number => typeof value === "number");
  const latest = explicit[0] || samples[0] || null;
  const p50 = percentile(readyValues, 0.5);
  const p75 = percentile(readyValues, 0.75);

  const sendReport = useCallback(async () => {
    if (!latest) return;
    setReporting(true);
    setReportMessage("");
    try {
      const response = await fetch("/api/speed/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          sample_id: latest.sample_id,
          route: latest.route,
          recent_sample_ids: samples.slice(0, 20).map((sample) => sample.sample_id),
          diagnostic_snapshot: {
            ready_ms: latest.ready_ms,
            ttfb_ms: latest.ttfb_ms,
            lcp_ms: latest.lcp_ms,
            inp_ms: latest.inp_ms,
            cls: latest.cls,
            slowest_api_path: latest.slowest_api_path,
            slowest_api_ms: latest.slowest_api_ms,
            top_resources: latest.details?.top_resources || [],
            top_api_requests: latest.details?.top_api_requests || [],
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { report_id?: string; detail?: string } | null;
      if (!response.ok) throw new Error(payload?.detail || "Could not send Speed Report");
      setReportMessage(payload?.report_id ? `Speed Report sent · ${payload.report_id}` : "Speed Report sent");
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Could not send Speed Report");
    } finally {
      setReporting(false);
    }
  }, [latest, samples]);

  return (
    <main className="min-h-screen bg-[#06070a] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[30px] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(255,255,255,0.025))] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">AoE2WAR Speed</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Your Speed Observatory</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Real measurements from this browser session. Authoritative Ready is recorded only after a marked primary interface reports itself usable.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Back to AoE2WAR
              </Link>
              <button type="button" onClick={() => void runLiveCheck()} disabled={checking} className="rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-300/15 disabled:opacity-50">
                {checking ? "Checking…" : "Run live check"}
              </button>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Latest Ready", latest?.ready_source === "explicit" ? formatDuration(latest.ready_ms) : "No proof yet", latest?.route || "Navigate an authoritative route"],
            ["Session median", formatDuration(p50), `${readyValues.length} fresh authoritative sample${readyValues.length === 1 ? "" : "s"}`],
            ["Session p75", formatDuration(p75), "Fresh initial/internal/reload samples only"],
            ["Live round trip", checkMs == null ? "—" : formatDuration(checkMs), checkBuild ? `Build ${checkBuild}` : "Browser → AoE2WAR → browser"],
          ].map(([label, value, helper]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
              <p className="mt-2 text-xs leading-5 text-white/45">{helper}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">This tab’s recent measurements</h2>
              <p className="mt-1 text-sm text-white/45">Up to 20 sanitized route samples are kept locally in this tab and relayed to the isolated Traffic performance store.</p>
            </div>
            <button type="button" onClick={() => void sendReport()} disabled={!latest || reporting} className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40">
              {reporting ? "Sending…" : "Send Speed Report"}
            </button>
          </div>
          {reportMessage ? <p className="mt-3 text-sm text-amber-100/80">{reportMessage}</p> : null}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-white/35">
                <tr>
                  <th className="pb-3 pr-4">Route</th>
                  <th className="pb-3 pr-4">Experience</th>
                  <th className="pb-3 pr-4">Ready</th>
                  <th className="pb-3 pr-4">Source</th>
                  <th className="pb-3 pr-4">TTFB</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/7">
                {samples.length ? samples.map((sample) => (
                  <tr key={sample.sample_id} className="text-white/70">
                    <td className="py-3 pr-4 font-medium text-white">{sample.route}</td>
                    <td className="py-3 pr-4">{navigationLabel(sample.navigation_kind)}</td>
                    <td className="py-3 pr-4">{formatDuration(sample.ready_ms)}</td>
                    <td className="py-3 pr-4">{sample.ready_source}</td>
                    <td className="py-3 pr-4">{formatDuration(sample.ttfb_ms)}</td>
                    <td className="py-3">{sample.valid_for_aggregation ? "Valid" : sample.invalid_reason || "Excluded"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-10 text-center text-white/40">No Speed samples in this browser tab yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
