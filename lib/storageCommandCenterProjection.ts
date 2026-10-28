/**
 * Private Storage OS read-side projection. No disk traversal, network calls,
 * deletion authority or synthetic/fixture observations.
 *
 * A browser poll is NOT a host sample. Preserve origin, timestamp and nulls.
 */
export type StoragePlaneId = "mac" | "hel1-root" | "hel1-volume-105319120";
export type StorageReading = {
  id: StoragePlaneId;
  label: string;
  freeBytes: number | null;
  usedPercent: number | null;
  reclaimedBytes: number | null;
  source: "SIGNED_THREE_PLANE_RECEIPT" | "OPERATOR_ESTATE_SNAPSHOT" | "NONE";
  asOf: string | null;
  status: "RECEIPT" | "STALE" | "UNKNOWN";
  classes: string[];
};
export type StorageCommandCenter = {
  schema: "aoe2war.private-storage-command-center.v1";
  polledAt: string;
  bridgeOnline: boolean;
  bridgeLastSeen: string | null;
  signedAdmission: "HOLD" | "NO_SIGNED_RECEIPT";
  planes: StorageReading[];
  release: {
    sourceSha: string | null;
    remoteSha: string | null;
    productionSha: string | null;
    sourceRemoteParity: boolean | null;
    sourceProductionParity: boolean | null;
    internalVersion: string | null;
    publicVersion: string | null;
    runtimeVersionParity: boolean | null;
    receiptAt: string | null;
  };
  macLevel1: {
    percent: null;
    certifiedReclaimedBytes: null;
    state: "NO_FRESH_CERTIFIED_MAC_CLOSURE_RECEIPT";
  };
};

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value : null;
}
function integerBytes(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}
function iso(value: unknown): string | null {
  const s = str(value);
  return s && Number.isFinite(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T/.test(s) ? s : null;
}
function sha(value: unknown): string | null {
  const s = str(value);
  return s && /^[0-9a-f]{40}$/i.test(s) ? s : null;
}
function parity(a: string | null, b: string | null): boolean | null {
  return a && b ? a === b : null;
}
function stillRecent(value: string | null, now: number, maxAge: number): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= maxAge;
}
const NAMES: Record<StoragePlaneId, string> = {
  mac: "DEVELOPMENT MAC", "hel1-root": "HEL1 ROOT",
  "hel1-volume-105319120": "HEL1 EVIDENCE VOLUME",
};
const IDS: StoragePlaneId[] = ["mac", "hel1-root", "hel1-volume-105319120"];

export function projectPrivateStorage(
  dashboardRaw: unknown, signedRaw: unknown, clock: Date = new Date(),
): StorageCommandCenter {
  const dashboard = obj(dashboardRaw);
  const bridge = obj(dashboard.bridge);
  const estate = obj(dashboard.snapshot);
  const estatePayload = obj(estate.payload);
  const release = obj(obj(estatePayload.info).release);
  const repos = obj(obj(estatePayload.info).source_repositories);
  const app = obj(repos["app-prodn"]);
  const observedAt = iso(estate.generatedAt);
  const now = clock.getTime();
  const estateFresh = stillRecent(observedAt, now, 30 * 60_000);
  const signed = obj(signedRaw);
  const verified = signed.schema === "aoe2war.storage-atlas.authenticated-public.v1"
    && signed.provenance === "ED25519_THREE_HOST_RECEIPTS"
    && signed.admission === "HOLD" && signed.live === false;
  const signedSnapshot = verified ? obj(signed.snapshot) : {};
  const signedPlanes = Array.isArray(signedSnapshot.planes) ? signedSnapshot.planes : [];
  const signedAsOf = verified ? iso(signedSnapshot.as_of) : null;
  const byPlane = new Map<string,Record<string,unknown>>();
  for (const raw of signedPlanes) {
    const item = obj(raw);
    if (typeof item.plane === "string" && IDS.includes(item.plane as StoragePlaneId))
      byPlane.set(item.plane, item);
  }
  const fallbackFree = {
    mac: null,
    "hel1-root": integerBytes(release.root_free_kb) === null ? null : integerBytes(release.root_free_kb)! * 1024,
    "hel1-volume-105319120": integerBytes(release.volume_free_kb) === null ? null : integerBytes(release.volume_free_kb)! * 1024,
  };
  const planes = IDS.map((id): StorageReading => {
    const signedPlane = byPlane.get(id);
    if (signedPlane) {
      const fresh = signedPlane.stale === false && stillRecent(signedAsOf, now, 24 * 3600_000);
      return {
        id, label: NAMES[id],
        freeBytes: integerBytes(signedPlane.ordinary_free_bytes),
        usedPercent: safeNumber(signedPlane.effective_used_percent) !== null
          && safeNumber(signedPlane.effective_used_percent)! <= 100
          ? safeNumber(signedPlane.effective_used_percent) : null,
        reclaimedBytes: integerBytes(signedPlane.measured_reclaimed_bytes),
        source: "SIGNED_THREE_PLANE_RECEIPT", asOf: signedAsOf,
        status: fresh ? "RECEIPT" : "STALE",
        classes: Array.isArray(signedPlane.top_consumer_classes)
          ? signedPlane.top_consumer_classes.filter((v): v is string => typeof v === "string").slice(0,6) : [],
      };
    }
    // The bridge's estate snapshot is not a signed collector measurement.
    // Never manufacture a Mac number or cross-source used percentage here.
    const free = fallbackFree[id];
    return {
      id, label: NAMES[id], freeBytes: free, usedPercent: null,
      reclaimedBytes: null, source: free !== null ? "OPERATOR_ESTATE_SNAPSHOT" : "NONE",
      asOf: free !== null ? observedAt : null,
      status: free === null ? "UNKNOWN" : estateFresh ? "RECEIPT" : "STALE",
      classes: [],
    };
  });
  const sourceSha = sha(app.head), remoteSha = sha(app.remote);
  const productionSha = sha(release.production_source);
  const internalVersion = str(release.internal_build_version);
  const publicVersion = str(release.public_build_version);
  return {
    schema: "aoe2war.private-storage-command-center.v1",
    polledAt: clock.toISOString(),
    bridgeOnline: bridge.online === true && stillRecent(iso(bridge.lastSeenAt), now, 90_000),
    bridgeLastSeen: iso(bridge.lastSeenAt),
    signedAdmission: verified ? "HOLD" : "NO_SIGNED_RECEIPT",
    planes,
    release: {
      sourceSha, remoteSha, productionSha,
      sourceRemoteParity: parity(sourceSha, remoteSha),
      sourceProductionParity: parity(sourceSha, productionSha),
      internalVersion, publicVersion,
      runtimeVersionParity: parity(internalVersion, publicVersion),
      receiptAt: observedAt,
    },
    macLevel1: {
      percent: null, certifiedReclaimedBytes: null,
      state: "NO_FRESH_CERTIFIED_MAC_CLOSURE_RECEIPT",
    },
  };
}
