import { createHmac, randomBytes } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma";
import { isAiPersonaUid } from "@/lib/aiConciergeConfig";
import { avatarPresenceUrlForUser } from "@/lib/avatarAssets";
import { normalizeManagedMediaTarget } from "@/lib/managedMediaAssets";
import {
  invalidateLivingKingdomAvatar,
  registerLivingKingdomAvatar,
} from "./avatarRegistry.ts";
import type { LivingKingdomHubIdentity } from "./hub.ts";

export const LIVING_KINGDOM_FEATURE_MODES = ["off", "staff", "canary", "public"] as const;
export type LivingKingdomFeatureMode = (typeof LIVING_KINGDOM_FEATURE_MODES)[number];
export type LivingKingdomPreferenceMode = "off" | "public_coarse";

export const LIVING_KINGDOM_IDENTITY_CACHE_TTL_MS = 15_000;
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

  const avatarTarget = normalizeManagedMediaTarget(`user-${uid}`);
  const [user, avatar] = await Promise.all([
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
    avatarTarget
      ? prisma.managedMediaAsset.findFirst({
          where: {
            kind: "avatar",
            target: avatarTarget,
            active: true,
            url: { not: "" },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: { id: true, updatedAt: true },
        })
      : Promise.resolve(null),
  ]);

  let profile: LivingKingdomIdentityProfile | null = null;
  if (user) {
    const mode = livingKingdomFeatureMode();
    const displayName = isAiPersonaUid(user.uid) ? null : displayNameForUser(user);
    const preferenceMode: LivingKingdomPreferenceMode =
      user.presencePreference?.mode === "public_coarse" ? "public_coarse" : "off";
    const featureAllowed = livingKingdomFeatureAllowsUser({
      mode,
      uid: user.uid,
      isAdmin: user.isAdmin,
      staffAllowlist: process.env.LIVING_KINGDOM_STAFF_UID_ALLOWLIST,
      canaryAllowlist: process.env.LIVING_KINGDOM_CANARY_UID_ALLOWLIST,
    });
    const avatarUrl =
      avatar && avatarTarget
        ? avatarPresenceUrlForUser(user.uid, displayName, avatar.updatedAt.getTime())
        : null;
    const publicId = publicIdForUid(user.uid);
    const publicAvatarUrl =
      avatar &&
      avatarTarget &&
      displayName &&
      preferenceMode === "public_coarse" &&
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
    expiresAtMs: nowMs + LIVING_KINGDOM_IDENTITY_CACHE_TTL_MS,
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
