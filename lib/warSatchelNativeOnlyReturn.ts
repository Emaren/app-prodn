/**
 * C02 App-only native escrow return transport. Never a payout or credit verifier.
 *
 * Every original source operation has ONE durable POST admission; an existing
 * attempt, any timeout, 404, disconnect, invalid body, or signer error may only
 * invoke read-only GET /satchel/v1/returns/execution/{claim_id}.
 *
 * No legacy settlement DTO, 8092, fallback URL, sign/retry, or money mutation.
 * An authenticated bank proof and separately approved financial-writer commit
 * are REQUIRED later; a tx_hash here is always a noncrediting candidate.
 */
import { createHash } from "node:crypto";

export const NATIVE_SATCHEL_CLAIM_START = BigInt("900000000001");
export const NATIVE_SATCHEL_CLAIM_END = BigInt("999999999999");
const EXECUTION = "http://127.0.0.1:8094/satchel/v1/returns";
const HASH = /^[A-F0-9]{64}$/;
const ASCII = /^[a-zA-Z0-9_.:-]{1,160}$/;
const REASONS = new Set([
  "intent_persisted", "pre_sign_permit_revoked", "signing_started",
  "signing_uncertain", "invalid_signed_bytes_unknown",
  "signed_bytes_persisted", "signed_permit_revoked_unknown",
  "broadcast_started", "broadcast_uncertain", "broadcast_accepted_unconfirmed",
]);

export type NativeAttemptIdentity = Readonly<{
  claimId: string;
  operationKey: string;
  appOperationId: string;
  approvalSha256: string;
}>;
export type NativeReturnNoncrediting = Readonly<{
  state: "unknown_hold";
  operationKey: string;
  candidateTxHash: string | null;
  creditAuthorized: false;
  broadcastPermitted: false;
  source: "native_8094_readonly_evidence";
}>;
export interface NativeAttemptJournal {
  /** Atomic INSERT/UNIQUE identity, committed before any outbound POST.
   * Returns false for an already recorded SAME identity. A conflicting
   * identity must throw. This is a finance-owner DB implementation boundary. */
  insertOnce(identity: NativeAttemptIdentity): Promise<boolean>;
}
type Fetch = typeof fetch;
function refuse(reason: string): never {
  throw Error("C02_NATIVE_RETURN_HOLD:" + reason);
}
export function freshSatchelClaimId(input: unknown): string {
  if (typeof input !== "string" || !/^[1-9][0-9]{11}$/.test(input))
    refuse("fresh_claim_namespace_required");
  const number = BigInt(input);
  if (number < NATIVE_SATCHEL_CLAIM_START || number > NATIVE_SATCHEL_CLAIM_END)
    refuse("fresh_claim_namespace_required");
  // This 12-digit namespace cannot collide with legacy PG integer IDs.
  return input;
}
function map(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    refuse("not_an_object");
  return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const m = value as Record<string, unknown>;
    return "{" + Object.keys(m).sort().map(k => JSON.stringify(k) + ":" + canonical(m[k])).join(",") + "}";
  }
  const s = JSON.stringify(value);
  if (s === undefined) refuse("noncanonical_json");
  return s;
}
export function nativeReturnIdentity(approval: unknown): NativeAttemptIdentity {
  const a = map(approval);
  const id = freshSatchelClaimId(a.claim_id);
  if (a.version !== 2 || typeof a.operation_id !== "string" ||
      !ASCII.test(a.operation_id) || typeof a.owner_id !== "string" ||
      !ASCII.test(a.owner_id) || typeof a.ticket_id !== "string" ||
      !/^[1-9][0-9]{0,11}$/.test(a.ticket_id) ||
      typeof a.market_id !== "string" ||
      !/^[1-9][0-9]{0,11}$/.test(a.market_id) ||
      typeof a.leg_id !== "string" || !ASCII.test(a.leg_id) ||
      typeof a.entitlement_id !== "string" || !ASCII.test(a.entitlement_id) ||
      !["bet_payout", "bet_refund"].includes(String(a.claim_kind)) ||
      typeof a.amount_uwolo !== "string" ||
      !/^[1-9][0-9]{0,18}$/.test(a.amount_uwolo) ||
      typeof a.allocation_digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.allocation_digest) ||
      typeof a.signature !== "string" || !a.signature ||
      typeof a.issued_at !== "number" || !Number.isSafeInteger(a.issued_at) ||
      typeof a.expires_at !== "number" || !Number.isSafeInteger(a.expires_at) ||
      a.issued_at >= a.expires_at ||
      !a.allocation || Array.isArray(a.allocation) ||
      typeof a.allocation !== "object") {
    refuse("invalid_signed_v2_approval_shape");
  }
  const digest = createHash("sha256").update(canonical(a)).digest("hex");
  return Object.freeze({
    claimId: id,
    operationKey: "satchel:claim-return:" + id,
    appOperationId: a.operation_id,
    approvalSha256: digest,
  });
}
function headers(token: string): Record<string, string> {
  if (!/^[a-zA-Z0-9_-]{48,512}$/.test(token))
    refuse("dedicated_8094_private_token_required");
  return {
    Authorization: "Bearer " + token, Accept: "application/json",
    "Content-Type": "application/json", "Accept-Encoding": "identity",
  };
}
function unknown(key: string, hash: string | null = null): NativeReturnNoncrediting {
  return Object.freeze({
    state: "unknown_hold", operationKey: key, candidateTxHash: hash,
    creditAuthorized: false, broadcastPermitted: false,
    source: "native_8094_readonly_evidence",
  });
}
function parseObservation(value: string, key: string): NativeReturnNoncrediting {
  if (!value || value.length > 65536 || value.includes("\\"))
    refuse("native_response_untrusted");
  const keys = [...value.matchAll(/"([^"\\]*)"\s*:/g)].map(match => match[1]);
  if (keys.length < 4 || keys.length > 5 || new Set(keys).size !== keys.length)
    refuse("native_response_untrusted");
  let r: Record<string, unknown>;
  try { r = map(JSON.parse(value)); }
  catch { refuse("native_response_untrusted"); }
  if (Object.keys(r).length !== keys.length ||
      Object.keys(r).some(k => !["operation_id", "status", "reason",
                               "tx_hash", "durable_fenced"].includes(k)) ||
      r.operation_id !== key || r.status !== "UNKNOWN" ||
      r.durable_fenced !== true || typeof r.reason !== "string" ||
      !REASONS.has(r.reason) ||
      (r.tx_hash !== undefined && (typeof r.tx_hash !== "string" ||
       (r.tx_hash !== "" && (!HASH.test(r.tx_hash) ||
        r.tx_hash === "0".repeat(64)))))) refuse("native_response_untrusted");
  return unknown(key, typeof r.tx_hash === "string" && r.tx_hash ? r.tx_hash : null);
}
async function call(
  url: string, method: "GET" | "POST", token: string,
  reader: Fetch, body?: string, canceled?: AbortSignal,
): Promise<NativeReturnNoncrediting> {
  const id = method === "GET"
    ? url.slice((EXECUTION + "/execution/").length)
    : null;
  const response = await reader(url, {
    method, headers: headers(token), redirect: "error", cache: "no-store",
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.any([AbortSignal.timeout(8500),...(canceled?[canceled]:[])]),
  });
  if (response.status !== 200 || !response.ok ||
      (response.headers.get("Content-Encoding") &&
       response.headers.get("Content-Encoding") !== "identity"))
    refuse("native_status_untrusted");
  if (!response.body) refuse("native_response_untrusted");
  const length = response.headers.get("Content-Length");
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) ||
      Number(length) > 65536)) refuse("native_response_oversized");
  const readerStream = response.body.getReader();
  const pieces: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const next = await readerStream.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > 65536) refuse("native_response_oversized");
      pieces.push(next.value);
    }
  } finally { readerStream.releaseLock(); }
  const raw = new TextDecoder("utf-8", {fatal:true}).decode(
    Buffer.concat(pieces, count)
  );
  const key = id ? "satchel:claim-return:" + id :
    "satchel:claim-return:" + freshSatchelClaimId(JSON.parse(body || "{}").claim_id);
  return parseObservation(raw, key);
}
/** GET-only recovery never POSTs and never treats 404 as permission to retry. */
export async function recoverFreshNativeReturn(
  claimId: string, token: string, reader: Fetch = fetch,
  canceled?:AbortSignal,
): Promise<NativeReturnNoncrediting> {
  const id = freshSatchelClaimId(claimId);
  const key = "satchel:claim-return:" + id;
  try {
    return await call(EXECUTION + "/execution/" + id, "GET", token, reader,undefined,canceled);
  } catch {
    return unknown(key);
  }
}
/**
 * Caller must independently authenticate the signed v2 approval, original
 * escrow funding and 8095-origin reserve review BEFORE calling this method.
 * Only a DB transaction with a committed unique record can implement journal.
 * Even successful 8094 replies are UNKNOWN until independent proof/credit.
 */
