/**
 * Canonical REST transaction envelope gate for historical WOLO payout proofs.
 *
 * This is read-only validation, not chain-consensus attestation or payout
 * execution. Cosmos/Go omitempty can legitimately omit execution code ZERO.
 * Missing code is acceptable only when the independently requested hash,
 * committed positive height and decoded transaction envelope are present.
 */
export type PayoutTxEnvelope =
  | { ok: true; executionCode: number; committedHeight: string }
  | { ok: false; reason: "TX_ENVELOPE_MISSING" | "TX_HASH_NOT_BOUND" |
      "TX_NOT_COMMITTED" | "TX_CODE_INVALID" | "TX_EXECUTION_FAILED" |
      "TX_BODY_MISSING" };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function codeOf(response: Record<string, unknown>): number | null {
  if (!Object.prototype.hasOwnProperty.call(response, "code")) return 0;
  const raw = response.code;
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff ? raw : null;
  }
  if (typeof raw === "string" && /^(0|[1-9][0-9]*)$/.test(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n <= 0xffffffff ? n : null;
  }
  return null;
}

export function inspectWoloPayoutTxEnvelope(
  payload: unknown,
  requestedHash: string,
): PayoutTxEnvelope {
  const root = record(payload);
  const response = record(root?.tx_response);
  if (!root || !response) return { ok: false, reason: "TX_ENVELOPE_MISSING" };
  const hash = response.txhash;
  if (typeof hash !== "string" || !/^[A-Fa-f0-9]{64}$/.test(hash) ||
      !/^[A-Fa-f0-9]{64}$/.test(requestedHash) ||
      hash.toUpperCase() !== requestedHash.toUpperCase()) {
    return { ok: false, reason: "TX_HASH_NOT_BOUND" };
  }
  const height = response.height;
  const canonicalHeight =
    typeof height === "string" && /^[1-9][0-9]{0,18}$/.test(height) ? height
    : typeof height === "number" && Number.isSafeInteger(height) && height > 0
      ? String(height) : null;
  if (!canonicalHeight) return { ok: false, reason: "TX_NOT_COMMITTED" };

  // Cosmos v1beta1 REST may include the decoded Tx in the outer root or
  // in the TxResponse. Never accept a bare status with no Tx body.
  const tx = record(root.tx) ?? record(response.tx);
  if (!record(tx?.body)) return { ok: false, reason: "TX_BODY_MISSING" };

  const code = codeOf(response);
  if (code === null) return { ok: false, reason: "TX_CODE_INVALID" };
  if (code !== 0) return { ok: false, reason: "TX_EXECUTION_FAILED" };
  return { ok: true, executionCode: 0, committedHeight: canonicalHeight };
}
