import assert from "node:assert/strict";
import { test } from "node:test";
import { Secp256k1, sha256 } from "@cosmjs/crypto";
import { pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";
import {
  satchelWalletOwnerChallengeText,
  satchelWalletOwnerSignDoc,
  verifyWarSatchelWalletOwnerProof,
  type SatchelWalletOwnerChallenge,
} from "../lib/warSatchelWalletOwnerProof.ts";

const PRIV = new Uint8Array(32).fill(7);
const NOW = "2026-10-14T12:00:01.000Z";
const start = "2026-10-14T12:00:00.000Z";
const end = "2026-10-14T12:10:00.000Z";

async function fixture() {
  const { pubkey } = await Secp256k1.makeKeypair(PRIV);
  const compressed = Secp256k1.compressPubkey(pubkey);
  const publicKeyB64 = Buffer.from(compressed).toString("base64");
  const address = pubkeyToAddress({ type: "tendermint/PubKeySecp256k1", value: publicKeyB64 }, "wolo");
  const challenge: SatchelWalletOwnerChallenge = {
    purpose: "satchel-v1:owner-proof",
    ownerUid: "warrior-101",
    walletAddress: address,
    nonce: "4f1a03c9aabffccd00225566778899aa",
    issuedAtUtc: start,
    expiresAtUtc: end,
    consumedAtUtc: null,
  };
  const signature = (await Secp256k1.createSignature(
    sha256(serializeSignDoc(satchelWalletOwnerSignDoc(challenge))), PRIV,
  )).toFixedLength();
  const keplrSignature = {
    pub_key: { type: "tendermint/PubKeySecp256k1", value: publicKeyB64 },
    signature: Buffer.from(signature).toString("base64"),
  };
  return {
    challenge,
    keplrSignature,
    authenticatedUid: "warrior-101",
    authenticatedWalletAddress: address,
    nowUtc: NOW,
  };
}

test("ADR-36 verified wallet key matches exact Wolo address and signed UID/nonce", async () => {
  const args = await fixture();
  const signedMessage = satchelWalletOwnerChallengeText(args.challenge);
  assert.match(signedMessage, /Chain: wolo-1/);
  assert.match(signedMessage, /Purpose: satchel-v1:owner-proof/);
  assert.match(signedMessage, /No WOLO deposit, transfer, wager or withdrawal is authorized/);
  assert.match(signedMessage, /Nonce: 4f1a03c9aabffccd00225566778899aa/);
  const result = await verifyWarSatchelWalletOwnerProof(args);
  assert.equal(result.kind, "unconsumed_verified_wallet_owner_candidate");
  assert.equal(result.ownerUid, args.authenticatedUid);
  assert.equal(result.walletAddress, args.authenticatedWalletAddress);
  assert.equal(result.custodyApproved, false);
  assert.equal(result.creditAuthorized, false);
  assert.equal(result.wagerAuthorized, false);
});

test("cross-owner and cross-wallet proofs are rejected", async () => {
  const args = await fixture();
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, authenticatedUid:"different-user"}), /wrong logged-in owner/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, authenticatedWalletAddress:"wolo1anotherwallet"}), /owner-wallet binding differs/);
});

test("expired, replay-consumed and future-dated challenges fail closed", async () => {
  const args = await fixture();
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, nowUtc:end}), /expired/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, nowUtc:"2026-10-14T11:59:59.000Z"}), /not yet valid/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, challenge:{...args.challenge,consumedAtUtc:start}}), /already used/);
});

test("signature tampering, invalid pubkey, wrong nonce and overly long TTL fail closed", async () => {
  const args = await fixture();
  const decoded = Buffer.from(args.keplrSignature.signature, "base64");
  decoded[5] ^= 0x01;
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, keplrSignature:{...args.keplrSignature,signature:decoded.toString("base64")}}), /invalid signature/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, keplrSignature:{...args.keplrSignature,pub_key:{...args.keplrSignature.pub_key,value:Buffer.alloc(33).toString("base64")}}}), /not a compressed/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, challenge:{...args.challenge,nonce:"0".repeat(32)}}), /invalid signature/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, challenge:{...args.challenge,expiresAtUtc:"2026-10-14T12:11:00.000Z"}}), /wrong signature expiry/);
});

test("wrong signature purpose and malformed address cannot authorize wallet proof", async () => {
  const args = await fixture();
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, challenge:{...args.challenge,purpose:"satchel-v1:transfer" as never}}), /wrong signing purpose/);
  await assert.rejects(() => verifyWarSatchelWalletOwnerProof({...args, challenge:{...args.challenge,walletAddress:"cosmos1abc"}}), /invalid Wolo wallet address/);
});
