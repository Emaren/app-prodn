/**
 * Owner-scoped Keplr ADR-36 consent for funded Mecha automation.
 * This signature authorizes finite, versioned Satchel stake exposure ONLY.
 * It never contains a private key and is NOT a TxBody or withdrawal approval.
 *
 * Caller must compare stored immutable challenge and owner/preset version,
 * verify signature, then consume its challenge exactly once under owner lock.
 */
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";
import { createPublicKey, ECDH, verify as verifyEcdsa } from "node:crypto";

const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const OWNER = /^[A-Za-z0-9_.:-]{1,100}$/;
const NONCE = /^[a-f0-9]{32}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

export type SatchelSpendChallenge = {
  ownerUid: string;
  walletAddress: string;
  presetId: number;
  presetVersion: number;
  winnerStakeWolo: number;
  desyncSide: "none" | "yes" | "no";
  desyncStakeWolo: number;
  perGameCapWolo: number;
  dailyCapWolo: number;
  untilOut: boolean;
  gamesRemaining: number | null;
  nonce: string;
  issuedAtUtc: string;
  challengeExpiresAtUtc: string;
  spendExpiresAtUtc: string;
  signedAtUtc: string | null;
  revokedAtUtc: string | null;
};
export type KeplrSatchelSpendSignature = {
  pub_key: { type: string; value: string };
  signature: string;
};
function enforce(condition: unknown, reason: string): asserts condition {
  if (!condition) throw Error("SATCHEL_SPEND_CONSENT_REFUSED:" + reason);
}
function parseUtc(value: string): number {
  enforce(typeof value === "string" && ISO.test(value), "noncanonical time");
  const num = Date.parse(value);
  enforce(Number.isFinite(num) && new Date(num).toISOString() === value, "invalid UTC time");
  return num;
}
function strictB64(value: unknown, bytes: number) {
  enforce(typeof value === "string" && /^[a-zA-Z0-9+/]+={0,2}$/.test(value), "invalid signature encoding");
  const data = Buffer.from(value, "base64");
  enforce(data.byteLength === bytes && data.toString("base64") === value, "wrong signature length");
  return data;
}
export function satchelAutoSpendChallengeText(c: SatchelSpendChallenge) {
  enforce(OWNER.test(c.ownerUid) && ADDR.test(c.walletAddress) && NONCE.test(c.nonce),
    "invalid owner wallet or nonce");
  enforce(Number.isSafeInteger(c.presetId) && c.presetId > 0 &&
    Number.isSafeInteger(c.presetVersion) && c.presetVersion > 0, "invalid plan version");
  enforce(c.desyncSide === "none" || c.desyncSide === "no" || c.desyncSide === "yes", "invalid desync side");
  enforce(Number.isSafeInteger(c.winnerStakeWolo) && c.winnerStakeWolo >= 1 &&
    Number.isSafeInteger(c.desyncStakeWolo) && c.desyncStakeWolo >= 0 &&
    ((c.desyncSide === "none" && c.desyncStakeWolo === 0) ||
      (c.desyncSide !== "none" && c.desyncStakeWolo > 0)), "invalid game amount");
  const combined = c.winnerStakeWolo + c.desyncStakeWolo;
  enforce(typeof c.untilOut === "boolean" && (c.untilOut ? c.gamesRemaining === null :
    Number.isSafeInteger(c.gamesRemaining) && c.gamesRemaining! > 0 &&
    c.gamesRemaining! * combined <= 10000), "invalid finite game authorization");
  enforce(Number.isSafeInteger(c.perGameCapWolo) && c.perGameCapWolo <= 1000 &&
    c.perGameCapWolo >= combined &&
    Number.isSafeInteger(c.dailyCapWolo) && c.dailyCapWolo <= 10000 &&
    c.dailyCapWolo >= c.perGameCapWolo, "unsafe spending ceiling");
  const issue = parseUtc(c.issuedAtUtc);
  const challenge = parseUtc(c.challengeExpiresAtUtc);
  const spend = parseUtc(c.spendExpiresAtUtc);
  enforce(challenge > issue && challenge - issue <= 300000 &&
    spend > challenge && spend - issue <= 86400000, "unbounded consent interval");
  return [
    "AoE2WAR War Satchel Mecha AUTO BET SPENDING AUTHORIZATION",
    "Origin: aoe2war.com",
    "Chain: wolo-1",
    "Denom: uwolo",
    "Owner UID: " + c.ownerUid,
    "Linked Keplr wallet: " + c.walletAddress,
    "Mecha preset ID: " + c.presetId,
    "Exact preset version: " + c.presetVersion,
    "Winner selection: own exact verified Steam roster side",
    "Game allowance: " + (c.untilOut ? "until available funds run out" : String(c.gamesRemaining) + " future games"),
    "Winner bet WOLO: " + c.winnerStakeWolo,
    "Desync selection: " + c.desyncSide,
    "Desync bet WOLO: " + c.desyncStakeWolo,
    "MAX per game WOLO: " + c.perGameCapWolo,
    "MAX daily WOLO: " + c.dailyCapWolo,
    "Authorization expires: " + c.spendExpiresAtUtc,
    "One-use challenge nonce: " + c.nonce,
    "Issued: " + c.issuedAtUtc,
    "Challenge expires: " + c.challengeExpiresAtUtc,
    "You authorize automated bets ONLY within these limits from your verified War Satchel.",
    "Only new Watcher games first opened after this authorization may spend funds.",
    "You do NOT authorize withdrawal, wallet-key access, or spending from your Keplr wallet.",
    "Pausing the plan or revoking this mandate must stop new betting immediately.",
  ].join("\n");
}
export function verifySatchelAutoSpendSignature(input: {
  challenge: SatchelSpendChallenge;
  ownerUid: string;
  ownerWallet: string;
  presetId: number;
  presetVersion: number;
  nowUtc: string;
  keplrSignature: KeplrSatchelSpendSignature;
}) {
  const { challenge: c } = input;
  const text = satchelAutoSpendChallengeText(c);
  const now = parseUtc(input.nowUtc);
  enforce(c.ownerUid === input.ownerUid && c.walletAddress === input.ownerWallet &&
    c.presetId === input.presetId && c.presetVersion === input.presetVersion,
    "owner preset version changed");
  enforce(c.signedAtUtc === null && c.revokedAtUtc === null &&
    now >= parseUtc(c.issuedAtUtc) && now < parseUtc(c.challengeExpiresAtUtc),
    "challenge expired or already consumed");
  const signature = input.keplrSignature;
  enforce(signature?.pub_key?.type === "tendermint/PubKeySecp256k1", "unexpected key algorithm");
  const rawKey = strictB64(signature.pub_key.value, 33);
  enforce(rawKey[0] === 2 || rawKey[0] === 3, "invalid compressed public key");
  const rawSig = strictB64(signature.signature, 64);
  const derivedWallet = pubkeyToAddress({
    type: "tendermint/PubKeySecp256k1", value: signature.pub_key.value,
  }, "wolo");
  enforce(derivedWallet === c.walletAddress, "not the linked wallet signer");
  const signDoc = makeSignDoc([{
    type: "sign/MsgSignData", value: {
      signer: c.walletAddress,
      data: Buffer.from(text, "utf8").toString("base64"),
    },
  }], { amount: [], gas: "0" }, "", "", "0", "0");
  const uncompressed = Buffer.from(
    ECDH.convertKey(rawKey, "secp256k1", undefined, undefined, "uncompressed"),
  );
  enforce(uncompressed.length === 65 && uncompressed[0] === 4, "unsupported public key");
  const publicKey = createPublicKey({
    key: { kty: "EC", crv: "secp256k1",
      x: uncompressed.subarray(1, 33).toString("base64url"),
      y: uncompressed.subarray(33, 65).toString("base64url") },
    format: "jwk",
  });
  enforce(verifyEcdsa("sha256", Buffer.from(serializeSignDoc(signDoc)),
    { key: publicKey, dsaEncoding: "ieee-p1363" }, rawSig), "invalid ADR-36 signature");
  return Object.freeze({
    kind: "verified_unconsumed_satchel_auto_spend_consent" as const,
    ownerUid: c.ownerUid,
    presetId: c.presetId,
    presetVersion: c.presetVersion,
    perGameCapWolo: c.perGameCapWolo,
    dailyCapWolo: c.dailyCapWolo,
    expiresAtUtc: c.spendExpiresAtUtc,
    // Money movement is NEVER authorized by this pure proof alone.
    creditAuthorized: false as const,
    wagerAuthorized: false as const,
    withdrawalAuthorized: false as const,
  });
}

