/**
 * Browser-safe, read-only L2 OWNER PREVIEW over the existing signed aggregate hogs.
 * A category is not a path, an individual candidate, or a reclaimable APFS extent.
 * This module does not grant mutation authority, even with local owner selection.
 */
import type { HogKey, PlaneId, StorageVisualView } from "./storageVisualPrivate.ts";

export type L2CategoryPreview = {
  key: HogKey;
  label: string;
  grossBytes: number;
  overlaps: boolean;
  plane: PlaneId;
  observedAt: string;
  coverage: "PARTIAL" | "DISJOINT";
  provenance: "PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY";
  confidence: "SIGNED_GROSS_OVERLAP" | "SIGNED_GROSS_NOT_UNIQUE";
  ownerAction: "LOCAL_PREVIEW_ONLY";
  individualSource: "NOT_ATTESTED";
  deletionEligible: false;
  uniqueRecoverableBytes: null;
};

export function ownerL2CategoryPreviews(
  visual: StorageVisualView | undefined,
  planeId: PlaneId,
): L2CategoryPreview[] {
  if (visual?.source !== "SIGNED_PRIVATE_RECEIPT" ||
      visual.authority !== "PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY") return [];
  const plane = visual.planes.find(p => p.id === planeId);
  if (!plane || plane.status !== "RECEIPT") return [];
  const keys = new Set<string>();
  const previews: L2CategoryPreview[] = [];
  for (const hog of plane.hogs) {
    // Exact received L2 policy only; L1 / L3 / L4 / L5 never enter the basket.
    if (hog.level !== 2 || !Number.isSafeInteger(hog.grossBytes) ||
        hog.grossBytes < 0 || keys.has(hog.key)) continue;
    keys.add(hog.key);
    previews.push({
      key: hog.key, label: hog.label, grossBytes: hog.grossBytes,
      overlaps: hog.overlaps, plane: plane.id, observedAt: plane.observedAt,
      coverage: plane.coverage, provenance: "PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
      confidence: hog.overlaps ? "SIGNED_GROSS_OVERLAP" : "SIGNED_GROSS_NOT_UNIQUE",
      ownerAction: "LOCAL_PREVIEW_ONLY", individualSource: "NOT_ATTESTED",
      deletionEligible: false, uniqueRecoverableBytes: null,
    });
  }
  return previews;
}

/** Fail closed on unknown, duplicate, or protected selections rather than silently accepting a partial basket. */
export function ownerL2ReviewBasket(
  previews: readonly L2CategoryPreview[],
  selectedKeys: readonly string[],
): L2CategoryPreview[] {
  const byKey = new Map<string, L2CategoryPreview>(previews.map(p => [p.key, p] as const));
  const unique = new Set(selectedKeys);
  if (selectedKeys.length !== unique.size ||
      selectedKeys.some(key => !byKey.has(key))) return [];
  return selectedKeys.map(key => byKey.get(key)!);
}
