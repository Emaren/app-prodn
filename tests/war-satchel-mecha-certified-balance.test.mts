import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCertifiedWarSatchelRead } from "../lib/warSatchelBalanceRead.ts";
import { formatMinimalDenomAmount } from "../lib/woloBalanceRead.ts";
import { SATCHEL_FINANCIAL_BRIDGE_READY } from "../lib/warSatchelFinancialBridgeHold.ts";

const paid = () => ({
  available: true, chainId: "wolo-1", denom: "uwolo",
  availableUwolo: "88000000", reservedUwolo: "12000000",
  withdrawalPendingUwolo: "0", committedHistoricalUwolo: "0",
  version: "7", depositEnabled: true, wageringEnabled: false,
});

test("owner Satchel read preserves exact 100-WOLO deposit minus reserved 12 stake", () => {
  const available = parseCertifiedWarSatchelRead(paid());
  assert.ok(available);
  assert.equal(formatMinimalDenomAmount(available.availableUwolo), "88.00");
  assert.equal(formatMinimalDenomAmount(available.reservedUwolo), "12.00");
  assert.equal(formatMinimalDenomAmount(available.withdrawalPendingUwolo), "0.00");
  assert.equal(available.version, "7");
  assert.ok(Object.isFrozen(available));
  assert.equal(parseCertifiedWarSatchelRead({...paid(), wageringEnabled: true})?.availableUwolo, "88000000",
    "once financial authority is independently activated, the display must remain a read-only client");
});

test("uncertified, wrong-chain, missing or malformed ledger data cannot display Satchel funds", () => {
  assert.equal(SATCHEL_FINANCIAL_BRIDGE_READY, false);
  for (const input of [
    null, undefined, {}, [],
    {...paid(), available: false},
    {...paid(), chainId: "wolo-test"},
    {...paid(), denom: "stake"},
    {...paid(), wageringEnabled: "true"},
    {...paid(), availableUwolo: "0.5"},
    {...paid(), availableUwolo: "00"},
    {...paid(), availableUwolo: "10000000000000000000"},
    {...paid(), reservedUwolo: "-1"},
    {...paid(), reservedUwolo: null},
    {...paid(), withdrawalPendingUwolo: "a"},
    {...paid(), committedHistoricalUwolo: "1e12"},
    {...paid(), version: "1.0"},
  ]) {
    assert.equal(parseCertifiedWarSatchelRead(input), null, JSON.stringify(input));
  }
  const held = {...paid(), available: false, availableUwolo: "0", reservedUwolo: "0",
    source: "not_installed_or_not_certified"};
  assert.equal(parseCertifiedWarSatchelRead(held), null);
});

test("Mecha only consumes private no-store API, never invents Satchel balance from wallet or user input", () => {
  const panel = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/user/war-satchel/balance/route.ts", import.meta.url), "utf8");
  assert.match(panel, /fetch\("\/api\/user\/war-satchel\/balance"/);
  assert.match(panel, /cache: "no-store", credentials: "same-origin"/);
  assert.match(panel, /parseCertifiedWarSatchelRead\(value\)/);
  assert.match(panel, /formatMinimalDenomAmount\(satchelBalance\.availableUwolo\)/);
  assert.match(panel, /setSatchelBalance\(null\)/);
  assert.doesNotMatch(panel, /satchelVerifiedBalanceWolo: string \| null = null/);
  assert.doesNotMatch(panel, /setSatchelBalance\([^)]*(walletAmount|depositAmount|walletBalance)/);
  assert.match(api, /if \(!activated\) return NextResponse\.json/);
  assert.match(api, /available: false, depositEnabled: false, wageringEnabled: false/);
  assert.match(api, /await getSessionUid\(request\)/);
  assert.match(api, /where: \{ ownerUserId: owner\.id \}/);
  assert.match(api, /Cache-Control": "private, no-store"/);
});
