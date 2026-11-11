/**
 * Session C: OFFLINE canonical Traffic continuity guard.
 *
 * This is NOT the active Traffic ingestion job or graph implementation.
 * Inputs are already normalized UTC day aggregates supplied by a future
 * separately authenticated source. Never conflate original certified
 * daily records with provisional observed-only IP/GET traffic.
 * Missing days remain null/gaps, never fabricated zeroes.
 */
const DAY_MS = 86_400_000;
const MAX_DAYS = 1_500;

function dayValue(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("HOLD_TRAFFIC_INVALID_UTC_DAY");
  }
  const ms = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error("HOLD_TRAFFIC_INVALID_UTC_DAY");
  }
  return ms;
}
const dayLabel = (ms) => new Date(ms).toISOString().slice(0, 10);

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("HOLD_TRAFFIC_UNTRUSTED_COUNT");
  }
  return value;
}

function orderedRows(source, maxCount, label, validator) {
  if (!Array.isArray(source) || source.length > maxCount) {
    throw new Error("HOLD_TRAFFIC_UNBOUNDED_" + label);
  }
  const rows = new Map();
  let previous = -Infinity;
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("HOLD_TRAFFIC_BAD_ROW_" + label);
    }
    const at = dayValue(item.date);
    if (at <= previous) {
      throw new Error("HOLD_TRAFFIC_DUPLICATE_OR_REGRESSED_" + label);
    }
    previous = at;
    rows.set(at, validator(item));
  }
  return rows;
}

export function inspectTrafficContinuity({
  certifiedDaily,
  provisionalDaily,
  certifiedBoundaryUtc,
  todayUtc,
} = {}) {
  const today = dayValue(todayUtc);
  const boundary = dayValue(certifiedBoundaryUtc);
  if (boundary >= today) throw new Error("HOLD_TRAFFIC_CERTIFICATION_FUTURE");
  const original = orderedRows(certifiedDaily, MAX_DAYS,
    "CANONICAL", (item) => {
      if (item.kind !== "ORIGINAL_CERTIFIED_TRAFFIC_CLAIM") {
        throw new Error("HOLD_TRAFFIC_WRONG_CERTIFIED_SOURCE");
      }
      // Values are accepted as a candidate's source claims only;
      // this module cannot prove raw archive signatures/lineage.
      return {
        originalSessions: count(item.originalSessions),
        originalPageViews: count(item.originalPageViews),
      };
    });
  if (!original.has(boundary) || original.size === 0) {
    throw new Error("HOLD_TRAFFIC_BOUNDARY_NOT_IN_ORIGINAL_ARCHIVE");
  }
  const first = Math.min(...original.keys());
  if ((today - first) / DAY_MS > MAX_DAYS ||
      (boundary - first) / DAY_MS > MAX_DAYS) {
    throw new Error("HOLD_TRAFFIC_WINDOW_TOO_LARGE");
  }
  const observed = orderedRows(provisionalDaily, 60,
    "PROVISIONAL", (item) => {
      if (item.kind !== "PROVISIONAL_OBSERVED_ONLY" ||
          item.certifiedHuman !== false) {
        throw new Error("HOLD_TRAFFIC_PROVISIONAL_MISLABELED");
      }
      const ip = count(item.observedQualifyingIps);
      const get = count(item.observedGetEvents);
      if (ip > get) throw new Error("HOLD_TRAFFIC_IP_OVER_GET");
      return {
        observedQualifyingIps: ip,
        observedGetEvents: get,
        certifiedHuman: false,
      };
    });
  if (Math.min(...observed.keys(), today) <= boundary) {
    throw new Error("HOLD_TRAFFIC_PROVISIONAL_OVERLAPS_ORIGINAL");
  }
  const originalPoints = [];
  const observedPoints = [];
  const missingOriginal = [];
  const missingProvisional = [];
  for (let time = first; time <= boundary; time += DAY_MS) {
    const data = original.get(time) || null;
    if (!data) missingOriginal.push(dayLabel(time));
    originalPoints.push({date: dayLabel(time), originalSessions:
      data?.originalSessions ?? null, originalPageViews:
      data?.originalPageViews ?? null});
  }
  // Missing canonical archive days are an integrity finding, not a
  // structural crash and absolutely never an invented zero.
  if ([...original.keys()].some((at) => at > boundary)) {
    throw new Error("HOLD_TRAFFIC_ORIGINAL_OUT_OF_BOUNDARY");
  }
  // Report only post-certification completed days as potentially missing.
  // Today is a partial day and never called complete/certified by this module.
  for (let time = boundary + DAY_MS; time < today; time += DAY_MS) {
    const data = observed.get(time) || null;
    if (!data) missingProvisional.push(dayLabel(time));
    observedPoints.push({date: dayLabel(time), observedQualifyingIps:
      data?.observedQualifyingIps ?? null, observedGetEvents:
      data?.observedGetEvents ?? null, certifiedHuman: false,
      dayComplete: true});
  }
  if (observed.has(today)) {
    const data = observed.get(today);
    observedPoints.push({date: dayLabel(today), ...data, dayComplete: false});
  }
  if (observed.size !== observedPoints.filter((x) =>
      x.observedGetEvents !== null).length) {
    throw new Error("HOLD_TRAFFIC_UNEXPECTED_PROVISIONAL_DAY");
  }
  return {
    schema: "SESSION_C_TRAFFIC_CONTINUITY_SOURCE_ONLY_V1",
    status: "HOLD_PENDING_CANONICAL_SOURCE_CERTIFICATION",
    certifiedBoundaryUtc: dayLabel(boundary),
    firstOriginalDayUtc: dayLabel(first),
    originalPoints, provisionalPoints: observedPoints,
    missingOriginalDays: missingOriginal,
    missingProvisionalCompletedDays: missingProvisional,
    sourceBytesVerified: false,
    certifiedMetricMergedWithObserved: false,
    fakeZeroDays: 0,
    canPublishAsCertifiedHistory: false,
  };
}
