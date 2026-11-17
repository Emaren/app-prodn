"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  WORK_ENVIRONMENT_SCHEMA,
  WORK_ENVIRONMENTS,
  readWorkEnvironmentEvidence,
} from "@/lib/workEnvironmentEvidence";
import { FactoryLiveReceipt } from "@/components/admin/work-environments/FactoryLiveReceipt";
import { KingdomAtlasDatedEvidence } from "@/components/admin/work-environments/KingdomAtlasDatedEvidence";
import { WebsiteReviewBoard } from "@/components/admin/work-environments/WebsiteReviewBoard";

function color(remote: "GITHUB_REF_OBSERVED" | "UNKNOWN") {
  return remote === "GITHUB_REF_OBSERVED" ? "text-cyan-200" : "text-amber-200";
}

type WorkEvidence = Awaited<ReturnType<typeof readWorkEnvironmentEvidence>>;

const initialEvidence: WorkEvidence = {
  schema: WORK_ENVIRONMENT_SCHEMA,
  queriedAt: "UNKNOWN",
  lanes: WORK_ENVIRONMENTS.map(lane => ({
    ...lane,
    remote: {
      state: "UNKNOWN" as const, headSha: null, observedAt: null,
      reason: lane.id === "WE1" ? "FINANCIAL_SOURCE_QUARANTINED" as const :
        lane.id === "WE3" ? "PRIVATE_SOURCE_NOT_CONNECTED" as const : "NOT_OBSERVED" as const,
    },
    status: lane.id === "WE1" ? "BLOCKED" as const : "UNKNOWN" as const,
    hostReceipt: "NOT_AVAILABLE" as const,
    localHead: null, localTree: null, localDirtyState: "UNKNOWN" as const,
    physicalRuntime: "UNKNOWN" as const, ownerPermit: "UNKNOWN" as const,
    storageAdmission: "UNKNOWN" as const,
  })),
  sessionPresence: "UNKNOWN",
  localDirtyState: "UNKNOWN",
  releaseAuthority: "EXACT_SOURCE_B_PRODUCTION_CONTROLLER_ONLY",
};

