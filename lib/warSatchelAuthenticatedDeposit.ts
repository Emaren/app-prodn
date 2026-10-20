/**
 * Exact-source offline Comet proof verification for one HD-owned deposit.
 *
 * NONCREDITING: 8094 exports untrusted evidence; the separate pinned
 * wolosatcheld executable authenticates consensus using an independent
 * operator-owned authority file. No browser may choose the vault, key,
 * anchor, executable, endpoint, amount, owner, memo or signed evidence.
 * Keep the source-level SATCHEL_FINANCIAL_BRIDGE_READY hold until the entire
 * withdrawal/claim-return/transaction-uniqueness rail is independently done.
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
const MARK = Symbol("authenticated-wolo-comet-deposit");
const issued = new WeakSet<object>();
let active = 0;
// Reviewed PR39 custody backend: source99f32de617964565875ed4689bea0d688bb99147,
// CI39129775493; NEW Linux/amd64 artifact. Historical PR29 bytes are not relabeled.
const PINNED_VERIFIER_SHA256 = "d431c580a47ff020d997534145c5c53959c70c6f2d00d13029582ee8ec8709ac";
const ENDPOINT = "http://127.0.0.1:8094/satchel/v1/proofs/deposit";
const HASH = /^[A-F0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const OWNER = /^[a-zA-Z0-9_.:-]{1,100}$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const PROOF_LIMIT = 15 * 1024 * 1024;
const BIN_LIMIT = 512 * 1024 * 1024;

function stop(reason: string): never {
  throw new Error("SATCHEL_AUTHENTICATED_DEPOSIT_REFUSED:" + reason);
}
export type ExpectedWarSatchelDeposit = Readonly<{
  intentId: string; ownerUid: string; sender: string; vault: string;
  amountUwolo: string; memo: string; createdAtUtc: string;
  expiresAtUtc: string; txHash: string;
}>;
export type AuthenticatedWarSatchelDeposit = Readonly<{
  intentId: string; ownerUid: string; sender: string; vault: string;
  amountUwolo: string; memo: string; txHash: string;
  height: bigint; blockHash: string; receiptId: string;
  createdAtUtc: string; expiresAtUtc: string; verifiedAtMs: number;
  authenticatedHeadExpiresAtMs: number;
  [MARK]: true;
}>;
export function isAuthenticatedWarSatchelDeposit(
  value: unknown,
): value is AuthenticatedWarSatchelDeposit {
  return Boolean(value && typeof value === "object" &&
    issued.has(value as object));
}
function assertExpected(x: ExpectedWarSatchelDeposit) {
  const start = Date.parse(x.createdAtUtc), end = Date.parse(x.expiresAtUtc);
  if (!/^[a-f0-9-]{36}$/i.test(x.intentId) || !OWNER.test(x.ownerUid) ||
      !ADDRESS.test(x.sender) || !ADDRESS.test(x.vault) ||
      x.sender === x.vault || !HASH.test(x.txHash) ||
      !AMOUNT.test(x.amountUwolo) ||
      BigInt(x.amountUwolo) > BigInt("9223372036854775807") ||
      x.memo.length > 240 || !x.memo.startsWith("aoe2war/satchel/v1/" + x.ownerUid + "/") ||
      !Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || end - start > 30 * 60_000) {
    stop("durable_deposit_expectations_invalid");
  }
}
function requireConfiguration(x: ExpectedWarSatchelDeposit) {
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
export function verifiedDepositTranscriptHeadExpiry(
  exported: string, nowMs = Date.now(),
): number {
  if (typeof exported !== "string" || Buffer.byteLength(exported) > PROOF_LIMIT ||
      !Number.isSafeInteger(nowMs)) stop("authenticated_head_metadata_invalid");
  const envelope = receiptObject(JSON.parse(exported) as unknown);
  const proof = receiptObject(envelope.proof);
  if (proof.version !== 1 || proof.chain_id !== "wolo-1" || proof.kind !== "deposit" ||
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

/** This predicate checks an already issued, opaque proof. Numeric freshness
 * metadata or a copied symbol alone cannot create an authenticated deposit.
 */
