const LIVING_KINGDOM_AVATAR_BINDING_TTL_MS = 5 * 60_000;
const LIVING_KINGDOM_AVATAR_BINDING_MAX = 1_024;
const PUBLIC_ID_PATTERN = /^lk_[A-Za-z0-9_-]{18}$/;
const INTERNAL_TARGET_PATTERN = /^[a-z0-9][a-z0-9-]{0,159}$/;

export const LIVING_KINGDOM_AVATAR_FALLBACK =
  "/champions/players/silhouette.webp";

type LivingKingdomAvatarBinding = {
  uid: string;
  target: string;
  fallback: string;
  expiresAtMs: number;
};

type GlobalWithLivingKingdomAvatarBindings = typeof globalThis & {
  __livingKingdomAvatarBindings?: Map<string, LivingKingdomAvatarBinding>;
};

const avatarGlobal = globalThis as GlobalWithLivingKingdomAvatarBindings;
const avatarBindings =
  avatarGlobal.__livingKingdomAvatarBindings ??
  new Map<string, LivingKingdomAvatarBinding>();
avatarGlobal.__livingKingdomAvatarBindings = avatarBindings;

function pruneExpired(nowMs: number) {
  for (const [publicId, binding] of avatarBindings) {
    if (binding.expiresAtMs <= nowMs) avatarBindings.delete(publicId);
  }
}

function enforceBound() {
  while (avatarBindings.size > LIVING_KINGDOM_AVATAR_BINDING_MAX) {
    const oldest = avatarBindings.keys().next().value as string | undefined;
    if (!oldest) break;
    avatarBindings.delete(oldest);
  }
}

export function isLivingKingdomAvatarHandle(value: string) {
  return PUBLIC_ID_PATTERN.test(value);
}

export function registerLivingKingdomAvatar(input: {
  publicId: string;
  uid: string;
  target: string;
  revision?: string | number | null;
  nowMs?: number;
}) {
  if (
    !isLivingKingdomAvatarHandle(input.publicId) ||
    !input.uid ||
    !INTERNAL_TARGET_PATTERN.test(input.target)
  ) {
    return null;
  }

  const nowMs = input.nowMs ?? Date.now();
  pruneExpired(nowMs);
  avatarBindings.delete(input.publicId);
  avatarBindings.set(input.publicId, {
    uid: input.uid,
    target: input.target,
    fallback: LIVING_KINGDOM_AVATAR_FALLBACK,
    expiresAtMs: nowMs + LIVING_KINGDOM_AVATAR_BINDING_TTL_MS,
  });
  enforceBound();

  const params = new URLSearchParams({ size: "presence" });
  if (input.revision != null) {
    params.set("rev", String(input.revision).slice(0, 96));
  }
  return `/api/media-assets/avatar/${encodeURIComponent(input.publicId)}?${params}`;
}

export function resolveLivingKingdomAvatar(
  publicId: string,
  nowMs = Date.now(),
) {
  if (!isLivingKingdomAvatarHandle(publicId)) return null;
  pruneExpired(nowMs);
  const binding = avatarBindings.get(publicId);
  if (!binding) return null;

  avatarBindings.delete(publicId);
  avatarBindings.set(publicId, binding);
  return { target: binding.target, fallback: binding.fallback };
}

export function invalidateLivingKingdomAvatar(uid: string) {
  for (const [publicId, binding] of avatarBindings) {
    if (binding.uid === uid) avatarBindings.delete(publicId);
  }
}

export function resetLivingKingdomAvatarRegistryForTests() {
  avatarBindings.clear();
}
