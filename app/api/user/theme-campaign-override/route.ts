import { NextRequest, NextResponse } from "next/server";
import { isLobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import { getSessionUid } from "@/lib/session";
import {
  callAppearanceWriter,
  readBoundedAppearanceJson,
  signedAppearanceCookie,
  validateAppearanceWriteOrigin,
} from "@/lib/appearanceWriterClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: NextRequest) {
  // This web-layer precheck improves client feedback. The real writer verifies
  // the signed session *again* and resolves the authoritative user in PG.
  if (!await getSessionUid(request)) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  if (!validateAppearanceWriteOrigin(request)) {
    return NextResponse.json(
      { detail: "Same-origin request required." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  const signedSession = signedAppearanceCookie(request);
  if (!signedSession) {
    return NextResponse.json(
      { detail: "Signed session required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  let body: unknown;
  try { body = await readBoundedAppearanceJson(request); }
  catch {
    return NextResponse.json(
      { detail: "Invalid appearance request." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { detail: "Campaign key and valid theme are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 2 ||
      typeof input.campaignKey !== "string" ||
      typeof input.themeKey !== "string" ||
      !isLobbyThemeKey(input.themeKey)) {
    return NextResponse.json(
      { detail: "Campaign key and valid theme are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const result = await callAppearanceWriter("personal", signedSession, {
    action: "setPersonalOverride",
    campaignKey: input.campaignKey,
    themeKey: input.themeKey,
  });
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
