import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateZodiacRecoveryProposal, verifyZodiacProposalArchive, zodiacProposalHash, type ZodiacRecoveryProposal } from "../lib/zodiacRecoveryProposal.ts";
import { applyReplayResultAdjudication, validateReplayResultAdjudication } from "../lib/replayResultAdjudications.ts";
import { resolveReplayResultForPlayer } from "../lib/replayPlayerResult.ts";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";

const packet = JSON.parse(readFileSync(new URL("../docs/replay-receipts/three-account-stats-only-proposals-2026-10-06.json", import.meta.url), "utf8")).proposals[0] as ZodiacRecoveryProposal;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/three-account-recovery-case-bindings.json", import.meta.url), "utf8"))[25782];
function seal(p: ZodiacRecoveryProposal) {
  const { packetSha256: _, ...material } = p;
  p.packetSha256 = zodiacProposalHash(material);
}

test("#25782 is an exact Vegeta human short-forfeit draft, retaining raw Unknown and early-exit counterevidence", () => {
  const before = structuredClone(fixture);
  assert.strictEqual(validateZodiacRecoveryProposal(packet, fixture), packet);
  assert.equal(packet.targetSteamId, "76561199849204394");
  assert.equal(packet.zodiacSteamId, undefined);
  assert.equal(packet.shortForfeitReview?.terminalTimestampMs, 49834);
  assert.equal(packet.affectsStats, false);
  assert.equal(packet.affectsBets, false);
  assert.equal(packet.payload.evidence.automaticPromotionAllowed, false);
  assert.equal(fixture.game.winner, "Unknown");
  assert.equal(fixture.game.key_events.no_rated_result, true);
  assert.equal(fixture.game.key_events.completed, false);
  assert.equal(fixture.game.disconnect_detected, true);
  assert.deepEqual(fixture, before);
});

for (const [name, change] of [
  ["same-person different Steam account", (p: ZodiacRecoveryProposal) => { p.targetSteamId = "76561198103810510"; }],
  ["Jiren identity absent from this roster", (p: ZodiacRecoveryProposal) => { p.targetSteamId = "76561198754754435"; }],
  ["unallowlisted account", (p: ZodiacRecoveryProposal) => { p.targetSteamId = "76561198257849801"; }],
  ["mixed legacy and current target fields", (p: ZodiacRecoveryProposal) => { p.zodiacSteamId = "76561198103810510"; }],
  ["absent short-forfeit acknowledgement", (p: ZodiacRecoveryProposal) => { delete p.shortForfeitReview; }],
  ["altered short-forfeit timestamp", (p: ZodiacRecoveryProposal) => { p.shortForfeitReview!.terminalTimestampMs++; }],
  ["claimed rated result", (p: ZodiacRecoveryProposal) => { (p.shortForfeitReview as any).acknowledgesNotRatedResult = false; }],
  ["misleading displayed duration", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.counterevidence as any).durationSeconds = 500; }],
  ["hidden parser exclusion", (p: ZodiacRecoveryProposal) => { (p.payload.evidence.counterevidence as any).noRatedResult = false; }],
  ["counterevidence suppression", (p: ZodiacRecoveryProposal, s: any) => { s.game.key_events.no_rated_result = false; }],
  ["new standalone financial claim", (p: ZodiacRecoveryProposal, s: any) => { s.financialSnapshot.claims.push({ id: 999, amountWolo: 1 }); }],
] as Array<[string, (p: ZodiacRecoveryProposal, s: any) => void]>) test(`#25782 rejects ${name}, even with a refreshed outer digest`, () => {
  const p = structuredClone(packet), state = structuredClone(fixture);
  change(p, state); seal(p);
  assert.throws(() => validateZodiacRecoveryProposal(p, state));
});

test("#25782 independently verifies both real 16-byte resignation windows in a synthetic whole archive", () => {
  const p = structuredClone(packet), bytes = Buffer.alloc(p.payload.evidence.archiveByteSize as number);
  const resignations = p.payload.evidence.resignations as any[];
  const windows = ["01000000040000000b030300e6720000", "01000000040000000b010100aac20000"];
  resignations.forEach((r, i) => {
    const raw = Buffer.from(windows[i], "hex");
    raw.copy(bytes, r.packet.offset);
    assert.equal(createHash("sha256").update(raw).digest("hex"), r.packet.sha256);
  });
  p.payload.sourceReplayHash = createHash("sha256").update(bytes).digest("hex");
  assert.doesNotThrow(() => verifyZodiacProposalArchive(p, bytes));
  const missing = structuredClone(p); (missing.payload.evidence.resignations as any[]).pop();
  assert.throws(() => verifyZodiacProposalArchive(missing, bytes), /complete_losing_side/);
  const disconnected = Buffer.from(bytes); disconnected[resignations[0].packet.offset + 11] = 1;
  p.payload.sourceReplayHash = createHash("sha256").update(disconnected).digest("hex");
  assert.throws(() => verifyZodiacProposalArchive(p, disconnected), /resignation_bytes/);
});

test("a hypothetical explicit human short-forfeit verdict grants stats only and does not mutate raw early-exit truth", () => {
  const raw = structuredClone(fixture.game), before = structuredClone(raw);
  const v = validateReplayResultAdjudication({ payload: packet.payload, replayHash: raw.replayHash, parseIteration: raw.parse_iteration, players: raw.players });
  const projected = applyReplayResultAdjudication(raw, { ...v, id: 999999, teamAssignments: v.teams,
    actorRole: "site_admin", actorDisplayNameSnapshot: "Synthetic test only", decisionStatus: "accepted",
    affectsStats: true, affectsBets: false, createdAt: "2026-10-07T00:00:00Z" });
  assert.equal(resolveReplayResultForPlayer(projected, p => p.steamId === packet.targetSteamId), "loss");
  assert.equal(publicReplayWinnerTruth(projected).statsEligible, true);
  assert.equal(publicReplayWinnerTruth(projected).bettingEligible, false);
  assert.deepEqual(raw, before);
});

test("the review surface makes the short-game exclusion visible before loading the draft", () => {
  const ui = readFileSync(new URL("../app/game-stats/[id]/review/ReplayResultReviewWorkspace.tsx", import.meta.url), "utf8");
  assert.match(ui, /50-second replay is excluded by the parser early-exit rule/);
  assert.match(ui, /does not establish a Steam-rated result/);
  const route = readFileSync(new URL("../app/api/replay-results/[id]/recovery-proposal/route.ts", import.meta.url), "utf8");
  assert.match(route, /three-account-stats-only-proposals/);
  assert.doesNotMatch(route, /export async function POST|submitReplayResultAdjudication|\.create\(|\.update\(/);
});
