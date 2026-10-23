/** Shared return/operation adapter for the exact reviewed Wolo custody build. Exported HTTP JSON is
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
import { verifyIndependentWagerReservation } from "./warSatchelWagerReservation.ts";
import { readWagerReviewerKey } from "./warSatchelWagerReviewerKey.ts";

const invoke = promisify(execFile);
const MARK = Symbol("authenticated-wolo-comet-financial-proof");
const issued = new WeakSet<object>();
let active = 0;
// PR72 CI39636828148 artifact12363880676, exact clean source
// 8c509e8f62ca3ec60711dc2654a03b12f22b0773, pinned Go1.24.6 Linux/amd64.
// Independently verified archive, manifest and raw binary. Historical artifacts
// retain their identities; this digest grants no financial activation authority.
const PINNED_VERIFIER_SHA256 = "4c69464e9f6bf46feffb96cfd9f242d40eabdb5fad514af7adf99d44397788b3";
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
  kind: "withdrawal" | "claim_return" | "wager";
  ownerUid: string; operationId: string; txHash: string; vault: string;
  expectedContext: Readonly<Record<string, unknown>>;
  requestPath: "/satchel/v1/proofs/operation" | "/satchel/v1/proofs/return";
  requestBody: Readonly<Record<string, unknown>>;
}>;
export type AuthenticatedWarSatchelFinancialProof = Readonly<{
  kind: "withdrawal" | "claim_return" | "wager"; ownerUid: string; operationId: string;
  txHash: string; height: bigint; blockHash: string; txTimestamp: string; receiptId: string;
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
/** Pure admission check for SERVER-PERSISTED expectations. This creates no
 * authenticated proof. The separate public approval key must come from the
 * protected authority, never from exported evidence or a browser request.
 */
