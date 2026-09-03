import { createHash, createHmac, randomBytes } from "node:crypto";

import {
  AOE2WAR_BROWSER_VISITOR_HEADER,
  browserVisitorIdIsValid,
} from "../browserVisitorId.ts";
export const LIVING_KINGDOM_ANONYMOUS_HEADER = AOE2WAR_BROWSER_VISITOR_HEADER;
export const LIVING_KINGDOM_ANONYMOUS_UID_PREFIX = "anonymous:";
export const LIVING_KINGDOM_ANONYMOUS_PUBLIC_ID_PREFIX = "lk_guest_";
export const LIVING_KINGDOM_ANONYMOUS_MALE_AVATAR =
  "/champions/players/silhouette.thumb.webp";
export const LIVING_KINGDOM_ANONYMOUS_FEMALE_AVATAR =
  "/champions/players/female_silhouette.thumb.webp";

const anonymousGlobal = globalThis as typeof globalThis & {
  __livingKingdomAnonymousSalt?: Buffer;
};
const anonymousSalt =
  anonymousGlobal.__livingKingdomAnonymousSalt ?? randomBytes(32);
anonymousGlobal.__livingKingdomAnonymousSalt = anonymousSalt;

export function livingKingdomAnonymousVisitorIdIsValid(value: unknown) {
  return browserVisitorIdIsValid(value);
}

export function livingKingdomAnonymousUid(visitorId: string) {
  return `${LIVING_KINGDOM_ANONYMOUS_UID_PREFIX}${visitorId}`;
}

export function livingKingdomActorIdIsAnonymous(actorId: string) {
  return actorId.startsWith(LIVING_KINGDOM_ANONYMOUS_PUBLIC_ID_PREFIX);
}

export function livingKingdomAnonymousIdentity(
  visitorId: string,
): { uid: string; publicId: string; displayName: string; avatarUrl: string } | null {
  const normalized = visitorId.trim().toLowerCase();
  if (!livingKingdomAnonymousVisitorIdIsValid(normalized)) return null;

  const publicDigest = createHmac("sha256", anonymousSalt)
    .update(normalized)
    .digest("base64url")
    .slice(0, 18);
  const genderByte = createHash("sha256").update(normalized).digest()[0] ?? 0;

  return {
    uid: livingKingdomAnonymousUid(normalized),
    publicId: `${LIVING_KINGDOM_ANONYMOUS_PUBLIC_ID_PREFIX}${publicDigest}`,
    displayName: "Unknown Warrior",
    avatarUrl:
      genderByte % 2 === 0
        ? LIVING_KINGDOM_ANONYMOUS_MALE_AVATAR
        : LIVING_KINGDOM_ANONYMOUS_FEMALE_AVATAR,
  };
}
