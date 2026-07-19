export function sanitizeSpeedPath(value: string | null | undefined) {
  if (!value) return "/";
  try {
    const parsed = new URL(value, "https://aoe2war.com");
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    return (pathname || "/").slice(0, 500);
  } catch {
    const pathname = value.split(/[?#]/, 1)[0]?.replace(/\/{2,}/g, "/") || "/";
    return pathname.startsWith("/") ? pathname.slice(0, 500) : `/${pathname}`.slice(0, 500);
  }
}
