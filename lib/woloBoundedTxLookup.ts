import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";

/**
 * Bounded, nonmutating Cosmos REST transaction retrieval.
 * Shared by legacy escrow and staking verification, which previously used
 * unbounded response.json() with no timeout or redirect restriction.
 *
 * This is TRANSPORT acceptance only. Callers must separately authenticate
 * hash/chain/height/amount/signer and never infer settlement from HTTP 200.
 */
export async function fetchBoundedWoloTxJson(
  url: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<Record<string, unknown> | null> {
  const maximumBytes = 750_000;
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6500),
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (response.status !== 200) return null;

  const reportedSize = response.headers.get("content-length");
  if (reportedSize !== null && (
    !/^(0|[1-9][0-9]{0,11})$/.test(reportedSize) ||
    Number(reportedSize) > maximumBytes
  )) return null;

  const raw = await readWarSatchelBoundedUtf8(response.body, maximumBytes);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" &&
      !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
