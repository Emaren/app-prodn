import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAPER_BLUEPRINT_RESEARCH_UNIVERSE,
  PAPER_STRATEGY_BLUEPRINTS,
  paperStrategyBlueprint,
} from "../lib/kingdomPaperStrategyBlueprints.ts";

const client = readFileSync("app/kingdom-traders/StrategyBlueprintWorkshop.tsx", "utf8");
const page = readFileSync("app/kingdom-traders/page.tsx", "utf8");
const catalog = readFileSync("lib/kingdomPaperStrategyBlueprints.ts", "utf8");

test("the two bounded PAPER research hypotheses are well-formed and explicit", () => {
  assert.deepEqual(PAPER_STRATEGY_BLUEPRINTS.map(x => x.id), ["twin-blades", "pincer"]);
  assert.deepEqual(PAPER_STRATEGY_BLUEPRINTS.map(x => x.name), ["Twin Blades", "Pincer"]);
  assert.deepEqual(PAPER_BLUEPRINT_RESEARCH_UNIVERSE.bases, ["BTC", "ETH", "SOL"]);
  assert.deepEqual(PAPER_BLUEPRINT_RESEARCH_UNIVERSE.referenceQuotes, ["USDT", "USDC"]);
  assert.deepEqual(PAPER_BLUEPRINT_RESEARCH_UNIVERSE.proposedVenues, ["Kraken", "Coinbase"]);
  for (const blueprint of PAPER_STRATEGY_BLUEPRINTS) {
    assert.equal(blueprint.legs.length, 2);
    assert.ok(blueprint.questions.length >= 3);
    assert.ok(blueprint.studyPlan.length >= 3);
    assert.ok(blueprint.premise.includes("risk") || blueprint.premise.includes("increase exposure"));
    assert.ok(paperStrategyBlueprint(blueprint.id) === blueprint);
  }
});

test("workshop is wired into the existing canonical public Kingdom Traders route", () => {
  assert.match(page, /import StrategyBlueprintWorkshop from "\.\/StrategyBlueprintWorkshop"/);
  assert.match(page, /<PaperFleetPreview\s*\/>/);
  assert.match(page, /<StrategyBlueprintWorkshop\s*\/>/);
  assert.match(client, /id="strategy-blueprints"/);
  assert.match(client, /aria-labelledby="strategy-blueprints-heading"/);
  assert.match(client, /useState<PaperBlueprintId>\("twin-blades"\)/);
  assert.match(client, /aria-label="Select a PAPER strategy blueprint"/);
  assert.match(client, /aria-pressed=\{selected === option\.id\}/);
  assert.match(client, /aria-controls="strategy-blueprint-details"/);
  assert.match(client, /aria-live="polite"/);
});

test("read-only design never represents connected exchanges, active returns or bots", () => {
  const source = client + page + catalog;
  assert.match(client, /Research design · Not connected/);
  assert.match(client, /no live/);
  assert.match(client, /No Kraken or Coinbase connection is established/);
  assert.match(client, /PAPER-only engine/);
  assert.match(client, /no live\s+entries, configured strategies, backtests, or simulated returns/);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bprocess\.env\b|localhost|127\.0\.0\.1|:9447|:809[2345]/);
  assert.doesNotMatch(source, /\b(placeOrder|executeOrder|submitOrder|connectExchange|settleBets|transferFunds)\s*\(/);
  assert.doesNotMatch(source, /\$\d+[.,]?\d*|\bPnL\s*[:=]\s*\d+/);
});
