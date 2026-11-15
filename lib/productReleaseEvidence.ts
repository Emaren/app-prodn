/**
 * A public Factory JSON document can describe several releases and attempts.
 * Only use clock metrics bound to the same live source and BUILD_ID. This is
 * bounded public provenance, NOT a signed root receipt or release authorization.
 */
export type ProductDeploymentClocks = {
  state: "MATCHED_PUBLIC_RECEIPT" | "UNKNOWN";
  firstVerifiedLiveMs: number | null;
  durableAcceptanceMs: number | null;
  deploymentKind: "warm" | "cold" | null;
};

const UNKNOWN: ProductDeploymentClocks = {
  state: "UNKNOWN",
  firstVerifiedLiveMs: null,
  durableAcceptanceMs: null,
  deploymentKind: null,
};

const isFiniteDuration = (value: unknown): value is number =>
  typeof value === "number"
  && Number.isFinite(value)
  && value >= 0
  && value <= 24 * 60 * 60 * 1000;

export function parseProductDeploymentClocks(
  value: unknown,
  sourceSha: string,
  buildId: string,
): ProductDeploymentClocks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return UNKNOWN;
  if (!/^[0-9a-f]{40}$/.test(sourceSha)
    || !/^[A-Za-z0-9_-]{8,64}$/.test(buildId)) return UNKNOWN;
  const row = value as Record<string, unknown>;
  if (row.schema !== "aoe2war.product.deployment-invocation.v1"
    || row.sourceSha !== sourceSha
    || row.buildId !== buildId
    || row.coverage !== "full"
    || (row.kind !== "warm" && row.kind !== "cold")
    || !isFiniteDuration(row.firstVerifiedLiveMs)
    || !isFiniteDuration(row.durableAcceptanceMs)
    || row.durableAcceptanceMs < row.firstVerifiedLiveMs) {
    return UNKNOWN;
  }
  return {
    state: "MATCHED_PUBLIC_RECEIPT",
    firstVerifiedLiveMs: row.firstVerifiedLiveMs,
    durableAcceptanceMs: row.durableAcceptanceMs,
    deploymentKind: row.kind,
  };
}
