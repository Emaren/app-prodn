/**
 * War Satchel dedicated one-shot custody signer CLIENT PORT.
 *
 * This file contains NO mnemonic, keyring, chain CLI or signing key.
 * It can only contact a separate, independently controlled LOOPBACK service
 * after an operator explicitly certifies that service's vault and durable
 * one-shot request semantics. A settlement service or validator is NOT such
 * a signer and MUST NOT be reused.
 *
 * Deploying this file DOES NOT create a signer or authorize a transfer.
 */
import type { IsolatedSatchelSigner } from "./warSatchelAutoBetExecutor.ts";

const ENDPOINT = "http://127.0.0.1:8094";
const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TX = /^[A-F0-9]{64}$/;
const MAX_BODY = 16384;

function refuse(reason: string): never {
  throw Error("SATCHEL_DEDICATED_SIGNER_UNAVAILABLE:" + reason);
}
function strictRecord(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) refuse("invalid_response");
  return x as Record<string, unknown>;
}
function config() {
  if (process.env.WAR_SATCHEL_SIGNER_CLIENT_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true") {
    refuse("operator_activation_not_certified");
  }
  const address = process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS?.trim() || "";
  const build = process.env.WAR_SATCHEL_SIGNER_BUILD_SHA256?.trim() || "";
  const token = process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN || "";
  if (!ADDR.test(address) || !SHA256.test(build) ||
      token.length < 48 || token.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(token)) {
    refuse("signer_provisioning_incomplete");
  }
  return { address, build, token };
}
async function request(
  path: "/satchel/v1/health" | "/satchel/v1/one-shot",
  token: string, body: unknown,
  reader: typeof fetch,
): Promise<Record<string, unknown>> {
  const result = await reader(ENDPOINT + path, {
    method: body === null ? "GET" : "POST",
    redirect: "error", cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(body === null ? {} : {"Content-Type": "application/json"}),
    },
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(body === null ? 4000 : 8500),
  });
  if (!result.ok || result.status !== 200 ||
      Number(result.headers.get("content-length") || "0") > MAX_BODY) {
    refuse("refused_or_missing_signer_response");
  }
  const raw = await result.text();
  if (Buffer.byteLength(raw) > MAX_BODY) refuse("oversized_signer_receipt");
  return strictRecord(JSON.parse(raw) as unknown);
}
function healthIsExact(
  health: Record<string, unknown>, cfg: ReturnType<typeof config>,
) {
  if (health.ok !== true || health.chain_id !== "wolo-1" ||
      health.signer_role !== "exclusive-war-satchel-v1" ||
      health.durable_one_shot !== true ||
      health.replay_after_restart_forbidden !== true ||
      health.refunds_require_chain_proof !== true ||
      health.vault_address !== cfg.address ||
      health.build_sha256 !== cfg.build ||
      health.custody_mnemonic_shared_with_other_roles !== false) {
    refuse("signer_is_not_exclusive_or_not_attested");
  }
}

/**
 * This connection is only an I/O adapter. The isolated signer MUST persist
 * requestId + exact economic payload to fsync'ed state BEFORE signing and
 * return UNKNOWN on crash, timeout or uncertain broadcast. A client promise
 * or source-code claim cannot certify those external properties.
 */
export async function connectCertifiedSatchelSigner(
  reader: typeof fetch = fetch,
): Promise<IsolatedSatchelSigner> {
  const cfg = config();
  const health = await request("/satchel/v1/health", cfg.token, null, reader);
  healthIsExact(health, cfg);
  return Object.freeze({
    custodyRole: "exclusive-war-satchel-v1" as const,
    attestedVaultAddress: cfg.address,
    async submitOneShot(input: Parameters<IsolatedSatchelSigner["submitOneShot"]>[0]) {
      if (input.chainId !== "wolo-1" || input.senderAddress !== cfg.address ||
          input.denom !== "uwolo" || !ADDR.test(input.recipientAddress) ||
          input.recipientAddress === cfg.address ||
          !/^satchel:ticket:[1-9][0-9]{0,11}$/.test(input.requestId) ||
          !/^[1-9][0-9]{0,18}$/.test(input.amountUwolo) ||
          BigInt(input.amountUwolo) > BigInt(1000)*BigInt(1000000) ||
          BigInt(input.amountUwolo) % BigInt(1000000) !== BigInt(0) ||
          input.memo.length > 240 || input.memo.length < 12) {
        return {kind: "unknown" as const, reason: "invalid_or_ambiguous_signer_payload"};
      }
      // A fresh exact-role health attestation is required at EACH send.
      // Neither a successful network connection nor a previous health result
      // proves that the dedicated signer process has not been replaced.
      const current = config();
      if (current.address !== cfg.address || current.build !== cfg.build ||
          current.token !== cfg.token) {
        return {kind: "unknown" as const, reason: "signer_configuration_changed"};
      }
      try {
        healthIsExact(await request("/satchel/v1/health", cfg.token, null, reader), cfg);
        const receipt = await request("/satchel/v1/one-shot", cfg.token, {
          request_id: input.requestId,
          chain_id: input.chainId,
          signer_role: "exclusive-war-satchel-v1",
          from_address: input.senderAddress,
          to_address: input.recipientAddress,
          amount: {denom:"uwolo",amount:input.amountUwolo},
          memo: input.memo,
        }, reader);
        if (receipt.request_id !== input.requestId ||
            receipt.chain_id !== "wolo-1" ||
            receipt.signer_role !== "exclusive-war-satchel-v1" ||
            receipt.broadcast_status !== "accepted_once" ||
            receipt.durable_request_fenced !== true ||
            typeof receipt.tx_hash !== "string" ||
            !TX.test(receipt.tx_hash)) {
          return {kind:"unknown" as const,reason:"signer_receipt_not_proven"};
        }
        // This is NOT on-chain finality. The calling ticket commit separately
        // verifies the signed Tx against the canonical existing escrow rail.
        return {kind:"broadcast_confirmed" as const,txHash:receipt.tx_hash};
      } catch {
        // NEVER retry. A lost response might follow a successful send.
        return {kind:"unknown" as const,reason:"signer_transport_or_identity_unknown"};
      }
    },
  });
}
