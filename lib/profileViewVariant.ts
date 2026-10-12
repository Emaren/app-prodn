export const PROFILE_VIEW_STORAGE_PREFIX = "aoe2war:profile-view:v2";
export const DEFAULT_PROFILE_VIEW = "e2" as const;
export const PROFILE_VIEW_VARIANTS = ["b1", "b2", "a1", "a2", "e1", "e2"] as const;

export type ProfileViewVariant = (typeof PROFILE_VIEW_VARIANTS)[number];
export type ProfileViewFamily = "basic" | "advanced" | "extreme";

export function isProfileViewVariant(value: unknown): value is ProfileViewVariant {
  return typeof value === "string" && PROFILE_VIEW_VARIANTS.some((variant) => variant === value);
}

export function profileViewFamily(view: ProfileViewVariant): ProfileViewFamily {
  return view[0] === "b" ? "basic" : view[0] === "a" ? "advanced" : "extreme";
}

export function profileViewStorageKey(uid: string | null | undefined): string {
  // This browser preference is deliberately scoped by account and is not money authority.
  return PROFILE_VIEW_STORAGE_PREFIX + ":" + (uid ? encodeURIComponent(uid) : "guest");
}

export function readProfileViewVariant(uid: string | null | undefined): ProfileViewVariant {
  if (typeof window === "undefined") return DEFAULT_PROFILE_VIEW;
  try {
    const saved = window.localStorage.getItem(profileViewStorageKey(uid));
    return isProfileViewVariant(saved) ? saved : DEFAULT_PROFILE_VIEW;
  } catch {
    return DEFAULT_PROFILE_VIEW;
  }
}

export function saveProfileViewVariant(uid: string | null | undefined, view: ProfileViewVariant) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(profileViewStorageKey(uid), view);
  } catch {
    // Storage restrictions cannot prevent selection during the active session.
  }
}
