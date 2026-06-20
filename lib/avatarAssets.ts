const STATIC_AVATAR_FALLBACKS: Record<string, string> = {
  emaren: "/champions/players/emaren.png",
  jim: "/champions/players/jim.png",
  julio: "/champions/players/julio.png",
  "julio-alvarez": "/champions/players/julio.png",
  sniper: "/champions/players/sniper.png",
  silhouette: "/champions/players/silhouette.png",
};

const NAME_TARGETS: Record<string, string> = {
  emaren: "emaren",
  jim: "jim",
  julio: "julio-alvarez",
  "julio alvarez": "julio-alvarez",
  sniper: "sniper",
  "the ai scribe": "sniper",
  grimer: "emaren",
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function slugifyAvatarTarget(value: string | null | undefined) {
  return normalizeName(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function avatarFallbackForName(name: string | null | undefined) {
  const normalized = normalizeName(name);
  const target = NAME_TARGETS[normalized] || slugifyAvatarTarget(normalized);
  return STATIC_AVATAR_FALLBACKS[target] || STATIC_AVATAR_FALLBACKS.silhouette;
}

export function managedAvatarUrl(target: string, fallback = STATIC_AVATAR_FALLBACKS.silhouette) {
  const normalizedTarget = slugifyAvatarTarget(target) || "silhouette";
  const safeFallback = fallback.startsWith("/") && !fallback.startsWith("//")
    ? fallback
    : STATIC_AVATAR_FALLBACKS.silhouette;

  return `/api/media-assets/avatar/${encodeURIComponent(normalizedTarget)}?fallback=${encodeURIComponent(
    safeFallback
  )}`;
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

const INLINE_SILHOUETTE_AVATAR =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <radialGradient id="g" cx="50%" cy="34%" r="70%">
          <stop offset="0%" stop-color="#203047"/>
          <stop offset="55%" stop-color="#07111f"/>
          <stop offset="100%" stop-color="#020713"/>
        </radialGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <circle cx="64" cy="47" r="24" fill="#102033"/>
      <path d="M24 116c5-29 24-45 40-45s35 16 40 45" fill="#102033"/>
      <path d="M24 116c5-29 24-45 40-45s35 16 40 45" fill="none" stroke="#334155" stroke-opacity=".55" stroke-width="2"/>
      <circle cx="64" cy="64" r="61" fill="none" stroke="#64748b" stroke-opacity=".38" stroke-width="2"/>
    </svg>`
  );

const MANAGED_NAME_AVATAR_TARGETS = new Set([
  "emaren",
  "jim",
  "julio",
  "julio-alvarez",
  "sniper",
]);

export function avatarUrlForName(name: string | null | undefined) {
  const normalized = normalizeLeaderboardAvatarTarget(name);

  if (!normalized) {
    return INLINE_SILHOUETTE_AVATAR;
  }

  if (!MANAGED_NAME_AVATAR_TARGETS.has(normalized)) {
    return INLINE_SILHOUETTE_AVATAR;
  }

  return `/api/media-assets/avatar/${encodeURIComponent(normalized)}`;
}

export function avatarUrlForUser(uid: string | null | undefined, name: string | null | undefined) {
  const normalizedUid = slugifyAvatarTarget(uid);
  if (!normalizedUid) {
    return avatarUrlForName(name);
  }

  return managedAvatarUrl(`user-${normalizedUid}`, avatarFallbackForName(name));
}
