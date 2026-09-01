import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "app/api/wolo/faucet/claim/route.ts",
  "utf8",
);

test("faucet requires signed Steam-linked account identity", () => {
  assert.match(
    source,
    /import \{ getSessionUid \} from "@\/lib\/session"/,
  );

  assert.doesNotMatch(
    source,
    /resolveRequestUid/,
  );

  assert.match(
    source,
    /const sessionUid = await getSessionUid\(request\)/,
  );

  assert.match(
    source,
    /if \(!sessionUid\)[\s\S]*status: 401/,
  );

  assert.match(
    source,
    /steamId: true/,
  );

  assert.match(
    source,
    /if \(!user\.steamId\)[\s\S]*status: 403/,
  );
});

test("faucet enforces account and address cooldowns", () => {
  assert.match(
    source,
    /claims-by-user\.json/,
  );

  assert.match(
    source,
    /existingAddressClaim/,
  );

  assert.match(
    source,
    /existingAccountClaim/,
  );

  assert.match(
    source,
    /accountLedger\[user\.uid\] = reservation/,
  );

  const reservation =
    source.indexOf(
      "accountLedger[user.uid] = reservation",
    );

  const broadcast =
    source.indexOf(
      "await sendFaucetTransfer(address)",
    );

  assert.ok(reservation >= 0);
  assert.ok(broadcast >= 0);
  assert.ok(
    reservation < broadcast,
    "identity must be reserved before chain broadcast",
  );
});

test("faucet serializes payouts and has persistent damage ceilings", () => {
  assert.match(
    source,
    /fs\.open\([\s\S]*"wx"/,
  );

  assert.match(
    source,
    /circuit-breaker\.json/,
  );

  assert.match(
    source,
    /WOLO_FAUCET_MAX_CLAIMS_PER_HOUR/,
  );

  assert.match(
    source,
    /WOLO_FAUCET_MAX_CLAIMS_PER_DAY/,
  );

  assert.match(
    source,
    /30,[\s\S]*1000/,
  );

  assert.match(
    source,
    /100,[\s\S]*10_000/,
  );

  assert.match(
    source,
    /automatically paused for operator review/,
  );
});

test("faucet ledgers are atomic and malformed state does not fail open", () => {
  assert.match(
    source,
    /Faucet ledger is malformed/,
  );

  assert.match(
    source,
    /code === "ENOENT"/,
  );

  assert.match(
    source,
    /fs\.rename\(temporaryPath, targetPath\)/,
  );
});


test("faucet does not expose internal failures", () => {
  assert.match(
    source,
    /detail:\s*"Could not process faucet claim\."/,
  );

  assert.doesNotMatch(
    source,
    /const detail =\s*error instanceof Error/,
  );
});

test("faucet delegates entitlement and breaker decisions to pure policy", () => {
  assert.match(
    source,
    /evaluateFaucetClaimPolicy/,
  );

  assert.doesNotMatch(
    source,
    /function countLedgerClaimsSince/,
  );

  assert.match(
    source,
    /Object\.values\(accountLedger\)/,
  );

  assert.match(
    source,
    /policy\.hourlyConfirmedClaims/,
  );

  assert.match(
    source,
    /policy\.dailyConfirmedClaims/,
  );
});

test("pre-broadcast reservation binds account and destination atomically", () => {
  assert.match(
    source,
    /const reservation: FaucetClaimRecord = \{[\s\S]*?txhash: "",[\s\S]*?address,[\s\S]*?\};/,
  );

  assert.match(
    source,
    /evaluateFaucetClaimPolicy\(\{[\s\S]*?nowMs: now,[\s\S]*?address,/,
  );

  const reservationWrite =
    source.indexOf(
      "accountLedger[user.uid] = reservation",
    );

  const broadcast =
    source.indexOf(
      "await sendFaucetTransfer(address)",
    );

  assert.ok(reservationWrite >= 0);
  assert.ok(broadcast >= 0);
  assert.ok(
    reservationWrite < broadcast,
    "account + destination reservation must precede chain broadcast",
  );
});
