import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = JSON.parse(
  readFileSync(new URL("../config/session-c-kingdom-traders-seam.json", import.meta.url), "utf8")
);
const page = readFileSync(
  new URL("../components/kingdom-traders/KingdomTradersPreview.tsx", import.meta.url), "utf8"
);

test("Session C only publishes a read-only public navigation preview", () => {
  assert.equal(contract.schema, "aoe2war.session-c.kingdom-traders.nonfinancial-seam.v1");
  assert.equal(contract.previewRoute, "/kingdom-traders");
  assert.equal(contract.routeMounted, false);
  assert.equal(contract.navigationEnabled, false);
  assert.equal(contract.publicOrigin, null);
  assert.equal(contract.publicCertificateTrusted, false);
  assert.equal(contract.websiteReleaseOwnershipTransferred, false);
  assert.equal(contract.operatorCredentialDelegation, false);
  assert.equal(contract.steamAuthenticationDelegation, false);
  assert.equal(contract.privateSourceProxyEnabled, false);
  assert.equal(contract.financialSQLAccessAllowed, false);
  assert.ok(contract.requiredApprovals.includes("SESSION_B_AUTHENTICATED_3032_ROLLBACK_HANDOFF"));
});

test("Unverified source remains on HALT and no financial path becomes available", () => {
  assert.equal(contract.paperSourceStatus, "HALT_NO_INDEPENDENT_FRESH_MARKET_DATA");
  assert.equal(contract.paperAccountsInHistoricalSnapshot, 100);
  assert.equal(contract.openUnpricedHistoricalPaperPositions, 7);
  for (const field of ["realOrdersAllowed", "walletFundingAllowed",
                       "leverageAllowed", "woloInteractionsAllowed"]) {
    assert.equal(contract[field], false, field);
  }
  assert.equal(contract.approvedReadOnlyStatusShape.realOrders, 0);
  assert.equal(contract.approvedReadOnlyStatusShape.fundedAuthority, false);
  assert.equal(contract.approvedReadOnlyStatusShape.paperNewOrdersAllowed, false);
});

test("No App operator secret, cross-origin fetch or private API is wired", () => {
  assert.match(page, /No sign-in forwarding/);
  assert.match(page, /No link to a certificate-untrusted origin/);
  assert.match(page, /no independently verified later Kraken source/i);
  for (const forbidden of ["fetch(", "process.env", "Authorization", "walletConnect",
                           "8094", "8092", "api/bets", "privateKey", "secretKey"]) {
    assert.equal(page.includes(forbidden), false, forbidden);
  }
});
