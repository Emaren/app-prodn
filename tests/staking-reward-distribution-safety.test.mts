import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const executionSource = fs.readFileSync(
  new URL("../lib/stakingExecution.ts", import.meta.url),
  "utf8",
);
const runRouteSource = fs.readFileSync(
  new URL("../app/api/staking/rewards/run/route.ts", import.meta.url),
  "utf8",
);
const configRouteSource = fs.readFileSync(
  new URL("../app/api/staking/config/route.ts", import.meta.url),
  "utf8",
);

test("mainnet reward distribution is explicitly safety-paused", () => {
  assert.match(
    executionSource,
    /STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED = true/,
  );
});
test("reward run fails closed before Prisma is acquired", () => {
  const authIndex = runRouteSource.indexOf("bearerToken(request)");
  const pauseIndex = runRouteSource.indexOf(
    "if (STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED)",
  );
  const prismaIndex = runRouteSource.indexOf("const prisma = getPrisma()");

  assert.ok(authIndex >= 0);
  assert.ok(pauseIndex > authIndex);
  assert.ok(prismaIndex > pauseIndex);
  assert.match(
    runRouteSource,
    /code: "STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED"/,
  );
  assert.match(runRouteSource, /\{ status: 503 \}/);
});
test("public staking config exposes reward distribution safety state", () => {
  assert.match(
    configRouteSource,
    /rewardDistributionReady: !STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED/,
  );
  assert.match(
    configRouteSource,
    /rewardDistributionReadyDetail: STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED/,
  );
});