type StoredConsent = {
  ownerUid: string; walletAddress: string; presetId: number; presetVersion: number;
  winnerStakeWolo: number; desyncSide: string; desyncStakeWolo: number;
  perGameCapWolo: number; dailyCapWolo: number; nonce: string;
  issuedAt: Date; challengeExpiresAt: Date; spendExpiresAt: Date;
  signedAt: Date | null; revokedAt: Date | null;
};
type OriginalMandate = {
  untilOut: boolean; gamesRemaining: number | null; challengeText: string;
  ownerSignatureJson: unknown; signedAt: Date | null;
};
export function storedSatchelSpendChallenge(row: StoredConsent,
  mandate: Pick<OriginalMandate, "untilOut" | "gamesRemaining">): SatchelSpendChallenge {
  enforce(["none", "no", "yes"].includes(row.desyncSide), "invalid stored side");
  return { ownerUid: row.ownerUid, walletAddress: row.walletAddress,
    presetId: row.presetId, presetVersion: row.presetVersion,
    winnerStakeWolo: row.winnerStakeWolo, desyncSide: row.desyncSide as SatchelSpendChallenge["desyncSide"],
    desyncStakeWolo: row.desyncStakeWolo, perGameCapWolo: row.perGameCapWolo,
    dailyCapWolo: row.dailyCapWolo, untilOut: mandate.untilOut, gamesRemaining: mandate.gamesRemaining,
    nonce: row.nonce, issuedAtUtc: row.issuedAt.toISOString(),
    challengeExpiresAtUtc: row.challengeExpiresAt.toISOString(), spendExpiresAtUtc: row.spendExpiresAt.toISOString(),
    signedAtUtc: row.signedAt?.toISOString() ?? null, revokedAtUtc: row.revokedAt?.toISOString() ?? null };
}

