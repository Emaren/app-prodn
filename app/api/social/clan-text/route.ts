import { NextRequest, NextResponse } from "next/server";
import { getSessionUid } from "@/lib/session";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import {
  callSocialWriter, readBoundedSocialJson, signedSocialCookie,
  validateSocialWriteOrigin,
} from "@/lib/socialWriterClient";
import { readRestrictedClanHall,CLAN_PRIVATE_HEADERS } from "@/lib/restrictedClanHall";
import { publishClanHallEvent } from "@/lib/clanHallEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/**
 * Exact static POST distinct from the protected /api/clans/[slug] handler.
 * No protected dynamic-route source modification and no general POST authority.
 */
export async function POST(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return NextResponse.json(
    { detail: "Sign in with Steam to post in the clan hall." },
    { status: 401, headers: NO_STORE },
  );
  const production = usesNonfinancialProductionAuth();
  if (production && !validateSocialWriteOrigin(request))
    return NextResponse.json(
      { detail: "Same-origin request required." },
      { status: 403, headers: NO_STORE },
    );

  let body: unknown;
  try { body = await readBoundedSocialJson(request); }
  catch { return NextResponse.json(
    { detail: "Plain-text JSON request required." },
    { status: 400, headers: NO_STORE },
  ); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ detail: "Invalid Clan Hall request." },
      { status: 400, headers: NO_STORE });
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) =>
    !["slug", "message", "audience", "scribe"].includes(key)) ||
    typeof input.slug !== "string" || !SLUG.test(input.slug) ||
    typeof input.message !== "string" ||
    typeof input.audience !== "string" ||
    (input.scribe !== undefined && typeof input.scribe !== "boolean"))
    return NextResponse.json({ detail: "Invalid Clan Hall text request." },
      { status: 400, headers: NO_STORE });
  const slug = input.slug;

  if (!production) {
    // Original business logic stays intact for local development.
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    const forwarded = new NextRequest(
      new URL("/api/clans/" + encodeURIComponent(slug), request.url), {
        method: "POST", headers,
        body: JSON.stringify({
          message: input.message, audience: input.audience,
          scribe: input.scribe ?? false,
        }),
      },
    );
    const { POST: legacyPost } = await import("@/app/api/clans/[slug]/route");
    return legacyPost(forwarded, { params: Promise.resolve({ slug }) });
  }
  if (input.scribe === true)
    return NextResponse.json(
      { detail: "Restricted production chat accepts human text only." },
      { status: 400, headers: NO_STORE },
    );
  const token = signedSocialCookie(request);
  if (!token) return NextResponse.json(
    { detail: "Signed session required." },
    { status: 401, headers: NO_STORE },
  );
  const result = await callSocialWriter("clan", token, {
    slug, message: input.message, audience: input.audience,
  });
  if (result.status !== 201)
    return NextResponse.json(result.body,
      { status: result.status, headers: NO_STORE });
  const messageId = result.body.messageId;
  if (typeof messageId !== "number")
    return NextResponse.json(
      { persisted: true, detail: "Check Clan Hall history before retrying." },
      { status: 202, headers: NO_STORE },
    );
  publishClanHallEvent(slug, { type: "message", messageId });
  try {
    const snapshot = await readRestrictedClanHall(token, sessionUid, slug, null, messageId);
    if (snapshot.messages.some(m=>m.id===messageId))
      return NextResponse.json(snapshot, { status: 201, headers: CLAN_PRIVATE_HEADERS });
  } catch { /* committed: never claim send failure */ }
  return NextResponse.json({
    persisted: true, messageId, clanSlug: slug,
    detail: "Message saved. Clan Hall readback is currently unavailable.",
  }, { status: 202, headers: NO_STORE });
}
