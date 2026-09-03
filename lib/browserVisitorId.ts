export const AOE2WAR_BROWSER_VISITOR_STORAGE_KEY =
  "aoe2war:radio-wolo-listener-id:v1";
export const AOE2WAR_BROWSER_VISITOR_HEADER = "x-aoe2war-visitor-id";

const BROWSER_VISITOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function browserVisitorIdIsValid(value: unknown): value is string {
  return typeof value === "string" && BROWSER_VISITOR_UUID_RE.test(value.trim());
}

export function createBrowserVisitorId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function readOrCreateBrowserVisitorId() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(
      AOE2WAR_BROWSER_VISITOR_STORAGE_KEY,
    );
    if (browserVisitorIdIsValid(stored)) return stored;

    const created = createBrowserVisitorId();
    window.localStorage.setItem(AOE2WAR_BROWSER_VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    return createBrowserVisitorId();
  }
}
