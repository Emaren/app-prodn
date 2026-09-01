import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFaucetClaimPolicy,
  type FaucetPolicyRecord,
} from "../lib/woloFaucetPolicy.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 2_000_000_000_000;

function claim(
  ageMs: number,
  options: {
    cooling?: boolean;
    confirmed?: boolean;
  } = {}
): FaucetPolicyRecord {
  return {
    claimedAtMs: NOW - ageMs,
    cooldownEndsAtMs:
      options.cooling === false
        ? NOW
        : NOW + HOUR,
    txhash:
      options.confirmed === false
        ? ""
        : `TX-${ageMs}`,
  };
}

function evaluate(
  overrides: Partial<
    Parameters<
      typeof evaluateFaucetClaimPolicy
    >[0]
  > = {}
) {
  return evaluateFaucetClaimPolicy({
    nowMs: NOW,
    address: "wolo1freshdestination",
    addressClaim: null,
    accountClaim: null,
    circuitBreakerActive: false,
    accountClaims: [],
    maxClaimsPerHour: 30,
    maxClaimsPerDay: 100,
    hourlyWindowMs: HOUR,
    dailyWindowMs: DAY,
    ...overrides,
  });
}

test("same account with a fresh wallet is blocked", () => {
  const result = evaluate({
    accountClaim: claim(1_000),
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["block", "account_cooldown"]
  );
});

test("fresh account with a previously used wallet is blocked", () => {
  const result = evaluate({
    addressClaim: claim(1_000),
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["block", "address_cooldown"]
  );
});

test("account becomes eligible after cooldown", () => {
  const result = evaluate({
    accountClaim: claim(DAY, {
      cooling: false,
    }),
  });

  assert.equal(result.action, "allow");
});

test("fresh account and fresh wallet are allowed", () => {
  assert.equal(
    evaluate().action,
    "allow"
  );
});

test("30th hourly confirmed payout is allowed and 31st trips breaker", () => {
  const twentyNine =
    Array.from(
      { length: 29 },
      (_, index) =>
        claim(
          10_000 + index * 1_000,
          { cooling: false }
        )
    );

  const thirty =
    Array.from(
      { length: 30 },
      (_, index) =>
        claim(
          10_000 + index * 1_000,
          { cooling: false }
        )
    );

  assert.equal(
    evaluate({
      accountClaims: twentyNine,
    }).action,
    "allow"
  );

  const result = evaluate({
    accountClaims: thirty,
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["trip", "hourly_limit"]
  );
});

test("daily confirmed payout ceiling trips independently", () => {
  const claims =
    Array.from(
      { length: 100 },
      (_, index) =>
        claim(
          2 * HOUR +
            index * 5 * 60 * 1000,
          { cooling: false }
        )
    );

  const result = evaluate({
    accountClaims: claims,
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["trip", "daily_limit"]
  );
});

test("uncertain reservations do not count as confirmed payouts", () => {
  const reservations =
    Array.from(
      { length: 200 },
      (_, index) =>
        claim(
          index * 1_000,
          {
            cooling: false,
            confirmed: false,
          }
        )
    );

  const result = evaluate({
    accountClaims: reservations,
  });

  assert.equal(result.action, "allow");
  assert.equal(
    result.hourlyConfirmedClaims,
    0
  );
  assert.equal(
    result.dailyConfirmedClaims,
    0
  );
});

test("persistent circuit breaker blocks immediately", () => {
  const result = evaluate({
    circuitBreakerActive: true,
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["block", "circuit_breaker"]
  );
});


test("uncertain account reservation protects its destination from another account", () => {
  const uncertainReservation = {
    ...claim(1_000, {
      confirmed: false,
    }),
    address: "wolo1shareddestination",
  };

  const result = evaluate({
    address: "wolo1shareddestination",
    accountClaims: [
      uncertainReservation,
    ],
  });

  assert.deepEqual(
    [result.action, result.reason],
    ["block", "address_cooldown"]
  );
});

test("uncertain reservation does not block an unrelated destination", () => {
  const uncertainReservation = {
    ...claim(1_000, {
      confirmed: false,
    }),
    address: "wolo1reserved",
  };

  const result = evaluate({
    address: "wolo1different",
    accountClaims: [
      uncertainReservation,
    ],
  });

  assert.equal(result.action, "allow");
});
