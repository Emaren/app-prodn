import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const radio = readFileSync("hooks/useRadioWoloListener.ts", "utf8");
const inbox = readFileSync("components/contact/HeaderInboxControl.tsx", "utf8");
const betsLayout = readFileSync("app/bets/layout.tsx", "utf8");
const betsPage = readFileSync("app/bets/page.tsx", "utf8");

test("Radio WOLO keeps media bytes off the page-ready path until listening intent", () => {
  const applyStart = radio.indexOf("const applyAnchorToAudio");
  const startListening = radio.indexOf("const startListening");
  const applyBlock = radio.slice(applyStart, startListening);
  assert.ok(applyStart >= 0 && startListening > applyStart);
  assert.match(applyBlock, /if \(!listeningIntentRef\.current\) \{\s*return;\s*\}/);
  assert.ok(
    applyBlock.indexOf("if (!listeningIntentRef.current)") < applyBlock.indexOf("audio.src ="),
    "listening-intent guard must run before audio.src is assigned",
  );
  assert.match(
    radio.slice(startListening, radio.indexOf("const stopListening")),
    /listeningIntentRef\.current =\s*true;[\s\S]*applyAnchorToAudio\(\s*anchor,?\s*\)/,
  );
});

test("responsive Nav Chat mounts share summary requests and one EventSource", () => {
  assert.match(inbox, /const sharedSummaryRequests = new Map/);
  assert.match(inbox, /function requestInboxSummaryShared/);
  assert.match(inbox, /const sharedInboxEventSubscribers = new Set/);
  assert.match(inbox, /let sharedInboxEventSource: EventSource \| null = null/);
  assert.match(inbox, /function subscribeSharedInboxEvents/);
  assert.match(inbox, /requestInboxSummaryShared\(/);
  assert.match(inbox, /subscribeSharedInboxEvents\(/);
  assert.equal(
    (inbox.match(/new EventSource\("\/api\/contact-emaren\/events"\)/g) || []).length,
    1,
  );
});


test("Bets bootstraps authoritative board truth before client hydration", () => {
  assert.match(betsLayout, /loadBetBoardSnapshot\(/);
  assert.match(betsLayout, /SESSION_COOKIE_NAME/);
  assert.match(betsLayout, /verifySession\(/);
  assert.match(betsLayout, /ensureMarkets:\s*false/);
  assert.match(betsLayout, /settlementSurfaceMode:\s*"fast"/);
  assert.match(betsLayout, /BetsInitialSnapshotProvider/);
  assert.match(betsPage, /useBetsInitialSnapshot\(\)/);
  assert.match(betsPage, /useState<BetBoardSnapshot \| null>\(initialSnapshot\)/);
  assert.match(betsPage, /useState\(initialSnapshot === null\)/);
  assert.match(
    betsPage,
    /else if \(!initialSnapshot\) \{\s*refreshBoard\(false\);\s*\}/,
  );
  assert.match(betsPage, /setInterval\([\s\S]*refreshBoard\(true\)/);
});
