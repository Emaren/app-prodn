import type {TeachingEvent} from "./storageHogTeachingLedger.ts";
import {teachingSourceDeadline} from "./storageSignedFreshness.ts";

/**
 * Storage OS owner-teaching semantics. This module never produces a deletion permit.
 * Signed source policy sets a minimum protection level; owner may only strengthen it.
 * A requested L2 on an L3/L4 item is recorded as feedback, not a downgrade.
 */
export const STORAGE_TEACHING_SCHEMA = "aoe2war.storage-owner-teaching.v1" as const;
export const CATEGORY_REVIEW_VERSION = "category-review-v1" as const;
export const TEACHING_LEVELS = [2, 3, 4, 5] as const;
export type TeachingLevel = typeof TEACHING_LEVELS[number];
export type ProtectionLevel = 1 | TeachingLevel;
export type TeachingPlane = "mac" | "hel1-root" | "hel1-volume-105319120";
export type LearningEffect = "OWNER_FEEDBACK_ONLY_NO_DELETE" | "PERMANENT_PROTECTION_NO_DELETE";

export function isTeachingLevel(value: unknown): value is TeachingLevel {
  return typeof value === "number" && TEACHING_LEVELS.includes(value as TeachingLevel);
}
export function isProtectionLevel(value: unknown): value is ProtectionLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}
export function isTeachingPlane(value: unknown): value is TeachingPlane {
  return value === "mac" || value === "hel1-root" || value === "hel1-volume-105319120";
}
export function teachingDisposition(
  sourceFloor: unknown, requested: unknown, permanentlyProtected = false,
): {status:"ACCEPT"|"HOLD";effectiveLevel:ProtectionLevel|null;reason:string;effect:LearningEffect|null} {
  if (!isProtectionLevel(sourceFloor) || !isTeachingLevel(requested))
    return {status:"HOLD",effectiveLevel:null,reason:"INVALID_LEVEL",effect:null};
  if ((sourceFloor === 5 || permanentlyProtected) && requested !== 5)
    return {status:"HOLD",effectiveLevel:5,reason:"PERMANENT_L5_CANNOT_DOWNGRADE",effect:null};
  // The source's signed floor and immutable owner L5 are not overrideable.
  const effectiveLevel = Math.max(sourceFloor, requested) as ProtectionLevel;
  return {
    status:"ACCEPT",effectiveLevel,
    reason:requested < sourceFloor ? "SOURCE_PROTECTION_FLOOR_PREVAILS" :
      requested === 5 ? "OWNER_PERMANENT_PROTECTION" : "RECORDED_AS_TRAINING_ONLY",
    effect:requested===5 ? "PERMANENT_PROTECTION_NO_DELETE" : "OWNER_FEEDBACK_ONLY_NO_DELETE",
  };
}
export function sourceMatchesRequest(
  observed: {key:string;grossBytes:number;level:ProtectionLevel;overlaps:boolean},
  requested: {key:unknown;grossBytes:unknown;sourceFloor:unknown;overlaps:unknown},
) {
  return typeof requested.key==="string" && requested.key===observed.key &&
    typeof requested.grossBytes==="number" && Number.isSafeInteger(requested.grossBytes) &&
    requested.grossBytes===observed.grossBytes &&
    requested.sourceFloor===observed.level && requested.overlaps===observed.overlaps;
}

type ReviewScope = {
  plane:TeachingPlane; category:string; observedAt:string;
  sourceFloor:ProtectionLevel; overlaps:boolean;
};
/** Permanent review ceiling across *all* signed owner events for a plane/category.
 * There is intentionally NO downgrade/reclassification executor in this release.
 * Historic L3/L4 decisions and signed inherited floors survive later L2 feedback.
 * This is a conservative category policy, never an exact-item deletion rule.
 */
export function strongestRecordedProtection(
  events: readonly TeachingEvent[], plane:TeachingPlane, category:string,
):ProtectionLevel {
  let floor:ProtectionLevel = 1;
  for (const event of events) {
    if(event.plane !== plane || event.category !== category)continue;
    // Only call on readTeachingEvents()-verified ledger entries.
    if(!isProtectionLevel(event.sourceFloor) || !isProtectionLevel(event.effectiveLevel) ||
       !isTeachingLevel(event.requestedLevel))return 5; // corruption must never grant L2
    floor=Math.max(floor,event.sourceFloor,event.effectiveLevel,event.requestedLevel) as ProtectionLevel;
  }
  return floor;
}

type ReviewFinding = "PROTECTED" | "ALREADY_REVIEWED" | "NEEDS_EXAMPLES" | "REVIEW_SUGGESTED" | "EXPIRED";

/** The input ledger is in verified append order. Comparable past category
 * observations can prioritize a manual review, never an individual file. */
export function categoryReviewEvidence(events:readonly TeachingEvent[], scope:ReviewScope,
  ownerBinding:string|null, now=Date.now()):{finding:ReviewFinding; examples:TeachingEvent[]} {
  const history = events.filter(e => e.plane === scope.plane && e.category === scope.category);
  // Signed inherited floors and all stronger decisions are sticky: an old
  // L4 followed by two L2 notes is NEVER evidence for an L2 recommendation.
  // A future separately authenticated reclassification must introduce a
  // versioned, independently reviewed authority; this release has none.
  if (scope.sourceFloor !== 2 ||
      strongestRecordedProtection(history,scope.plane,scope.category) > 2)
    return {finding:"PROTECTED", examples:[]};
  if (teachingSourceDeadline(scope.observedAt,2,now) === null)
    return {finding:"EXPIRED", examples:[]};
  const examples:TeachingEvent[] = [];
  const observed = new Set<number>();
  const current = Date.parse(scope.observedAt);
  for (const event of history.reverse()) {
    // Changed provenance, overlap, floor or owner intent ends the streak.
    if (!ownerBinding || event.ownerBinding !== ownerBinding ||
        event.reviewVersion !== CATEGORY_REVIEW_VERSION || event.sourceFloor !== scope.sourceFloor ||
        event.overlaps !== scope.overlaps) break;
    const at = Date.parse(event.sourceObservedAt);
    if (at === current) return {finding:"ALREADY_REVIEWED", examples:[]};
    if (!Number.isFinite(at) || at > current || event.effectiveLevel !== 2 ||
        event.requestedLevel !== 2 || !event.note.trim()) break;
    if (!observed.has(at)) {
      examples.push(event);
      observed.add(at);
    }
  }
  return {finding:examples.length >= 2 ? "REVIEW_SUGGESTED" : "NEEDS_EXAMPLES", examples};
}
