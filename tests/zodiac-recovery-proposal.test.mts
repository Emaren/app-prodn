import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateZodiacRecoveryProposal, verifyZodiacProposalArchive, zodiacProposalHash, type ZodiacRecoveryProposal } from "../lib/zodiacRecoveryProposal.ts";

const packets = JSON.parse(readFileSync(new URL("../docs/replay-receipts/zodiac-stats-only-proposals-2026-10-06.json", import.meta.url), "utf8")).proposals as ZodiacRecoveryProposal[];
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/zodiac-recovery-case-bindings.json", import.meta.url), "utf8"));
function seal(packet: ZodiacRecoveryProposal) {
  const { packetSha256: _, ...material } = packet;
  packet.packetSha256 = zodiacProposalHash(material);
  return packet;
}
function rebindSource(p: ZodiacRecoveryProposal, state: any) {
  p.sourceGameStateSha256 = zodiacProposalHash(Object.fromEntries(["id", "replayHash", "parse_iteration", "is_final", "disconnect_detected", "parse_source", "parse_reason", "winner", "players", "key_events", "event_types"].map(k => [k, state.game[k]])));
}
for (const packet of packets) test(`exact #${packet.gameStatsId} packet validates a complete stats-only human draft`, () => {
  const result = validateZodiacRecoveryProposal(packet, fixtures[packet.gameStatsId]);
  assert.equal(result.affectsStats, false);
  assert.equal(result.affectsBets, false);
  assert.equal(result.status, "requires_commissioner_approval");
  assert.equal(result.payload.evidence.automaticPromotionAllowed, false);
  assert.ok(result.payload.idempotencyKey.startsWith(`zodiac-serialized:${packet.gameStatsId}:`));
});
for (const [name, change] of [
  ["changed source flags", (p: ZodiacRecoveryProposal, s: any) => { s.game.disconnect_detected = true; }],
  ["changed parse iteration", (p: ZodiacRecoveryProposal, s: any) => { s.game.parse_iteration++; }],
  ["changed exact archive", (p: ZodiacRecoveryProposal, s: any) => { s.game.replayHash = "a".repeat(64); }],
  ["changed slot identity", (p: ZodiacRecoveryProposal, s: any) => { s.game.players[0].number = 8; }],
  ["changed team identity", (p: ZodiacRecoveryProposal, s: any) => { s.game.players[0].team_id = 7; }],
  ["new adjudication", (p: ZodiacRecoveryProposal, s: any) => { s.adjudications.push({ id: 999 }); }],
  ["confirmed desync", (p: ZodiacRecoveryProposal, s: any) => { s.desyncOccurred = true; }],
  ["changed financial snapshot", (p: ZodiacRecoveryProposal, s: any) => { s.linkedMarkets.push({ id: 1 }); }],
  ["new standalone claim obligation", (p: ZodiacRecoveryProposal, s: any) => { s.financialSnapshot.claims.push({ id: 1, status: "pending", amountWolo: 5 }); }],
  ["changed wager without changed market summary", (p: ZodiacRecoveryProposal, s: any) => { s.financialSnapshot.markets.push({ id: 1, wagers: [{ amountWolo: 9 }] }); }],
  ["raw fractional slot", (p: ZodiacRecoveryProposal, s: any) => { s.game.players[0].number = 1.7; rebindSource(p, s); }],
  ["conflicting slot aliases", (p: ZodiacRecoveryProposal, s: any) => { s.game.players[0].player_number = 2; rebindSource(p, s); }],
  ["raw fractional team", (p: ZodiacRecoveryProposal, s: any) => { s.game.players[0].team_id = 0.1; rebindSource(p, s); }],
  ["bet authority escalation", (p: ZodiacRecoveryProposal) => { p.affectsBets = true; }],
  ["premature stats authority", (p: ZodiacRecoveryProposal) => { p.affectsStats = true; }],
  ["winner slot substitution", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.independentTerminalResult as any).winning_player_numbers = [1, 2]; }],
  ["incomplete framing", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.terminalFraming as any).complete = false; }],
  ["parser contract substitution", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.parser as any).pass_version = "9"; }],
  ["inner parser substitution", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.independentTerminalResult as any).proof.parser.pass_version = "9"; }],
  ["inner archive substitution", (p: ZodiacRecoveryProposal) => { p.payload.evidence.archiveSha256 = "a".repeat(64); }],
  ["extra winning slot", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.independentTerminalResult as any).winning_player_numbers.push(99); }],
  ["duplicate winning slot", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.independentTerminalResult as any).winning_player_numbers.push(3); }],
  ["changed display winner", (p: ZodiacRecoveryProposal) => { p.winnerNames = ["Zodiac"]; }],
  ["mixed resignation proof packets", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.independentTerminalResult as any).proof.packets.pop(); }],
] as Array<[string, (p: ZodiacRecoveryProposal, s: any) => void]>) test(`proposal rejects ${name}, even with a refreshed packet digest`, () => {
  const p = structuredClone(packets[0]); const state = structuredClone(fixtures[p.gameStatsId]);
  change(p, state); seal(p);
  assert.throws(() => validateZodiacRecoveryProposal(p, state));
});

// Real serialized packet windows inside explicitly synthetic whole archives.
// These fixtures test the independent byte referee, not synthetic archive authority.
const rawWindows: Record<number, string[]> = {
  27269: ["01000000040000000b02020010021900", "01000000040000000b0101003e1c1900"],
  44670: ["01000000040000000b02020018621700"],
};
function syntheticArchive(packet: ZodiacRecoveryProposal) {
  const p = structuredClone(packet);
  const rows = p.payload.evidence.resignations as any[];
  const bytes = Buffer.alloc(p.payload.evidence.archiveByteSize as number);
  rows.forEach((r, i) => {
    const raw = Buffer.from(rawWindows[p.gameStatsId][i], "hex");
    raw.copy(bytes, r.packet.offset);
    r.packet.sha256 = createHash("sha256").update(raw).digest("hex");
  });
  p.payload.sourceReplayHash = createHash("sha256").update(bytes).digest("hex");
  return { p, bytes };
}
for (const packet of packets) test(`#${packet.gameStatsId} whole losing side is verified from serialized bytes`, () => {
  const { p, bytes } = syntheticArchive(packet);
  assert.doesNotThrow(() => verifyZodiacProposalArchive(p, bytes));
  const altered = Buffer.from(bytes); altered[(p.payload.evidence.resignations as any[])[0].packet.offset + 11] = 1;
  assert.throws(() => verifyZodiacProposalArchive(p, altered));
  const incomplete = structuredClone(p); (incomplete.payload.evidence.resignations as any[]).pop();
  assert.throws(() => verifyZodiacProposalArchive(incomplete, bytes));
  const wrongWinner = structuredClone(p); wrongWinner.payload.winningTeamKey = p.payload.winningTeamKey === "gold" ? "blue" : "gold";
  assert.throws(() => verifyZodiacProposalArchive(wrongWinner, bytes));
});
test("proposal route is read-only, admin-only and rehashes fixed canonical archive bytes", () => {
  const source = readFileSync(new URL("../app/api/replay-results/[id]/recovery-proposal/route.ts", import.meta.url), "utf8");
  assert.match(source, /state.access.isAdmin/);
  assert.match(source, /verifyZodiacProposalArchive/);
  assert.match(source, /realpath\(path\) !== path/);
  assert.doesNotMatch(source, /export async function POST|\.create\(|\.update\(|submitReplayResultAdjudication/);
});
