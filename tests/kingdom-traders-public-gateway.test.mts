import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gateway = readFileSync(
  new URL("../app/kingdom-traders/page.tsx", import.meta.url),
  "utf8",
);
const header = readFileSync(
  new URL("../components/HeaderMenu.tsx", import.meta.url),
  "utf8",
);

test("Kingdom Traders has a genuine canonical public page and header entry", () => {
  assert.match(gateway, /canonical: "\/kingdom-traders"/);
  assert.match(gateway, /export default function KingdomTradersPage/);
  assert.match(
    header,
    /href: "\/kingdom-traders", label: "Kingdom Traders", icon: Bot, featured: true/,
  );
});

test("the gateway tells the truth about disconnected PAPER and disabled live orders", () => {
  assert.match(gateway, /"Execution connectivity", "Not connected"/);
  assert.match(gateway, /"Public bot telemetry", "Not connected"/);
  assert.match(gateway, /"Live order entry", "Disabled"/);
  assert.match(gateway, /No exchange keys, real orders, private PAPER API calls/);
});

test("public gateway has no private endpoint, financial writer or fake balances", () => {
  assert.doesNotMatch(gateway, /\bfetch\s*\(/);
  assert.doesNotMatch(gateway, /\bprocess\.env\b/);
  assert.doesNotMatch(gateway, /localhost|127\.0\.0\.1|:9447|:809[2345]/);
  assert.doesNotMatch(gateway, /\b(placeOrder|executeOrder|transfer|settleBets)\s*\(/);
  assert.doesNotMatch(gateway, /\bUSD\s*\$?\d+|\$\d+[.,]?\d*/);
});

test("gateway offers actionable navigation instead of inert trading buttons", () => {
  assert.match(gateway, /href="#workbenches"/);
  assert.match(gateway, /href="\/kingdom"/);
  assert.match(gateway, /href="\/kingdom-progress"/);
  assert.doesNotMatch(gateway, /<button/);
});