export function WorkEnvironmentObservatory() {
  const [evidence, setEvidence] = useState<WorkEvidence>(initialEvidence);
  useEffect(() => {
    let active = true;
    void readWorkEnvironmentEvidence().then(result => {
      if (active) setEvidence(result);
    });
    return () => { active = false; };
  }, []);
  return (
    <section id="work-environments" className="bg-[#050b17] px-4 py-8 text-slate-50 sm:px-7 xl:px-10">
      <div className="mx-auto max-w-[1480px] space-y-7">
        <header className="rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,.16),transparent_45%),linear-gradient(145deg,#132038,#040812)] p-6 sm:p-9">
          <Link href="/admin/central-command"
            className="text-sm text-cyan-200 underline">Central Command</Link>
          <p className="mt-7 text-xs font-bold uppercase tracking-[.28em] text-cyan-200">
            Private PRODUCT · Workspace OS
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
            Work Environment Observatory
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            Three logical environments, two separately owned PRODUCT source lanes and one
            quarantined FINANCIAL boundary. Public GitHub source is not local checkout,
            authenticated session, Factory permit, deployment or storage recovery.
            Private Trader state stays UNKNOWN until a separately authorized receipt exists.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-amber-300/30 px-3 py-2">WE1 · Financial quarantined</span>
            <span className="rounded-lg border border-cyan-300/30 px-3 py-2">WE2 · Website + Factory</span>
            <span className="rounded-lg border border-violet-300/30 px-3 py-2">WE3 · Private Kingdom Traders</span>
          </div>
        </header>

        <FactoryLiveReceipt />

        <KingdomAtlasDatedEvidence />

        <section aria-label="Independent source work environments">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-extrabold">Source benches</h2>
            <span className="text-xs text-slate-400">
              Browser GitHub requested {evidence.queriedAt} · Branch observations cached up to 5 min · Local processes: UNKNOWN
            </span>
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            {evidence.lanes.map(lane => (
              <article key={lane.id}
                className="min-w-0 rounded-3xl border border-white/15 bg-slate-950/80 p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.24em] text-slate-400">
                      {lane.id} · {lane.namespace}
                    </p>
                    <h3 className="mt-2 text-2xl font-bold">{lane.label}</h3>
                  </div>
                  <span className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-amber-200">
                    {lane.status} · Session heartbeat: UNKNOWN
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{lane.description}</p>
                <dl className="mt-5 space-y-3 text-xs">
                  <div className="border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Assigned scope</dt>
                    <dd className="mt-1 text-sm text-slate-100">{lane.focus}</dd>
                  </div>
                  <div className="border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Git repository</dt>
                    <dd className="mt-1 font-mono">{lane.repo}</dd>
                  </div>
                  <div className="border-b border-white/10 pb-3">
                    <dt className="text-slate-400">Branch namespace / configured source ref</dt>
                    <dd className="mt-1 break-all font-mono">{lane.namespace} · {lane.branch}</dd>
                  </div>
                  <div className="border-b border-white/10 pb-3">
                    <dt className="text-slate-400">GitHub branch read</dt>
                    <dd className={"mt-1 font-semibold " + color(lane.remote.state)}>
                      {lane.remote.state === "GITHUB_REF_OBSERVED"
                        ? "GITHUB SOURCE OBSERVED" :
                        lane.remote.reason === "PRIVATE_SOURCE_NOT_CONNECTED"
                          ? "UNKNOWN — private Traders feed not connected" :
                        lane.remote.reason === "FINANCIAL_SOURCE_QUARANTINED"
                          ? "BLOCKED — protected FINANCIAL source" :
                          "UNKNOWN — no current source proof"}
                    </dd>
                    <dd className="mt-1 break-all font-mono text-slate-200">
                      {lane.remote.headSha ?? "No verified remote HEAD"}
                    </dd>
                    <dd className="mt-1 text-slate-300">
                      {lane.remote.observedAt
                        ? "Ref read at " + lane.remote.observedAt
                        : "No current GitHub branch observation"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Source owner / isolation contract</dt>
                    <dd className="mt-1 font-mono">{lane.sourceOwner}</dd>
                    <dd className="mt-1 text-slate-300">Local HEAD, dirty state, physical runtime, storage and permit: UNKNOWN without an authenticated host receipt</dd>
                    <dd className="mt-1 font-mono text-xs text-cyan-200">{lane.isolation}</dd>
                    <dd className="mt-2 leading-5 text-slate-400">{lane.scope}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-3 text-sm">
                  <a href={lane.sourceLink} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-cyan-300/30 px-3 py-2 text-cyan-100 hover:bg-cyan-300/10">
                    GitHub source
                  </a>
                  <a href="https://github.com/Emaren/app-prodn/issues/1360"
                    target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-white/20 px-3 py-2 text-slate-200 hover:bg-white/10">
                    Ownership contract
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <WebsiteReviewBoard />

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-amber-300/25 bg-slate-950/75 p-6">
            <h2 className="text-xl font-bold">Other session · Storage OS</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              WE2 owns the website, Factory and the existing VPSSentry Storage OS.
              WE3 alone owns its separate private Traders repository and PAPER journals.
              Neither lane can modify the WE1 financial estate.
              Historical scan claims are not an authenticated live status feed.
            </p>
            <a href="https://github.com/Emaren/VPSSentry"
              target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-cyan-200 underline">
              Storage OS source repository
            </a>
          </article>
          <article className="rounded-3xl border border-white/15 bg-slate-950/75 p-6">
            <h2 className="text-xl font-bold">One release authority</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Neither website nor Traders source can automatically release to HEL1. All website
              changes travel through reviewed source, exact-head CI, independent
              Linux artifact proof, an owner-scoped B permit, and the root T10
              release/rollback controller. FINANCIAL authorization remains denied.
            </p>
            <Link href="/factory" className="mt-4 inline-block text-sm text-cyan-200 underline">
              Source-distinct Factory evidence
            </Link>
          </article>
        </section>

        <section aria-label="Terminal visibility and Git lane rules"
          className="rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-6">
          <h2 className="text-xl font-bold">Terminal &amp; worktree visibility</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Commands run through remote Desktop Commander do not appear automatically
            in the founder’s local terminal. Keep their exact output as receipts and
            link significant GitHub PR/issue evidence here. This page performs
            no shell commands, branch changes, deployment, cleanup or scheduling.
          </p>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            {[
              ["Before editing", "Confirm source owner, repository, UID and clean/staged worktree state"],
              ["Before publishing", "WE2 website and WE3 private Traders sources use separate approved branches and PRs"],
              ["Before deployment", "B controls one 3032 source; verify rollback and durable T10"],
            ].map(([name, detail]) => (
              <div key={name} className="rounded-xl border border-white/10 p-4">
                <h3 className="font-semibold text-cyan-100">{name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-amber-200">
            Source repository separation is not separate kernel UID proof. WE2 and WE3
            may share restricted UID650; no browser GitHub result certifies local
            filesystem access, a running agent, clean Git state or Trader risk gates.
          </p>
        </section>
      </div>
    </section>
  );
}
