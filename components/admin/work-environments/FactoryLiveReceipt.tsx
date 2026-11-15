"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { parseProductDeploymentClocks } from "@/lib/productReleaseEvidence";

type FactoryProof = {
  state: "VERIFIED_PUBLIC_SOURCE" | "STALE" | "UNKNOWN";
  source: string | null;
  buildId: string | null;
  observedAt: string | null;
  acceptedMs: number | null;
  firstLiveMs: number | null;
  invocationKind: "warm" | "cold" | null;
};

const UNKNOWN: FactoryProof = {
  state: "UNKNOWN", source: null, buildId: null, observedAt: null,
  acceptedMs: null, firstLiveMs: null, invocationKind: null,
};

export function FactoryLiveReceipt() {
  const [proof, setProof] = useState<FactoryProof>(UNKNOWN);
  const [busy, setBusy] = useState(false);
  const read = useCallback(async (signal: AbortSignal) => {
    setBusy(true);
    try {
      const response = await fetch("/factory/status.json", {
        method: "GET", cache: "no-store", credentials: "same-origin", signal,
      });
      if (!response.ok) throw new Error("Factory unavailable");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object") throw new Error("Malformed Factory");
      const body = value as {
        schema?: unknown;
        generatedAt?: unknown;
        liveRelease?: { id?: unknown; buildId?: unknown; status?: unknown };
        deploymentInvocation?: unknown;
      };
      if (body.schema !== "aoe2war.factory.public.v1"
        || typeof body.liveRelease?.id !== "string"
        || !/^[0-9a-f]{40}$/.test(body.liveRelease.id)
        || typeof body.liveRelease.buildId !== "string"
        || body.liveRelease.status !== "pass"
        || !/^[A-Za-z0-9_-]{8,64}$/.test(body.liveRelease.buildId)
        || typeof body.generatedAt !== "string")
        throw new Error("Unverified Factory identity");
      const time = Date.parse(body.generatedAt);
      if (!Number.isFinite(time) || Date.now() - time > 15 * 60_000
        || time > Date.now() + 60_000) {
        setProof({ state: "STALE", source: null, buildId: null,
          observedAt: body.generatedAt, acceptedMs: null,
          firstLiveMs: null, invocationKind: null });
        return;
      }
      const clocks = parseProductDeploymentClocks(
        body.deploymentInvocation, body.liveRelease.id, body.liveRelease.buildId,
      );
      setProof({
        state: "VERIFIED_PUBLIC_SOURCE",
        source: body.liveRelease.id, buildId: body.liveRelease.buildId,
        observedAt: body.generatedAt,
        acceptedMs: clocks.durableAcceptanceMs,
        firstLiveMs: clocks.firstVerifiedLiveMs,
        invocationKind: clocks.deploymentKind,
      });
    } catch {
      if (!signal.aborted) setProof(UNKNOWN);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [read]);

  return (
    <section aria-label="Production source and release evidence"
      className="rounded-3xl border border-emerald-300/20 bg-slate-950/80 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Public Factory witness</p>
          <h2 className="mt-2 text-xl font-bold">One production lane. Two development benches.</h2>
        </div>
        <button type="button" disabled={busy} onClick={() => {
          const controller = new AbortController();
          void read(controller.signal);
        }} className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Reading…" : "Refresh Factory"}
        </button>
      </div>
      <p role="status" className="mt-4 text-sm font-semibold text-slate-100">
        {proof.state === "VERIFIED_PUBLIC_SOURCE" ? "Fresh public source evidence" :
          proof.state === "STALE" ? "STALE — no current production claim" :
          "UNKNOWN — no verified live source"}
      </p>
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-white/5 p-3">
          <p className="text-slate-400">Deployed SOURCE SHA (not GitHub main)</p>
          <p className="mt-1 break-all font-mono text-cyan-100">{proof.source || "UNKNOWN"}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-white/5 p-3">
          <p className="text-slate-400">Verified BUILD_ID</p>
          <p className="mt-1 break-all font-mono text-cyan-100">{proof.buildId || "UNKNOWN"}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Source-matched deployment stopwatch">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-slate-300">Command start → first verified live</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">
            {proof.firstLiveMs !== null ? (proof.firstLiveMs / 1000).toFixed(1) + "s" : "UNKNOWN"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-slate-300">Command start → durable acceptance</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">
            {proof.acceptedMs !== null ? (proof.acceptedMs / 1000).toFixed(1) + "s" : "UNKNOWN"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">
        Factory generated: {proof.observedAt || "UNKNOWN"} · Invocation type:
        {" "}{proof.invocationKind ?? "UNKNOWN"}.
        Stopwatch values require matching SOURCE SHA, BUILD_ID, full-coverage public
        invocation schema and bounded durations. This is not a signed root permit or
        a claim that a GitHub branch is deployed.
      </p>
      <Link href="/factory" className="mt-4 inline-block text-sm font-semibold text-emerald-200 underline">
        Open public Factory console
      </Link>
    </section>
  );
}
