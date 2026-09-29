import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateBetAutoShadowAdmission,
  type BetAutoShadowDesyncMarketInput,
  type BetAutoShadowMarketInput,
  type BetAutoShadowPresetInput,
  type BetAutoShadowSessionInput,
} from "../lib/betAutomation.ts";

const OWNER_STEAM = "76561198000000001";
const OTHER_STEAM = "76561198000000002";

function preset(
  overrides: Partial<BetAutoShadowPresetInput> = {}
): BetAutoShadowPresetInput {
  return {
    id: 7,
    version: 3,
    enabled: true,
    winnerStakeWolo: 25,
    desyncSide: "none",
    desyncStakeWolo: 0,
    untilOut: false,
    gamesRemaining: 3,
    selfOnly: true,
    ...overrides,
  };
}

function market(
  overrides: Partial<BetAutoShadowMarketInput> = {}
): BetAutoShadowMarketInput {
  return {
    id: 41,
    marketType: "winner",
    status: "live",
    scheduledMatchId: null,
    linkedSessionKey: "platform:exact-match",
    propositionHash: "a".repeat(64),
    teamResolutionStatus: "resolved",
    teamConfidence: "high",
    integrityStatus: "verified",
    leftRosterSnapshot: [
      { name: "Emaren", steamId: OWNER_STEAM, teamId: 1 },
    ],
    rightRosterSnapshot: [
      { name: "Opponent", steamId: OTHER_STEAM, teamId: 2 },
    ],
    ...overrides,
  };
}

function session(
  overrides: Partial<BetAutoShadowSessionInput> = {}
): BetAutoShadowSessionInput {
  return {
    sessionKey: "platform:exact-match",
    identityAliases: ["legacy-exact-match"],
    uploaders: [{ uid: "emaren" }],
    ...overrides,
  };
}

function desync(
  overrides: Partial<BetAutoShadowDesyncMarketInput> = {}
): BetAutoShadowDesyncMarketInput {
  return {
    id: 42,
    parentMarketId: 41,
    marketType: "desync",
    status: "live",
    propositionHash: "a".repeat(64),
    integrityStatus: "verified",
    ...overrides,
  };
}

function evaluate(
  overrides: {
    preset?: Partial<BetAutoShadowPresetInput>;
    market?: Partial<BetAutoShadowMarketInput>;
    session?: Partial<BetAutoShadowSessionInput>;
    ownerUid?: string | null;
    ownerSteamId?: string | null;
    desyncMarket?: BetAutoShadowDesyncMarketInput | null;
  } = {}
) {
  return evaluateBetAutoShadowAdmission({
    preset: preset(overrides.preset),
    ownerUid:
      overrides.ownerUid === undefined
        ? "emaren"
        : overrides.ownerUid,
    ownerSteamId:
      overrides.ownerSteamId === undefined
        ? OWNER_STEAM
        : overrides.ownerSteamId,
    market: market(overrides.market),
    session: session(overrides.session),
    desyncMarket:
      overrides.desyncMarket === undefined
        ? null
        : overrides.desyncMarket,
  });
}

test("shadow admission selects the exact Steam roster side for the exact uploader", () => {
  const left = evaluate();
  assert.equal(left.eligible, true);
  if (!left.eligible) return;
  assert.equal(left.selectedSide, "left");
  assert.equal(left.gameIdentityKey, "platform:exact-match");
  assert.equal(left.sessionKey, "platform:exact-match");
  assert.equal(left.desyncMarketId, null);
  assert.equal(left.evidence.exactSteamRosterMatch, true);
  assert.equal(left.evidence.exactUploaderUidMatch, true);

  const right = evaluate({
    market: {
      leftRosterSnapshot: [
        { name: "Opponent", steamId: OTHER_STEAM, teamId: 1 },
      ],
      rightRosterSnapshot: [
        { name: "Emaren", steamId: OWNER_STEAM, teamId: 2 },
      ],
    },
  });
  assert.equal(right.eligible, true);
  if (!right.eligible) return;
  assert.equal(right.selectedSide, "right");
});

test("a proven session alias resolves to the canonical game identity", () => {
  const result = evaluate({
    market: { linkedSessionKey: "legacy-exact-match" },
  });

  assert.equal(result.eligible, true);
  if (!result.eligible) return;
  assert.equal(result.gameIdentityKey, "platform:exact-match");
  assert.equal(result.sessionKey, "platform:exact-match");
});

test("shadow admission fails closed without exact uploader UID proof", () => {
  const result = evaluate({
    session: { uploaders: [{ uid: "someone-else" }] },
  });
  assert.deepEqual(result, {
    eligible: false,
    reason: "owner_not_exact_uploader",
  });
});