export async function submitFreshNativeReturnOnce(
  approval: unknown, token: string, journal: NativeAttemptJournal,
  reader: Fetch = fetch, canceled?: AbortSignal,
): Promise<NativeReturnNoncrediting> {
  const identity = nativeReturnIdentity(approval);
  headers(token);
  const body = canonical(approval);
  if (Buffer.byteLength(body, "utf8") > 65536) refuse("approval_body_too_large");
  const a = map(approval);
  const now = Math.floor(Date.now()/1000);
  // Never send a newly expired or not-yet-valid signed request. Recovery
  // remains a GET, including after permit expiry.
  if (typeof a.issued_at !== "number" || typeof a.expires_at !== "number" ||
      a.issued_at > now || a.expires_at <= now ||
      a.expires_at - now > 120) {
    return recoverFreshNativeReturn(identity.claimId, token, reader,canceled);
  }
  // Commit first. Lost COMMIT ack is an UNKNOWN and never permits POST.
  let first: boolean;
  try { first = await journal.insertOnce(identity); }
  catch { return unknown(identity.operationKey); }
  if (first !== true) return recoverFreshNativeReturn(identity.claimId, token, reader,canceled);
  try {
    canceled?.throwIfAborted();
    return await call(EXECUTION + "/execute", "POST", token, reader, body,canceled);
  } catch {
    // One GET-only observation, even if request may have reached the signer.
    return recoverFreshNativeReturn(identity.claimId, token, reader,canceled);
  }
}
