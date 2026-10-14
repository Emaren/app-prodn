/**
 * War Satchel Gate C2: off-chain Keplr ADR-36 wallet control proof ONLY.
 * Not a deposit intent, chain receipt, transferable approval or custody credit.
 *
 * Upstream must independently bind a persisted, single-use challenge to the
 * authenticated server-side session UID. On success, consume it atomically;
 * replay prevention CANNOT be implemented by cryptography alone.
 */
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";
import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";

export type SatchelWalletOwnerChallenge = {
  purpose: "satchel-v1:owner-proof";
  ownerUid: string;
  walletAddress: string;
  nonce: string;
  issuedAtUtc: string;
  expiresAtUtc: string;
  consumedAtUtc: string | null;
};

export type KeplrArbitrarySignature = {
  pub_key: { type: string; value: string };
  signature: string;
};

const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const OWNER = /^[A-Za-z0-9_.:-]{1,100}$/;
const NONCE = /^[a-f0-9]{32}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_CHALLENGE_MS = 10 * 60_000;

function requireProof(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error("SATCHEL_OWNER_PROOF_REFUSED: " + detail);
}
function parseIso(input: string): number {
  requireProof(typeof input === "string" && ISO.test(input), "invalid challenge timestamp");
  const time = Date.parse(input);
  requireProof(Number.isFinite(time) && new Date(time).toISOString() === input, "invalid challenge clock");
  return time;
}
function canonicalB64(value: unknown, bytes: number): Uint8Array {
  requireProof(typeof value === "string" && /^[a-zA-Z0-9+/]+={0,2}$/.test(value), "invalid signature encoding");
  const decoded = Buffer.from(value, "base64");
  requireProof(decoded.byteLength === bytes && decoded.toString("base64") === value, "invalid signature length/encoding");
  return decoded;
}

export function satchelWalletOwnerChallengeText(challenge: SatchelWalletOwnerChallenge): string {
  requireProof(challenge?.purpose === "satchel-v1:owner-proof", "wrong signing purpose");
  requireProof(OWNER.test(challenge.ownerUid), "invalid session UID");
  requireProof(ADDRESS.test(challenge.walletAddress), "invalid Wolo wallet address");
  requireProof(NONCE.test(challenge.nonce), "invalid server nonce");
  const start = parseIso(challenge.issuedAtUtc);
  const end = parseIso(challenge.expiresAtUtc);
  requireProof(end > start && end - start <= MAX_CHALLENGE_MS, "wrong signature expiry");
  return [
    "AoE2WAR War Satchel wallet ownership",
    "Origin: aoe2war.com",
    "Chain: wolo-1",
    "Purpose: satchel-v1:owner-proof",
    "UID: " + challenge.ownerUid,
    "Wallet: " + challenge.walletAddress,
    "Nonce: " + challenge.nonce,
    "Issued: " + challenge.issuedAtUtc,
    "Expires: " + challenge.expiresAtUtc,
    "This signature proves wallet control ONLY. No WOLO deposit, transfer, wager or withdrawal is authorized.",
  ].join("\n");
}

/** Matches Keplr signArbitrary's ADR-36 amino sign/MsgSignData document. */
export function satchelWalletOwnerSignDoc(challenge: SatchelWalletOwnerChallenge) {
  const message = satchelWalletOwnerChallengeText(challenge);
  const bytes = Buffer.from(message, "utf8");
  return makeSignDoc(
    [{ type: "sign/MsgSignData", value: {
      signer: challenge.walletAddress,
      data: bytes.toString("base64"),
    } }],
    { amount: [], gas: "0" },
    "", "", "0", "0",
  );
}

/**
 * Caller supplies a persisted, unconsumed challenge, the authenticated UID
 * from the server session and the wallet bound to that user. The caller must
 * then *atomically* consume the challenge with a unique DB compare-and-swap.
 *
 * This function is deliberately NOT exported as a route or money executor.
 */
export async function verifyWarSatchelWalletOwnerProof(input: {
  challenge: SatchelWalletOwnerChallenge;
  authenticatedUid: string;
  authenticatedWalletAddress: string;
  nowUtc: string;
  keplrSignature: KeplrArbitrarySignature;
}) {
  const { challenge, keplrSignature } = input;
  const now = parseIso(input.nowUtc);
  const payload = satchelWalletOwnerChallengeText(challenge);
  requireProof(challenge.consumedAtUtc === null, "challenge already used");
  requireProof(challenge.ownerUid === input.authenticatedUid, "wrong logged-in owner");
  requireProof(challenge.walletAddress === input.authenticatedWalletAddress, "owner-wallet binding differs");
  requireProof(now >= parseIso(challenge.issuedAtUtc) && now < parseIso(challenge.expiresAtUtc), "challenge expired/not yet valid");
  requireProof(keplrSignature?.pub_key?.type === "tendermint/PubKeySecp256k1", "unsupported Keplr signing key");
  const rawKey = canonicalB64(keplrSignature.pub_key.value, 33);
  requireProof(rawKey[0] === 2 || rawKey[0] === 3, "not a compressed secp256k1 key");
  const rawSig = canonicalB64(keplrSignature.signature, 64);
  const expectedWallet = pubkeyToAddress(
    { type: "tendermint/PubKeySecp256k1", value: keplrSignature.pub_key.value }, "wolo",
  );
  requireProof(expectedWallet === challenge.walletAddress, "signature key not the linked Wolo wallet");
  const signBytes = serializeSignDoc(satchelWalletOwnerSignDoc(challenge));
  const ok = await Secp256k1.verifySignature(
    Secp256k1Signature.fromFixedLength(rawSig),
    sha256(signBytes),
    rawKey,
  );
  requireProof(ok, "invalid signature");
  // Return minimal evidence only. This is not an API capability or persisted flag.
  void payload;
  return Object.freeze({
    kind: "unconsumed_verified_wallet_owner_candidate" as const,
    ownerUid: challenge.ownerUid,
    walletAddress: challenge.walletAddress,
    challengeNonce: challenge.nonce,
    custodyApproved: false as const,
    creditAuthorized: false as const,
    wagerAuthorized: false as const,
  });
}
