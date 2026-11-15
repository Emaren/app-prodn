import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseWoloPublicBlock } from "../lib/woloBrowserBlocks.ts";
import { readFactoryPublicStatus, unknownFactoryStatus } from "../lib/factoryPublicStatus.ts";

const root = new URL("../", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");
const now = Date.parse("2026-11-14T23:45:10Z");
function block(height = "2986507", txs: string[] | null = []) {
  return { result: {
    block_id: { hash: "A".repeat(64) },
    block: { header: { chain_id: "wolo-1", height, time: "2026-11-14T23:45:05Z" },
      data: { txs } },
  } };
}
test("Wolo public blocks retain exact real height, timestamp, hash and zero transactions", () => {
  const value = parseWoloPublicBlock(block(), "2986507", now);
  assert.equal(value.height, "2986507");
  assert.equal(value.transactionCount, 0);
  assert.deepEqual(value.transactionBase64, []);
  assert.equal(value.hash, "A".repeat(64));
});
test("Wolo block parser accepts bounded transaction count with sampled hashes", () => {
  const value = parseWoloPublicBlock(block("2986507", Array(14).fill("YWJj")), "2986507", now);
  assert.equal(value.transactionCount, 14);
  assert.equal(value.transactionBase64.length, 8);
});
test("wrong chain, height mismatch, bad hash, absurd transactions and future time fail closed", () => {
  const wrong = block(); wrong.result.block.header.chain_id = "other-1";
  assert.throws(() => parseWoloPublicBlock(wrong, "2986507", now), /WRONG_CHAIN/);
  assert.throws(() => parseWoloPublicBlock(block(), "2986508", now), /HEIGHT_MISMATCH/);
  const bad = block(); bad.result.block_id.hash = "invalid";
  assert.throws(() => parseWoloPublicBlock(bad, "2986507", now), /HASH_INVALID/);
  assert.throws(() => parseWoloPublicBlock(block("2986507", Array(2001).fill("YWJj")), "2986507", now), /INVALID_TXS/);
  const future = block(); future.result.block.header.time = "2026-11-14T23:48:00Z";
  assert.throws(() => parseWoloPublicBlock(future, "2986507", now), /FUTURE_TIME/);
  assert.throws(() => parseWoloPublicBlock({}, "2986507", now), /MALFORMED/);
});
test("Kingdom Deployments reads only the public Factory receipt feed and supplies no deploy controls", () => {
  const client = read("app/kingdom-deployments/KingdomDeploymentsClient.tsx");
  assert.match(client, /readFactoryPublicStatus/);
  assert.match(client, /\/factory\/status\.json/);
  assert.match(client, /no-store/);
  assert.doesNotMatch(client, /fetch\([^)]*(?:method:\s*["']POST|\/api\/deploy)/);
  assert.match(client, /HISTORY BOUNDARY/);
  const nav = read("components/HeaderMenu.tsx");
  const a = nav.indexOf('label: "Kingdom Progress"');
  const b = nav.indexOf('label: "Kingdom Deployments"');
  const c = nav.indexOf('label: "Renaissance Campaign"');
  assert.ok(a >= 0 && a < b && b < c);
  assert.match(read("app/AppShell.tsx"), /pathname === "\/factory"/);
  assert.match(read("components/wolo/WoloChainTerminalTile.tsx"), /WoloBlockRail/);
  assert.deepEqual(readFactoryPublicStatus(unknownFactoryStatus(), now).value, unknownFactoryStatus());
});
