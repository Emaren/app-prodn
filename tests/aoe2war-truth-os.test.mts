import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cli = await readFile(
  "bin/aoe2war",
  "utf8"
);

const python = await readFile(
  "scripts/aoe2_truth.py",
  "utf8"
);

const remote = await readFile(
  "scripts/aoe2_truth_remote.mjs",
  "utf8"
);

test("AoE2WAR CLI exposes Replay Truth OS", () => {
  assert.match(
    cli,
    /aoe2war truth <status\\|census\\|audit\\|closure\\|target>/
  );

  assert.match(
    cli,
    /TRUTH_OS=/
  );

  assert.match(
    cli,
    /truth\)\s*[\s\S]*exec python3 "\$TRUTH_OS"/
  );
});

test("Replay Truth OS is hard read-only and guards Wolo", () => {
  assert.match(
    python,
    /AOE2WAR_PROD_DB_PREVIEW=true/
  );

  assert.match(
    python,
    /:8092/
  );

  assert.match(
    python,
    /:8093/
  );

  assert.match(
    python,
    /runtime_mutated/
  );

  assert.match(
    python,
    /database_mutated/
  );

  assert.match(
    python,
    /wolo_mutated/
  );

  assert.match(
    remote,
    /default_transaction_read_only/
  );

  assert.match(
    remote,
    /transaction_read_only/
  );
});

test("Replay Truth audit preserves the full-corpus contract", () => {
  assert.match(
    remote,
    /contractMismatchGames/
  );

  assert.match(
    remote,
    /scalarAuthorityIncoherent/
  );

  assert.match(
    remote,
    /stored_winner_field/
  );

  assert.match(
    remote,
    /resolveReplayResultForPlayer/
  );

  assert.match(
    remote,
    /publicReplayWinnerTruth/
  );
});

test("Replay Truth OS tracks explicit team composition independently of result authority", () => {
  assert.match(
    remote,
    /observedExplicitTwoTeamComposition/
  );

  assert.match(
    remote,
    /explicit_replay_team_ids_observed/
  );

  assert.match(
    remote,
    /team\.known/
  );

  assert.doesNotMatch(
    remote,
    /team\.resolved/
  );
});

test("Replay Truth OS models topology independently of canonical two-team authority", () => {
  assert.match(
    remote,
    /topologyProjection/
  );

  assert.match(
    remote,
    /KNOWN_FFA/
  );

  assert.match(
    remote,
    /KNOWN_TG/
  );

  assert.match(
    remote,
    /KNOWN_SINGLE_GROUP/
  );

  assert.match(
    remote,
    /KNOWN_MULTI_SIDE/
  );

  assert.match(
    remote,
    /topologyKnown/
  );

  assert.match(
    remote,
    /unexplainedTopologyDebt/
  );

  assert.match(
    remote,
    /SOURCE_ARTIFACT_REQUIRED/
  );

  assert.match(
    remote,
    /PARSER_RESEARCH_REQUIRED/
  );
});

test("Replay topology candidate reads are bounded to immutable parser storage", () => {
  assert.match(
    remote,
    /TRUTH_CANDIDATE_ROOT/
  );

  assert.match(
    remote,
    /insideTruthRoot/
  );

  assert.match(
    remote,
    /candidate_output_outside_allowed_root/
  );

  assert.match(
    remote,
    /mgz\.summary\.get_diplomacy/
  );

  assert.match(
    remote,
    /mgz\.header\.player\.team_id/
  );
});

test("Direct-header topology prefers exact replay slot identity over normalized player identity", () => {
  assert.match(
    remote,
    /subject\.player_number[\s\S]*number:\$\{subject\.player_number\}[\s\S]*cleanTruthText\([\s\S]*subject\.player_key/
  );
});

test("Replay Truth status preserves corpus intelligence after target commands", () => {
  assert.match(
    python,
    /latest_receipt\(\s*"census"\s*\)/
  );

  assert.match(
    python,
    /latest_receipt\(\s*"audit"\s*\)/
  );

  assert.match(
    python,
    /Latest census/
  );

  assert.match(
    python,
    /Latest audit/
  );
});

test("Replay Truth target receipts include the game ID", () => {
  assert.match(
    python,
    /f"target-\{game_id\}"/
  );
});

test("Replay Truth target exposes evidence and current projection", () => {
  assert.match(
    remote,
    /replayParseRuns/
  );

  assert.match(
    remote,
    /replayStatProjections/
  );

  assert.match(
    remote,
    /replayResultAdjudications/
  );

  assert.match(
    remote,
    /classifyRoute/
  );
});


test("Replay Truth certainty closure accounts for every final game without guessing settlement truth", () => {
  assert.match(
    remote,
    /buildCertaintyClosure/
  );

  assert.match(
    remote,
    /UNPARSEABLE_FROM_CURRENT_VAULT/
  );

  assert.match(
    remote,
    /ARTIFACT_PRESENT_REPARSE/
  );

  assert.match(
    remote,
    /ARTIFACT_PRESENT_CURRENT_PARSER_INSUFFICIENT/
  );

  assert.match(
    remote,
    /CANDIDATE_WINNER_NOT_AUTHORITY/
  );

  assert.match(
    remote,
    /terminalForCurrentVault/
  );

  assert.match(
    python,
    /Replay certainty closure|REPLAY CERTAINTY CLOSURE/
  );

  assert.match(
    python,
    /latest_receipt\(\s*"closure"\s*\)/
  );
});