export function assertExpectedWarSatchelFinancialProof(
  x: ExpectedWarSatchelFinancialProof,
  wagerApprovalPublicKeyHex?: string,
) {
  const c = x.expectedContext;
  if ((x.kind !== "withdrawal" && x.kind !== "claim_return" && x.kind !== "wager") || !OWNER.test(x.ownerUid) ||
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
  } else if (x.kind === "claim_return") {
    const approval = receiptObject(c.return_approval);
    if (x.requestPath !== "/satchel/v1/proofs/return" || c.recipient !== x.vault ||
        typeof approval.claim_id !== "string" || !/^[1-9][0-9]{0,15}$/.test(approval.claim_id) ||
        approval.claim_id === "889" ||
        JSON.stringify(x.requestBody) !== JSON.stringify({claim_id:approval.claim_id}))
      stop("durable_return_expectations_invalid");
  } else {
    const exactKeys = ["protocol", "kind", "owner_id", "operation_id", "sender",
      "recipient", "amount_uwolo", "memo", "tx_hash", "reservation"];
    const keys = Reflect.ownKeys(c);
    if (keys.length !== exactKeys.length ||
        keys.some(key => typeof key !== "string" || !exactKeys.includes(key)) ||
        x.requestPath !== "/satchel/v1/proofs/operation" || c.sender !== x.vault ||
        typeof c.amount_uwolo !== "string" ||
        JSON.stringify(x.requestBody) !== JSON.stringify({operation_id:x.operationId}))
      stop("durable_wager_expectations_invalid");
    const a = receiptObject(c.reservation);
    // This is the exact ORIGINAL review read from the consumer's immutable
    // attempt. Historical proof verification uses its original issuance time,
    // matching Go VerifyFinancialProof; it grants no fresh submission window.
    verifyIndependentWagerReservation(a, {
      operationId: x.operationId, ownerUid: x.ownerUid, vault: x.vault,
      recipient: String(c.recipient), amountUwolo: c.amount_uwolo,
      memo: String(c.memo), reservationDigest: String(a.reservation_digest),
      ledgerRevision: String(a.ledger_revision), consentDigest: String(a.consent_digest),
      feeUwolo: String(a.fee_uwolo), issuedAt: a.issued_at as number,
      expiresAt: a.expires_at as number,
    }, wagerApprovalPublicKeyHex || "", Number(a.issued_at) * 1000);
  }
}
function requireConfiguration(x: {vault: string; kind: string}) {
  if (process.env.WAR_SATCHEL_PROOF_VERIFIER_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true" ||
      process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS !== x.vault)
    stop("operator_proof_authority_not_certified");
  const token = process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN || "";
  const binary = process.env.WAR_SATCHEL_VERIFIER_BINARY || "";
  const digest = PINNED_VERIFIER_SHA256;
  if (process.env.WAR_SATCHEL_VERIFIER_SHA256 && process.env.WAR_SATCHEL_VERIFIER_SHA256 !== digest)
    stop("unreviewed_verifier_digest");
  // The wager proof authority contains an explicit wager_approval_public_key_hex
  // distinct from its withdrawal-role approval_public_key_hex. Go verifies
  // reservations with the wager role only; a generic key is never substituted.
  const withdrawalAuthority = process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE || "";
  const authority = x.kind === "wager"
    ? process.env.WAR_SATCHEL_WAGER_PROOF_VERIFIER_AUTHORITY_FILE || ""
    : withdrawalAuthority;
  if (!/^[A-Za-z0-9_-]{48,512}$/.test(token) || !isAbsolute(binary) ||
      !isAbsolute(authority) || !DIGEST.test(digest) ||
      binary === authority ||
      (x.kind === "wager" && (!isAbsolute(withdrawalAuthority) ||
       authority === withdrawalAuthority ||
       authority === process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE))) {
    stop("pinned_offline_verifier_not_provisioned");
  }
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

export type VerifiedWarSatchelBankObservation=Readonly<{
  vaultAddress:string;balanceUwolo:bigint;height:bigint;commitHeight:bigint;
  blockHash:string;appHash:string;verifiedAtMs:number;authenticatedHeadExpiresAtMs:number;
}>;

/** Pure receipt validation only, after the pinned executable authenticated the
 * exact proof. Calling this helper cannot mint the opaque bank capability.
 * State H must be committed by the current authenticated head H+1; retaining
 * the executable's original minimum deadline also bounds trust-anchor expiry.
 */
export function verifiedBankReceiptMetadata(
  value:unknown,vault:string,height:number,nowMs=Date.now(),
):VerifiedWarSatchelBankObservation{
  const receipt=receiptObject(value);
  const exact=["protocol","status","chain_id","denom","vault","balance_uwolo","height","commit_height",
    "block_hash","app_hash","head_height","head_block_hash","head_time","authenticated_expires_at",
    "credit_authorized","spending_authorized","solvency_authorized"];
  if(!ADDRESS.test(vault)||!Number.isSafeInteger(height)||height<=0||height>=Number.MAX_SAFE_INTEGER||
     !Number.isSafeInteger(nowMs)||Object.keys(receipt).length!==exact.length||
     Object.keys(receipt).some(k=>!exact.includes(k))||
     receipt.protocol!==1||receipt.status!=="AUTHENTICATED_BANK_NONAUTHORIZING"||
     receipt.chain_id!=="wolo-1"||receipt.denom!=="uwolo"||receipt.vault!==vault||
     receipt.height!==height||receipt.commit_height!==height+1||receipt.head_height!==height+1||
     receipt.head_block_hash!==receipt.block_hash||
     typeof receipt.balance_uwolo!=="string"||!/^(0|[1-9][0-9]{0,18})$/.test(receipt.balance_uwolo)||
     BigInt(receipt.balance_uwolo)>BigInt("9223372036854775807")||
     !HASH.test(String(receipt.block_hash))||!HASH.test(String(receipt.app_hash))||
     receipt.block_hash==="0".repeat(64)||receipt.app_hash==="0".repeat(64)||
     !validCommitTimestamp(receipt.head_time)||!validCommitTimestamp(receipt.authenticated_expires_at)||
     receipt.credit_authorized!==false||receipt.spending_authorized!==false||receipt.solvency_authorized!==false)
    stop("bank_verifier_receipt_invalid");
  // Date.parse truncates nanos conservatively. Never grant a new thirty-second
  // window at verification completion or while waiting for a database lock.
  const headAtMs=Date.parse(receipt.head_time),expiresAtMs=Date.parse(receipt.authenticated_expires_at);
  if(!Number.isSafeInteger(headAtMs)||!Number.isSafeInteger(expiresAtMs)||headAtMs>nowMs+5000||
     expiresAtMs>headAtMs+30000||expiresAtMs<=nowMs)
    stop("authenticated_bank_evidence_expired");
  return Object.freeze({vaultAddress:vault,balanceUwolo:BigInt(receipt.balance_uwolo),height:BigInt(height),
    commitHeight:BigInt(height+1),blockHash:String(receipt.block_hash),appHash:String(receipt.app_hash),
    verifiedAtMs:nowMs,authenticatedHeadExpiresAtMs:expiresAtMs});
}

/** Fixed read-only bank route and command, sharing the exact reviewed binary
 * snapshot and public authority file used by the financial proof boundary.
 * This returns authenticated assets only, never complete solvency authority. */
export async function collectAndVerifyPinnedWarSatchelBankProof(
  vault:string, reader:typeof fetch=fetch, canceled?:AbortSignal,
):Promise<VerifiedWarSatchelBankObservation>{
  if(!ADDRESS.test(vault)||active>=4)stop("bank_verifier_unavailable");
  active++;
  const signal=AbortSignal.any([AbortSignal.timeout(30_000),...(canceled?[canceled]:[])]);
  try{
    signal.throwIfAborted();
    const cfg=requireConfiguration({vault,kind:"bank"});
    const response=await reader(ENDPOINT+"/satchel/v1/proofs/bank",{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{Authorization:"Bearer "+cfg.token,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({protocol:1}),signal,
    });
    const size=response.headers.get("content-length"), media=response.headers.get("content-type")||"";
    if(!response.ok||response.status!==200||
       !/^application\/json(?:;\s*charset=utf-8)?$/i.test(media)||
       response.headers.has("content-encoding")||
       size!==null&&(!/^(0|[1-9][0-9]{0,10})$/.test(size)||Number(size)>PROOF_LIMIT)){
      void response.body?.cancel().catch(()=>{});
      stop("bank_proof_export_unavailable");
    }
    const exported=await readWarSatchelBoundedUtf8(response.body,PROOF_LIMIT);
    if(!exported)stop("bank_proof_envelope_unavailable");
    const proof=receiptObject(JSON.parse(exported) as unknown),height=proof.height;
    if(proof.version!==1||proof.chain_id!=="wolo-1"||proof.denom!=="uwolo"||proof.address!==vault||
       typeof height!=="number"||!Number.isSafeInteger(height)||height<=0||height>=Number.MAX_SAFE_INTEGER)
      stop("bank_proof_identity_invalid");
    const directory=await realpath(await mkdtemp(join(tmpdir(),"aoe2war-satchel-bank-proof-")));
    try{
      await chmod(directory,0o700);
      const proofPath=join(directory,"untrusted-bank-proof.json"),binaryPath=join(directory,"verified-wolosatcheld");
      await writeFile(proofPath,exported,{mode:0o600,flag:"wx"});
      await snapshotBinary(cfg.binary,binaryPath,cfg.digest,signal);
      const {stdout}=await invoke(binaryPath,["verify-bank-proof","--authority",cfg.authority,
        "--height",String(height),"--proof",proofPath],{timeout:25_000,maxBuffer:16384,windowsHide:true,signal});
      signal.throwIfAborted();
      return verifiedBankReceiptMetadata(JSON.parse(stdout) as unknown,vault,height);
    }finally{await rm(directory,{recursive:true,force:true});}
  }finally{active--;}
}

function timestampObject(value: unknown, allowed: readonly string[]) {
  const object = receiptObject(value);
  if (Object.keys(object).some(key => !allowed.includes(key)))
    stop("authenticated_tx_timestamp_metadata_invalid");
  return object;
}
function validCommitTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) return false;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59) return false;
  if (parts[8] !== "Z") {
    const [offsetHour, offsetMinute] = parts[8].slice(1).split(":").map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

/** Metadata extraction ONLY AFTER the pinned verifier authenticates these
 * exact transcript bytes and returns this inclusion height/block hash.
 * Portable v1 proofs contain /commit, not /block. Comet authenticates
 * the signed header's time and its binding to commit.block_id.hash. REST's
 * second-precision transaction timestamp is never used here.
 * The pure helper does not authenticate a proof or issue an opaque receipt.
 */
export function verifiedFinancialTranscriptTxTimestamp(
  exported: string, height: bigint, blockHash: string,
): string {
  if (typeof exported !== "string" || Buffer.byteLength(exported) > PROOF_LIMIT ||
      typeof height !== "bigint" || height <= BigInt(0) ||
      height > BigInt(Number.MAX_SAFE_INTEGER) || typeof blockHash !== "string" ||
      !HASH.test(blockHash) || blockHash === "0".repeat(64))
    stop("authenticated_tx_timestamp_metadata_invalid");
  const envelope = receiptObject(JSON.parse(exported) as unknown);
  const proof = receiptObject(envelope.proof);
  if (envelope.height !== Number(height) || envelope.block_hash !== blockHash ||
      proof.version !== 1 || proof.chain_id !== "wolo-1" || proof.kind !== "transfer" ||
      !Array.isArray(proof.responses) || proof.responses.length === 0 || proof.responses.length > 80)
    stop("authenticated_tx_timestamp_metadata_invalid");
  const matches = proof.responses.filter(value => {
    const response = receiptObject(value);
    return response.source === "primary" && response.path === "/commit" &&
      response.query === "height=" + height.toString();
  });
  if (matches.length === 0) stop("authenticated_tx_timestamp_missing");
  let timestamp: string | undefined;
  for (const value of matches) {
    const response = timestampObject(value, ["source", "path", "query", "body"]);
    const body = timestampObject(response.body, ["jsonrpc", "id", "result", "error"]);
    if (body.error !== undefined && body.error !== null)
      stop("authenticated_tx_timestamp_metadata_invalid");
    const result = timestampObject(body.result, ["signed_header", "canonical"]);
    const signed = timestampObject(result.signed_header, ["header", "commit"]);
    const header = timestampObject(signed.header, ["version", "chain_id", "height", "time",
      "last_block_id", "last_commit_hash", "data_hash", "validators_hash", "next_validators_hash",
      "consensus_hash", "app_hash", "last_results_hash", "evidence_hash", "proposer_address"]);
    const commit = timestampObject(signed.commit, ["height", "round", "block_id", "signatures"]);
    const identity = timestampObject(commit.block_id, ["hash", "parts"]);
    if (result.canonical !== true || header.chain_id !== "wolo-1" ||
        header.height !== height.toString() || commit.height !== height.toString() ||
        identity.hash !== blockHash || !validCommitTimestamp(header.time))
      stop("authenticated_tx_timestamp_identity_mismatch");
    if (timestamp !== undefined && timestamp !== header.time)
      stop("authenticated_tx_timestamp_inconsistent");
    // Replay can fetch the same primary commit again during light-client
    // verification. Identical observations are harmless; differing ones fence.
    timestamp = header.time;
  }
  return timestamp!;
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
    const approvalPublicKey = expected.kind === "wager" ? await readWagerReviewerKey() : undefined;
    assertExpectedWarSatchelFinancialProof(expected, approvalPublicKey);
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
      const txTimestamp = verifiedFinancialTranscriptTxTimestamp(exported, BigInt(height), String(receipt.block_hash));
      const result = Object.freeze({kind:expected.kind,ownerUid:expected.ownerUid,operationId:expected.operationId,
        txHash:expected.txHash,height:BigInt(height),blockHash:String(receipt.block_hash),txTimestamp,
        receiptId:String(receipt.receipt_id),contextDigest:String(receipt.context_digest),
        verifiedAtMs,authenticatedHeadExpiresAtMs,[MARK]:true as const});
      issued.add(result);
      return result;
    } finally { await rm(directory,{recursive:true,force:true}); }
  } finally { active--; }
}
