import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_RADIO_LISTENER_HOLD_STATUS,
  RADIO_ON_AIR_MEDIA_HOLD_STATUS,
  adminRadioListenerReadHoldPayload,
  radioOnAirMediaReadHoldPayload,
  isAdminRadioListenerReadHold,
} from "../lib/radioWoloRestrictedReadHold.ts";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin listener hold never fabricates zero listener totals", () => {
  const hold = adminRadioListenerReadHoldPayload();
  assert.equal(hold.status, ADMIN_RADIO_LISTENER_HOLD_STATUS);
  assert.equal(hold.analyticsAvailable, false);
  assert.equal(hold.countsVerified, false);
  assert.equal("summary" in hold, false);
  assert.equal("listeners" in hold, false);
  assert.equal("tracks" in hold, false);
  assert.equal(isAdminRadioListenerReadHold(hold), true);
  assert.equal(isAdminRadioListenerReadHold({ ...hold, countsVerified: true }), false);
  assert.equal(isAdminRadioListenerReadHold({ ...hold, status: "PASS" }), false);
  assert.equal(isAdminRadioListenerReadHold(null), false);
});

test("media hold denies playback without suggesting a missing user file", () => {
  const hold = radioOnAirMediaReadHoldPayload();
  assert.equal(hold.status, RADIO_ON_AIR_MEDIA_HOLD_STATUS);
  assert.equal(hold.playbackAvailable, false);
  assert.equal("audioStorageKey" in hold, false);
  assert.equal("mediaUrl" in hold, false);
});

test("admin-only route checks signed identity before C03 nonfinancial HOLD", () => {
  const route = source("app/api/admin/radio/listeners/route.ts");
  const auth = route.indexOf("await requireAdmin");
  const denied = route.indexOf('if ("error" in gate)');
  const restricted = route.indexOf("if (isNonfinancialPublicReadProfile())");
  const legacy = route.indexOf("await loadAdminRadioWoloAnalytics");
  assert.ok(auth > -1 && auth < denied && denied < restricted && restricted < legacy);
  assert.match(route, /adminRadioListenerReadHoldPayload\(\)/);
  assert.match(route, /status: 503/);
  assert.match(route, /Vary: "Cookie"/);
  assert.doesNotMatch(route, /GRANT|ALTER ROLE|BYPASSRLS/);
});

test("unadmitted dynamic audio route stays outside this strictly scoped release", () => {
  // The PRODUCT boundary forbids the bracketed [publicId] file path.
  // Keep the original route and its known restricted-read defect explicit;
  // #1391 retains the original separate source candidate pending review.
  const route = source("app/api/radio/station/audio/[publicId]/route.ts");
  assert.match(route, /radioStationState\.findUnique/);
  assert.doesNotMatch(route, /radioOnAirMediaReadHoldPayload\(\)/);
});

test("Radio WOLO admin UI stops 15s polling only on exact reader HOLD", () => {
  const ui = source("components/admin/RadioWoloListenerSignals.tsx");
  assert.match(ui, /isAdminRadioListenerReadHold\(hold\)/);
  assert.match(ui, /setReaderHold\(true\)/);
  assert.match(ui, /if \(readerHold\) return;/);
  assert.match(ui, /window\.setInterval\(\(\) => void refresh\(\), 15_000\)/);
  assert.match(ui, /setReaderHold\(false\)/);
  assert.match(ui, /onClick=\{\(\) =>\s*void refresh\(\)/);
});
