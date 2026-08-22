import { createHmac, randomBytes } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma";
import { avatarPresenceUrlForTarget } from "@/lib/avatarAssets";
import { isInternalSystemUid } from "@/lib/internalSystemAccounts";
import {
  invalidateLivingKingdomAvatar,
  registerLivingKingdomAvatar,
} from "./avatarRegistry.ts";
import {
  livingKingdomHub,
  type LivingKingdomHubIdentity,
} from "./hub.ts";
import { livingKingdomManagedAvatarTargetsForUid } from "./managedAvatarTargets.ts";

export const LIVING_KINGDOM_FEATURE_MODES = ["off", "staff", "canary", "public"] as const;
export type LivingKingdomFeatureMode = (typeof LIVING_KINGDOM_FEATURE_MODES)[number];
export type LivingKingdomPreferenceMode = "off" | "public_coarse";

type StoredLivingKingdomPreference = {
  mode: string;
};

export function resolveLivingKingdomPreferenceMode(
  preference: StoredLivingKingdomPreference | null | undefined,
): LivingKingdomPreferenceMode {
  // Living Kingdom publication is an account capability, not a user-facing
  // preference. Legacy rows remain readable for migration/audit history, but
  // neither `off` nor malformed historical values suppress an eligible human.
  void preference;
  return "public_coarse";
}

export const LIVING_KINGDOM_IDENTITY_CACHE_TTL_MS = 15_000;
export const LIVING_KINGDOM_INELIGIBLE_CACHE_TTL_MS = 2_000;
const LIVING_KINGDOM_IDENTITY_CACHE_MAX = 1_000;
const ALLOWLIST_MAX_ENTRIES = 200;

export type LivingKingdomIdentityProfile = {
  userId: number;
  uid: string;
  displayName: string | null;
  displayEligible: boolean;
  avatarEligible: boolean;
  avatarUrl: string | null;
  preferenceMode: LivingKingdomPreferenceMode;
  preferenceExists: boolean;
  enabledAt: Date | null;
  preferenceUpdatedAt: Date | null;
  featureAllowed: boolean;
  identity: LivingKingdomHubIdentity | null;
};

type CachedIdentity = {
  expiresAtMs: number;
  featureSignature: string;
  profile: LivingKingdomIdentityProfile | null;
};

type GlobalWithLivingKingdomIdentity = typeof globalThis & {
  __livingKingdomIdentityCache?: Map<string, CachedIdentity>;
  __livingKingdomPublicIdSalt?: Buffer;
  __livingKingdomIdentityGeneration?: number;
};

const identityGlobal = globalThis as GlobalWithLivingKingdomIdentity;
const identityCache = identityGlobal.__livingKingdomIdentityCache ?? new Map<string, CachedIdentity>();
const publicIdSalt = identityGlobal.__livingKingdomPublicIdSalt ?? randomBytes(32);
identityGlobal.__livingKingdomIdentityCache = identityCache;
identityGlobal.__livingKingdomPublicIdSalt = publicIdSalt;
identityGlobal.__livingKingdomIdentityGeneration ??= 0;

export function livingKingdomFeatureMode(
  raw = process.env.LIVING_KINGDOM_MODE,
): LivingKingdomFeatureMode {
  return raw === "staff" || raw === "canary" || raw === "public" ? raw : "off";
}

function parseUidAllowlist(raw: string | undefined) {
  return new Set(
    String(raw ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 100)
      .slice(0, ALLOWLIST_MAX_ENTRIES),
  );
}

export function livingKingdomFeatureAllowsUser(input: {
  mode: LivingKingdomFeatureMode;
  uid: string;
  isAdmin: boolean;
  staffAllowlist?: string;
  canaryAllowlist?: string;
}) {
  if (input.mode === "off") return false;
  if (input.mode === "public") return true;

  const isStaff =
    input.isAdmin || parseUidAllowlist(input.staffAllowlist).has(input.uid);
  if (input.mode === "staff") return isStaff;

  return isStaff || parseUidAllowlist(input.canaryAllowlist).has(input.uid);
}

function featureSignature() {
  return [
    livingKingdomFeatureMode(),
    process.env.LIVING_KINGDOM_STAFF_UID_ALLOWLIST ?? "",
    process.env.LIVING_KINGDOM_CANARY_UID_ALLOWLIST ?? "",
  ].join("\u0000");
}

function displayNameForUser(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  const candidate = user.inGameName?.trim() || user.steamPersonaName?.trim();
  if (!candidate) return null;
  const normalized = candidate
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return normalized || null;
}

function publicIdForUid(uid: string) {
  return `lk_${createHmac("sha256", publicIdSalt).update(uid).digest("base64url").slice(0, 18)}`;
}

function enforceCacheBound() {
  while (identityCache.size > LIVING_KINGDOM_IDENTITY_CACHE_MAX) {
    const oldestKey = identityCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    identityCache.delete(oldestKey);
  }
}

