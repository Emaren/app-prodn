/** Bounded read-only transport for observed Wolo vault bank/status JSON.
 * A transport result is not authenticated bank solvency, key custody proof,
 * release authority, or permission to credit any funds.
 */
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";

const RPC_STATUS = "https://rpc-mainnet.aoe2war.com/status";
const REST_PREFIX = "https://rest-mainnet.aoe2war.com";
const BANK_PATH = /^\/cosmos\/bank\/v1beta1\/balances\/wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}\/by_denom\?denom=uwolo$/;
const LIMIT = 65536;
const LENGTH = /^(0|[1-9][0-9]{0,10})$/;

function refuse(reason: string): never {
  throw new Error("WAR_SATCHEL_FUNDED_REFUSED:" + reason);
}

function permitted(url: string): boolean {
  return url === RPC_STATUS ||
    (url.startsWith(REST_PREFIX) && BANK_PATH.test(url.slice(REST_PREFIX.length)));
}

/** Never read Response.text()/json() before enforcing this strict byte ceiling.
 * The caller must independently prove consensus/bank provenance; this reader
 * never certifies the contents of an HTTP response.
 */
export async function readBoundedSatchelBankJson(
  url: string,
  reader: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (!permitted(url)) refuse("untrusted_chain_endpoint");
  const response = await reader(url, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || response.status !== 200) refuse("bank_network_unavailable");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!LENGTH.test(declared) || Number(declared) > LIMIT)) {
    refuse("bank_body_too_large");
  }
  const raw = await readWarSatchelBoundedUtf8(response.body, LIMIT);
  if (raw === null) refuse("bank_body_too_large_or_invalid_utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    refuse("bad_chain_response");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    refuse("bad_chain_response");
  }
  return parsed as Record<string, unknown>;
}
