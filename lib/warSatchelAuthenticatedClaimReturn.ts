/** Authenticated, NONCREDITING escrow return. Only the pinned independent
 * Comet verifier can issue the physical proof; only HD's durable approval and
 * original funded ticket determine the economic expectation. */
import {
  authenticateWarSatchelFinancialProof, financialProofFreshAt,
} from "./warSatchelAuthenticatedFinancialProof.ts";
import {
  verifySatchelSignedV2Return, type ExpectedSignedReturn,
} from "./warSatchelSignedV2Return.ts";

const issued = new WeakSet<object>();
const HASH = /^[A-F0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
function refuse(reason: string): never {
  throw Error("SATCHEL_AUTHENTICATED_RETURN_REFUSED:" + reason);
}
export type ExpectedWarSatchelClaimReturn = ExpectedSignedReturn & Readonly<{
  txHash: string; principalUwolo: string; stakeUwolo: string;
  approval: unknown; contextFingerprint: string;
}>;
export type AuthenticatedWarSatchelClaimReturn = Readonly<{
  expected: ExpectedWarSatchelClaimReturn;
  txHash: string; amountUwolo: bigint; canonicalHeight: bigint;
  blockHash: string; receiptId: string; contextDigest: string;
  verifiedAtMs: number; authenticatedHeadExpiresAtMs: number;
  physicalProof: Awaited<ReturnType<typeof authenticateWarSatchelFinancialProof>>;
}>;

/** JSON, a copied object, REST observations and scalar receipts have no brand. */
export function isAuthenticatedWarSatchelClaimReturn(value: unknown): value is AuthenticatedWarSatchelClaimReturn {
  return Boolean(value && typeof value === "object" && issued.has(value as object));
}
export function authenticatedWarSatchelClaimReturnFreshAt(value: unknown, nowMs = Date.now()): value is AuthenticatedWarSatchelClaimReturn {
  return isAuthenticatedWarSatchelClaimReturn(value) && financialProofFreshAt(value.physicalProof, nowMs);
}

/** No signing, broadcast, escrow preparation, settlement or ledger update. */
export async function authenticateSatchelClaimReturn(
  source: ExpectedWarSatchelClaimReturn,
  reader: typeof fetch = fetch,
  canceled?: AbortSignal,
): Promise<AuthenticatedWarSatchelClaimReturn> {
  // Detach nested approval so an asynchronous caller cannot swap economics.
  const expected = Object.freeze({...source, approval: structuredClone(source.approval)});
  if (!/^[1-9][0-9]{0,9}$/.test(expected.claimId) || expected.claimId === "889" ||
      !HASH.test(expected.txHash) || !DIGEST.test(expected.contextFingerprint) ||
      !expected.principalUwolo || !expected.stakeUwolo)
    refuse("durable_context_invalid");
  const signed = verifySatchelSignedV2Return({
    approval: expected.approval,
    independentOperatorPublicKeyHex: process.env.WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX || "",
    expected,
  });
  const physicalProof = await authenticateWarSatchelFinancialProof({
    kind: "claim_return", ownerUid: expected.ownerId,
    operationId: expected.operationId, txHash: expected.txHash,
    vault: expected.vaultAddress,
    requestPath: "/satchel/v1/proofs/return",
    requestBody: {claim_id: expected.claimId},
    expectedContext: {
      protocol: 1, kind: "claim_return", owner_id: expected.ownerId,
      operation_id: expected.operationId, sender: expected.escrowAddress,
      recipient: expected.vaultAddress, amount_uwolo: expected.amountUwolo,
      memo: "aoe2war/satchel/claim-return/v1/" + expected.claimId,
      tx_hash: expected.txHash, funded_amount_uwolo: expected.fundedAmountUwolo,
      return_approval: expected.approval,
    },
  }, reader, canceled);
  const proof = Object.freeze({
    expected, txHash: expected.txHash, amountUwolo: signed.amountUwolo,
    canonicalHeight: physicalProof.height, blockHash: physicalProof.blockHash,
    receiptId: physicalProof.receiptId, contextDigest: physicalProof.contextDigest,
    verifiedAtMs: physicalProof.verifiedAtMs,
    authenticatedHeadExpiresAtMs: physicalProof.authenticatedHeadExpiresAtMs,
    physicalProof,
  });
  issued.add(proof);
  return proof;
}
