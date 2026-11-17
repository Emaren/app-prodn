/**
 * Storage OS owner-teaching semantics. This module never produces a deletion permit.
 * Signed source policy sets a minimum protection level; owner may only strengthen it.
 * A requested L2 on an L3/L4 item is recorded as feedback, not a downgrade.
 */
export const STORAGE_TEACHING_SCHEMA = "aoe2war.storage-owner-teaching.v1" as const;
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
