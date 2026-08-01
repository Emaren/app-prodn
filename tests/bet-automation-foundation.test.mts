import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BET_AUTOMATION_MAX_RESERVE_WOLO,
  BetAutomationInputError,
  estimateBetAutomationReserveWolo,
  parseBetAutoPresetDraft,
  readBetAutomationRuntime,
} from "../lib/betAutomation.ts";

function validPreset(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    winnerStakeWolo: 10,
    desyncSide: "none",
    desyncStakeWolo: 0,
    untilOut: false,
    gamesRemaining: 3,
    selfOnly: true,
    ...overrides,
  };
}

test("auto-bet presets normalize a finite self-only preview", () => {
  const preset = parseBetAutoPresetDraft(
    validPreset({
      desyncSide: "no",
      desyncStakeWolo: 2,
    })
  );

  assert.deepEqual(preset, {
    enabled: true,
    winnerStakeWolo: 10,
    desyncSide: "no",
    desyncStakeWolo: 2,
    untilOut: false,
    gamesRemaining: 3,
    selfOnly: true,
  });
  assert.equal(estimateBetAutomationReserveWolo(preset), 36);
});

test("Until Out uses the hard 10,000 WOLO plan envelope", () => {
  const preset = parseBetAutoPresetDraft(
    validPreset({ untilOut: true, gamesRemaining: null })
  );
  assert.equal(
    estimateBetAutomationReserveWolo(preset),
    BET_AUTOMATION_MAX_RESERVE_WOLO
  );
});

test("finite plans cannot estimate more than 10,000 WOLO", () => {
  assert.throws(
    () =>
      parseBetAutoPresetDraft(
        validPreset({ winnerStakeWolo: 101, gamesRemaining: 100 })
      ),
    (error: unknown) =>
      error instanceof BetAutomationInputError &&
      /10,100 WOLO/.test(error.message)
  );
});

test("desync selections always carry an explicit positive stake", () => {
  assert.throws(
    () =>
      parseBetAutoPresetDraft(
        validPreset({ desyncSide: "yes", desyncStakeWolo: 0 })
      ),
    /at least 1 WOLO/
  );
  assert.throws(
    () =>
      parseBetAutoPresetDraft(
        validPreset({ desyncSide: "none", desyncStakeWolo: 1 })
      ),
    /must be 0/
  );
});

test("automation can never be configured to bet on another player", () => {
  assert.throws(
    () => parseBetAutoPresetDraft(validPreset({ selfOnly: false })),
    /self-only/
  );
});

test("shadow is the safe default and explicitly never executes", () => {
  const runtime = readBetAutomationRuntime({});
  assert.equal(runtime.mode, "shadow");
  assert.equal(runtime.previewOnly, true);
  assert.equal(runtime.executionReady, false);
  assert.equal(runtime.code, "PREVIEW_READY");
});

test("live mode fails closed without the complete custody capability", () => {
  const runtime = readBetAutomationRuntime({ BET_AUTOMATION_MODE: "live" });
  assert.equal(runtime.configuredMode, "live");
  assert.equal(runtime.mode, "disabled");
  assert.equal(runtime.executionReady, false);
  assert.equal(runtime.code, "LIVE_CUSTODY_UNAVAILABLE");
});

test("custody capability alone cannot activate an unimplemented executor", () => {
  const runtime = readBetAutomationRuntime({
    BET_AUTOMATION_MODE: "live",
    WOLO_BET_CUSTODY_CAPABILITY: "bet-custody-v1",
    WOLO_BET_CUSTODY_URL: "http://127.0.0.1:8092/settlement/v1/bet-custody",
    WOLO_SETTLEMENT_AUTH_TOKEN: "test-only-secret",
  });

  assert.equal(runtime.custodyCapabilityPresent, true);
  assert.equal(runtime.mode, "shadow");
  assert.equal(runtime.executionReady, false);
  assert.equal(runtime.code, "LIVE_EXECUTOR_UNAVAILABLE");
});

test("profile and API keep the preview boundary explicit", () => {
  const card = readFileSync(
    new URL("../components/profile/AutoBetReserveCard.tsx", import.meta.url),
    "utf8"
  );
  const route = readFileSync(
    new URL("../app/api/user/bet-automation/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(card, /No WOLO moves and no wager is placed in Preview mode/);
  assert.match(card, /No funding control is active/);
  assert.doesNotMatch(card, /sendTokens|SigningStargateClient|connectWallet/);
  assert.match(route, /getSessionUid/);
  assert.match(route, /error\.code === "P2002"/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /betWager\.create|betStakeTicket\.create/);
});

test("schema foundation is an outbox, not an implicit financial trigger", () => {
  const schema = readFileSync(
    new URL("../prisma/schema.prisma", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260801193000_add_bet_auto_preview_foundation/migration.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(schema, /model BetAutoPreset/);
  assert.match(schema, /model BetAutoExecution/);
  assert.match(schema, /ticketId\s+Int\?\s+@unique/);
  assert.match(migration, /ck_bet_auto_presets_self_only/);
  assert.match(migration, /ck_bet_auto_presets_game_plan/);
  assert.match(migration, /No producer or\s+-- consumer is enabled/);
});
