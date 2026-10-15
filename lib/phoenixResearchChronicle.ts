/**
 * Bounded PUBLIC research chronicle — a reviewed transcription of Oct 15
 * api-prodn PR #46 research-memory and Phoenix XI. Never a result resolver.
 *
 * Do not infer total all-time experiments from these entries: their scoped
 * ledger does not claim every private/retired/native attempt was indexed.
 * No filesystem paths, Steam IDs, private receipts, wager rows or raw bytes.
 */
export const CHRONICLE_API_SOURCE = "e6093762fad055a1d8e8dc3b64df9e9acf36ccab";
export const CHRONICLE_RESEARCH_SEAL = "2026-10-15T02:56:04.200Z";
export const CHRONICLE_AUDIT_SEAL = "2026-10-15T02:52:48.686Z";
export const CHRONICLE_SOURCE_URL = "https://github.com/Emaren/api-prodn/pull/46";
export const CHRONICLE_AUDIT_URL =
  "https://github.com/Emaren/api-prodn/blob/e6093762fad055a1d8e8dc3b64df9e9acf36ccab/docs/replay-intelligence/phoenix-xi-recovery-2026-10-14.md";

export type ChronicleStatus = "retired" | "blocked" | "control";
export type ChronicleCase = {
  id: number;
  experiment: string;
  status: ChronicleStatus;
  method: string;
  observed: string;
  nextProof: string;
};

export const CHRONICLE_CASES: readonly ChronicleCase[] = [
  {
    id: 13017, experiment: "phoenix.ix.header-final-snapshot.v1", status: "retired",
    method: "Initial-world clock and resource hypothesis; representative ID from a four-target control",
    observed: "Zero initial clocks and shared resource values did not distinguish winning from losing controls. No terminal outcome was decoded.",
    nextProof: "A new, independently verified completed-world field/control; not the same initial-state bytes.",
  },
  {
    id: 42534, experiment: "phoenix.x.map57-terminal-42534.v1", status: "retired",
    method: "Map 57 parser compatibility and independent whole-stream framing",
    observed: "One additional full summary parse, zero postgames/resignations, and an unresolved disconnect/identity veto; no new winner.",
    nextProof: "A genuinely new decisive terminal signal with complete participants and sides.",
  },
  {
    id: 42822, experiment: "historical.retired.42822.v1", status: "retired",
    method: "Existing complete-body terminal review",
    observed: "Disconnect exits, no postgame proof, and unresolved sides. Repeating these bytes cannot settle the match.",
    nextProof: "Independent final result proof with complete identity and side binding.",
  },
  {
    id: 42716, experiment: "historical.retired.42716.v1", status: "retired",
    method: "Free-for-all departure/survivor hypothesis",
    observed: "One player departed but play continued; there was no proved postgame result.",
    nextProof: "A separately authenticated completed FFA final state.",
  },
  {
    id: 42614, experiment: "historical.retired.42614.v1", status: "retired",
    method: "HDsave 12.36 extended-exit decoder",
    observed: "Eight trailing bytes lacked a matching terminal-positive control; other save versions cannot supply these semantics.",
    nextProof: "A known-result control with the exact version and independently proven exit layout.",
  },
  {
    id: 12862, experiment: "historical.retired.12862.v1", status: "retired",
    method: "Existing complete-body terminal-marker review",
    observed: "No decisive result markers; desync and incomplete-completion evidence veto the outcome.",
    nextProof: "New authenticated final evidence, not a renamed replay scan.",
  },
  {
    id: 25620, experiment: "historical.retired.25620.v1", status: "retired",
    method: "Opposing-side resignation negative control",
    observed: "Both opposing sides' voluntary exits conflict. The strict referee correctly abstains rather than inventing a winner.",
    nextProof: "Independently resolved ending and side semantics with all contradictory signals addressed.",
  },
  {
    id: 25590, experiment: "phoenix.x.final-artifact-25590.v1", status: "blocked",
    method: "Four-player, exact-battle external final evidence",
    observed: "The original is authenticated and the roster is complete, but no decisive final artifact is indexed. Conflicting date claims remain preserved.",
    nextProof: "New scoreboard, final VOD frame, or alternate clean replay; bind the exact game, all players, sides and restart/desync state.",
  },
  {
    id: 25324, experiment: "phoenix.x.saved-world-control-25324.v1", status: "blocked",
    method: "Saved-world terminal-state hypothesis",
    observed: "The saved chapter occurs early in a longer game. Its world state is not an independently proven final state.",
    nextProof: "A known finished/unfinished saved-world control pair and validated terminal fields.",
  },
  {
    id: 12284, experiment: "phoenix.x.ai-bookkeeping-control-12284.v1", status: "control",
    method: "Post-AI object and bookkeeping decoder control",
    observed: "A result-known structural control. Later object layout remains undecoded; it cannot be counted as a recovered unknown.",
    nextProof: "Version-matched layout/control, bounded object extents and truncation negatives.",
  },
  {
    id: 54108, experiment: "phoenix.xi.exact-tail-disconnect-54108.v1", status: "retired",
    method: "Exact-EOF disconnect counterevidence audit",
    observed: "Complete byte framing, 18 disconnect-marked exits, zero voluntary exits and no postgame. No hidden tail.",
    nextProof: "New exact-battle final evidence or a different, independently controlled decoder method.",
  },
  {
    id: 54100, experiment: "phoenix.xi.exact-tail-disconnect-54100.v1", status: "retired",
    method: "Exact-EOF disconnect counterevidence audit",
    observed: "Complete byte framing, 15 disconnect-marked exits, zero voluntary exits and no postgame. No hidden tail.",
    nextProof: "New exact-battle final evidence or a different, independently controlled decoder method.",
  },
  {
    id: 54090, experiment: "phoenix.xi.exact-tail-disconnect-54090.v1", status: "retired",
    method: "Exact-EOF disconnect counterevidence audit",
    observed: "Complete byte framing, 12 disconnect-marked exits, zero voluntary exits and no postgame. No hidden tail.",
    nextProof: "New exact-battle final evidence or a different, independently controlled decoder method.",
  },
] as const;

