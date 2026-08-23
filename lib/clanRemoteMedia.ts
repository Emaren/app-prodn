import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_REMOTE_IMAGE_BYTES = 96_000_000;
const MAX_REMOTE_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;

const IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function ipv4IsPrivate(address: string) {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipIsPrivate(address: string) {
  const normalized = address.toLowerCase();
  if (net.isIPv4(normalized)) return ipv4IsPrivate(normalized);
  if (!net.isIPv6(normalized)) return true;

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicRemoteUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Choose a valid remote image URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Remote Hall media must use HTTPS.");
  }
  if (url.username || url.password || !url.hostname) {
    throw new Error("Remote Hall media URL is not allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Remote Hall media host is not allowed.");
  }

  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new Error("Remote Hall media host is not public.");
  } else {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => ipIsPrivate(entry.address))) {
      throw new Error("Remote Hall media host is not public.");
    }
  }

  return url;
}

function imageMimeFromBuffer(buffer: Buffer, headerMime: string | null) {
  if (buffer.length >= 6) {
    const magic = buffer.subarray(0, 6).toString("ascii");
    if (magic === "GIF87a" || magic === "GIF89a") return "image/gif";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const normalizedHeader = (headerMime || "").split(";", 1)[0].trim().toLowerCase();
  return IMAGE_MIME_TYPES.has(normalizedHeader) ? normalizedHeader : null;
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function htmlEntityDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pageImageCandidate(html: string, baseUrl: URL) {
  const gifMatch = html.match(/https:\/\/[^"'<>\\\s]+\.gif(?:\?[^"'<>\\\s]*)?/i)?.[0];
  if (gifMatch) {
    return htmlEntityDecode(gifMatch.replace(/\\u0026/g, "&"));
  }

  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern)?.[1];
    if (!match) continue;
    try {
      return new URL(htmlEntityDecode(match), baseUrl).toString();
    } catch {
      // Keep looking.
    }
  }

  return null;
}

async function readResponseBufferBounded(
  response: Response,
  limitBytes: number,
  tooLargeMessage: string,
) {
  if (!response.body) {
    throw new Error(
      "Remote Hall media returned no body.",
    );
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } =
      await reader.read();

    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;

    if (totalBytes > limitBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(tooLargeMessage);
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchRemote(url: URL, redirectCount = 0): Promise<{ buffer: Buffer; mimeType: string; finalUrl: URL }> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "image/gif,image/webp,image/png,image/jpeg,text/html;q=0.6,*/*;q=0.2",
      "User-Agent": "AoE2WAR-ClanHall-Media/1.0",
    },
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error("Remote Hall media redirected too many times.");
    const location = response.headers.get("location");
    if (!location) throw new Error("Remote Hall media redirect is invalid.");
    const nextUrl = await assertPublicRemoteUrl(new URL(location, url).toString());
    return fetchRemote(nextUrl, redirectCount + 1);
  }

  if (!response.ok) throw new Error("Remote Hall media could not be downloaded.");

  const headerMime =
    response.headers.get("content-type");

  const normalizedHeader =
    (headerMime || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();

  const limit =
    normalizedHeader === "text/html"
      ? MAX_REMOTE_HTML_BYTES
      : MAX_REMOTE_IMAGE_BYTES;

  const tooLargeMessage =
    normalizedHeader === "text/html"
      ? "Remote media page is unusually large."
      : "That remote animation is unusually large for a single Hall post.";

  const contentLength = Number(
    response.headers.get("content-length") || "0",
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > limit
  ) {
    throw new Error(tooLargeMessage);
  }

  const buffer =
    await readResponseBufferBounded(
      response,
      limit,
      tooLargeMessage,
    );

  if (buffer.length < 1) {
    throw new Error(
      "Remote Hall media returned no usable content.",
    );
  }

  if (normalizedHeader === "text/html") {
    const candidate = pageImageCandidate(buffer.toString("utf8"), url);
    if (!candidate) throw new Error("That page does not expose an importable image.");
    const candidateUrl = await assertPublicRemoteUrl(candidate);
    return fetchRemote(candidateUrl, redirectCount + 1);
  }

  const mimeType = imageMimeFromBuffer(buffer, headerMime);
  if (!mimeType) throw new Error("Remote Hall media must be GIF, PNG, JPEG, or WebP.");
  return { buffer, mimeType, finalUrl: url };
}

export function normalizeRemoteClanMediaUrls(values: string[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || unique.has(trimmed)) continue;
    if (unique.size >= 4) break;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

export async function importRemoteClanImageFiles(values: string[]) {
  const urls = normalizeRemoteClanMediaUrls(values);
  const files: File[] = [];

  for (const rawUrl of urls) {
    const url = await assertPublicRemoteUrl(rawUrl);
    const { buffer, mimeType, finalUrl } = await fetchRemote(url);
    const pathnameName = decodeURIComponent(finalUrl.pathname.split("/").filter(Boolean).pop() || "remote-image")
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
      .trim();
    const baseName = pathnameName.replace(/\.(gif|png|jpe?g|webp)$/i, "").slice(0, 180) || "remote-image";
    files.push(new File([buffer], `${baseName}${extensionForMime(mimeType)}`, { type: mimeType }));
  }

  return files;
}
