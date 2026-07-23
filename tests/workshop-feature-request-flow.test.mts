import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sponsor = readFileSync(
  new URL("../components/workshop/WorkshopSponsor.tsx", import.meta.url),
  "utf8",
);

const route = readFileSync(
  new URL("../app/api/workshop/sponsor/route.ts", import.meta.url),
  "utf8",
);

const inbox = readFileSync(
  new URL("../components/contact/ContactInboxPanel.tsx", import.meta.url),
  "utf8",
);

const protocol = readFileSync(
  new URL("../lib/featureRequestInboxMessage.ts", import.meta.url),
  "utf8",
);

test("Patronage is a simple feature composer without the old patron dashboard", () => {
  assert.match(sponsor, /Describe your feature/);
  assert.match(sponsor, /Send Feature Request/);
  assert.doesNotMatch(sponsor, /Patron Record/);
  assert.doesNotMatch(sponsor, /Workshop Treasury/);
  assert.doesNotMatch(sponsor, /Copy address/);
});

test("feature text is persisted before the WoloChain payment opens", () => {
  assert.match(
    sponsor,
    /action:\s*"intent"[\s\S]*walletAddress[\s\S]*requestText:\s*typedText/,
  );
  assert.match(route, /const requestText = normalizeRequestText\(body\.requestText\)/);
  assert.match(route, /requesterDisplayNameSnapshot:[\s\S]*requestText,[\s\S]*requesterAddress/);
});

test("completed requests disappear from the public composer", () => {
  assert.match(
    route,
    /status:\s*\{[\s\S]*in:\s*\["awaiting_payment",\s*"awaiting_request"\]/,
  );
  assert.match(sponsor, /setActiveRequest\(null\)/);
  assert.match(sponsor, /setRequestText\(""\)/);
});

test("submitted feature requests use a typed private inbox protocol", () => {
  assert.match(route, /buildFeatureRequestInboxMessage/);
  assert.match(protocol, /FEATURE_REQUEST_INBOX_HEADLINE/);
  assert.match(protocol, /🔨 FEATURE REQUEST/);
});

test("private inbox renders feature requests as dedicated cards", () => {
  assert.match(inbox, /parseFeatureRequestInboxMessage/);
  assert.match(inbox, /function FeatureRequestMessageCard/);
  assert.match(inbox, /Private Workshop request/);
  assert.match(inbox, /Payment verified/);
});
