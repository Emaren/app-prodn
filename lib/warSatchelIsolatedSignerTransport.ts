/**
 * HD War Satchel isolated signer transport. This is the REQUESTING SIDE only:
 * it never reads a Keplr mnemonic or executes a node CLI. A separately
 * provisioned restricted signer service must implement the exact one-shot
 * protocol and durable request journal; its health report is NOT independent
 * certification of its key, custody or recovery authority.
 *
 * No timer, route, worker, or web UI activates this source automatically.
 */
import type { IsolatedSatchelSigner } from "./warSatchelAutoBetExecutor.ts";

const RPC = "http://127.0.0.1:8094";
const ROLE = "exclusive-war-satchel-v1";
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const HASH = /^[A-Fa-f0-9]{64}$/;
const DEC = /^[1-9][0-9]{0,18}$/;
const REQUEST = /^satchel:ticket:[1-9][0-9]{0,12}$/;
const MEMO = /^AoE2HDBets bet ticket v1 · ticket [1-9][0-9]{0,12}$/;
const MAX_AMT = BigInt(1000) * BigInt(1000000);
const MAX_JSON = 16384;

export type LocalSatchelSignerConfig = Readonly<{
  vaultAddress: string;
  escrowAddress: string;
  keyFingerprint: string;
  serviceAccessToken: string;
  approvedByOperator: boolean;
}>;

export type LocalSatchelSignerHealth = Readonly<{
  protocol: 1;
  chainId: "wolo-1";
  custodyRole: "exclusive-war-satchel-v1";
  vaultAddress: string;
  keyFingerprint: string;
  exclusiveSignOnly: true;
  accepting: true;
}>;

function refusal(reason: string): never {
  throw Error("SATCHEL_SIGNER_PORT_REFUSED:" + reason);
}
function obj(input: unknown): Record<string,unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) refusal("invalid_json");
  return input as Record<string,unknown>;
}
function assertConfig(config: LocalSatchelSignerConfig) {
  if (config.approvedByOperator !== true ||
      !ADDRESS.test(config.vaultAddress) || !ADDRESS.test(config.escrowAddress) ||
      config.vaultAddress === config.escrowAddress ||
      !/^[0-9a-f]{64}$/.test(config.keyFingerprint) ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(config.serviceAccessToken)) {
    refusal("independent_custody_configuration_missing");
  }
}
async function strictResponse(response: Response): Promise<Record<string, unknown>> {
  if (response.status !== 200 || !response.ok) refusal("local_service_unavailable");
  const len = Number(response.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(len) || len > MAX_JSON) refusal("response_too_large");
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON) refusal("response_too_large");
  return obj(JSON.parse(raw) as unknown);
}

/**
 * Read-only health check of a strictly pinned *loopback* service; its
 * self-reported identity must also match a separately attested key inventory.
 * No arbitrary URL, hostname, port, destination or key is accepted.
 */
export async function assertLocalSatchelSignerHealth(
  config: LocalSatchelSignerConfig,
  reader: typeof fetch = fetch,
): Promise<LocalSatchelSignerHealth> {
  assertConfig(config);
  const response = await reader(RPC + "/satchel/v1/health", {
    method: "GET", redirect: "error", cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + config.serviceAccessToken,
    },
    signal: AbortSignal.timeout(4000),
  });
  const data = await strictResponse(response);
  if (data.protocol !== 1 || data.chainId !== "wolo-1" ||
      data.custodyRole !== ROLE ||
      data.vaultAddress !== config.vaultAddress ||
      data.keyFingerprint !== config.keyFingerprint ||
      data.exclusiveSignOnly !== true || data.accepting !== true) {
    refusal("custody_service_or_key_fingerprint_mismatch");
  }
  return Object.freeze({
    protocol: 1 as const,
    chainId: "wolo-1" as const,
    custodyRole: ROLE,
    vaultAddress: config.vaultAddress,
    keyFingerprint: config.keyFingerprint,
    exclusiveSignOnly: true as const,
    accepting: true as const,
  });
}

/**
 * Construct an HTTP transport, NOT a signer implementation. The REAL isolated
 * service must atomically persist request IDs BEFORE it could send tokens.
 * This client performs exactly ONE POST, with no automated resend on network
 * failure, timeout or malformed reply. CommitBetStakeTicket independently
 * verifies any returned tx on WoloChain before accepting a wager.
 */
export function createLocalIsolatedSatchelSigner(
  config: LocalSatchelSignerConfig,
  reader: typeof fetch = fetch,
): IsolatedSatchelSigner {
  assertConfig(config);
  return Object.freeze({
    custodyRole: ROLE,
    attestedVaultAddress: config.vaultAddress,
    async submitOneShot(input) {
      if (input.chainId !== "wolo-1" || input.denom !== "uwolo" ||
          input.senderAddress !== config.vaultAddress ||
          input.recipientAddress !== config.escrowAddress ||
          !REQUEST.test(input.requestId) || !MEMO.test(input.memo) ||
          !DEC.test(input.amountUwolo) ||
          BigInt(input.amountUwolo) > MAX_AMT) {
        refusal("invalid_one_shot_wager_identity_or_amount");
      }
      // Health must match immediately BEFORE this one-shot send; a downed
      // service returns UNKNOWN to the caller and freezes its bank reserve.
      try {
        await assertLocalSatchelSignerHealth(config, reader);
      } catch {
        return Object.freeze({ kind: "unknown" as const, reason: "signer_health_unavailable" });
      }
      try {
        const response = await reader(RPC + "/satchel/v1/one-shot", {
          method: "POST", cache: "no-store", redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + config.serviceAccessToken,
          },
          body: JSON.stringify({
            protocol: 1, requestId: input.requestId, chainId: "wolo-1",
            senderAddress: input.senderAddress,
            recipientAddress: input.recipientAddress,
            denom: "uwolo", amountUwolo: input.amountUwolo,
            memo: input.memo,
          }),
          signal: AbortSignal.timeout(12000),
        });
        const body = await strictResponse(response);
        if (body.kind === "broadcast_confirmed" &&
            typeof body.txHash === "string" && HASH.test(body.txHash)) {
          return Object.freeze({kind: "broadcast_confirmed" as const,
            txHash: body.txHash.toUpperCase()});
        }
        return Object.freeze({ kind: "unknown" as const,
          reason: "no_verifiable_one_shot_receipt" });
      } catch {
        return Object.freeze({ kind: "unknown" as const,
          reason: "signer_request_or_acknowledgement_unknown" });
      }
    },
  });
}
