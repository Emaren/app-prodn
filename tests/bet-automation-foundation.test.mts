import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BET_AUTOMATION_MAX_RESERVE_WOLO,
  BET_AUTOMATION_MAX_PER_GAME_WOLO,
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

test("Until Out uses the hard 50,000 WOLO plan envelope", () => {
  const preset = parseBetAutoPresetDraft(
    validPreset({ untilOut: true, gamesRemaining: null })
  );
  assert.equal(
    estimateBetAutomationReserveWolo(preset),
    BET_AUTOMATION_MAX_RESERVE_WOLO
  );
});

test("finite plans cannot estimate more than 50,000 WOLO", () => {
  assert.throws(
    () =>
      parseBetAutoPresetDraft(
        validPreset({ winnerStakeWolo: 501, gamesRemaining: 100 })
      ),
    (error: unknown) =>
      error instanceof BetAutomationInputError &&
      /50,100 WOLO/.test(error.message)
  );
});

test("Mecha per-match preset boundary is enforced", () => {
  assert.equal(BET_AUTOMATION_MAX_PER_GAME_WOLO, 10_000);
  assert.equal(
    parseBetAutoPresetDraft(validPreset({
      winnerStakeWolo: 9998, desyncSide: "yes", desyncStakeWolo: 2,
      gamesRemaining: 1,
    })).winnerStakeWolo, 9998
  );
  assert.throws(
    () => parseBetAutoPresetDraft(validPreset({ winnerStakeWolo: 10_001, gamesRemaining: 1 })),
    /between 1 and 10,000/
  );
  assert.throws(
    () => parseBetAutoPresetDraft(validPreset({
      winnerStakeWolo: 9999, desyncSide: "yes", desyncStakeWolo: 2,
      gamesRemaining: 1,
    })),
    /combined per-game plan cannot exceed 10,000/
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

test("custody config refuses nonlocal, ambiguous and redirected origins", () => {
  const base = {
    BET_AUTOMATION_MODE: "live",
    WOLO_BET_CUSTODY_CAPABILITY: "bet-custody-v1",
    WOLO_SETTLEMENT_AUTH_TOKEN: "test-only-secret",
  };
  const rejected = [
    "https://example.com/settlement/v1/bet-custody",
    "https://127.0.0.1:8092/settlement/v1/bet-custody",
    "http://localhost:8092/settlement/v1/bet-custody",
    "http://127.0.0.1:8093/settlement/v1/bet-custody",
    "http://127.0.0.1:8092/settlement/v1/bet-custody?role=owner",
    "http://127.0.0.1:8092/settlement/v1/bet-custody#confirmed",
    "http://admin:token@127.0.0.1:8092/settlement/v1/bet-custody",
    "http://127.0.0.1:8092/settlement/v1/bet-custody/../bet-custody",
    " http://127.0.0.1:8092/settlement/v1/bet-custody ",
    "http://0x7f000001:8092/settlement/v1/bet-custody",
    "http://[::1]:8092/settlement/v1/bet-custody",
    "",
  ];
  for (const endpoint of rejected) {
    const runtime = readBetAutomationRuntime({ ...base, WOLO_BET_CUSTODY_URL: endpoint });
    assert.equal(runtime.custodyCapabilityPresent, false, endpoint);
    assert.equal(runtime.executionReady, false, endpoint);
    assert.equal(runtime.mode, "disabled", endpoint);
    assert.equal(runtime.code, "LIVE_CUSTODY_UNAVAILABLE", endpoint);
  }
  const noToken = readBetAutomationRuntime({
    ...base, WOLO_SETTLEMENT_AUTH_TOKEN: "   ",
    WOLO_BET_CUSTODY_URL: "http://127.0.0.1:8092/settlement/v1/bet-custody",
  });
  assert.equal(noToken.custodyCapabilityPresent, false);
  assert.equal(noToken.executionReady, false);
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
  assert.match(card, /Shadow worker/);
  assert.match(card, /Preview matched/);
  assert.match(card, /Exact Watcher uploader \+ Steam roster proof matched/);
  assert.doesNotMatch(card, /market worker is intentionally not connected yet/);
  assert.doesNotMatch(card, /sendTokens|SigningStargateClient|connectWallet/);
  assert.match(route, /getSessionUid/);
  assert.match(route, /durableMarketEvaluatorReady: true/);
  assert.match(route, /shadow evaluator is connected/);
  assert.match(route, /error\.code === "P2002"/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /betWager\.create|betStakeTicket\.create/);
});

test("runtime copy distinguishes shadow evaluation from funded execution", () => {
  const runtimeSource = readFileSync(
    new URL("../lib/betAutomation.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    runtimeSource,
    /Preview mode evaluates eligible self-bet rules and records shadow evidence only/
  );
  assert.match(runtimeSource, /funded executor is not installed/);
  assert.match(runtimeSource, /LIVE_EXECUTOR_IMPLEMENTED = false/);
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
  assert.match(schema, /shadow producer writes preview/);
  assert.match(schema, /funded reservation\/ticket consumption remains disabled/);
  assert.match(schema, /ticketId\s+Int\?\s+@unique/);
  assert.match(migration, /ck_bet_auto_presets_self_only/);
  assert.match(migration, /ck_bet_auto_presets_game_plan/);
  assert.match(migration, /No producer or\s+-- consumer is enabled/);
});
