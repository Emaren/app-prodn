import { createHash } from "node:crypto";
import { normalizeReplayPlayers } from "./teamResolution.ts";
import { validateReplayResultAdjudication } from "./replayResultAdjudications.ts";
import { HD_REPLAY_PARSER_CONTRACT } from "./replayEngineRoom.ts";

export type ZodiacRecoveryProposal = {
  schema: string;
  gameStatsId: number;
  packetSha256: string;
  zodiacSteamId: string;
  status: string;
  affectsStatsRequested: boolean;
  affectsStats: boolean;
  affectsBets: boolean;
  settlementAuthority: boolean;
  woloAuthority: boolean;
  financialDisposition: string;
  sourceGameStateSha256: string;
  canonicalRoster: Array<{ stablePlayerKey: string; name: string; steamId: string; playerNumber: number; teamId: string | null }>;
  winnerNames: string[];
  payload: {
    idempotencyKey: string;
    sourceReplayHash: string;
    sourceParseIteration: number;
    sourceRosterHash: string;
    teams: Array<{ teamKey: "gold" | "blue"; playerKeys: string[] }>;
    winningTeamKey: "gold" | "blue";
    reason: string;
    evidence: Record<string, unknown>;
    supersedesId: null;
  };
};

export function zodiacProposalHash(value: unknown): string {
  const sorted = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sorted);
    if (input && typeof input === "object") return Object.fromEntries(
      Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sorted(v)])
    );
    return input;
  };
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}

/** A frozen research packet can populate a human draft; it never accepts a result. */
export function validateZodiacRecoveryProposal(packet: ZodiacRecoveryProposal, state: {
  game: Record<string, unknown> & { id: number; replayHash: string; parse_iteration: number; players: unknown };
  adjudications: unknown[];
  desyncOccurred: boolean;
  linkedMarkets: unknown[];
  financialSnapshot: unknown;
}) {
  const require: (ok: boolean, reason: string) => asserts ok = (ok, reason) => { if (!ok) throw new Error(reason); };
  const { packetSha256, ...material } = packet;
  require(zodiacProposalHash(material) === packetSha256, "proposal_digest_mismatch");
  require(packet.schema === "aoe2war-zodiac-commissioner-proposal/v1" && packet.status === "requires_commissioner_approval", "unsupported_proposal");
  require(packet.zodiacSteamId === "76561198103810510" && packet.gameStatsId === state.game.id, "proposal_game_identity_mismatch");
  require(packet.affectsStatsRequested === true && packet.affectsStats === false && packet.affectsBets === false && packet.settlementAuthority === false && packet.woloAuthority === false, "proposal_authority_escalation");
  require(state.adjudications.length === 0 && !state.desyncOccurred, "proposal_requires_fresh_commissioner_review");
  const bindings = Object.fromEntries([
    "id", "replayHash", "parse_iteration", "is_final", "disconnect_detected", "parse_source", "parse_reason", "winner", "players", "key_events", "event_types",
  ].map(k => [k, state.game[k]]));
  require(zodiacProposalHash(bindings) === packet.sourceGameStateSha256, "proposal_source_changed");
  require(Array.isArray(state.game.players) && state.game.players.every(value => {
    if (!value || typeof value !== "object") return false;
    const raw = value as Record<string, unknown>;
    return [["player_number", "playerNumber", "number"], ["team_id", "teamId", "team_number", "teamNumber", "team"]].every((aliases, group) => {
      const values = aliases.map(k => raw[k]).filter(v => v !== null && v !== undefined);
      return (group === 1 || values.length > 0) && values.every(v => (typeof v === "number" || typeof v === "string" && /^\d+$/.test(v)) && Number.isSafeInteger(Number(v)) && Number(v) >= (group === 0 ? 1 : 0) && Number(v) <= 8) && new Set(values.map(Number)).size <= 1;
    });
  }), "proposal_raw_slot_or_team_ambiguous");
  const roster = normalizeReplayPlayers(state.game.players).map(p => ({ stablePlayerKey: p.stablePlayerKey, name: p.name, steamId: p.steamId, playerNumber: p.playerNumber, teamId: p.teamId }));
  require(zodiacProposalHash(roster) === zodiacProposalHash(packet.canonicalRoster), "proposal_roster_changed");
  require(roster.every(p => p.steamId && /^[0-9]{17}$/.test(p.steamId) && p.playerNumber !== null && Number.isSafeInteger(p.playerNumber) && p.playerNumber >= 1 && p.playerNumber <= 8) && new Set(roster.map(p => p.steamId)).size === roster.length && new Set(roster.map(p => p.playerNumber)).size === roster.length, "proposal_slot_identity_ambiguous");
  const evidence = packet.payload.evidence;
  require(evidence.requiresCommissionerApproval === true && evidence.affectsBets === false && evidence.financialAuthority === false && evidence.woloAuthority === false && evidence.automaticPromotionAllowed === false, "proposal_evidence_authority_escalation");
  const parser = evidence.parser as Record<string, unknown>;
  require(parser.implementation === HD_REPLAY_PARSER_CONTRACT.parserName && parser.implementation_version === HD_REPLAY_PARSER_CONTRACT.parserVersion && parser.pass_name === HD_REPLAY_PARSER_CONTRACT.passName && parser.pass_version === HD_REPLAY_PARSER_CONTRACT.passVersion && parser.schema_version === HD_REPLAY_PARSER_CONTRACT.schemaVersion, "proposal_parser_contract_changed");
  const financial = evidence.financialSnapshot as { linkedMarkets?: unknown[]; markets?: unknown[]; claims?: unknown[] };
  require(zodiacProposalHash(financial.linkedMarkets) === zodiacProposalHash(state.linkedMarkets), "proposal_financial_snapshot_changed");
  const liveFinancial = state.financialSnapshot as { markets?: unknown[]; claims?: unknown[] };
  require(Array.isArray(financial.markets) && Array.isArray(financial.claims) && zodiacProposalHash({ markets: financial.markets, claims: financial.claims }) === zodiacProposalHash({ markets: liveFinancial.markets, claims: liveFinancial.claims }), "proposal_financial_obligations_changed");
  require(packet.financialDisposition === (financial.markets.length ? "operator_review_required" : "none"), "proposal_financial_disposition_mismatch");
  const terminal = evidence.independentTerminalResult as { status?: string; source?: string; blockers?: unknown[]; winning_player_numbers?: number[]; proof?: { artifact_sha256?: string; parser?: unknown; terminal_schema_version?: string; packets?: unknown[] } };
  const framing = evidence.terminalFraming as { complete?: boolean; last_consumed_offset?: number };
  require(terminal.status === "deterministic_candidate" && terminal.source === "complete_team_voluntary_resignation" && terminal.blockers?.length === 0 && terminal.proof?.artifact_sha256 === packet.payload.sourceReplayHash && framing.complete === true && framing.last_consumed_offset === evidence.archiveByteSize, "proposal_terminal_proof_incomplete");
  require(evidence.archiveSha256 === packet.payload.sourceReplayHash && zodiacProposalHash(terminal.proof?.parser) === zodiacProposalHash(parser) && terminal.proof?.terminal_schema_version === "hd-terminal-evidence-v2", "proposal_inner_proof_binding_mismatch");
  const resignations = evidence.resignations as Array<{ packet?: unknown }>;
  require(Array.isArray(resignations) && resignations.length > 0 && zodiacProposalHash(resignations.map(r => r.packet)) === zodiacProposalHash(terminal.proof?.packets), "proposal_resignation_proof_mismatch");
  require(Array.isArray(terminal.winning_player_numbers) && terminal.winning_player_numbers.length > 0 && terminal.winning_player_numbers.every(n => Number.isSafeInteger(n) && roster.some(p => p.playerNumber === n)) && new Set(terminal.winning_player_numbers).size === terminal.winning_player_numbers.length, "proposal_winner_slot_ambiguous");
  const validated = validateReplayResultAdjudication({ payload: packet.payload, replayHash: state.game.replayHash, parseIteration: state.game.parse_iteration, players: state.game.players });
  const winners = roster.filter(p => terminal.winning_player_numbers?.includes(p.playerNumber as number)).map(p => p.stablePlayerKey).sort();
  require(JSON.stringify(winners) === JSON.stringify(validated.winningPlayerKeys), "proposal_winner_slot_mismatch");
  require(zodiacProposalHash(packet.winnerNames) === zodiacProposalHash(roster.filter(p => validated.winningPlayerKeys.includes(p.stablePlayerKey)).map(p => p.name)), "proposal_winner_names_mismatch");
  return packet;
}

