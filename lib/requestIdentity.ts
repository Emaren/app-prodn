import { NextRequest } from "next/server";
import { getSessionUid } from "@/lib/session";

export async function resolveRequestUid(
  request: NextRequest,
  body?: Record<string, unknown>
) {
  const sessionUid = await getSessionUid(request);
  if (sessionUid) return sessionUid;

  if (process.env.ALLOW_LEGACY_UID_HEADERS === "true") {
    const uidFromHeader = request.headers.get("x-user-uid")?.trim();
    if (uidFromHeader) return uidFromHeader;
    if (typeof body?.uid === "string" && body.uid.trim()) {
      return body.uid.trim();
    }
  }

  return null;
}

export function resolveRequestEmail(
  request: NextRequest,
  body?: Record<string, unknown>
) {
  const emailFromHeader = request.headers.get("x-user-email")?.trim();
  if (emailFromHeader) return emailFromHeader;
  if (typeof body?.email === "string" && body.email.trim()) {
    return body.email.trim();
  }
  return null;
}
