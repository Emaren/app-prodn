import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isValidBech32AccountAddress } from "../lib/woloBalanceRead.ts";
import {
  WOLO_OPERATOR_REPORTED_FAUCET_COHORT,
  WOLO_FAUCET_COHORT_PUBLIC_LABEL,
  WOLO_FAUCET_COHORT_QUALIFIER,
  isOperatorReportedFaucetCohortAddress,
} from "../lib/woloFaucetIncidentAnnotations.ts";

test("all eight operator-identified incident-review addresses are exact and valid WoloChain accounts", () => {
  assert.equal(WOLO_OPERATOR_REPORTED_FAUCET_COHORT.length, 8);
  assert.equal(new Set(WOLO_OPERATOR_REPORTED_FAUCET_COHORT).size, 8);
  for (const address of WOLO_OPERATOR_REPORTED_FAUCET_COHORT) {
    assert.equal(address.length, 43);
    assert.equal(isValidBech32AccountAddress(address, "wolo"), true, address);
    assert.equal(isOperatorReportedFaucetCohortAddress(address), true);
    assert.equal(isOperatorReportedFaucetCohortAddress(address.toUpperCase()), true);
  }
  assert.equal(isOperatorReportedFaucetCohortAddress("wolo1unrelated"), false);
  assert.match(WOLO_FAUCET_COHORT_PUBLIC_LABEL, /August 2026 faucet hack/);
  assert.match(WOLO_FAUCET_COHORT_QUALIFIER, /Operator-reported.*pending/);
});

test("screenshots' operator classification never substitutes for chain provenance or current-holder ranking", () => {
  const client = readFileSync("components/wolo/WoloChainLiveTransparency.tsx","utf8");
  const holdersRoute = readFileSync("app/api/wolo/holders/route.ts","utf8");
  const treasury = readFileSync("components/treasury/KingdomTreasury.tsx","utf8");
  assert.match(client,/holder\.classification === "unclassified"/);
  assert.match(client,/isOperatorReportedFaucetCohortAddress\(holder\.address\)/);
  assert.match(client,/parseWoloBalanceApiPayload/);
  assert.match(client,/formatMinimalDenomAmount/);
  assert.match(client,/offset < addresses\.length; offset \+= 4/);
  assert.match(client,/document\.visibilityState === "visible"/);
  assert.doesNotMatch(holdersRoute,/WOLO_OPERATOR_REPORTED_FAUCET_COHORT/);
  assert.doesNotMatch(treasury,/FAUCET RAID|TREASURY_FAUCET_INCIDENT|Incident evidence/);
});
