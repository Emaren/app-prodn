/** Pure historical founder payout evidence comparisons. No signing, state or IO. */
export function claim889CanonicalMemo(claim) {
  if (claim?.source_founder_bonus_id !== 15 ||
      claim?.claim_kind !== "founders_win" ||
      typeof claim.claim_group_key !== "string") {
    throw new Error("historical claim identity mismatch");
  }
  const norm = value => value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "target";
  const target = norm(claim.claim_group_key);
  const kind = norm(claim.claim_kind).slice(0, 32);
  return `AoE2 Founder payout · bonus 15 · ${kind} · ${target}`.slice(0, 180);
}

const HASH = /^[a-f0-9]{64}$/i;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;

export function classifyClaim889CanonicalCandidate({ claim, cachedTxHash, response }) {
  const hash = String(cachedTxHash || "").toUpperCase();
  if (!HASH.test(hash) || !Number.isSafeInteger(claim?.amount_wolo) ||
      claim.amount_wolo <= 0) {
    throw new Error("invalid historical claim or transaction identity");
  }
  const tx = response?.tx_response;
  const body = tx?.tx?.body;
  if (typeof tx !== "object" || tx === null ||
      String(tx.txhash || "").toUpperCase() !== hash ||
      typeof body !== "object" || body === null) {
    throw new Error("canonical transaction payload/identity unavailable");
  }
  const memoMatch = body.memo === claim889CanonicalMemo(claim);
  const success = Number.isInteger(Number(tx.code)) &&
    Number(tx.code) === 0 && Number(tx.height) > 0;
  const expected = (BigInt(claim.amount_wolo) * 1000000n).toString();
  const sends = Array.isArray(body.messages) ? body.messages : [];
  const matching = sends.filter(msg => {
    if (msg?.["@type"] !== "/cosmos.bank.v1beta1.MsgSend" ||
        !ADDRESS.test(String(msg.from_address || "")) ||
        !ADDRESS.test(String(msg.to_address || "")) ||
        !Array.isArray(msg.amount)) return false;
    return msg.amount.some(c => c.denom === "uwolo" && c.amount === expected);
  });
  const observed = {
    txHash: hash,
    canonicalTxSucceeded: success,
    exactMemoMatched: memoMatch,
    exactAmountMsgSendCount: matching.length,
    actualRecipientBoundToClaim: false,
    independentSenderRoleCertified: false,
    fullyReconciledPayout: false,
  };
  return {
    ...observed,
    status: success && memoMatch && matching.length === 1
      ? "CANONICAL_POSSIBLE_PAYOUT_REQUIRES_RECIPIENT_AND_SIGNER_PROOF"
      : "CANONICAL_TRANSACTION_NOT_AN_EXACT_FOUNDER_PAYOUT_CANDIDATE",
  };
}
