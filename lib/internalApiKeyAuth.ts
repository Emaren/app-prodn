import { timingSafeEqual } from "node:crypto";

/**
 * Shared HD internal-service credential boundary.
 *
 * Maintains the existing x-api-key header and whitespace-trim contract.
 * Missing/unconfigured tokens fail closed. Never log credentials, infer a
 * caller identity, or substitute this for endpoint authorization policy.
 * The caller owns the exact HTTP status/body and must check before effects.
 */
export function internalApiKeyMatches(
  request: Pick<Request, "headers">,
  configuredToken: string | null | undefined
): boolean {
  const expected = configuredToken?.trim() || "";
  const supplied = request.headers.get("x-api-key")?.trim() || "";

  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
