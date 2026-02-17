export function getBackendUpstreamBase() {
  const raw =
    process.env.AOE2_BACKEND_UPSTREAM ||
    process.env.BACKEND_API ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:3330";

  const normalized = raw === "." ? "http://127.0.0.1:3330" : raw;
  return normalized.replace(/\/$/, "");
}
