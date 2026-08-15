import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reward-window weight cannot overwrite lifetime staking weight", async () => {
  const source = await readFile(
    new URL("../lib/staking.ts", import.meta.url),
    "utf8",
  );

  // Reward accounting still has its own capped/window reconstruction.
  assert.match(
    source,
    /weightStartAt:\s*periodStart[\s\S]*rewardWeightCapWolo:\s*KINGDOM_STAKE_REWARD_CAP_WOLO/,
  );

  // Lifetime accounting is reconstructed separately without the reward cap.
  assert.match(
    source,
    /mainnetLifetimePositions[\s\S]*loadMainnetStakingPositions\(prisma,\s*\{[\s\S]*asOf:\s*periodEnd,[\s\S]*requireCompleteLedger:\s*true/,
  );

  // Permanent staking checkpoints must use lifetime weight.
  const lifetimeWrites =
    source.match(/accumulatedWeight:\s*position\.lifetimeWeight/g) ?? [];
  assert.equal(lifetimeWrites.length, 3);

  // The former corruption must not return.
  const rewardWeightWrites =
    source.match(/accumulatedWeight:\s*position\.userWeight/g) ?? [];
  assert.equal(rewardWeightWrites.length, 0);

  assert.match(
    source,
    /weightBefore:\s*position\.lifetimeWeight[\s\S]*weightAfter:\s*position\.lifetimeWeight/,
  );
});
