/**
 * Session C storage capacity readiness — server-visual read model only.
 *
 * Does NOT approve C06 off-host backups, source-HMAC, natural schedule
 * cycles, deletion, uploads or release. A visual file proves no recovery.
 */
const GI_B = 1024 ** 3;
const PLANES = Object.freeze([
  { id: "mac", floorGiB: 30 },
  { id: "hel1-root", floorGiB: 8 },
  { id: "hel1-volume-105319120", floorGiB: 8 },
]);

function dateUtc(raw) {
  if (typeof raw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) ||
      !Number.isFinite(Date.parse(raw))) {
    throw new Error("HOLD_STORAGE_INVALID_CLOCK");
  }
  const ms = Date.parse(raw);
  if (new Date(ms).toISOString().slice(0,19) !== raw.slice(0,19)) {
    throw new Error("HOLD_UNREAL_UTC_CALENDAR_DATE");
  }
  return ms;
}
function bytes(v) {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new Error("HOLD_STORAGE_UNTRUSTED_CAPACITY");
  }
  return v;
}

export function inspectStorageCapacity({ planes, nowUtc } = {}) {
  const now = dateUtc(nowUtc);
  if (!Array.isArray(planes) || planes.length > PLANES.length) {
    throw new Error("HOLD_STORAGE_WRONG_PLANE_CARDINALITY");
  }
  const known = new Set(PLANES.map((x) => x.id));
  const seen = new Map();
  for (const item of planes) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !known.has(item.id) || seen.has(item.id) ||
        typeof item.serverVisualHmacVerified !== "boolean" ||
        item.sourceHmacVerifiedAtRead !== false ||
        item.durableBridgeAckVerified !== false ||
        item.scheduledCyclesVerified !== 0) {
      throw new Error("HOLD_STORAGE_FORGED_SOURCE_OR_DUPLICATE");
    }
    seen.set(item.id, item);
  }
  const result = PLANES.map(({ id, floorGiB }) => {
    const record = seen.get(id);
    const unknown = { id, status: "UNKNOWN_NO_ADMITTED_SOURCE",
      availableGiB: null, capacityGiB: null, floorGiB,
      belowFloor: null, sourceHmacVerifiedAtRead: false,
      durableBackupVerified: false, scheduledCyclesVerified: 0 };
    if (!record || record.serverVisualHmacVerified !== true) return unknown;
    const observed = dateUtc(record.observedAt);
    if (observed > now + 60_000 || now - observed > 36 * 3600_000) {
      return { ...unknown, status: "STALE_OR_FUTURE_VISUAL" };
    }
    const total = bytes(record.totalBytes);
    const free = bytes(record.freeBytes);
    if (total === 0 || free > total) {
      throw new Error("HOLD_STORAGE_INCONSISTENT_BYTES");
    }
    const available = free / GI_B;
    return {
      id, status: "SERVER_SIGNED_VISUAL_ONLY_NOT_BACKUP_PROOF",
      availableGiB: Math.round(available * 100) / 100,
      capacityGiB: Math.round(total / GI_B * 100) / 100,
      floorGiB,
      belowFloor: available < floorGiB,
      sourceHmacVerifiedAtRead: false,
      durableBackupVerified: false,
      scheduledCyclesVerified: 0,
    };
  });
  return Object.freeze({
    schema: "SESSION_C_STORAGE_CAPACITY_ALERT_ONLY_V1",
    status: "HOLD_PRIVATE_SIGNED_RECOVERY_NOT_PROVEN",
    adoptionAuthorized: false,
    deletionAuthorized: false,
    c06BackupCertified: false,
    c07RestoreCertified: false,
    planes: result,
    warnings: result
      .filter((r) => r.status !==
        "SERVER_SIGNED_VISUAL_ONLY_NOT_BACKUP_PROOF" ||
        r.belowFloor !== false)
      .map((r) => ({ id: r.id,
        reason: r.belowFloor === true ?
          "CAPACITY_BELOW_BOUNDED_RESEARCH_FLOOR" :
          "FRESH_AUTHENTIC_SOURCE_NOT_AVAILABLE" })),
  });
}
