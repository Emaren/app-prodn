/** Exact Wolo protocol-2 owner reservation review. Pure verification only:
 * the caller supplies independently persisted economics and a separately
 * provisioned public key. A bearer, digest or signature is not solvency proof.
 * No review issuer, key loading, network access or financial mutation lives here.
 */
import { createPublicKey, verify } from "node:crypto";
import { fromBech32 } from "@cosmjs/encoding";

export type SatchelWagerReservation = Readonly<{
  version: 1;
  operation_id: string;
  owner_id: string;
  vault: string;
  recipient: string;
  amount_uwolo: string;
  memo: string;
  reservation_digest: string;
  ledger_revision: string;
  consent_digest: string;
  fee_uwolo: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}>;

/** Reconstruct this from the original durable hold/review, never its reply. */
export type SatchelWagerReservationContext = Readonly<{
  operationId: string;
  ownerUid: string;
  vault: string;
  recipient: string;
  amountUwolo: string;
  memo: string;
  reservationDigest: string;
  ledgerRevision: string;
  consentDigest: string;
  feeUwolo: string;
  issuedAt: number;
  expiresAt: number;
}>;

const WIRE_KEYS = ["version", "operation_id", "owner_id", "vault", "recipient",
  "amount_uwolo", "memo", "reservation_digest", "ledger_revision",
  "consent_digest", "fee_uwolo", "issued_at", "expires_at", "signature"];
const CONTEXT_KEYS = ["operationId", "ownerUid", "vault", "recipient",
  "amountUwolo", "memo", "reservationDigest", "ledgerRevision", "consentDigest",
  "feeUwolo", "issuedAt", "expiresAt"];
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_I64 = BigInt("9223372036854775807");
const MAX_WAGER_UWOLO = BigInt(1000) * BigInt(1000000);
const MAX_UNIX_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

function stop(reason: string): never {
  throw Error("SATCHEL_WAGER_RESERVATION_REFUSED:" + reason);
}

/** Snapshot only ordinary JSON data properties, including hidden/symbol checks.
 * Re-reading a mutable object or invoking getters between validation and crypto
 * must not change the bytes that were checked.
 */
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    stop("noncanonical_fields");
  }
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) {
    stop("noncanonical_fields");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const property = descriptors[key];
    if (!property || !property.enumerable || !("value" in property)) stop("noncanonical_fields");
    snapshot[key] = property.value;
  }
  return snapshot;
}

function address(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 90 || value !== value.toLowerCase()) return false;
  try {
    // Explicit finite BIP-173 bound: @scure/base rejects CosmJS's Infinity default.
    // This also prevents unexpectedly long addresses from ever entering custody.
    const decoded = fromBech32(value, 90);
    return decoded.prefix === "wolo" && decoded.data.length === 20;
  } catch { return false; }
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value) && value !== "0".repeat(64);
}

function amount(value: unknown, limit: bigint): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= MAX_I64 && BigInt(value) <= limit;
}

function validateEconomics(a: Record<string, unknown>) {
  if (a.version !== 1 || typeof a.operation_id !== "string" ||
      !/^satchel:ticket:[1-9][0-9]{0,11}$/.test(a.operation_id) ||
      typeof a.owner_id !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(a.owner_id) ||
      !address(a.vault) || !address(a.recipient) || a.vault === a.recipient ||
      !amount(a.amount_uwolo, MAX_WAGER_UWOLO) ||
      BigInt(a.amount_uwolo) % BigInt(1000000) !== BigInt(0) ||
      typeof a.memo !== "string" ||
      !/^AoE2HDBets bet ticket v1 · ticket [1-9][0-9]{0,11}$/.test(a.memo) ||
      !digest(a.reservation_digest) || !digest(a.ledger_revision) || !digest(a.consent_digest) ||
      !amount(a.fee_uwolo, BigInt(1000000))) stop("invalid_economics");
  if (!Number.isSafeInteger(a.issued_at) || !Number.isSafeInteger(a.expires_at) ||
      (a.issued_at as number) < 0 || (a.expires_at as number) > MAX_UNIX_SECONDS ||
      (a.expires_at as number) <= (a.issued_at as number) ||
      (a.expires_at as number) - (a.issued_at as number) > 300) stop("invalid_time_window");
}

function signBytes(a: Record<string, unknown>): Buffer {
  // encoding/json's fixed array ordering and HTML/line-separator escaping.
  const json = JSON.stringify(["aoe2war/satchel/wager-reservation/v1", a.version,
    "wolo-1", "uwolo", a.operation_id, a.owner_id, a.vault, a.recipient,
    a.amount_uwolo, a.memo, a.reservation_digest, a.ledger_revision,
    a.consent_digest, a.fee_uwolo, a.issued_at, a.expires_at]);
  return Buffer.from(json.replace(/[<>&\u2028\u2029]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")), "utf8");
}

/** Exact bytes from Go satchelservice.WagerReservationMessage. No signature is
 * generated. Signature syntax itself is checked by the verification function.
 */
export function wagerReservationSignBytes(value: SatchelWagerReservation): Buffer {
  const a = exact(value, WIRE_KEYS);
  validateEconomics(a);
  return signBytes(a);
}

/** Current execution authorization only. Recovery must verify the ORIGINAL
 * persisted review at its issuance time and authenticate chain evidence; it
 * must never renew the review or submit a second transaction.
 * This pure function cannot consume an operation: durable replay prevention
 * remains the caller's atomic reservation/attempt journal.
 */
export function verifyIndependentWagerReservation(
  value: unknown,
  expected: SatchelWagerReservationContext,
  publicKeyHex: string,
  nowMs: number,
): SatchelWagerReservation {
  const a = exact(value, WIRE_KEYS);
  const e = exact(expected, CONTEXT_KEYS);
  validateEconomics(a);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      (a.issued_at as number) > Math.floor(nowMs / 1000) ||
      (a.expires_at as number) <= Math.floor(nowMs / 1000)) stop("expired_or_future_review");
  for (const [wire, context] of [
    ["operation_id", "operationId"], ["owner_id", "ownerUid"], ["vault", "vault"],
    ["recipient", "recipient"], ["amount_uwolo", "amountUwolo"], ["memo", "memo"],
    ["reservation_digest", "reservationDigest"], ["ledger_revision", "ledgerRevision"],
    ["consent_digest", "consentDigest"], ["fee_uwolo", "feeUwolo"],
    ["issued_at", "issuedAt"], ["expires_at", "expiresAt"],
  ]) {
    if (a[wire] !== e[context]) stop("immutable_context_mismatch");
  }
  if (typeof publicKeyHex !== "string" || !DIGEST.test(publicKeyHex) ||
      publicKeyHex === "0".repeat(64)) stop("independent_public_key_invalid");
  if (typeof a.signature !== "string" || a.signature.length !== 88 ||
      !/^[A-Za-z0-9+/]{86}==$/.test(a.signature)) stop("noncanonical_signature");
  const signature = Buffer.from(a.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== a.signature) stop("noncanonical_signature");
  const key = createPublicKey({ format: "der", type: "spki", key: Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex"),
  ]) });
  if (!verify(null, signBytes(a), key, signature)) stop("independent_signature_invalid");
  return Object.freeze(a) as SatchelWagerReservation;
}
