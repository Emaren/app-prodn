export const STREAM_MEDIA_CONTENT_TYPE = "video/webm";

const MAX_STREAM_THUMBNAIL_LENGTH = 256_000;

const SAFE_WEBM_CODECS = new Set(["vp8", "vp9", "av1", "opus", "vorbis"]);

export function normalizeStreamMediaMimeType(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "application/octet-stream" || raw === "video/x-matroska") {
    return STREAM_MEDIA_CONTENT_TYPE;
  }

  const [type, ...parameters] = raw.split(";").map((part) => part.trim());
  if (type !== STREAM_MEDIA_CONTENT_TYPE) return null;
  if (parameters.length === 0) return STREAM_MEDIA_CONTENT_TYPE;
  if (parameters.length !== 1 || !parameters[0].startsWith("codecs=")) return null;

  const codecs = parameters[0]
    .slice("codecs=".length)
    .replace(/^"|"$/g, "")
    .split(",")
    .map((codec) => codec.trim())
    .filter(Boolean);
  if (codecs.length === 0 || codecs.some((codec) => !SAFE_WEBM_CODECS.has(codec))) {
    return null;
  }

  return `${STREAM_MEDIA_CONTENT_TYPE};codecs=${codecs.join(",")}`;
}

export function normalizeStreamThumbnailUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > MAX_STREAM_THUMBNAIL_LENGTH) return null;

  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function streamMediaResponseHeaders(contentLength?: number) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": STREAM_MEDIA_CONTENT_TYPE,
    "X-Content-Type-Options": "nosniff",
    ...(typeof contentLength === "number"
      ? { "Content-Length": String(contentLength) }
      : {}),
  };
}
