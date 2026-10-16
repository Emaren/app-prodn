/**
 * C3 canonical public-chain deposit evidence for a PREPARED_UNFUNDABLE intent.
 * No signing, custody credit, spendable balance, withdrawal, or wager.
 * Only the trusted server can supply the immutable intent and linked owner.
 */
const HASH = /^[a-fA-F0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const HEIGHT = /^[1-9][0-9]{0,19}$/;
const MAX_UWOLO = BigInt("9223372036854775807");
const AMOUNT = /^[1-9][0-9]{0,18}$/;
const TYPE = "/cosmos.bank.v1beta1.MsgSend";

export type SatchelImmutableIntent = {
  id: string;
  chainId: string;
  senderAddress: string;
  vaultAddress: string;
  amountUwolo: string;
  memo: string;
  status: string;
  createdAtUtc: string;
  expiresAtUtc: string;
};
function demand(ok: unknown, why: string): asserts ok {
  if (!ok) throw new Error("SATCHEL_CANONICAL_AUDIT_REFUSED:" + why);
}
function obj(v: unknown): Record<string, unknown> {
  demand(v !== null && typeof v === "object" && !Array.isArray(v), "invalid object");
  return v as Record<string, unknown>;
}
function parseClock(value: string): number {
  demand(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value) &&
    /(Z|\+00:00)$/.test(value), "invalid UTC timestamp");
  const t = Date.parse(value);
  demand(Number.isFinite(t), "unparseable timestamp");
  return t;
}
export function inspectCanonicalSatchelDeposit(input: {
  immutableIntent: SatchelImmutableIntent;
  ownerUid: string;
  ownerWallet: string;
  certifiedVault: string;
  hash: string;
  chainStatus: unknown;
  txResponse: unknown;
  nowUtc: string;
}) {
  const { immutableIntent: it } = input;
  demand(it && typeof it === "object" && it.status === "prepared", "unprepared intent");
  demand(it.chainId === "wolo-1", "wrong stored chain");
  demand(ADDRESS.test(it.senderAddress) && it.senderAddress === input.ownerWallet &&
    ADDRESS.test(it.vaultAddress) && it.vaultAddress === input.certifiedVault, "owner or vault mismatch");
  demand(HASH.test(input.hash), "invalid tx hash");
  demand(AMOUNT.test(it.amountUwolo) && BigInt(it.amountUwolo) <= MAX_UWOLO,
    "invalid DB-safe amount");
  demand(it.memo.startsWith("aoe2war/satchel/v1/" + input.ownerUid + "/") &&
    /^aoe2war\/satchel\/v1\/[A-Za-z0-9_.:-]{1,128}\/[A-Za-z0-9_-]{16,64}$/.test(it.memo),
    "memo not bound to session owner");
  const created = parseClock(it.createdAtUtc);
  const expired = parseClock(it.expiresAtUtc);
  const now = parseClock(input.nowUtc);
  demand(created < expired && expired - created <= 1_800_000, "unbounded intent");
  demand(now >= created, "clock predates intent");
  const status = obj(obj(input.chainStatus).result);
  const net = obj(status.node_info);
  const sync = obj(status.sync_info);
  demand(net.network === "wolo-1" && sync.catching_up === false, "canonical head unavailable");
  demand(typeof sync.latest_block_height === "string" && HEIGHT.test(sync.latest_block_height),
    "invalid canonical head height");
  const response = obj(input.txResponse);
  const tx = obj(response.tx_response);
  demand(typeof tx.txhash === "string" &&
    tx.txhash.toUpperCase() === input.hash.toUpperCase(), "tx identity mismatch");
  // Cosmos/Go omitempty removes a successful numeric zero from tx_response.
  // Explicit null, malformed codes, and all nonzero codes still fail closed.
  const executionCode = Object.prototype.hasOwnProperty.call(tx, "code") ? tx.code : 0;
  demand(executionCode === 0 || executionCode === "0", "transaction not successful");
  demand(typeof tx.height === "string" && HEIGHT.test(tx.height), "invalid transaction height");
  const head = BigInt(sync.latest_block_height as string);
  const height = BigInt(tx.height as string);
  demand(head >= height && head - height + BigInt(1) >= BigInt(3),
    "insufficient mainnet confirmation depth");
  const onchainTime = parseClock(tx.timestamp as string);
  demand(onchainTime >= created && onchainTime <= expired && onchainTime <= now,
    "transaction outside prepared intent lifetime");
  // Cosmos REST v1beta1 normally returns the decoded Tx at root.tx.
  // Some RPC/gateway serializers also include tx_response.tx. Accept
  // either without accepting contradictory decoded payloads.
  demand(response.tx != null || tx.tx != null, "decoded transaction unavailable");
  const primary = response.tx != null ? obj(obj(response.tx).body) : obj(obj(tx.tx).body);
  if (response.tx != null && tx.tx != null) {
    const secondary = obj(obj(tx.tx).body);
    demand(JSON.stringify(primary) === JSON.stringify(secondary),
      "conflicting decoded transaction bodies");
  }
  const body = primary;
  demand(body.memo === it.memo, "tx memo mismatches unique intent");
  demand(Array.isArray(body.messages) && body.messages.length === 1,
    "unexpected transaction messages; no ambiguous/multi-transfer credit");
  const transfer = obj(body.messages[0]);
  demand(transfer["@type"] === TYPE &&
    transfer.from_address === it.senderAddress &&
    transfer.to_address === it.vaultAddress, "bank sender or vault mismatch");
  demand(Array.isArray(transfer.amount) && transfer.amount.length === 1,
    "mixed denomination or multiple bank amounts");
  const coin = obj(transfer.amount[0]);
  demand(coin.denom === "uwolo" && coin.amount === it.amountUwolo,
    "wrong denom or exact uwolo amount");
  const hash = input.hash.toUpperCase();
  return Object.freeze({
    kind: "canonical_chain_candidate_uncredited" as const,
    receiptKey: "wolo-1:" + hash + ":0",
    txHash: hash,
    height: height.toString(),
    confirmations: (head - height + BigInt(1)).toString(),
    intentId: it.id,
    ownerUid: input.ownerUid,
    canonicalSendCount: 1 as const,
    chainId: "wolo-1" as const,
    denom: "uwolo" as const,
    // A valid transaction is an evidence candidate, not authorization to
    // credit: segregation, chain asset reserve, double-entry and withdrawals
    // remain separate C3/C4 release gates.
    creditAuthorized: false as const,
    depositAuthorized: false as const,
    wagerAuthorized: false as const,
  });
}
