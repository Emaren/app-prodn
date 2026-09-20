import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("successful compact faucet claim shows amount and on-chain proof", async () => {
  const source = await readFile("components/wolo/WoloFaucetCard.tsx", "utf8");

  assert.match(source, /Claimed \+\{FAUCET_AMOUNT_WOLO\} WOLO/);
  assert.match(source, /tx \{formatTxhash\(txhash\)\}/);
  assert.match(source, />\s*proof\s*<\/a>/);
  assert.match(source, /href=\{txUrl\}/);
});
