import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isNonfinancialPublicReadProfile } from "../lib/nonfinancialPublicReadProfile.ts";

const source = readFileSync(
  new URL("../config/nonfinancial-public-read-model-v1.sql", import.meta.url),
  "utf8",
);
const profile = {
  NODE_ENV: "production",
  AOE2WAR_R25_ISOLATED_WEB: "true",
  AOE2WAR_RUNTIME_PROFILE: "nonfinancial-production-v1",
  WARGRAPH_RUNTIME_DISABLED: "true",
  AOE2WAR_PROD_DB_PREVIEW: "false",
};

test("only the exact restricted production profile uses the public views", () => {
  assert.equal(isNonfinancialPublicReadProfile(profile), true);
  for (const [key, value] of Object.entries({
    NODE_ENV: "development",
    AOE2WAR_R25_ISOLATED_WEB: "false",
    AOE2WAR_RUNTIME_PROFILE: "preview-read-only",
    WARGRAPH_RUNTIME_DISABLED: "false",
    AOE2WAR_PROD_DB_PREVIEW: "true",
  })) {
    assert.equal(isNonfinancialPublicReadProfile({ ...profile, [key]: value }), false, key);
  }
  assert.equal(isNonfinancialPublicReadProfile({}), false);
});

test("public DDL is bounded to specific security-barrier views", () => {
  assert.match(source, /CREATE SCHEMA IF NOT EXISTS aoe2war_public_v1/);
  const views = [...source.matchAll(/CREATE OR REPLACE VIEW aoe2war_public_v1\.([a-z_]+)\s+WITH \(security_barrier=true\)/g)]
    .map((match) => match[1]);
  assert.deepEqual(views, [
    "player_badges",
    "player_gifts",
    "pending_player_gift_totals",
    "pending_claim_names",
    "replay_projection_watermarks",
    "accepted_replay_projections",
    "pending_claim_watermark",
  ]);
  const grants = [...source.matchAll(/^GRANT SELECT ON (\S+) TO aoe2war_web_prod;$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(grants, views.map((view) => "aoe2war_public_v1." + view));
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE public\./);
  assert.doesNotMatch(source, /GRANT (?:ALL|UPDATE|INSERT|DELETE)/);
  assert.match(source, /PUBLIC_READ_MODEL_PRIVATE_DIRECT_AUTHORITY_DRIFT/);
});

test("public gift and badge rows must be accepted and display-consented", () => {
  const badges = source.split("CREATE OR REPLACE VIEW aoe2war_public_v1.player_badges")[1]
    .split("CREATE OR REPLACE VIEW")[0];
  const gifts = source.split("CREATE OR REPLACE VIEW aoe2war_public_v1.player_gifts")[1]
    .split("CREATE OR REPLACE VIEW")[0];
  for (const section of [badges, gifts]) {
    assert.match(section, /status='accepted' AND \w\.display_on_profile IS TRUE/);
    assert.match(section, /NULL::text AS note/);
    assert.doesNotMatch(section, /created_by_user_id|wallet_address|payout_tx_hash/);
  }
});

test("pending financial views never project wallet or payout authority", () => {
  const claims = source.split("CREATE OR REPLACE VIEW aoe2war_public_v1.pending_claim_names")[1]
    .split("CREATE OR REPLACE VIEW")[0];
  const select = claims.split("FROM public.pending_wolo_claims")[0];
  assert.match(claims, /status='pending' AND amount_wolo>0/);
  for (const secret of ["note", "payout_tx_hash", "payout_proof_url",
                        "error_state", "source_founder_bonus_id", "wallet_address"]) {
    assert.equal(select.includes(secret), false, secret);
  }
  assert.match(source, /NOT EXISTS \([\s\S]*newer\.supersedes_id=p\.id/);
});

test("R25 code branches use public views, and missing views fail closed", () => {
  const root = new URL("../lib/", import.meta.url);
  const players = readFileSync(new URL("publicPlayerDirectory.ts", root), "utf8");
  const generation = readFileSync(new URL("publicPlayerDirectoryGeneration.ts", root), "utf8");
  const honors = readFileSync(new URL("communityHonors.ts", root), "utf8");
  const claims = readFileSync(new URL("pendingWoloClaims.ts", root), "utf8");
  const replay = readFileSync(new URL("publicReplayGeneration.ts", root), "utf8");
  assert.match(players, /aoe2war_public_v1\.accepted_replay_projections/);
  assert.match(players, /aoe2war_public_v1\.pending_player_gift_totals/);
  assert.match(players, /if \(isNonfinancialPublicReadProfile\(\)\) throw error/);
  assert.match(generation, /aoe2war_public_v1\.player_badges/);
  assert.match(generation, /aoe2war_public_v1\.pending_claim_names/);
  assert.match(honors, /PUBLIC_READ_MODEL_PRIVATE_HONOR_AUTHORITY_REQUIRED/);
  assert.match(claims, /aoe2war_public_v1\.pending_claim_names/);
  assert.match(claims, /PUBLIC_PENDING_CLAIMS_BOUNDED_QUERY_LIMIT/);
  assert.match(replay, /aoe2war_public_v1\.replay_projection_watermarks/);
});
