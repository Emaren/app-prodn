import Link from "next/link";
import { readWorkEnvironmentEvidence } from "@/lib/workEnvironmentEvidence";
import { FactoryLiveReceipt } from "@/components/admin/work-environments/FactoryLiveReceipt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function color(remote: "GITHUB_REF_OBSERVED" | "UNKNOWN") {
  return remote === "GITHUB_REF_OBSERVED" ? "text-cyan-200" : "text-amber-200";
}

export async function WorkEnvironmentObservatory() {
  const evidence = await readWorkEnvironmentEvidence();
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
            Two independently owned development benches, one protected production release
            path. Commit SHA is source evidence, not agent presence or deployment.
            Missing and stale evidence stays UNKNOWN.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-cyan-300/30 px-3 py-2">WE2 · Existing PRODUCT</span>
            <span className="rounded-lg border border-violet-300/30 px-3 py-2">WE3 · Independent PRODUCT clone</span>
            <span className="rounded-lg border border-amber-300/30 px-3 py-2">FINANCIAL · Separate, held</span>
          </div>
        </header>

        <FactoryLiveReceipt />

        <section aria-label="Independent source work environments">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-extrabold">Source benches</h2>
            <span className="text-xs text-slate-400">
              GitHub checked {evidence.queriedAt} · Local processes: UNKNOWN
            </span>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
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
                    Session heartbeat: UNKNOWN
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
                    <dt className="text-slate-400">Branch namespace / working branch</dt>
                    <dd className="mt-1 break-all font-mono">{lane.branch}</dd>
                  </div>
                  <div className="border-b border-white/10 pb-3">
                    <dt className="text-slate-400">GitHub branch read</dt>
                    <dd className={"mt-1 font-semibold " + color(lane.remote.state)}>
                      {lane.remote.state === "GITHUB_REF_OBSERVED"
                        ? "GITHUB SOURCE OBSERVED" : "UNKNOWN — no current source proof"}
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
                    <dt className="text-slate-400">Isolation contract</dt>
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

        <section aria-label="Website source review queue"
          className="rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-6">
          <h2 className="text-xl font-bold">Website review queue</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            These links point to the exact GitHub review surfaces; they are not
            live CI, merge approval, session or deployment-status claims.
            Visit GitHub for current checks and commit histories.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["WE3 Admin Observatory", "https://github.com/Emaren/app-prodn/pull/1362", "Authenticated workspace display"],
              ["WE3 Kingdom Traders", "https://github.com/Emaren/app-prodn/pull/1363", "PAPER workshop and strategy research"],
              ["PRODUCT DocsV2 review", "https://github.com/Emaren/app-prodn/pull/1364", "Hall Scribe and Phoenix source reviews"],
              ["A/B review handoff", "https://github.com/Emaren/app-prodn/issues/787", "Pending owners and release gates"],
            ].map(([name, href, purpose]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                className="rounded-xl border border-cyan-300/20 bg-white/5 px-4 py-4 text-cyan-100 hover:border-cyan-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200">
                <span className="block text-sm font-bold">{name}</span>
                <span className="mt-2 block text-xs leading-5 text-slate-300">{purpose}</span>
                <span className="mt-3 block font-mono text-xs text-slate-300">Open GitHub evidence</span>
              </a>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-amber-300/25 bg-slate-950/75 p-6">
            <h2 className="text-xl font-bold">Other session · Storage OS</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              The parallel session owns VPSSentry, Kingdom Atlas, host storage
              and systemd scheduling. WE3 does not modify those repositories,
              their branches, private host data or production timers.
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
              Neither WE2 nor WE3 can automatically release to HEL1. All PRODUCT
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
              ["Before editing", "Confirm isolated WE3 Git directory, branch and clean status"],
              ["Before publishing", "Only session-c/we3-* branches; fast-forward with reviewed PR"],
              ["Before deployment", "B controls one 3032 source; verify rollback and durable T10"],
            ].map(([name, detail]) => (
              <div key={name} className="rounded-xl border border-white/10 p-4">
                <h3 className="font-semibold text-cyan-100">{name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-amber-200">
            Hard-OS isolation is not claimed: WE2 and WE3 currently use the same
            restricted UID650. Their .git object stores, working files, node_modules
            and scratch are separate. Full UID isolation needs a separately admitted
            agent and kernel ACL configuration.
          </p>
        </section>
      </div>
    </section>
  );
}
