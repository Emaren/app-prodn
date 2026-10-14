/**
 * War Satchel C3b: independent, read-only wolo-1 server evidence adapter.
 * NOT a public API, deposit executor, owner binding, proof-credit admission,
 * wallet transfer, accepted bet, or permission to share the manual bet vault.
 *
 * Callers must load immutable deposit intent and authenticated owner from
 * the server DB. Browser-supplied proof/head objects are NEVER trusted.
 */
import {
  examineSatchelDepositEvidence,
  type SatchelDepositIntent,
  type SatchelEscrowProof,
} from "./warSatchelCustodyEvidence.ts";

const HASH = /^[a-fA-F0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const MAX_UWOLO = BigInt("9223372036854775807");
const LOCAL_ESCROW = "http://127.0.0.1:8092";
const LOCAL_RPC = "http://127.0.0.1:27657";
const MAX_JSON_BYTES = 1024 * 1024;
const DEFAULT_CONFIRMATIONS = 3;

type FetchReader = (url: string, init: RequestInit) => Promise<Response>;

function refuse(msg: string): never {
  throw new Error("SATCHEL_CHAIN_READ_REFUSED: " + msg);
}
function assert(value: unknown, msg: string): asserts value {
  if (!value) refuse(msg);
}
function object(v: unknown): Record<string, unknown> {
  assert(v && typeof v === "object" && !Array.isArray(v), "malformed chain reply");
  return v as Record<string, unknown>;
}
async function readJson(url: string, reader: FetchReader): Promise<Record<string, unknown>> {
  assert(url.startsWith(LOCAL_ESCROW + "/") || url.startsWith(LOCAL_RPC + "/"),
    "non-local evidence endpoint");
  let response: Response;
  try {
    response = await reader(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5500),
      headers: { Accept: "application/json" },
    });
  } catch {
    refuse("canonical chain service not reachable");
  }
  assert(response!.ok && response!.status === 200, "chain service rejected evidence");
  const contentLength = Number(response!.headers.get("content-length") || "0");
  assert(Number.isSafeInteger(contentLength) && contentLength >= 0 &&
    contentLength <= MAX_JSON_BYTES, "oversized response header");
  let text: string;
  try {
    text = await response!.text();
  } catch {
    refuse("unable to read canonical evidence");
  }
  assert(Buffer.byteLength(text!, "utf8") > 0 &&
    Buffer.byteLength(text!, "utf8") <= MAX_JSON_BYTES, "oversized or empty evidence");
  try {
    return object(JSON.parse(text!));
  } catch {
    refuse("invalid JSON evidence");
  }
}

export type ReadOnlySatchelReceiptQuery = {
  /** Immutable DB intent, not client supplied. */
  intent: SatchelDepositIntent;
  /** Authentication derived from signed-in session and persisted Keplr proof. */
  authenticatedUid: string;
  authenticatedWalletAddress: string;
  /** A user-submitted hash may be a lookup HINT, never a proof. */
  claimedTxHash: string;
};

/**
 * No credits and no writes. The proof path requires a separately certified
 * vault, not the existing shared manual bet escrow. Injected reader is only
 * for offline tests and must not be taken from a browser.
 */
export async function readOnlyWarSatchelChainCandidate(
  query: ReadOnlySatchelReceiptQuery,
  reader: FetchReader = fetch,
) {
  assert(process.env.WAR_SATCHEL_PROOF_AUDIT_ENABLED === "true",
    "read-only audit feature disabled");
  const certified = process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS?.trim() || "";
  const betEscrow = process.env.WOLO_BET_ESCROW_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS?.trim() || "";
  const challengeEscrow = process.env.WOLO_CHALLENGE_ESCROW_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS?.trim() || betEscrow;
  assert(ADDRESS.test(certified) && ADDRESS.test(betEscrow) &&
    ADDRESS.test(challengeEscrow), "missing certified vault or existing escrow authority");
  assert(certified !== betEscrow && certified !== challengeEscrow,
    "Satchel vault cannot reuse betting/challenge collateral");
  assert(query.intent?.vaultAddress === certified, "stored intent not tied to certified vault");
  assert(HASH.test(query.claimedTxHash), "invalid lookup transaction hash");
  assert(ADDRESS.test(query.intent.senderAddress) &&
    query.intent.senderAddress === query.authenticatedWalletAddress, "wrong bound wallet");
  assert(query.intent.ownerUid === query.authenticatedUid, "wrong authenticated owner");
  assert(AMOUNT.test(query.intent.amountUwolo) &&
    BigInt(query.intent.amountUwolo) <= MAX_UWOLO, "invalid SQL-safe positive amount");

  const health = await readJson(LOCAL_ESCROW + "/settlement/v1/health", reader);
  assert(health.ok === true && health.chain_id === "wolo-1",
    "settlement health not independently authenticated");
  const status = await readJson(LOCAL_RPC + "/status", reader);
  const result = object(status.result);
  const nodeInfo = object(result.node_info);
  const syncInfo = object(result.sync_info);
  assert(nodeInfo.network === "wolo-1" && syncInfo.catching_up === false,
    "canonical RPC wrong chain or catching up");
  assert(typeof syncInfo.latest_block_height === "string" &&
    /^[1-9][0-9]*$/.test(syncInfo.latest_block_height), "invalid canonical block height");

  const hash = query.claimedTxHash.toUpperCase();
  const url = LOCAL_ESCROW + "/settlement/v1/escrow/txs/" + hash +
    "?expected_sender=" + encodeURIComponent(query.intent.senderAddress) +
    "&expected_amount_uwolo=" + encodeURIComponent(query.intent.amountUwolo);
  const response = await readJson(url, reader);
  const checked = examineSatchelDepositEvidence({
    intent: query.intent,
    claimedTxHash: hash,
    authenticatedUid: query.authenticatedUid,
    authenticatedWalletAddress: query.authenticatedWalletAddress,
    expectedVaultAddress: certified,
    proof: response as unknown as SatchelEscrowProof,
    head: {
      chainId: "wolo-1",
      height: syncInfo.latest_block_height,
      observedAt: new Date().toISOString(),
    },
    minConfirmations: DEFAULT_CONFIRMATIONS,
    now: new Date().toISOString(),
  });
  return Object.freeze({
    ...checked,
    evidenceOrigin: "pinned_local_escrow_and_canonical_rpc" as const,
    mutationPerformed: false as const,
    creditAuthorized: false as const,
    wagerAuthorized: false as const,
  });
}