/** Re-verify durable original ADR-36 bytes under the execution lock, not signedAt alone. */
export function verifyDurableSatchelAutoSpendMandate(input: {
  consent: StoredConsent; originalMandate: OriginalMandate | null;
  ownerUid: string; ownerWallet: string; presetId: number; presetVersion: number;
  untilOut: boolean; gamesRemaining: number | null; now: Date;
}) {
  const {consent: c, originalMandate: m} = input;
  enforce(m && c.signedAt && m.signedAt && c.signedAt.getTime() === m.signedAt.getTime() &&
    c.revokedAt === null && c.spendExpiresAt.getTime() > input.now.getTime(), "original signed mandate absent expired or revoked");
  enforce(m.untilOut === input.untilOut && (m.untilOut ? input.gamesRemaining === null :
    Number.isSafeInteger(input.gamesRemaining) && input.gamesRemaining! > 0 &&
    input.gamesRemaining! <= m.gamesRemaining!), "finite game mandate changed");
  const original = storedSatchelSpendChallenge(c, m);
  enforce(satchelAutoSpendChallengeText(original) === m.challengeText, "stored challenge text changed");
  return verifySatchelAutoSpendSignature({ challenge: {...original, signedAtUtc: null},
    ownerUid: input.ownerUid, ownerWallet: input.ownerWallet,
    presetId: input.presetId, presetVersion: input.presetVersion,
    nowUtc: c.signedAt.toISOString(), keplrSignature: m.ownerSignatureJson as KeplrSatchelSpendSignature });
}
