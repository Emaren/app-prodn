/** Shared return/operation adapter for Wolo PR29. Exported HTTP JSON is
 * untrusted until the exact pinned offline executable authenticates Comet and
 * the full independently persisted expected context. No execution or credit.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { chmod, mkdtemp, realpath, rm, writeFile, open, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";

const invoke = promisify(execFile);
const MARK = Symbol("authenticated-wolo-comet-financial-proof");
const issued = new WeakSet<object>();
let active = 0;
// PR29 run39069854469, exact source155fcf67, two clean Linux/amd64 builds.
const PINNED_VERIFIER_SHA256 = "3c2f89936802d016a43efdb8b2ec914bd388e78e0b1251f76a837c793d5da92e";
const ENDPOINT = "http://127.0.0.1:8094";
const HASH = /^[A-F0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const OWNER = /^[a-zA-Z0-9_.:-]{1,100}$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const PROOF_LIMIT = 15 * 1024 * 1024;
const BIN_LIMIT = 512 * 1024 * 1024;

function stop(reason: string): never {
  throw new Error("SATCHEL_AUTHENTICATED_FINANCIAL_PROOF_REFUSED:" + reason);
}
export type ExpectedWarSatchelFinancialProof = Readonly<{
  kind: "withdrawal" | "claim_return";
  ownerUid: string; operationId: string; txHash: string; vault: string;
  expectedContext: Readonly<Record<string, unknown>>;
  requestPath: "/satchel/v1/proofs/operation" | "/satchel/v1/proofs/return";
  requestBody: Readonly<Record<string, unknown>>;
}>;
export type AuthenticatedWarSatchelFinancialProof = Readonly<{
  kind: "withdrawal" | "claim_return"; ownerUid: string; operationId: string;
  txHash: string; height: bigint; blockHash: string; receiptId: string;
  contextDigest: string; verifiedAtMs: number; authenticatedHeadExpiresAtMs: number;
  [MARK]: true;
}>;
export function financialProofFreshAt(value: unknown, nowMs = Date.now()): value is AuthenticatedWarSatchelFinancialProof {
  if (!value || typeof value !== "object" || !issued.has(value)) return false;
  const proof = value as AuthenticatedWarSatchelFinancialProof;
  return Number.isSafeInteger(nowMs) && Number.isSafeInteger(proof.verifiedAtMs) &&
    Number.isSafeInteger(proof.authenticatedHeadExpiresAtMs) && proof.verifiedAtMs <= nowMs &&
    nowMs - proof.verifiedAtMs <= 30_000 && nowMs < proof.authenticatedHeadExpiresAtMs;
}
function assertExpected(x: ExpectedWarSatchelFinancialProof) {
  const c = x.expectedContext;
  if ((x.kind !== "withdrawal" && x.kind !== "claim_return") || !OWNER.test(x.ownerUid) ||
      !ADDRESS.test(x.vault) || !HASH.test(x.txHash) || x.txHash === "0".repeat(64) ||
      !/^satchel:[a-z]+:[A-Za-z0-9-]{1,100}$/.test(x.operationId) ||
      c.protocol !== 1 || c.kind !== x.kind || c.owner_id !== x.ownerUid ||
      c.operation_id !== x.operationId || c.tx_hash !== x.txHash ||
      !ADDRESS.test(String(c.sender)) || !ADDRESS.test(String(c.recipient)) ||
      c.sender === c.recipient || !AMOUNT.test(String(c.amount_uwolo)) ||
      BigInt(String(c.amount_uwolo)) > BigInt("9223372036854775807") ||
      typeof c.memo !== "string" || c.memo.length === 0 || Buffer.byteLength(c.memo) > 256 ||
      Buffer.byteLength(JSON.stringify(c)) > 64 * 1024)
    stop("durable_financial_expectations_invalid");
  if (x.kind === "withdrawal") {
    if (x.requestPath !== "/satchel/v1/proofs/operation" || c.sender !== x.vault ||
        !c.withdrawal_approval || !c.owner_mandate ||
        JSON.stringify(x.requestBody) !== JSON.stringify({operation_id:x.operationId}))
      stop("durable_withdrawal_expectations_invalid");
  } else {
    const approval = receiptObject(c.return_approval);
    if (x.requestPath !== "/satchel/v1/proofs/return" || c.recipient !== x.vault ||
        typeof approval.claim_id !== "string" || !/^[1-9][0-9]{0,15}$/.test(approval.claim_id) ||
        approval.claim_id === "889" ||
        JSON.stringify(x.requestBody) !== JSON.stringify({claim_id:approval.claim_id}))
      stop("durable_return_expectations_invalid");
  }
}
function requireConfiguration(x: {vault: string}) {
  if (process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS !== x.vault)
    stop("operator_proof_authority_not_certified");
  const token = process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN || "";
  const binary = process.env.WAR_SATCHEL_VERIFIER_BINARY || "";
  const digest = PINNED_VERIFIER_SHA256;
  if (process.env.WAR_SATCHEL_VERIFIER_SHA256 && process.env.WAR_SATCHEL_VERIFIER_SHA256 !== digest)
    stop("unreviewed_verifier_digest");
  const authority = process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE || "";
  if (!/^[A-Za-z0-9_-]{48,512}$/.test(token) || !isAbsolute(binary) ||
      !isAbsolute(authority) || !DIGEST.test(digest) ||
      binary === authority) stop("pinned_offline_verifier_not_provisioned");
  return {token, binary, digest, authority};
}
async function snapshotBinary(path: string, destination: string, digest: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (await realpath(path) !== path) stop("verifier_binary_file_invalid");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let output: FileHandle | undefined;
  try {
    output = await open(destination, "wx", 0o500);
    const before = await file.stat();
    if (!before.isFile() || before.size <= 0 || before.size > BIN_LIMIT || (before.mode & 0o022) !== 0)
      stop("verifier_binary_file_invalid");
    const hash = createHash("sha256");
    let size = 0;
    const buffer = Buffer.alloc(1024 * 1024);
    while (true) {
      signal.throwIfAborted();
      const {bytesRead} = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > BIN_LIMIT) stop("verifier_binary_file_invalid");
      const part = buffer.subarray(0, bytesRead); hash.update(part);
      let offset = 0;
      while (offset < bytesRead) {
        signal.throwIfAborted();
        offset += (await output.write(part, offset, bytesRead - offset)).bytesWritten;
      }
    }
    signal.throwIfAborted();
    const after = await file.stat();
    if (before.ino !== after.ino || before.dev !== after.dev || size !== before.size ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs || hash.digest("hex") !== digest)
      stop("verifier_binary_not_exact_attested_artifact");
  } finally { await file.close(); if (output) await output.close(); }
}
function receiptObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    stop("offline_receipt_malformed");
  return value as Record<string, unknown>;
}
function canonicalStatusObject(value: unknown, allowed: readonly string[]) {
  const object = receiptObject(value);
  if (Object.keys(object).some(key => !allowed.includes(key)))
    stop("authenticated_head_metadata_aliased_or_unknown");
  return object;
}

/** Freshness metadata only, NEVER an authentication or credit API. Call only
 * after the pinned offline executable authenticated these exact transcript
 * bytes. Keep both source heads' original deadlines instead of granting a
 * fresh thirty-second window when the verifier returns.
 */