/** Rehash the immutable archive and each serialized resignation before showing a draft. */
export function verifyZodiacProposalArchive(packet: ZodiacRecoveryProposal, bytes: Buffer) {
  const evidence = packet.payload.evidence;
  if (bytes.length !== evidence.archiveByteSize || createHash("sha256").update(bytes).digest("hex") !== packet.payload.sourceReplayHash) throw new Error("proposal_archive_changed");
  const rows = evidence.resignations as Array<{ player_id: number; player_num: number; disconnected: boolean; flags_complete: boolean; identity_complete: boolean; payload_hex: string; packet: { offset: number; byte_size: number; sha256: string; timestamp_ms: number } }>;
  if (!Array.isArray(rows) || !rows.length) throw new Error("proposal_resignations_missing");
  const resigned = new Set<number>();
  let previous = -1;
  for (const row of rows) {
    const p = row.packet;
    if (!Number.isSafeInteger(p.offset) || p.offset <= previous || p.offset < 4 || p.byte_size !== 16 || p.offset + 16 > bytes.length) throw new Error("proposal_packet_extent_invalid");
    previous = p.offset;
    const raw = bytes.subarray(p.offset, p.offset + p.byte_size);
    if (createHash("sha256").update(raw).digest("hex") !== p.sha256 || raw.readUInt32LE(0) !== 1 || raw.readUInt32LE(4) !== 4 || raw[8] !== 11 || raw.subarray(9, 12).toString("hex") !== row.payload_hex || raw[9] !== row.player_id || raw[10] !== row.player_num || row.player_id !== row.player_num || raw[11] !== 0 || raw.readUInt32LE(12) !== p.timestamp_ms || row.disconnected !== false || row.flags_complete !== true || row.identity_complete !== true || resigned.has(row.player_id)) throw new Error("proposal_resignation_bytes_invalid");
    resigned.add(row.player_id);
  }
  const losing = packet.payload.teams.filter(t => t.teamKey !== packet.payload.winningTeamKey).flatMap(t => t.playerKeys);
  const expected = packet.canonicalRoster.filter(p => losing.includes(p.stablePlayerKey)).map(p => p.playerNumber).sort((a,b) => a-b);
  if (JSON.stringify([...resigned].sort((a,b) => a-b)) !== JSON.stringify(expected)) throw new Error("proposal_complete_losing_side_not_proven");
  const final = rows.at(-1)!.packet;
  const framing = evidence.terminalFraming as { end_timestamp_ms: number };
  if (final.offset + final.byte_size !== bytes.length || final.timestamp_ms !== framing.end_timestamp_ms) throw new Error("proposal_terminal_extent_changed");
}
