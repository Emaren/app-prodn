import { WOLO_BASE_DENOM, WOLO_MAINNET_CHAIN_ID } from "@/lib/woloChain";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export class AllocatedFounderPayoutError extends Error {
  readonly uncertain: boolean;
  readonly evidence?: RecordValue;
  constructor(message: string, uncertain = false, evidence?: RecordValue) { super(message); this.name = "AllocatedFounderPayoutError"; this.uncertain = uncertain; this.evidence = evidence; }
}

/** Allocation-only rail. Scalar Trophy payouts retain their existing adapter.
 * Never fall back to a mnemonic signer or retry an uncertain POST. */
type AllocationRequest = {requestId:string;toAddress:string;amountUwolo:bigint;memo:string};
export async function executeAllocatedFounderPayout(input: AllocationRequest) { return allocatedFounderPayout(input); }
export async function reconcileAllocatedFounderPayout(input: AllocationRequest, evidence: unknown) {
  const previousExecution = record(record(evidence).execution);
  if (!/^[A-Fa-f0-9]{64}$/.test(text(previousExecution.tx_hash))) throw new AllocatedFounderPayoutError("ALLOCATION_EXECUTION_UNCERTAIN: no transaction hash is available; inspect the protected stored request before retry. No payout was resent.",true);
  return allocatedFounderPayout(input,previousExecution);
}
async function allocatedFounderPayout(input: AllocationRequest, previousExecution?: RecordValue) {
  const baseUrlRaw = process.env.WOLO_FOUNDER_SETTLEMENT_URL?.trim() || "";
  const token = process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN?.trim() || "";
  let target: URL;
  try { target = new URL(baseUrlRaw); } catch { throw new AllocatedFounderPayoutError("FOUNDER_EXECUTOR_UNAVAILABLE: protected Founder Rewards executor is not configured."); }
  if (target.protocol !== "http:" || !["127.0.0.1","localhost","[::1]"].includes(target.hostname) || target.port !== "8093" || target.username || target.password || target.search || target.hash || (target.pathname !== "/" && target.pathname !== "") || !token) throw new AllocatedFounderPayoutError("FOUNDER_EXECUTOR_UNAVAILABLE: allocations require the authenticated protected Founder listener on port 8093.");
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(input.requestId) || !input.toAddress.startsWith("wolo1") || input.toAddress !== input.toAddress.trim() || input.amountUwolo <= BigInt(0)) throw new AllocatedFounderPayoutError("INVALID_ALLOCATION_REQUEST: exact request identity, wallet and positive integer uwolo are required.");
  const baseUrl = target.origin, headers = {authorization:`Bearer ${token}`};
  let health: RecordValue;
  try {
    const response = await fetch(`${baseUrl}/settlement/v1/health`,{headers,cache:"no-store",signal:AbortSignal.timeout(10_000)});
    health = record(await response.json());
    if (!response.ok || health.ok !== true || health.chain_id !== WOLO_MAINNET_CHAIN_ID || health.runtime_chain_id !== WOLO_MAINNET_CHAIN_ID || health.loopback_only !== true || health.auth_token_set !== true || !text(health.payout_address).startsWith("wolo1")) throw new Error("Protected Founder health does not prove the canonical chain and signer.");
  } catch { throw new AllocatedFounderPayoutError("FOUNDER_EXECUTOR_UNAVAILABLE: protected Founder health could not be proven; no payout was sent."); }
  const expectedAmount = input.amountUwolo.toString();
  let payload = previousExecution ?? {}, responseOk = Boolean(previousExecution);
  if (!previousExecution) try {
    const response = await fetch(`${baseUrl}/settlement/v1/payouts`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({request_id:input.requestId,to_address:input.toAddress,amount_uwolo:expectedAmount,memo:input.memo.slice(0,180)}),cache:"no-store",signal:AbortSignal.timeout(30_000)});
    responseOk = response.ok;
    payload = record(await response.json());
  } catch { throw new AllocatedFounderPayoutError("ALLOCATION_EXECUTION_UNCERTAIN: Founder request outcome is unknown; inspect it before any retry.",true); }
  const txHash = text(payload.tx_hash);
  const evidence = {requestId:input.requestId,execution:payload};
  if (!responseOk || payload.ok !== true || !["accepted","confirmed"].includes(text(payload.status)) || text(payload.failure_code) || !/^[A-Fa-f0-9]{64}$/.test(txHash) || Number(payload.code ?? 0) !== 0 || payload.request_id !== input.requestId || payload.chain_id !== WOLO_MAINNET_CHAIN_ID || payload.signer_role !== "payout" || payload.signer_address !== health.payout_address || payload.to_address !== input.toAddress || payload.amount_uwolo !== expectedAmount) throw new AllocatedFounderPayoutError("ALLOCATION_EXECUTION_UNCERTAIN: Founder response does not prove the exact allocation request; inspect stored work.",true,evidence);
  // The protected service may report accepted before commit. Only exact committed
  // bank-transfer events can make an allocation paid.
  let lookup: RecordValue;
  try {
    const query = new URLSearchParams({expected_sender:text(health.payout_address),expected_recipient:input.toAddress,expected_amount_uwolo:expectedAmount});
    const proofResponse = await fetch(`${baseUrl}/settlement/v1/txs/${txHash}?${query}`,{headers,cache:"no-store",signal:AbortSignal.timeout(10_000)});
    lookup = record(await proofResponse.json());
    const transfer = record(lookup.matched_transfer);
    if (!proofResponse.ok || lookup.ok !== true || lookup.found !== true || lookup.tx_success !== true || lookup.matched_expected !== true || lookup.chain_id !== WOLO_MAINNET_CHAIN_ID || lookup.memo !== input.memo.slice(0,180) || text(lookup.tx_hash).toUpperCase() !== txHash.toUpperCase() || Number(lookup.code ?? 0) !== 0 || !/^[1-9][0-9]*$/.test(text(lookup.height)) || transfer.sender !== health.payout_address || transfer.recipient !== input.toAddress || transfer.amount !== expectedAmount || transfer.denom !== WOLO_BASE_DENOM) throw new Error("Exact committed allocation events are not proven.");
  } catch { throw new AllocatedFounderPayoutError("ALLOCATION_EXECUTION_UNCERTAIN: transaction exists but its exact committed transfer is not proven; do not rebroadcast.",true,evidence); }
  return {txHash:txHash.toUpperCase(),requestId:input.requestId,toAddress:input.toAddress,amountUwolo:expectedAmount,chainId:WOLO_MAINNET_CHAIN_ID,execution:payload,lookup};
}