export function verifiedFinancialTranscriptHeadExpiry(
  exported: string, nowMs = Date.now(),
): number {
  if (typeof exported !== "string" || Buffer.byteLength(exported) > PROOF_LIMIT ||
      !Number.isSafeInteger(nowMs)) stop("authenticated_head_metadata_invalid");
  const envelope = receiptObject(JSON.parse(exported) as unknown);
  const proof = receiptObject(envelope.proof);
  if (proof.version !== 1 || proof.chain_id !== "wolo-1" || proof.kind !== "transfer" ||
      !Array.isArray(proof.responses) || proof.responses.length > 80)
    stop("authenticated_head_metadata_invalid");
  let expiresAtMs = Number.POSITIVE_INFINITY;
  for (const source of ["primary", "witness"]) {
    const statuses = proof.responses.filter(value => {
      const response = receiptObject(value);
      return response.source === source && response.path === "/status" && response.query === "";
    });
    if (statuses.length !== 1) stop("authenticated_head_metadata_missing_or_ambiguous");
    // The Go RPC decoder can recognize case/Unicode aliases. Reject every
    // noncanonical status key so this exact-name metadata read cannot select
    // a different head from the one the pinned verifier authenticated.
    const body = canonicalStatusObject(receiptObject(statuses[0]).body, ["jsonrpc", "id", "result", "error"]);
    const status = canonicalStatusObject(body.result, ["node_info", "sync_info", "validator_info"]);
    const node = canonicalStatusObject(status.node_info, ["protocol_version", "id", "listen_addr", "network", "version", "channels", "moniker", "other"]);
    const sync = canonicalStatusObject(status.sync_info, ["latest_block_hash", "latest_app_hash", "latest_block_height", "latest_block_time", "earliest_block_hash", "earliest_app_hash", "earliest_block_height", "earliest_block_time", "catching_up"]);
    const time = sync.latest_block_time;
    if (node.network !== "wolo-1" || sync.catching_up !== false || typeof time !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(time))
      stop("authenticated_head_metadata_invalid");
    // Date.parse truncates sub-millisecond digits, which makes this deadline
    // conservative relative to Go's RFC3339Nano comparison.
    const headAtMs = Date.parse(time);
    if (!Number.isSafeInteger(headAtMs) || headAtMs > nowMs + 5000)
      stop("authenticated_head_metadata_invalid");
    expiresAtMs = Math.min(expiresAtMs, headAtMs + 30_000);
  }
  if (!Number.isSafeInteger(expiresAtMs) || nowMs >= expiresAtMs)
    stop("authenticated_chain_head_expired");
  return expiresAtMs;
}

