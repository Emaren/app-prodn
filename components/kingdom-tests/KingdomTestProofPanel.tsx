"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { inspectKingdomTestsEvidence, type EvidenceAssessment } from "@/lib/kingdomTestsEvidence";

const READ_DEADLINE_MS = 10_000;

/** An opt-in second read, never an extra poller or certifying authority. */
export default function KingdomTestProofPanel() {
  const [proof, setProof] = useState<EvidenceAssessment | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function inspect() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState("loading");
    setProof(null);
    setError(null);
    const deadline = window.setTimeout(() => controller.abort(), READ_DEADLINE_MS);
    try {
      const response = await fetch("/api/general-inspections", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Inspection reader unavailable");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 256_000) throw new Error("Oversized evidence");
      const body = await response.text();
      if (body.length > 256_000) throw new Error("Oversized evidence");
      const payload: unknown = JSON.parse(body);
      if (active.current !== controller || controller.signal.aborted) return;
      setProof(inspectKingdomTestsEvidence(payload));
      setState("ready");
    } catch {
      if (active.current !== controller) return;
      setError(controller.signal.aborted ? "Evidence inspection timed out; no prior result was retained." : "Inspection evidence could not be read. No test outcome was inferred.");
      setState("error");
    } finally {
      window.clearTimeout(deadline);
      if (active.current === controller) active.current = null;
    }
  }

  return (
    <section aria-labelledby="kingdom-test-proof-title" className="mx-auto my-5 w-full max-w-[1440px] rounded-2xl border border-cyan-300/15 bg-slate-950 p-5 text-slate-200 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-3xl">
          <p id="kingdom-test-proof-title" className="text-lg font-bold tracking-wide text-cyan-200">TEST EVIDENCE · TRUST BOUNDARY</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">The existing matrix reports <strong>General Inspections readiness checks</strong>, not independently authenticated test executions. A green readiness score, a freshly fetched response, or a declared check does not certify passing tests or a Renaissance page grade.</p>
        </div>
        <button type="button" disabled={state === "loading"} onClick={() => void inspect()} className="rounded-lg border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:opacity-50">
          {state === "loading" ? "Inspecting evidence…" : "Inspect published claims"}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true" className="mt-4 text-sm">
        {state === "idle" && <p>Optional, on-demand source inspection. No additional background polling.</p>}
        {state === "loading" && <p>Reading source claims; no test result is assumed.</p>}
        {state === "error" && <p role="alert" className="text-amber-200">{error}</p>}
        {state === "ready" && proof && <div>
          <p className="font-semibold text-amber-200">{proof.state === "CLAIMS_ONLY" ? "SOURCE CLAIMS · NOT INDEPENDENTLY CERTIFIED" : "EVIDENCE UNAVAILABLE"}</p>
          <p className="mt-1">{proof.reason}</p>
          {proof.state === "CLAIMS_ONLY" && <>
            <p className="mt-3 text-xs text-slate-400">Reported release: <code>{proof.releaseSha?.slice(0, 12) || "UNKNOWN"}</code> · Reported build: <code>{proof.buildVersion || "UNKNOWN"}</code> · Snapshot assembled: {proof.assembledAt || "UNKNOWN"} ({proof.assemblyAge}). These identifiers are source assertions, not deployed-build parity proof.</p>
            <p className="mt-2 text-xs text-slate-400">{proof.checks.length} declared inspection checks. Independently verified executed/pass/fail totals: <strong>UNKNOWN</strong>.</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {proof.checks.map(check => <li key={check.id} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <strong className="block text-sm">{check.label}</strong>
                <span className="text-xs">Reported readiness: {check.reportedState} · Underlying evidence: {check.age}</span>
                <span className="mt-1 block text-xs text-slate-400">{check.at || "No evidence timestamp"} · {check.detail || "No detail"}</span>
              </li>)}
            </ul>
          </>}
        </div>}
      </div>
      <p className="mt-4 text-xs text-slate-400">Source authority: <Link className="underline focus-visible:outline" href="/general-inspections">General Inspections</Link>. Certification authority: <Link className="underline focus-visible:outline" href="/kingdom-index">Kingdom Index</Link>. Individual PASS claims need authenticated, exact-source run receipts and fresh provenance.</p>
    </section>
  );
}