export function authenticatedWarSatchelDepositFreshAt(
  value: unknown, nowMs = Date.now(),
): value is AuthenticatedWarSatchelDeposit {
  return isAuthenticatedWarSatchelDeposit(value) && Number.isSafeInteger(nowMs) &&
    Number.isSafeInteger(value.verifiedAtMs) && Number.isSafeInteger(value.authenticatedHeadExpiresAtMs) &&
    value.verifiedAtMs <= nowMs && nowMs - value.verifiedAtMs <= 30_000 &&
    nowMs < value.authenticatedHeadExpiresAtMs;
}
/** A return value exists ONLY following offline verifier exit 0. */
export async function authenticateOwnerDeposit(
  expected: ExpectedWarSatchelDeposit,
  reader: typeof fetch = fetch,
  canceled?: AbortSignal,
): Promise<AuthenticatedWarSatchelDeposit> {
  if (active >= 4) stop("proof_verifier_busy");
  active++;
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(canceled ? [canceled] : [])]);
  try {
  signal.throwIfAborted();
  expected = Object.freeze({...expected});
  assertExpected(expected);
  const cfg = requireConfiguration(expected);

  const payload = {
    protocol: 1, owner_id: expected.ownerUid,
    sender: expected.sender, amount_uwolo: expected.amountUwolo,
    memo: expected.memo, created_at: expected.createdAtUtc,
    expires_at: expected.expiresAtUtc, tx_hash: expected.txHash,
  };
  const response = await reader(ENDPOINT, {
    method: "POST", redirect: "error", cache: "no-store",
    headers: {
      Authorization: "Bearer " + cfg.token,
      "Content-Type": "application/json", Accept: "application/json",
    },
    body: JSON.stringify(payload), signal,
  });
  const size = Number(response.headers.get("content-length") || "0");
  if (!response.ok || response.status !== 200 ||
      !Number.isSafeInteger(size) || size > PROOF_LIMIT)
    stop("proof_export_unavailable");
  const exported = await readWarSatchelBoundedUtf8(response.body, PROOF_LIMIT);
  if (!exported || Buffer.byteLength(exported) > PROOF_LIMIT)
    stop("proof_envelope_unavailable");

  // Ordered exactly as FinancialProofContext in WoloChain PR #29. These are
  // independently reloaded HD intent fields, NOT exporter.context values.
  const trustedExpected = {
    protocol: 1, kind: "deposit", owner_id: expected.ownerUid,
    sender: expected.sender, recipient: expected.vault,
    amount_uwolo: expected.amountUwolo, memo: expected.memo,
    tx_hash: expected.txHash, created_at: expected.createdAtUtc,
    expires_at: expected.expiresAtUtc,
  };
  const directory = await realpath(await mkdtemp(join(tmpdir(), "aoe2war-satchel-offline-")));
  try {
    await chmod(directory, 0o700);
    const contextPath = join(directory, "expected.json");
    const proofPath = join(directory, "untrusted-proof.json");
    await writeFile(contextPath, JSON.stringify(trustedExpected), {mode: 0o600, flag: "wx"});
    await writeFile(proofPath, exported, {mode: 0o600, flag: "wx"});
    const binaryPath = join(directory, "verified-wolosatcheld");
    await snapshotBinary(cfg.binary, binaryPath, cfg.digest, signal);
    const {stdout} = await invoke(binaryPath, [
      "verify-financial-proof", "--authority", cfg.authority,
      "--expected", contextPath, "--proof", proofPath,
    ], {timeout: 25_000, maxBuffer: 16384, windowsHide: true, signal});
    signal.throwIfAborted();
    const receipt = receiptObject(JSON.parse(stdout) as unknown);
    const height = receipt.height;
    if (receipt.protocol !== 1 || receipt.kind !== "deposit" ||
        receipt.chain_id !== "wolo-1" || receipt.denom !== "uwolo" ||
        receipt.owner_id !== expected.ownerUid ||
        receipt.tx_hash !== expected.txHash ||
        receipt.receipt_id !== "wolo-1:" + expected.txHash + ":0" ||
        receipt.transfer_index !== 0 || receipt.message_index !== 0 ||
        receipt.credit_authorized !== false ||
        typeof height !== "number" || !Number.isSafeInteger(height) ||
        height <= 0 || !HASH.test(String(receipt.block_hash))) {
      stop("offline_receipt_identity_does_not_match_intent");
    }
    const verifiedAtMs = Date.now();
    const authenticatedHeadExpiresAtMs = verifiedDepositTranscriptHeadExpiry(exported, verifiedAtMs);
    const authenticated = Object.freeze({
      intentId: expected.intentId, ownerUid: expected.ownerUid,
      sender: expected.sender, vault: expected.vault,
      amountUwolo: expected.amountUwolo, memo: expected.memo,
      txHash: expected.txHash, height: BigInt(height),
      blockHash: String(receipt.block_hash),
      receiptId: String(receipt.receipt_id), [MARK]: true as const,
      createdAtUtc: expected.createdAtUtc, expiresAtUtc: expected.expiresAtUtc,
      verifiedAtMs, authenticatedHeadExpiresAtMs,
    });
    issued.add(authenticated);
    return authenticated;
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
  } finally { active--; }
}
