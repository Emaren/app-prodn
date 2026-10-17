import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";

import {
  satchelAutoSpendChallengeText,
  verifySatchelAutoSpendSignature,
  type SatchelSpendChallenge,
} from "../lib/warSatchelAutoSpendConsent.ts";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
const coords = publicKey.export({ format: "jwk" }) as { x: string; y: string };
const x = Buffer.from(coords.x, "base64url");
const y = Buffer.from(coords.y, "base64url");
const compressed = Buffer.concat([
  Buffer.from([(y[y.length - 1] & 1) ? 3 : 2]), x,
]).toString("base64");
const wallet = pubkeyToAddress({
  type: "tendermint/PubKeySecp256k1", value: compressed,
}, "wolo");

const original: SatchelSpendChallenge = {
  ownerUid: "steam:test-mecha",
  walletAddress: wallet,
  presetId: 91,
  presetVersion: 4,
  winnerStakeWolo: 75,
  desyncSide: "yes",
  desyncStakeWolo: 25,
  perGameCapWolo: 100,
  dailyCapWolo: 1000,
  nonce: "a".repeat(32),
  issuedAtUtc: "2026-10-17T01:00:00.000Z",
  challengeExpiresAtUtc: "2026-10-17T01:05:00.000Z",
  spendExpiresAtUtc: "2026-10-18T00:00:00.000Z",
  signedAtUtc: null,
  revokedAtUtc: null,
};

function signChallenge(c: SatchelSpendChallenge = original) {
  const text = satchelAutoSpendChallengeText(c);
  const signDoc = makeSignDoc([{
    type: "sign/MsgSignData",
    value: {
      signer: c.walletAddress,
      data: Buffer.from(text, "utf8").toString("base64"),
    },
  }], { amount: [], gas: "0" }, "", "", "0", "0");
  return {
    pub_key: { type: "tendermint/PubKeySecp256k1", value: compressed },
    signature: sign("sha256", Buffer.from(serializeSignDoc(signDoc)), {
      key: privateKey, dsaEncoding: "ieee-p1363",
    }).toString("base64"),
  };
}

function verify(c: SatchelSpendChallenge = original) {
  return verifySatchelAutoSpendSignature({
    challenge: c,
    ownerUid: original.ownerUid,
    ownerWallet: original.walletAddress,
    presetId: original.presetId,
    presetVersion: original.presetVersion,
    nowUtc: "2026-10-17T01:02:00.000Z",
    keplrSignature: signChallenge(),
  });
}

test("real secp256k1 ADR36 signature proves exact owner/preset/budget but does not authorize money movement", () => {
  const result = verify();
  assert.equal(result.kind, "verified_unconsumed_satchel_auto_spend_consent");
  assert.equal(result.ownerUid, original.ownerUid);
  assert.equal(result.presetVersion, 4);
  assert.equal(result.perGameCapWolo, 100);
  assert.equal(result.dailyCapWolo, 1000);
  assert.equal(result.creditAuthorized, false);
  assert.equal(result.wagerAuthorized, false);
  assert.equal(result.withdrawalAuthorized, false);
  assert(Object.isFrozen(result));
});

test("tampered per-game, daily, or desync stake cannot inherit original signature", () => {
  assert.throws(() => verify({ ...original, winnerStakeWolo: 74 }), /invalid ADR-36 signature/);
  assert.throws(() => verify({ ...original, dailyCapWolo: 1001 }), /invalid ADR-36 signature/);
  assert.throws(() => verify({ ...original, desyncStakeWolo: 24 }), /invalid ADR-36 signature/);
});

test("wallet account, owner, plan version and nonce cannot be substituted", () => {
  assert.throws(() => verify({ ...original, ownerUid: "steam:someone-else" }), /owner preset version changed/);
  assert.throws(() => verify({ ...original, presetVersion: 5 }), /owner preset version changed/);
  assert.throws(() => verify({ ...original, nonce: "b".repeat(32) }), /invalid ADR-36 signature/);
  assert.throws(() => verify({ ...original, walletAddress: "wolo1" + "q".repeat(38) }), /owner preset version changed/);
});

test("replayed, revoked and expired authorization challenges are rejected before spending", () => {
  assert.throws(() => verify({ ...original, signedAtUtc: "2026-10-17T01:01:00.000Z" }), /challenge expired or already consumed/);
  assert.throws(() => verify({ ...original, revokedAtUtc: "2026-10-17T01:01:00.000Z" }), /challenge expired or already consumed/);
  assert.throws(() => verifySatchelAutoSpendSignature({
    challenge: original,
    ownerUid: original.ownerUid,
    ownerWallet: wallet,
    presetId: original.presetId,
    presetVersion: original.presetVersion,
    nowUtc: "2026-10-17T01:05:00.000Z",
    keplrSignature: signChallenge(),
  }), /challenge expired or already consumed/);
});

test("unbounded auto-bet caps are refused even with a valid test signature", () => {
  assert.throws(() => satchelAutoSpendChallengeText({
    ...original, perGameCapWolo: 1001,
  }), /unsafe spending ceiling/);
  assert.throws(() => satchelAutoSpendChallengeText({
    ...original, dailyCapWolo: 10001,
  }), /unsafe spending ceiling/);
});