/** Only a successful exact-source offline verifier can issue the opaque result. */
export async function authenticateWarSatchelFinancialProof(
  expected: ExpectedWarSatchelFinancialProof, reader: typeof fetch = fetch,
  canceled?: AbortSignal,
): Promise<AuthenticatedWarSatchelFinancialProof> {
  if (active >= 4) stop("proof_verifier_busy");
  active++;
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(canceled ? [canceled] : [])]);
  try {
    signal.throwIfAborted();
    // Isolate nested approvals from callers mutating their object during I/O.
    expected = JSON.parse(JSON.stringify(expected)) as ExpectedWarSatchelFinancialProof;
    assertExpected(expected);
    const cfg = requireConfiguration(expected);
    const response = await reader(ENDPOINT + expected.requestPath, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: {Authorization: "Bearer " + cfg.token, "Content-Type": "application/json", Accept: "application/json"},
      body: JSON.stringify(expected.requestBody), signal,
    });
    const size = Number(response.headers.get("content-length") || "0");
    if (!response.ok || response.status !== 200 || !Number.isSafeInteger(size) || size > PROOF_LIMIT)
      stop("proof_export_unavailable");
    const exported = await readWarSatchelBoundedUtf8(response.body, PROOF_LIMIT);
    if (!exported || Buffer.byteLength(exported) > PROOF_LIMIT) stop("proof_envelope_unavailable");
    const directory = await realpath(await mkdtemp(join(tmpdir(), "aoe2war-satchel-financial-proof-")));
    try {
      await chmod(directory, 0o700);
      const contextPath = join(directory, "expected.json"), proofPath = join(directory, "untrusted-proof.json");
      await writeFile(contextPath, JSON.stringify(expected.expectedContext), {mode:0o600,flag:"wx"});
      await writeFile(proofPath, exported, {mode:0o600,flag:"wx"});
      const binaryPath = join(directory, "verified-wolosatcheld");
      await snapshotBinary(cfg.binary, binaryPath, cfg.digest, signal);
      const {stdout} = await invoke(binaryPath, ["verify-financial-proof", "--authority", cfg.authority,
        "--expected", contextPath, "--proof", proofPath],
        {timeout:25_000,maxBuffer:16384,windowsHide:true,signal});
      signal.throwIfAborted();
      const receipt = receiptObject(JSON.parse(stdout) as unknown);
      const height = receipt.height, ordinal = receipt.transfer_index;
      if (receipt.protocol !== 1 || receipt.kind !== expected.kind || receipt.chain_id !== "wolo-1" ||
          receipt.denom !== "uwolo" || receipt.owner_id !== expected.ownerUid ||
          receipt.operation_id !== expected.operationId || receipt.tx_hash !== expected.txHash ||
          receipt.message_index !== 0 || receipt.credit_authorized !== false ||
          typeof ordinal !== "number" || !Number.isSafeInteger(ordinal) || ordinal < 0 ||
          receipt.receipt_id !== `wolo-1:${expected.txHash}:${ordinal}` ||
          typeof height !== "number" || !Number.isSafeInteger(height) || height <= 0 ||
          !HASH.test(String(receipt.block_hash)) || !DIGEST.test(String(receipt.context_digest)))
        stop("offline_receipt_identity_does_not_match_durable_context");
      const verifiedAtMs = Date.now();
      const authenticatedHeadExpiresAtMs = verifiedFinancialTranscriptHeadExpiry(exported, verifiedAtMs);
      const result = Object.freeze({kind:expected.kind,ownerUid:expected.ownerUid,operationId:expected.operationId,
        txHash:expected.txHash,height:BigInt(height),blockHash:String(receipt.block_hash),
        receiptId:String(receipt.receipt_id),contextDigest:String(receipt.context_digest),
        verifiedAtMs,authenticatedHeadExpiresAtMs,[MARK]:true as const});
      issued.add(result);
      return result;
    } finally { await rm(directory,{recursive:true,force:true}); }
  } finally { active--; }
}
