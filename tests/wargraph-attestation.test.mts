import assert from "node:assert/strict";
import test from "node:test";

import {
  extractWarGraphWatcherAttestation,
  parseWarGraphWatcherAttestation,
} from "../lib/wargraph/attestations.ts";
import { classifyReplayIngestReceipt } from "../lib/replayPostIngest.ts";

const JIM_KEY = "1".repeat(64);
const ZODIAC_KEY = "2".repeat(64);

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema: "aoe2war-wargraph-watcher-attestation/v1",
    attestation_id: "a".repeat(64),
    transport_authenticated: true,
    uploader_uid: "u_jim",
    game_stats_id: 42,
    replay_hash: "b".repeat(64),
    replay_fingerprint: "100:200",
    platform_match_id: "match-42",
    watcher_identity_hash: "c".repeat(64),
    watcher_session_hash: "d".repeat(64),
    roster_hash: "e".repeat(64),
    roster_player_key_hashes: [ZODIAC_KEY, JIM_KEY],
    uploader_player_key_hash: JIM_KEY,
    participant_bound: true,
    ingestion_provenance: "live_monitor",
    provenance_signature_verified: true,
    live_provenance: true,
    commenced_at: "2026-08-24T04:59:00+00:00",
    is_final: true,
    archive_verified: true,
    file_role: "final_recording",
    finality_status: "trusted_final",
    result_trusted: true,
    result_provenance: "postgame_winner_flags",
    winning_player_key_hashes: [JIM_KEY],
    result_hash: "f".repeat(64),
    ...overrides,
  };
}

test("accepts a strict participant-bound final receipt", () => {
  const parsed = parseWarGraphWatcherAttestation(receipt());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.gameStatsId, 42);
  assert.equal(parsed.value.participantBound, true);
  assert.equal(parsed.value.liveProvenance, true);
  assert.deepEqual(parsed.value.rosterPlayerKeyHashes, [JIM_KEY, ZODIAC_KEY]);
  assert.equal(parsed.value.commencedAt?.toISOString(), "2026-08-24T04:59:00.000Z");
  assert.match(parsed.value.evidenceHash, /^[a-f0-9]{64}$/);
  assert.equal("transport_authenticated" in parsed.value.canonicalReceipt, false);
});

test("rejects unauthenticated, malformed, and inconsistent trust claims", () => {
  assert.equal(
    parseWarGraphWatcherAttestation(
      receipt({ transport_authenticated: false }),
    ).ok,
    false,
  );
  assert.equal(
    parseWarGraphWatcherAttestation(receipt({ replay_hash: "bad" })).ok,
    false,
  );
  assert.equal(
    parseWarGraphWatcherAttestation(
      receipt({ uploader_player_key_hash: "9".repeat(64) }),
    ).ok,
    false,
  );
  assert.equal(
    parseWarGraphWatcherAttestation(
      receipt({ archive_verified: false }),
    ).ok,
    false,
  );
});

test("retains non-qualifying evidence without elevating it", () => {
  const parsed = parseWarGraphWatcherAttestation(
    receipt({
      participant_bound: false,
      ingestion_provenance: "historical_import",
      provenance_signature_verified: true,
      live_provenance: false,
      uploader_player_key_hash: null,
      roster_hash: null,
      roster_player_key_hashes: [],
      commenced_at: null,
      is_final: false,
      archive_verified: false,
      finality_status: "live_pending_parse",
      result_trusted: false,
      winning_player_key_hashes: [],
      result_hash: null,
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.resultTrusted, false);
    assert.equal(parsed.value.liveProvenance, false);
    assert.equal(parsed.value.commencedAt, null);
  }
});

test("rejects a forged live provenance claim", () => {
  assert.equal(
    parseWarGraphWatcherAttestation(
      receipt({ provenance_signature_verified: false }),
    ).ok,
    false,
  );
  assert.equal(
    parseWarGraphWatcherAttestation(
      receipt({ ingestion_provenance: "historical_import" }),
    ).ok,
    false,
  );
});

test("extracts only the nested allowlisted attestation", () => {
  const parsed = extractWarGraphWatcherAttestation({
    game_id: 42,
    wargraph_attestation: {
      ...receipt(),
      api_key: "must-never-cross-the-boundary",
      watcher_id: "raw-watcher-id",
    },
  });
  assert.ok(parsed?.ok);
  if (parsed?.ok) {
    assert.equal("api_key" in parsed.value.canonicalReceipt, false);
    assert.equal("watcher_id" in parsed.value.canonicalReceipt, false);
  }
});

test("replay post-ingest classification carries valid evidence without elevating it", () => {
  const classified = classifyReplayIngestReceipt(
    {
      game_id: 42,
      replay_hash: "b".repeat(64),
      finality_status: "trusted_final",
      should_settle: true,
      wargraph_attestation: receipt(),
    },
    true,
  );

  assert.equal(classified.warGraph.rejectedReason, null);
  assert.equal(classified.warGraph.attestation?.attestationId, "a".repeat(64));
  assert.equal(classified.warGraph.attestation?.gameStatsId, classified.gameId);
});
