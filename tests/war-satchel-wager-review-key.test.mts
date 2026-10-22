import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readWagerReviewerKey } from "../lib/warSatchelWagerReviewerKey.ts";

const withdrawalKey = "1".repeat(64);
const wagerKey = "2".repeat(64);

test("wager-review authority is never substituted with the withdrawal key", async () => {
  const priorW = process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE;
  const priorD = process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE;
  const dir = await realpath(await mkdtemp(join(tmpdir(), "aoe2war-wager-review-role-")));
  const withdrawalPath = join(dir, "withdrawal-public.json");
  const wagerPath = join(dir, "wager-public.json");
  const symlinkPath = join(dir, "wager-link.json");
  try {
    await writeFile(withdrawalPath, JSON.stringify({approval_public_key_hex:withdrawalKey}), {mode:0o600});
    await writeFile(wagerPath, JSON.stringify({wager_approval_public_key_hex:wagerKey}), {mode:0o600});
    process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE = withdrawalPath;
    process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = wagerPath;
    assert.equal(await readWagerReviewerKey(), wagerKey);

    process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = withdrawalPath;
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);
    process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = wagerPath;

    await writeFile(wagerPath, JSON.stringify({wager_approval_public_key_hex:withdrawalKey}));
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);
    await writeFile(wagerPath, JSON.stringify({approval_public_key_hex:wagerKey}));
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);
    await writeFile(wagerPath, JSON.stringify({wager_approval_public_key_hex:wagerKey,approval_public_key_hex:withdrawalKey}));
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);

    await writeFile(wagerPath, JSON.stringify({wager_approval_public_key_hex:wagerKey}));
    await chmod(wagerPath, 0o644);
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);
    await chmod(wagerPath, 0o600);

    await symlink(wagerPath, symlinkPath);
    process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = symlinkPath;
    await assert.rejects(readWagerReviewerKey(), /SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE/);
    process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = wagerPath;
    assert.equal(await readWagerReviewerKey(), wagerKey);
  } finally {
    if (priorW === undefined) delete process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE;
    else process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE = priorW;
    if (priorD === undefined) delete process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE;
    else process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE = priorD;
    await rm(dir,{recursive:true,force:true});
  }
});

test("all original wager approval consumers require a distinct wager public key", () => {
  const cases = [
    "lib/warSatchelIndependentReviewerPickup.ts",
    "lib/warSatchelDedicatedSignerClient.ts",
    "lib/warSatchelAuthenticatedFinancialProof.ts",
    "lib/warSatchelFundedLedger.ts",
  ];
  for (const file of cases) {
    const text = readFileSync(new URL("../" + file,import.meta.url),"utf8");
    assert.match(text,/readWagerReviewerKey/);
  }
  for (const functionName of ["markSatchelSubmissionAttempt", "attachIndependentSatchelWagerReview", "loadSatchelWagerReview"]) {
    const text = readFileSync(new URL("../lib/warSatchelFundedLedger.ts",import.meta.url),"utf8");
    const start = text.indexOf("export async function " + functionName);
    assert.ok(start >= 0,functionName + " missing");
    const next = text.indexOf("export ",start + 22);
    const body = text.slice(start,next<0 ? undefined : next);
    assert.match(body,/readWagerReviewerKey\(\)/,functionName);
    assert.doesNotMatch(body,/readWithdrawalReviewerKey\(\)/,functionName);
  }
});
