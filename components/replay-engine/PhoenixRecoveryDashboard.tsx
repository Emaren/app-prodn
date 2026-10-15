import Link from "next/link";
import { ArrowUpRight, Fingerprint, Flame, Layers3, ShieldCheck } from "lucide-react";
import type { PhoenixDashboardSnapshot, PhoenixFamily } from "@/lib/phoenixRecoveryDashboard";
import { WarGraphTime } from "@/components/wargraph/WarGraphTime";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
const families: Record<PhoenixFamily, { label: string; tone: string }> = {
  external_terminal_evidence: { label: "Final artifact needed", tone: "copper" },
  parser_decoder: { label: "Decoder research", tone: "ice" },
  participant_binding: { label: "Identity binding", tone: "neutral" },
  original_artifact_binding: { label: "Original binding", tone: "neutral" },
};
const stateLabels = {
  no_replay_proof: "Original not bound",
  external_required: "Final proof not indexed",
  decoder_gap: "Decoder gap",
  identity_ambiguous: "Identity ambiguous",
  verified_review_required: "Verified · awaiting review",
  promotion_eligible: "Governed promotion eligible",
};
const causeLabels: Record<string, string> = {
  disconnect_or_desync: "Disconnect / desync",
  untrusted_structured_team_result: "Unproven team result",
  winner_missing: "Final proof absent",
  stored_winner_not_canonical_team: "Side conflict",
  other_public_reason: "Other indexed reason",
};

