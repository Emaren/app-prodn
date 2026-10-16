/**
 * Read-only decoded bank-send extraction for payout evidence.
 *
 * Never silently filter malformed messages: doing so changes the original
 * top-level transaction message ordinal, making financial evidence ambiguous.
 * Never select the first of two uwolo amounts as if it were the sole amount.
 * This parser is only one input to canonical chain, signer and claim checks.
 */
export type CanonicalWoloMsgSend = {
  index: number;
  fromAddress: string;
  toAddress: string;
  amountUwolo: string;
  denom: string;
};

type Obj = Record<string, unknown>;
function obj(value: unknown): Obj | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Obj : null;
}
function address(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(normalized) ? normalized : null;
}
function decodeBody(
  body: unknown,
  denom: string,
): { sends: CanonicalWoloMsgSend[]; messageCount: number } | null {
  const messages = obj(body)?.messages;
  if (!Array.isArray(messages)) return null;
  const sends: CanonicalWoloMsgSend[] = [];
  for (let index = 0; index < messages.length; index++) {
    const msg = obj(messages[index]);
    if (!msg) return null; // Never remove a message and reindex subsequent sends.
    if (msg["@type"] !== "/cosmos.bank.v1beta1.MsgSend") continue;
    const fromAddress = address(msg.from_address);
    const toAddress = address(msg.to_address);
    if (!fromAddress || !toAddress || !Array.isArray(msg.amount) || msg.amount.length === 0) {
      return null;
    }
    let amountUwolo: string | null = null;
    const denoms = new Set<string>();
    for (const value of msg.amount) {
      const coin = obj(value);
      if (!coin || typeof coin.denom !== "string" || !coin.denom ||
          typeof coin.amount !== "string" ||
          !/^[1-9][0-9]{0,29}$/.test(coin.amount) ||
          denoms.has(coin.denom)) return null;
      denoms.add(coin.denom);
      if (coin.denom === denom) amountUwolo = coin.amount;
    }
    if (amountUwolo !== null) {
      sends.push({ index, fromAddress, toAddress, amountUwolo, denom });
    }
  }
  return { sends, messageCount: messages.length };
}

/**
 * Return null for malformed or mutually inconsistent REST representations.
 * Return [] for a valid transaction without a WOLO MsgSend.
 */
export function extractCanonicalWoloMsgSends(
  payload: unknown,
  denom: string,
): CanonicalWoloMsgSend[] | null {
  const root = obj(payload);
  const rootResponse = obj(root?.tx_response);
  const outerTx = obj(root?.tx);
  const nestedTx = obj(rootResponse?.tx);
  // If either REST source supplies a non-null transaction, it must be
  // a decodable object. Never accept the other source after discarding a
  // contradictory malformed view as if it were merely absent.
  if ((root?.tx != null && !outerTx) ||
      (rootResponse?.tx != null && !nestedTx)) return null;
  const outer = outerTx ? decodeBody(outerTx.body, denom) : null;
  const nested = nestedTx ? decodeBody(nestedTx.body, denom) : null;
  if ((outerTx && !outer) || (nestedTx && !nested)) return null;
  if (!outer && !nested) return null;
  if (outer && nested &&
      (outer.messageCount !== nested.messageCount ||
       JSON.stringify(outer.sends) !== JSON.stringify(nested.sends))) return null;
  return (outer ?? nested)?.sends ?? null;
}
