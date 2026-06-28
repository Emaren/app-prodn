const STATIC_AVATAR_FALLBACKS: Record<string, string> = {
  emaren: "/champions/players/emaren.webp",
  jim: "/champions/players/jim.webp",
  julio: "/champions/players/julio.webp",
  "julio-alvarez": "/champions/players/julio.webp",
  sniper: "/champions/players/sniper.webp",
  silhouette: "/champions/players/silhouette.webp",
};

const STATIC_AVATAR_THUMB_FALLBACKS: Record<string, string> = {
  emaren: "/champions/players/emaren.thumb.webp",
  jim: "/champions/players/jim.thumb.webp",
  julio: "/champions/players/julio.thumb.webp",
  "julio-alvarez": "/champions/players/julio.thumb.webp",
  sniper: "/champions/players/sniper.thumb.webp",
  silhouette: "/champions/players/silhouette.thumb.webp",
};

const NAME_TARGETS: Record<string, string> = {
  emaren: "emaren",
  jim: "jim",
  julio: "julio-alvarez",
  "julio alvarez": "julio-alvarez",
  sniper: "sniper",
  "the ai scribe": "sniper",
  grimer: "emaren",

  myth: "myth",
  ra: "ra",
  "bdb pigman": "bdb-pigman",
  "[bdb]pigman": "bdb-pigman",
  pigman: "pigman",
  "dil pascana": "dil-pascana",
  "dil_pascana": "dil-pascana",
  "dil-pascana": "dil-pascana",
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


const ZODIAC_UID_AVATAR_TARGET = "user-u-06c16d39d25c476fac2c86fee7b4d189";

function managedAvatarTargetOverrideForName(name: string | null | undefined) {
  const normalized = String(name ?? "").trim().toLowerCase();
  return normalized === "zodiac" ? ZODIAC_UID_AVATAR_TARGET : null;
}

export function slugifyAvatarTarget(value: string | null | undefined) {
  return normalizeName(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function thumbnailPathForStaticAvatar(path: string) {
  return path.replace(/\.(avif|webp|png|jpe?g)$/i, ".thumb.webp");
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function avatarFallbackForName(name: string | null | undefined) {
  const normalized = normalizeName(name);
  const target = NAME_TARGETS[normalized] || slugifyAvatarTarget(normalized);
  return STATIC_AVATAR_FALLBACKS[target] || STATIC_AVATAR_FALLBACKS.silhouette;
}

export function avatarThumbFallbackForName(name: string | null | undefined) {
  const normalized = normalizeName(name);
  const target = NAME_TARGETS[normalized] || slugifyAvatarTarget(normalized);
  const fallback = STATIC_AVATAR_THUMB_FALLBACKS[target] || STATIC_AVATAR_THUMB_FALLBACKS.silhouette;
  return fallback || thumbnailPathForStaticAvatar(avatarFallbackForName(normalized));
}

export function managedAvatarUrl(
  target: string,
  fallback = STATIC_AVATAR_FALLBACKS.silhouette,
  options?: { size?: "thumb" | "card" }
) {
  const normalizedTarget = slugifyAvatarTarget(target) || "silhouette";
  const safeFallback = fallback.startsWith("/") && !fallback.startsWith("//")
    ? fallback
    : STATIC_AVATAR_FALLBACKS.silhouette;

  const url = `/api/media-assets/avatar/${encodeURIComponent(normalizedTarget)}?fallback=${encodeURIComponent(
    safeFallback
  )}`;

  if (options?.size === "thumb") {
    return appendQueryParam(url, "size", "thumb");
  }

  if (options?.size === "card") {
    return appendQueryParam(url, "size", "card");
  }

  return url;
}

function normalizeLeaderboardAvatarTarget(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

const MANAGED_NAME_AVATAR_TARGETS = new Set([
  "emaren",
  "jim",
  "julio",
  "julio-alvarez",
  "sniper",

  "myth",
  "ra",
  "bdb-pigman",
  "pigman",
  "dil-pascana",
]);

export function avatarUrlForName(name: string | null | undefined) {

  const managedOverrideTarget = managedAvatarTargetOverrideForName(name);
  if (managedOverrideTarget) {
    return managedAvatarUrl(managedOverrideTarget, avatarFallbackForName(name));
  }

  const normalized = normalizeLeaderboardAvatarTarget(name);

  if (!normalized || !MANAGED_NAME_AVATAR_TARGETS.has(normalized)) {
    return avatarFallbackForName(normalized);
  }

  return managedAvatarUrl(normalized, avatarFallbackForName(normalized));
}

export function avatarThumbUrlForName(name: string | null | undefined) {

  const managedThumbOverrideTarget = managedAvatarTargetOverrideForName(name);
  if (managedThumbOverrideTarget) {
    return managedAvatarUrl(managedThumbOverrideTarget, avatarFallbackForName(name), { size: "thumb" });
  }

  const normalized = normalizeLeaderboardAvatarTarget(name);

  if (!normalized || !MANAGED_NAME_AVATAR_TARGETS.has(normalized)) {
    return avatarThumbFallbackForName(normalized);
  }

  return managedAvatarUrl(normalized, avatarFallbackForName(normalized), { size: "thumb" });
}

export function avatarCardUrlForName(name: string | null | undefined) {

  const managedCardOverrideTarget = managedAvatarTargetOverrideForName(name);
  if (managedCardOverrideTarget) {
    return managedAvatarUrl(managedCardOverrideTarget, avatarFallbackForName(name), { size: "card" });
  }

  const normalized = normalizeLeaderboardAvatarTarget(name);

  if (!normalized || !MANAGED_NAME_AVATAR_TARGETS.has(normalized)) {
    return avatarFallbackForName(normalized).replace(/\.(avif|webp|png|jpe?g)$/i, ".card.webp");
  }

  return managedAvatarUrl(normalized, avatarFallbackForName(normalized), { size: "card" });
}

export function avatarCardUrlForUser(uid: string | null | undefined, name: string | null | undefined) {
  const normalizedUid = slugifyAvatarTarget(uid);
  if (!normalizedUid) {
    return avatarCardUrlForName(name);
  }

  return managedAvatarUrl(`user-${normalizedUid}`, avatarFallbackForName(name), { size: "card" });
}

export function avatarUrlForUser(uid: string | null | undefined, name: string | null | undefined) {
  const normalizedUid = slugifyAvatarTarget(uid);
  if (!normalizedUid) {
    return avatarUrlForName(name);
  }

  return managedAvatarUrl(`user-${normalizedUid}`, avatarFallbackForName(name));
}

export function avatarThumbUrlForUser(uid: string | null | undefined, name: string | null | undefined) {
  const normalizedUid = slugifyAvatarTarget(uid);
  if (!normalizedUid) {
    return avatarThumbUrlForName(name);
  }

  return managedAvatarUrl(`user-${normalizedUid}`, avatarFallbackForName(name), { size: "thumb" });
}

export function thumbnailUrlForAvatarAsset(url: string | null | undefined) {
  const value = String(url ?? "").trim();

  if (!value) {
    return STATIC_AVATAR_THUMB_FALLBACKS.silhouette;
  }

  if (value.startsWith("/api/media-assets/avatar/")) {
    return value.includes("size=thumb") ? value : appendQueryParam(value, "size", "thumb");
  }

  if (value.startsWith("/uploads/managed-assets/avatar/") || value.startsWith("/champions/players/")) {
    return value.replace(/\.(avif|webp|png|jpe?g)(\?.*)?$/i, ".thumb.webp$2");
  }

  return value;
}