export function invalidateLivingKingdomIdentity(uid: string) {
  identityCache.delete(uid);
  invalidateLivingKingdomAvatar(uid);
  // Never leave a now-revoked or newly-replaced portrait projected from stale
  // hub state. An eligible active user republishes the fresh identity on the
  // next bounded heartbeat.
  livingKingdomHub.removeUser(uid);
  identityGlobal.__livingKingdomIdentityGeneration =
    (identityGlobal.__livingKingdomIdentityGeneration ?? 0) + 1;
}

export function livingKingdomIdentityGeneration() {
  return identityGlobal.__livingKingdomIdentityGeneration ?? 0;
}

export async function loadLivingKingdomIdentityProfile(
  prisma: PrismaClient,
  uid: string,
  nowMs = Date.now(),
): Promise<LivingKingdomIdentityProfile | null> {
  const signature = featureSignature();
  const cached = identityCache.get(uid);
  if (cached && cached.expiresAtMs > nowMs && cached.featureSignature === signature) {
    identityCache.delete(uid);
    identityCache.set(uid, cached);
    return cached.profile;
  }

  const avatarTargets = livingKingdomManagedAvatarTargetsForUid(uid);
  const readIdentitySource = () =>
    Promise.all([
      prisma.user.findUnique({
        where: { uid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          isAdmin: true,
          presencePreference: {
            select: { mode: true, enabledAt: true, updatedAt: true },
          },
        },
      }),
      avatarTargets.length > 0
        ? prisma.managedMediaAsset.findMany({
            where: {
              kind: "avatar",
              target: { in: avatarTargets },
              active: true,
              url: { not: "" },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 12,
            select: { id: true, target: true, updatedAt: true },
          })
        : Promise.resolve([]),
    ]);

  let loadGeneration = livingKingdomIdentityGeneration();
  let [user, avatarRows] = await readIdentitySource();
  if (loadGeneration !== livingKingdomIdentityGeneration()) {
    // An avatar or account identity change committed while the reads were in
    // flight. Retry once before any public avatar registration or cache write,
    // then fail closed on more churn.
    loadGeneration = livingKingdomIdentityGeneration();
    [user, avatarRows] = await readIdentitySource();
    if (loadGeneration !== livingKingdomIdentityGeneration()) return null;
  }

  // A directly selected profile avatar wins. Admin-created featured and pool
  // avatars are immediate fallbacks so a newly avatarized signup enters the
  // kingdom without waiting for a second, user-driven selection step.
  const avatar = avatarTargets
    .map((target) => avatarRows.find((candidate) => candidate.target === target))
    .find((candidate) => Boolean(candidate)) ?? null;
  const avatarTarget = avatar?.target ?? null;

  let profile: LivingKingdomIdentityProfile | null = null;
  if (user) {
    const mode = livingKingdomFeatureMode();
    const displayName = isInternalSystemUid(user.uid) ? null : displayNameForUser(user);
    const preferenceMode = resolveLivingKingdomPreferenceMode(user.presencePreference);
    const featureAllowed = livingKingdomFeatureAllowsUser({
      mode,
      uid: user.uid,
      isAdmin: user.isAdmin,
      staffAllowlist: process.env.LIVING_KINGDOM_STAFF_UID_ALLOWLIST,
      canaryAllowlist: process.env.LIVING_KINGDOM_CANARY_UID_ALLOWLIST,
    });
    const avatarUrl =
      avatar && avatarTarget
        ? avatarPresenceUrlForTarget(
            avatarTarget,
            displayName,
            avatar.updatedAt.getTime(),
          )
        : null;
    const publicId = publicIdForUid(user.uid);
    const publicAvatarUrl =
      avatar &&
      avatarTarget &&
      displayName &&
      featureAllowed
        ? registerLivingKingdomAvatar({
            publicId,
            uid: user.uid,
            target: avatarTarget,
            revision: avatar.updatedAt.getTime(),
            nowMs,
          })
        : null;
    const identity =
      publicAvatarUrl && displayName
        ? {
            uid: user.uid,
            publicId,
            displayName,
            avatarUrl: publicAvatarUrl,
          }
        : null;

    profile = {
      userId: user.id,
      uid: user.uid,
      displayName,
      displayEligible: Boolean(displayName),
      avatarEligible: Boolean(avatar),
      avatarUrl,
      preferenceMode,
      preferenceExists: Boolean(user.presencePreference),
      enabledAt: user.presencePreference?.enabledAt ?? null,
      preferenceUpdatedAt: user.presencePreference?.updatedAt ?? null,
      featureAllowed,
      identity,
    };
  }

  identityCache.set(uid, {
    expiresAtMs:
      nowMs +
      (profile?.displayEligible && profile.avatarEligible
        ? LIVING_KINGDOM_IDENTITY_CACHE_TTL_MS
        : LIVING_KINGDOM_INELIGIBLE_CACHE_TTL_MS),
    featureSignature: signature,
    profile,
  });
  enforceCacheBound();
  return profile;
}

export async function loadLivingKingdomIdentity(
  prisma: PrismaClient,
  uid: string,
  nowMs = Date.now(),
) {
  return (await loadLivingKingdomIdentityProfile(prisma, uid, nowMs))?.identity ?? null;
}
