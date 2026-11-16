import http from "node:http";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// This is an unprivileged *client* for a distinct, owner-admitted UNIX
// service. No PG writer URL or SQL privileges may be introduced into Next.js.
export const APPEARANCE_WRITER_SOCKET =
  "/run/aoe2war-appearance-writer/appearance.sock";
const MAX_BYTES = 4096;
const TRANSPORT_TIMEOUT_MS = 2300;

export type AppearanceWriterReply = {
  status: number;
  body: Record<string, unknown>;
};

export function validateAppearanceWriteOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site && !["same-origin", "none"].includes(site)) return false;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" &&
      parsed.origin === request.nextUrl.origin &&
      parsed.username === "" && parsed.password === "";
  } catch { return false; }
}

// Stream-size bound rather than request.json() which can buffer arbitrarily.
export async function readBoundedAppearanceJson(request: NextRequest): Promise<unknown> {
  const size = request.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > MAX_BYTES)) {
    throw new Error("BODY_TOO_LARGE");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new Error("JSON_REQUIRED");
  }
  const body = request.body;
  if (!body) throw new Error("BODY_REQUIRED");
  const reader = body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        void reader.cancel("too large").catch(() => undefined);
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function signedAppearanceCookie(request: NextRequest): string | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token && token.length <= 4096 ? token : null;
}

export async function callAppearanceWriter(
  scope: "admin" | "personal",
  sessionToken: string,
  action: Record<string, unknown>,
): Promise<AppearanceWriterReply> {
  // No environment-selected arbitrary socket path or URL. Neither any
  // PostgreSQL credentials nor a userId are ever passed from the web.
  const payload = JSON.stringify(action);
  if (Buffer.byteLength(payload, "utf8") > MAX_BYTES ||
      sessionToken.length > 4096 || !sessionToken) {
    return { status: 400, body: { detail: "INVALID_APPEARANCE_ACTION" } };
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reply: AppearanceWriterReply) => {
      if (!settled) { settled = true; resolve(reply); }
    };
    const req = http.request({
      socketPath: APPEARANCE_WRITER_SOCKET,
      path: scope === "admin" ? "/v1/admin" : "/v1/personal",
      method: "POST",
      timeout: TRANSPORT_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload, "utf8"),
        "x-appearance-signed-session": sessionToken,
        "Connection": "close",
      },
    }, (res) => {
      const pieces: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8192) {
          req.destroy();
          finish({ status: 503, body: { detail: "APPEARANCE_WRITER_UNAVAILABLE" } });
        } else pieces.push(chunk);
      });
      res.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(pieces).toString("utf8"));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          finish({
            status: res.statusCode && res.statusCode >= 200 && res.statusCode <= 503
              ? res.statusCode : 503,
            body: parsed as Record<string, unknown>,
          });
        } catch {
          finish({ status: 503, body: { detail: "APPEARANCE_WRITER_UNAVAILABLE" } });
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => finish({ status: 503, body: { detail: "APPEARANCE_WRITER_UNAVAILABLE" } }));
    req.end(payload);
  });
}