function Value({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return <div className="phoenix-reading">
    <span>{label}</span><strong>{number(value)}</strong><small>{value === null ? "Not measured" : detail}</small>
  </div>;
}

/** A frozen research view. It never refreshes from the live observatory or writes results. */
export default function PhoenixRecoveryDashboard({ snapshot }: { snapshot: PhoenixDashboardSnapshot | null }) {
  if (!snapshot) return <section className="replay-panel p-5 sm:p-7" aria-label="Phoenix recovery research">
    <h2 className="text-lg font-semibold text-stone-100">Phoenix recovery</h2>
    <p className="mt-3 text-sm text-stone-400">Source-bound research snapshot unavailable.</p>
  </section>;
  const { corpus, recovery, measurements, measurement_scope: scope } = snapshot;
  const resultPct = corpus.logical_battles ? corpus.trusted_results / corpus.logical_battles * 100 : 0;
  return <section className="replay-panel phoenix-panel p-5 sm:p-7" aria-labelledby="phoenix-title" data-phoenix-recovery="v1">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="replay-section-number"><Flame size={17} aria-hidden /></span><h2 id="phoenix-title" className="text-xl font-semibold tracking-tight text-stone-100">Phoenix recovery</h2></div>
      <span className="phoenix-snapshot-label">SEALED SNAPSHOT · <WarGraphTime value={snapshot.observed_at} /></span>
    </div>
    <div className="phoenix-overview">
      <div className="phoenix-coverage">
        <div className="phoenix-truth-ring" role="img" aria-label={`Full Battle Truth: ${corpus.full_battle_truth} of ${corpus.logical_battles} logical battles, ${corpus.full_battle_truth_percent.toFixed(2)} percent`} style={{ background: `conic-gradient(#d9b37b ${corpus.full_battle_truth_percent}%, #30343a 0)` }}>
          <div><span>FULL BATTLE TRUTH</span><strong>{corpus.full_battle_truth_percent.toFixed(2)}<small>%</small></strong><span>{number(corpus.full_battle_truth)} / {number(corpus.logical_battles)}</span></div>
        </div>
        <div className="phoenix-result-line">
          <div><span>Trusted winners</span><strong>{number(corpus.trusted_results)}</strong></div>
          <div><span>Unknowns</span><strong className="!text-[#e3bb82]">{number(corpus.unresolved_results)}</strong></div>
          <div className="phoenix-result-bar" role="img" aria-label={`${corpus.trusted_results} trusted and ${corpus.unresolved_results} unknown logical battles`}><i style={{ width: `${resultPct}%` }} /></div>
          <small>Deduplicated logical battles · winner + complete roster required for Full Truth</small>
        </div>
      </div>
      <div className="phoenix-measurements">
        <Value label="New winners · bound audit" value={measurements.new_verified_winners_audit} detail={`${number(scope.audit_cases)} inspected cases`} />
        <div className="phoenix-reading"><span>Recovered · 7 days / all time</span><strong>{number(measurements.new_verified_winners_7_days)} / {number(measurements.new_verified_winners_all_time)}</strong><small>{measurements.new_verified_winners_7_days === null || measurements.new_verified_winners_all_time === null ? "Not measured" : "Verified unknown → known"}</small></div>
        <Value label="Indexed research cases" value={recovery.indexed_history_cases} detail="Bounded ledger coverage" />
        <Value label="Exhausted same-byte cases" value={recovery.exhausted_same_bytes_cases} detail="Retry needs new evidence" />
      </div>
    </div>
    <div className="phoenix-research-grid">
      <div>
        <h3 className="phoenix-chart-title"><Layers3 size={14} aria-hidden /> Evidence opportunities <span>{number(corpus.unresolved_results)} unknowns</span></h3>
        <div className="space-y-4">
          {[...snapshot.opportunities].sort((a, b) => b.count - a.count).map(opportunity => {
            const family = families[opportunity.family];
            return <details key={opportunity.family} className="phoenix-opportunity">
              <summary><span>{family.label}</span><strong>{number(opportunity.count)}</strong><span className="phoenix-expand" aria-hidden>+</span>
                <span className={`phoenix-opportunity-track phoenix-tone-${family.tone}`}><i style={{ width: `${corpus.unresolved_results ? opportunity.count / corpus.unresolved_results * 100 : 0}%` }} /></span>
              </summary>
              <div className="phoenix-opportunity-detail"><p>{opportunity.next_step}</p><div className="mt-3 flex flex-wrap gap-2">{opportunity.game_stats_ids.map(id => <Link key={id} href={`/game-stats/${id}`} className="phoenix-game-link">#{id} <ArrowUpRight size={12} aria-hidden /></Link>)}</div></div>
            </details>;
          })}
        </div>
      </div>
      <div className="phoenix-audit">
        <h3 className="phoenix-chart-title"><Fingerprint size={14} aria-hidden /> Bound original audit <span>{scope.audit_cases === null ? "Not measured" : `${number(scope.audit_cases)} cases`}</span></h3>
        <div className="phoenix-audit-readings">
          <Value label="Originals authenticated" value={measurements.originals_authenticated} detail="SHA-256 + byte length" />
          <Value label="Byte streams at exact EOF" value={measurements.complete_byte_framed_streams} detail="Does not prove game completion" />
          <Value label="Full summary parses" value={measurements.full_summary_parses} detail="Does not prove a winner" />
          <Value label="Header fallback parses" value={measurements.header_fallback_parses} detail="Full summary unavailable" />
          <Value label="Truncated byte streams" value={measurements.truncated_streams} detail="Bound audit only" />
          <Value label="Terminal candidates" value={measurements.terminal_candidates} detail="Independent verification required" />
        </div>
        <div className="phoenix-external"><span>Indexed external candidates</span><strong>{number(measurements.external_artifacts_indexed)}</strong><small>{measurements.external_artifacts_indexed === null ? "Not measured" : "Indexed in this evidence inventory"}</small></div>
        <p className="mt-3 text-[11px] leading-5 text-stone-400">Replay-truncated totals and method yield are not measured across the unknown corpus.</p>
      </div>
    </div>
    <div className="phoenix-causes">
      <h3 className="phoenix-chart-title">Unknown result causes <span>Metadata dispositions · {number(corpus.unresolved_results)} logical battles</span></h3>
      <div className="phoenix-causes-grid">{snapshot.unknown_causes.map(cause => <div key={cause.reason}>
        <div className="mb-2 flex justify-between gap-3 text-xs"><span className="text-stone-300">{causeLabels[cause.reason] ?? cause.reason.replaceAll("_", " ")}</span><strong className="font-mono font-medium text-stone-200">{number(cause.count)}</strong></div>
        <div className="phoenix-opportunity-track" role="img" aria-label={`${causeLabels[cause.reason] ?? cause.reason}: ${cause.count} of ${corpus.unresolved_results} unknown logical battles`}><i style={{ width: `${corpus.unresolved_results ? cause.count / corpus.unresolved_results * 100 : 0}%` }} /></div>
      </div>)}</div>
    </div>
    <details className="phoenix-source">
      <summary><ShieldCheck size={14} aria-hidden /><span>Source & evidence gates</span><span className="ml-auto font-mono">{snapshot.production_source.slice(0, 10)}</span></summary>
      <div className="phoenix-source-content">
        <dl className="phoenix-source-grid">
          <div><dt>Observed</dt><dd><time dateTime={snapshot.observed_at}>{snapshot.observed_at}</time></dd></div>
          <div><dt>Application checkout · not runtime certification</dt><dd>{snapshot.production_source}</dd></div>
          <div><dt>Certified application source</dt><dd>{snapshot.certified_application_source ?? "Not certified by this snapshot"}</dd></div>
          <div><dt>API research source</dt><dd>{snapshot.api_source_sha}</dd></div>
          <div><dt>Immutable inventory SHA-256</dt><dd>{snapshot.snapshot_sha256}</dd></div>
          <div><dt>Audit observed</dt><dd>{scope.audit_observed_at ?? "Not measured"}</dd></div>
        </dl>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(stateLabels).map(([key, label]) => <div key={key} className="flex justify-between gap-3 text-xs text-stone-400"><span>{label}</span><strong className="font-mono text-stone-200">{number(recovery.states[key as keyof typeof recovery.states])}</strong></div>)}</div>
        <p className="mt-5 text-xs text-stone-400">Research candidates only. This view grants no result, betting, settlement or Wolo authority.</p>
      </div>
    </details>
  </section>;
}
