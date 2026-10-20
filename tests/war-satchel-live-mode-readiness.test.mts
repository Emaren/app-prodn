import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FUNDED_MECHA_PUBLIC_LIVE_CONTROLS,
  evaluateFundedMechaPublicReadiness,
  observeFundedMechaPublicReadiness,
} from "../lib/warSatchelLiveModeReadiness.ts";
import { readBetAutomationRuntime } from "../lib/betAutomation.ts";
import { satchelFinancialBridgeReady } from "../lib/warSatchelFinancialBridgeHold.ts";

function certifiedFlags() {
  return Object.fromEntries(
    FUNDED_MECHA_PUBLIC_LIVE_CONTROLS.map(name => [name, "true"]),
  );
}

test("environment flags, even all true, cannot defeat hardcoded financial source HOLD", () => {
  const config = {
    ...certifiedFlags(), BET_AUTOMATION_MODE: "live",
    WOLO_BET_CUSTODY_CAPABILITY: "bet-custody-v1",
    WOLO_BET_CUSTODY_URL: "http://127.0.0.1:8092/settlement/v1/bet-custody",
    WOLO_SETTLEMENT_AUTH_TOKEN: "not-a-production-secret",
  };
  assert.equal(satchelFinancialBridgeReady(), false);
  const observed = observeFundedMechaPublicReadiness(config);
  assert.equal(observed.ready, false);
  assert.equal(observed.status, "CERTIFICATION_REQUIRED");
  assert.ok(observed.unresolvedControlNames.includes(
    "SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD"));
  assert.equal(readBetAutomationRuntime(config).executionReady, false);
  assert.notEqual(readBetAutomationRuntime(config).mode, "live");
});

test("pure status simulation requires source release AND every independent certification", () => {
  const config = certifiedFlags();
  const future = evaluateFundedMechaPublicReadiness(config, true);
  assert.equal(future.ready, true);
  assert.equal(future.status, "CONFIGURED_AFTER_SOURCE_RELEASE");
  assert.deepEqual(future.unresolvedControlNames, []);
  assert.ok(Object.isFrozen(future));
  assert.ok(Object.isFrozen(future.unresolvedControlNames));
  const held = evaluateFundedMechaPublicReadiness(config, false);
  assert.equal(held.ready, false);
  assert.deepEqual(held.unresolvedControlNames,
    ["SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD"]);
});

test("fail closed when any source, original LIVE Watcher, signer-health or other named control is absent", () => {
  const complete = certifiedFlags();
  for (const name of FUNDED_MECHA_PUBLIC_LIVE_CONTROLS) {
    for (const badValue of [undefined, "", "TRUE", "1", "false", " true", "true "]) {
      const env = { ...complete, [name]: badValue };
      const readiness = evaluateFundedMechaPublicReadiness(env, true);
      assert.equal(readiness.ready, false, name + ":" + badValue);
      assert.deepEqual(readiness.unresolvedControlNames, [name]);
      assert.equal(observeFundedMechaPublicReadiness(env).ready, false);
    }
  }
  assert.ok(FUNDED_MECHA_PUBLIC_LIVE_CONTROLS.includes(
    "WAR_SATCHEL_ORIGINAL_LIVE_WATCHER_CERTIFIED"));
  assert.ok(FUNDED_MECHA_PUBLIC_LIVE_CONTROLS.includes(
    "WAR_SATCHEL_SIGNER_RUNTIME_HEALTH_ATTESTED"));
});

test("read-only public presentation does not disclose env values or become signing authority", () => {
  const config = {
    ...certifiedFlags(),
    WAR_SATCHEL_SIGNER_AUTH_TOKEN: "PRIVATE_VALUE_NO_OUTPUT",
  };
  const status = observeFundedMechaPublicReadiness(config);
  assert.equal(JSON.stringify(status).includes("PRIVATE_VALUE_NO_OUTPUT"), false);
  const src = readFileSync(new URL("../lib/warSatchelLiveModeReadiness.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /SigningStargateClient|signArbitrary|submitOneShot|sendTokens|broadcastTx/);
  assert.match(src, /satchelFinancialBridgeReady\(\)/);
});

test("all three owner-facing signals share the same held-source guard", () => {
  const automation = readFileSync(new URL("../lib/betAutomation.ts", import.meta.url), "utf8");
  const balance = readFileSync(new URL("../app/api/user/war-satchel/balance/route.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  assert.match(automation, /observeFundedMechaPublicReadiness\(env\)\.ready/);
  assert.match(automation, /mode: "live"/);
  assert.match(automation, /executionReady: true/);
  assert.match(balance, /wageringEnabled: observeFundedMechaPublicReadiness\(\)\.ready/);
  assert.match(balance, /if \(!activated\) return NextResponse\.json/);
  assert.match(balance, /available: false, depositEnabled: false, wageringEnabled: false/);
  assert.match(panel, /FUNDED EXECUTOR CONFIGURED/);
  assert.match(panel, /SAVE MECHA PLAN/);
  assert.match(panel, /NO WOLO MOVED · NO BET PLACED/);
  assert.doesNotMatch(panel, /FUNDING STATUS UNAVAILABLE/);
});