test("shadow admission requires one and only one Steam roster side", () => {
  const missing = evaluate({
    market: {
      leftRosterSnapshot: [
        { name: "Alpha", steamId: OTHER_STEAM, teamId: 1 },
      ],
      rightRosterSnapshot: [
        { name: "Bravo", steamId: "76561198000000003", teamId: 2 },
      ],
    },
  });
  assert.deepEqual(missing, {
    eligible: false,
    reason: "owner_not_on_exactly_one_roster_side",
  });

  const ambiguous = evaluate({
    market: {
      leftRosterSnapshot: [
        { name: "Emaren", steamId: OWNER_STEAM, teamId: 1 },
      ],
      rightRosterSnapshot: [
        { name: "Duplicate", steamId: OWNER_STEAM, teamId: 2 },
      ],
    },
  });
  assert.deepEqual(ambiguous, {
    eligible: false,
    reason: "owner_not_on_exactly_one_roster_side",
  });

  const invalidSteam = evaluate({ ownerSteamId: "not-a-steam-id" });
  assert.deepEqual(invalidSteam, {
    eligible: false,
    reason: "owner_steam_id_missing",
  });
});

test("shadow admission rejects non-live, scheduled, or unverified winner markets", () => {
  assert.equal(
    evaluate({ market: { status: "closing" } }).eligible,
    false
  );
  assert.equal(
    evaluate({ market: { scheduledMatchId: 55 } }).eligible,
    false
  );

  for (const marketOverride of [
    { teamResolutionStatus: "ambiguous" },
    { teamConfidence: "medium" },
    { integrityStatus: "blocked" },
  ]) {
    const result = evaluate({ market: marketOverride });
    assert.deepEqual(result, {
      eligible: false,
      reason: "market_roster_not_verified",
    });
  }
});

test("session identity must come from the exact canonical alias set", () => {
  const result = evaluate({
    market: { linkedSessionKey: "guessed-from-display-name" },
  });
  assert.deepEqual(result, {
    eligible: false,
    reason: "session_identity_mismatch",
  });
});

test("a configured Desync leg requires the exact live sibling proposition", () => {
  const missing = evaluate({
    preset: {
      desyncSide: "yes",
      desyncStakeWolo: 5,
    },
  });
  assert.deepEqual(missing, {
    eligible: false,
    reason: "desync_market_missing_or_inconsistent",
  });

  const wrongHash = evaluate({
    preset: {
      desyncSide: "yes",
      desyncStakeWolo: 5,
    },
    desyncMarket: desync({ propositionHash: "b".repeat(64) }),
  });
  assert.deepEqual(wrongHash, {
    eligible: false,
    reason: "desync_market_missing_or_inconsistent",
  });

  const eligible = evaluate({
    preset: {
      desyncSide: "no",
      desyncStakeWolo: 5,
    },
    desyncMarket: desync(),
  });
  assert.equal(eligible.eligible, true);
  if (!eligible.eligible) return;
  assert.equal(eligible.desyncMarketId, 42);
});

test("finite plans must still have capacity, while Until Out remains preview-eligible", () => {
  const exhausted = evaluate({
    preset: { gamesRemaining: 0 },
  });
  assert.deepEqual(exhausted, {
    eligible: false,
    reason: "finite_plan_exhausted",
  });

  const untilOut = evaluate({
    preset: {
      untilOut: true,
      gamesRemaining: null,
    },
  });
  assert.equal(untilOut.eligible, true);
});

test("shadow worker is durable but structurally non-financial", () => {
  const worker = readFileSync(
    new URL("../lib/betAutomationShadowWorker.ts", import.meta.url),
    "utf8"
  );
  const bets = readFileSync(
    new URL("../lib/bets.ts", import.meta.url),
    "utf8"
  );

  assert.match(worker, /BET_AUTO_SHADOW_READY_STATUS = "shadow_ready"/);
  assert.match(worker, /betAutoExecution\.createMany/);
  assert.match(worker, /skipDuplicates: true/);
  assert.match(worker, /acceptedAt: null/);
  assert.match(worker, /reservationId: null/);
  assert.match(worker, /attemptCount: 0/);

  assert.doesNotMatch(worker, /betWager\.create/);
  assert.doesNotMatch(worker, /betStakeTicket\.create/);
  assert.doesNotMatch(worker, /betStakeIntent\.create/);
  assert.doesNotMatch(worker, /gamesRemaining:\s*\{\s*decrement/);
  assert.doesNotMatch(worker, /acceptedAt:\s*new Date/);

  const settleIndex = bets.indexOf(
    "await settleFounderBonuses(prisma);"
  );
  const workerIndex = bets.indexOf(
    "await runBetAutoShadowWorker(prisma, { activeSessions });"
  );
  assert.ok(settleIndex >= 0);
  assert.ok(workerIndex > settleIndex);
  assert.match(
    bets.slice(settleIndex, workerIndex + 300),
    /try \{[\s\S]*runBetAutoShadowWorker[\s\S]*catch \(error\)/
  );
});

test("market reconciliation reuses its canonical active-session snapshot for shadow evaluation", () => {
  const bets = readFileSync(
    new URL("../lib/bets.ts", import.meta.url),
    "utf8"
  );
  const worker = readFileSync(
    new URL("../lib/betAutomationShadowWorker.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    bets,
    /activeSessions: sessionSnapshot\.activeSessions/
  );
  assert.match(
    bets,
    /runBetAutoShadowWorker\(prisma, \{ activeSessions \}\)/
  );
  assert.doesNotMatch(worker, /loadLiveSessionSnapshot/);
});