/** Exact 25 original IDs from the independently bounded Phoenix XI audit.
 *  Overlap with the 13 research records is expected and must not be added
 *  to any all-time attempt count.
 */
export const CHRONICLE_AUDITED_IDS = [
  25590, 25324, 54108, 54100, 54090, 47446, 46806, 45859, 45796,
  45082, 45056, 45045, 43163, 42386, 42382, 42378, 42351, 42350,
  42328, 42326, 42316, 42314, 42313, 42311, 42304,
] as const;

export const CHRONICLE_MILESTONES = [
  {
    period: "Sep 20–22", title: "The original engine-loading gate",
    id: 32388,
    observation: "The HD engine read the performance script and exact known-result control replay; a completed performance record was observed. This proves loading, not terminal winner recovery.",
    lesson: "Do not repeat solved file-open experiments. Decisive GAME OVER and side semantics still require independent proof.",
  },
  {
    period: "Oct 7–9", title: "Player-first and offline negative controls",
    id: 25620,
    observation: "The historical 99-case player-first ledger and 110-case offline tranche exposed missing result packets, disconnects and contradictory resignations without a verified new winner.",
    lesson: "Never turn a resignation count or partial stream into a result. Keep current corpus size separate from these dated cohorts.",
  },
  {
    period: "Oct 11–12", title: "Native control and instrumentation hold",
    id: 32388,
    observation: "A corrected standalone debugger probe ended HOLD with no owned hits; transport, decoder and gameplay-result proof remain different milestones.",
    lesson: "Preserve process-control failures and exact conditions rather than spending another session rerunning the same probe.",
  },
  {
    period: "Oct 13–15", title: "Phoenix XI original audit",
    id: 25590,
    observation: "25 exact originals authenticated and framed to EOF: two pre-existing full summaries, 23 header fallbacks, zero newly verified winners.",
    lesson: "EOF does not establish that gameplay ended. Next payoff requires genuinely new final evidence or version-bound terminal controls.",
  },
  {
    period: "Oct 15", title: "Research memory sealed and stopped",
    id: 25590,
    observation: "Thirteen bounded experiment records retain method, failure, next proof and stop-retry logic in draft API PR #46. An unrelated full-history attempt count has not been measured.",
    lesson: "Keep the known negative results. Resume only with a new independent artifact or a materially different, controlled hypothesis.",
  },
] as const;
