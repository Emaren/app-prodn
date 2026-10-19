/**
 * Private War Satchel independent-reviewer pickup. Source-only under the
 * immutable financial HOLD. The reviewer is a separately controlled process,
 * NOT app-prodn, the 8094 vault signer, or the old 8092/8093 services.
 *
 * The only request data are the immutable operation ID. The reviewer MUST
 * independently examine HD's original SQL reservation/Keplr/Watcher data,
 * chain-trusted bank, all liabilities and fee census before signing.
 * Neither an HTTP bearer nor an asserted ready flag is spend authority.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import {
  loadSatchelWagerReview, attachIndependentSatchelWagerReview,
} from "./warSatchelFundedLedger.ts";
import { type DurableSatchelWagerAuthorization, wagerReviewContext } from "./warSatchelWagerAuthorization.ts";
import {
  verifyIndependentWagerReservation, type SatchelWagerReservation,
} from "./warSatchelWagerReservation.ts";
import { readWithdrawalReviewerKey } from "./warSatchelWithdrawalReview.ts";
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";

const ENDPOINT = "http://127.0.0.1:8095/reviewer/v1/wagers";
const OPERATION = /^satchel:ticket:[1-9][0-9]{0,11}$/;
const SHA = /^[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{48,512}$/;
const MAX_REPLY_BYTES = 4096;
const APPROVAL_FIELDS = [
  "version", "operation_id", "owner_id", "vault", "recipient", "amount_uwolo",
  "memo", "reservation_digest", "ledger_revision", "consent_digest",
  "fee_uwolo", "issued_at", "expires_at", "signature",
] as const;

function stop(reason: string): never {
  throw Error("SATCHEL_AUTO_REVIEWER_REFUSED:" + reason);
}
function ready() {
  requireSatchelFinancialBridge();
  if (process.env.WAR_SATCHEL_AUTO_REVIEWER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_INDEPENDENT_REVIEWER_CERTIFIED !== "true" ||
      process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED !== "true") {
    stop("not_operationally_certified");
  }
  const token = process.env.WAR_SATCHEL_REVIEWER_AUTH_TOKEN || "";
  const expectedBuild = process.env.WAR_SATCHEL_REVIEWER_BUILD_SHA256 || "";
  if (!TOKEN.test(token) || !SHA.test(expectedBuild) || expectedBuild === "0".repeat(64)) {
    stop("reviewer_private_identity_unavailable");
  }
  // This value is only a provisioned identity constraint. A local endpoint
  // claiming the same hash is NOT binary attestation or financial approval.
  return { token };
}
function exact(x: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x) ||
      Object.getPrototypeOf(x) !== Object.prototype) stop("noncanonical_reply");
  const keys = Reflect.ownKeys(x);
  if (keys.length !== fields.length ||
      keys.some(key => typeof key !== "string" || !fields.includes(key))) {
    stop("noncanonical_reply");
  }
  const descriptor = Object.getOwnPropertyDescriptors(x);
  for (const key of fields) {
    if (!descriptor[key]?.enumerable || !("value" in descriptor[key])) stop("noncanonical_reply");
  }
  return x as Record<string, unknown>;
}

/** Pure cryptographic admission; a response cannot nominate its own key or
 * replace any immutable HD fact. No database or network side effects. */
export function verifySatchelReviewerReply(
  reply: unknown,
  original: DurableSatchelWagerAuthorization,
  reviewerPublicKey: string,
  nowMs = Date.now(),
): Readonly<{ kind: "pending" } | { kind: "reviewed"; approval: SatchelWagerReservation }> {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) stop("invalid_review_clock");
  const status = reply && typeof reply === "object" && !Array.isArray(reply) &&
    Object.getPrototypeOf(reply) === Object.prototype
    ? Object.getOwnPropertyDescriptor(reply, "status")?.value : undefined;
  const basic = exact(reply, status === "SIGNED"
    ? ["protocol", "status", "operation_id", "approval"]
    : ["protocol", "status", "operation_id"]);
  if (basic.protocol !== 1 || basic.operation_id !== original.operationId ||
      !OPERATION.test(original.operationId)) stop("wrong_operation_or_protocol");
  if (basic.status === "PENDING") return Object.freeze({ kind: "pending" as const });
  if (basic.status !== "SIGNED") stop("unknown_reviewer_status");
  const raw = exact(basic.approval, APPROVAL_FIELDS);
  // The reviewer's claimed fee and times are allowed only if the signature
  // authenticates them under the original HD reservation/ledger/consent.
  const approval = verifyIndependentWagerReservation(raw,
    wagerReviewContext(original, raw as unknown as SatchelWagerReservation), reviewerPublicKey, nowMs);
  return Object.freeze({ kind: "reviewed" as const, approval });
}

/** One-shot reviewer pickup only, NEVER a transfer, signer retry or balance
 * operation. Errors remain held as waiting_for_review in the caller. */
export async function requestCertifiedIndependentSatchelReview(
  prisma: PrismaClient,
  input: Readonly<{ operationId: string; ownerUserId: number }>,
  reader: typeof fetch = fetch,
): Promise<"reviewed" | "pending"> {
  const cfg = ready();
  if (!OPERATION.test(input.operationId) ||
      !Number.isSafeInteger(input.ownerUserId) || input.ownerUserId < 1) stop("invalid_review_identity");
  const existing = await loadSatchelWagerReview(prisma,input);
  if (existing.review) return "reviewed";
  const original = existing.authorization;
  const publicKey = await readWithdrawalReviewerKey();
  const signal = AbortSignal.timeout(5000);
  const response = await reader(ENDPOINT, {
    method: "POST", redirect: "error", cache: "no-store", credentials: "omit",
    headers: {Authorization: "Bearer " + cfg.token,
      Accept: "application/json", "Content-Type": "application/json"},
    body: JSON.stringify({protocol:1,operation_id:original.operationId}),
    signal,
  });
  const length = Number(response.headers.get("content-length") || "0");
  if (!response.ok || response.status !== 200 ||
      !Number.isSafeInteger(length) || length < 0 || length > MAX_REPLY_BYTES) {
    void response.body?.cancel().catch(() => {});
    stop("reviewer_unavailable_or_oversized");
  }
  const body = await readWarSatchelBoundedUtf8(response.body, MAX_REPLY_BYTES);
  if (!body) stop("reviewer_reply_invalid");
  let decoded: unknown;
  try { decoded = JSON.parse(body); } catch { stop("reviewer_json_invalid"); }
  const reviewed = verifySatchelReviewerReply(decoded, original, publicKey, Date.now());
  if (reviewed.kind === "pending") return "pending";
  // Only durable HD ingress can attach, serializing with original reserve.
  await attachIndependentSatchelWagerReview(prisma,{
    operationId:original.operationId,ownerUserId:input.ownerUserId,approval:reviewed.approval,
  });
  return "reviewed";
}
