/**
 * Mecha War Satchel Gate B: PURE, NON-CREDITING CUSTODY EVIDENCE CHECKS.
 *
 * Inputs MUST come from independent, trusted authenticated server reads:
 * a verified owner-to-Keplr binding, current WoloChain settlement service,
 * and current canonical chain head. Neither this library nor its result
 * persists a credit, signs a transaction, opens the satchel or authorizes
 * a wager. Client-submitted proof JSON is never trusted evidence.
 */
export const SATCHEL_PROOF_CHAIN = "wolo-1" as const;
export const SATCHEL_PROOF_DENOM = "uwolo" as const;
const TX_HASH = /^[A-Fa-f0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const OWNER = /^[A-Za-z0-9_.:-]{1,128}$/;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

type Transfer = { sender?: string; recipient?: string; amount?: string; denom?: string };
export type SatchelEscrowProof = {
  ok: boolean;
  deposit_found: boolean;
  escrow_address: string;
  expected_sender?: string;
  expected_amount_uwolo?: string;
  lookup?: {
    ok: boolean;
    found: boolean;
    chain_id: string;
    tx_hash: string;
    tx_success: boolean;
    code?: number;
    height: string;
    timestamp: string;
    memo: string;
    matched_expected: boolean;
    matched_transfer?: Transfer;
    matched_transfer_index?: number;
    matching_transfer_count?: number;
    transfers?: Transfer[];
  };
};

export type SatchelDepositIntent = {
  ownerUid: string;
  senderAddress: string;
  vaultAddress: string;
  amountUwolo: string;
  chainId: string;
  nonce: string;
  memo: string;
  createdAt: string;
  expiresAt: string;
};

function enforce(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error("SATCHEL_PROOF_REFUSED: " + detail);
}
function integerAmount(raw: unknown, positive: boolean, label: string): bigint {
  enforce(typeof raw === "string" && /^(0|[1-9][0-9]{0,76})$/.test(raw), "invalid " + label);
  const value = BigInt(raw);
  enforce(!positive || value > BigInt(0), "non-positive " + label);
  return value;
}
function naturalHeight(raw: string, label: string): bigint {
  const height = integerAmount(raw, true, label);
  return height;
}
function isoTime(raw: string, label: string): number {
  enforce(typeof raw === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(raw), "invalid " + label);
  const time = Date.parse(raw);
  enforce(Number.isFinite(time), "invalid " + label);
  return time;
}
function validAddress(raw: string): boolean {
  return typeof raw === "string" && ADDRESS.test(raw);
}
export function satchelDepositMemo(ownerUid: string, nonce: string): string {
  enforce(OWNER.test(ownerUid), "invalid UID");
  enforce(NONCE.test(nonce), "invalid deposit nonce");
  return "aoe2war/satchel/v1/" + ownerUid + "/" + nonce;
}

/**
 * Independently evaluated intent-vs-chain candidate, NOT an accepted credit.
 * The caller has to validate the logged-in UID and wallet ownership, obtain
 * this proof from 8092 server-side and independently attest a current block.
 */
export function examineSatchelDepositEvidence(input: {
  intent: SatchelDepositIntent;
  claimedTxHash: string;
  authenticatedUid: string;
  authenticatedWalletAddress: string;
  expectedVaultAddress: string;
  proof: SatchelEscrowProof;
  head: { chainId: string; height: string; observedAt: string };
  minConfirmations: number;
  now: string;
}) {
  const { intent, proof, head } = input;
  enforce(intent !== null && typeof intent === "object", "missing intent");
  enforce(intent.chainId === SATCHEL_PROOF_CHAIN && head.chainId === SATCHEL_PROOF_CHAIN, "wrong chain");
  enforce(validAddress(intent.senderAddress) && validAddress(intent.vaultAddress) &&
    validAddress(input.expectedVaultAddress), "invalid wallet or vault address");
  enforce(intent.vaultAddress === input.expectedVaultAddress, "vault not certified");
  enforce(intent.ownerUid === input.authenticatedUid && OWNER.test(intent.ownerUid), "owner mismatch");
  enforce(intent.senderAddress === input.authenticatedWalletAddress, "Keplr owner mismatch");
  integerAmount(intent.amountUwolo, true, "intent uwolo");
  enforce(intent.memo === satchelDepositMemo(intent.ownerUid, intent.nonce), "intent memo mismatch");
  const created = isoTime(intent.createdAt, "intent creation");
  const expires = isoTime(intent.expiresAt, "intent expiry");
  enforce(expires > created && expires - created <= 30 * 60_000, "expired or unbounded intent");
  const observed = isoTime(head.observedAt, "chain head observation");
  const now = isoTime(input.now, "audit time");
  enforce(observed <= now && now - observed <= 120_000, "stale or future chain head");
  enforce(Number.isSafeInteger(input.minConfirmations) && input.minConfirmations >= 1 &&
    input.minConfirmations <= 100, "missing or unreasonable finality policy");
  enforce(TX_HASH.test(input.claimedTxHash), "invalid tx hash");
  enforce(proof && proof.ok === true && proof.deposit_found === true, "chain verifier refused receipt");
  enforce(proof.escrow_address === intent.vaultAddress, "chain escrow address differs");
  enforce(proof.expected_sender === intent.senderAddress &&
    proof.expected_amount_uwolo === intent.amountUwolo, "chain verifier expectations differ");
  const tx = proof.lookup;
  // WoloChain's Go response serializes Code with json:"code,omitempty":
  // confirmed code=0 is omitted. The trusted verifier independently derives
  // tx_success from the REST tx response Code==0, so do not reject that
  // authentic successful response solely for missing an optional zero field.
  enforce(tx && tx.ok === true && tx.found === true && tx.tx_success === true &&
    (tx.code === 0 || tx.code === undefined), "transaction failed or unverified");
  enforce(tx.chain_id === SATCHEL_PROOF_CHAIN && TX_HASH.test(tx.tx_hash) &&
    tx.tx_hash.toUpperCase() === input.claimedTxHash.toUpperCase(), "wrong transaction identity");
  enforce(tx.memo === intent.memo, "memo does not bind owner intent");
  const timestamp = isoTime(tx.timestamp, "on-chain transaction time");
  enforce(timestamp <= observed, "transaction dated after observed chain head");
  enforce(timestamp >= created && timestamp <= expires, "transaction outside intent lifetime");
  const txHeight = naturalHeight(tx.height, "transaction height");
  const headHeight = naturalHeight(head.height, "chain head height");
  enforce(headHeight >= txHeight &&
    headHeight - txHeight + BigInt(1) >= BigInt(input.minConfirmations), "insufficient confirmation depth");
  enforce(tx.matched_expected === true && tx.matching_transfer_count === 1, "ambiguous or absent matching transfer");
  // Do not delegate exclusivity to a reported summary field: recompute the
  // exact sender/recipient/amount/uwolo event count over the full returned list.
  // A candidate with two identical transfers is ambiguous even when an
  // upstream verifier incorrectly reports matching_transfer_count=1.
  enforce(Array.isArray(tx.transfers) && tx.transfers.length > 0 && tx.transfers.length <= 10000,
    "missing or oversized canonical transfer list");
  const matches = tx.transfers.reduce((count, item) =>
    count + Number(item.sender === intent.senderAddress &&
      item.recipient === intent.vaultAddress &&
      item.amount === intent.amountUwolo &&
      item.denom === SATCHEL_PROOF_DENOM), 0);
  enforce(matches === 1, "ambiguous or absent exact uwolo transfer");
  const index = tx.matched_transfer_index;
  enforce(Number.isSafeInteger(index) && index! >= 0 &&
    Array.isArray(tx.transfers) && index! < tx.transfers.length, "missing canonical transfer index");
  const transfer = tx.transfers![index!];
  enforce(tx.matched_transfer != null &&
    transfer.sender === intent.senderAddress && transfer.recipient === intent.vaultAddress &&
    transfer.amount === intent.amountUwolo && transfer.denom === SATCHEL_PROOF_DENOM &&
    tx.matched_transfer.sender === transfer.sender &&
    tx.matched_transfer.recipient === transfer.recipient &&
    tx.matched_transfer.amount === transfer.amount &&
    tx.matched_transfer.denom === transfer.denom, "indexed uwolo transfer mismatch");

  return Object.freeze({
    kind: "uncredited_deposit_candidate" as const,
    receiptKey: SATCHEL_PROOF_CHAIN + ":" + tx.tx_hash.toUpperCase() + ":" + index,
    ownerUid: intent.ownerUid,
    senderAddress: intent.senderAddress,
    vaultAddress: intent.vaultAddress,
    amountUwolo: intent.amountUwolo,
    txHeight: txHeight.toString(),
    confirmations: (headHeight - txHeight + BigInt(1)).toString(),
    // Never treated as a bank asset or spendable ledger balance.
    creditAuthorized: false as const,
    wagerAuthorized: false as const,
  });
}

export type SatchelReserveSegment = {
  category: string;
  liabilityUwolo: string;
  sourceReceipt: string;
  atHeight: string;
  independentlyAttested: boolean;
};
/** Numerical check only. Cannot establish non-overlap, live solvency or authority. */
export function examineSatchelReserveArithmetic(input: {
  vaultAddress: string;
  bankBalanceUwolo: string;
  bankAtHeight: string;
  segments: readonly SatchelReserveSegment[];
}) {
  enforce(validAddress(input.vaultAddress), "invalid reserve vault");
  const bank = integerAmount(input.bankBalanceUwolo, false, "bank balance");
  const height = naturalHeight(input.bankAtHeight, "bank height");
  enforce(Array.isArray(input.segments) && input.segments.length > 0 &&
    input.segments.length <= 32, "missing liability census");
  const categories = new Set<string>();
  const receipts = new Set<string>();
  let liabilities = BigInt(0);
  for (const segment of input.segments) {
    enforce(segment && typeof segment.category === "string" &&
      /^[a-z][a-z0-9_-]{0,63}$/.test(segment.category) &&
      !categories.has(segment.category), "missing or duplicate liability partition");
    enforce(segment.independentlyAttested === true, "unattested liability partition");
    enforce(typeof segment.sourceReceipt === "string" &&
      /^[a-fA-F0-9]{64}$/.test(segment.sourceReceipt) &&
      !receipts.has(segment.sourceReceipt), "missing or duplicate source attestation");
    enforce(naturalHeight(segment.atHeight, "partition block height") === height, "non-atomic liability snapshot");
    categories.add(segment.category);
    receipts.add(segment.sourceReceipt);
    liabilities += integerAmount(segment.liabilityUwolo, false, "liability");
  }
  return Object.freeze({
    bankBalanceUwolo: bank.toString(),
    reportedLiabilitiesUwolo: liabilities.toString(),
    arithmeticCovered: bank >= liabilities,
    shortfallUwolo: bank < liabilities ? (liabilities - bank).toString() : "0",
    excessUwolo: bank > liabilities ? (bank - liabilities).toString() : "0",
    // Completeness/non-overlap of these financial domains remains independently
    // unproven. Never elevate this numerical check into an executor readiness.
    custodyApproved: false as const,
    executionReady: false as const,
  });
}
