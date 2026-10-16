/**
 * Pure exact-source count gate for a canonical WOLO bank payout tx.
 *
 * An authentic transfer to the right wallet and amount is NOT payout proof
 * when it came from another signer. Multiple obligations need that many
 * distinct MsgSend effects; duplicate entries cannot reuse one transfer.
 *
 * Caller must separately validate requested hash, chain, committed result,
 * address syntax, the payout request identity, and any historical liabilities.
 */
export type ExpectedPayoutSource = {
  fromAddress: string | null;
  toAddress: string;
  amountUwolo: string;
};
export type ObservedPayoutSource = {
  fromAddress: string;
  toAddress: string;
  amountUwolo: string;
};

export function hasSufficientBoundPayoutSources(
  expected: readonly ExpectedPayoutSource[],
  observed: readonly ObservedPayoutSource[],
): boolean {
  const needed = new Map<string, number>();
  const available = new Map<string, number>();
  const key = (sender: string, recipient: string, amount: string) =>
    JSON.stringify([sender, recipient, amount]);
  for (const payout of expected) {
    if (payout.fromAddress === null) continue; // Legacy claim: origin unmeasured, NOT proven.
    if (!payout.fromAddress) return false;
    const id = key(payout.fromAddress, payout.toAddress, payout.amountUwolo);
    needed.set(id, (needed.get(id) ?? 0) + 1);
  }
  for (const send of observed) {
    const id = key(send.fromAddress, send.toAddress, send.amountUwolo);
    available.set(id, (available.get(id) ?? 0) + 1);
  }
  return [...needed.entries()].every(([id, count]) => (available.get(id) ?? 0) >= count);
}
