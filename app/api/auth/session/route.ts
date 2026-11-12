// /var/www/AoE2HDBets/app-prodn/app/api/auth/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { fetchUserVerification, toUserApi, type UserCoreRow } from "@/lib/userDto";
import {
  getPreviewIdentity,
} from "@/lib/previewDataSource";
import {
  clearSessionCookie,
  getSessionUid,
  newSessionUid,
  setSessionCookie,
  signSession,
} from "@/lib/session";
import {
  allowUserOnlineSession,
  forceUserOnlineOffline,
} from "@/lib/userOnlinePresence";
import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import { isProductionAuthMutationOrigin, readProductionUser, touchProductionSession, usesNonfinancialProductionAuth, usesC03ExistingOnlyAuth } from "@/lib/productionAuth";
import { readC03ExistingUser, touchC03ExistingSession } from "@/lib/c03ProductionAuthServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOW_GUEST_SESSIONS = process.env.ALLOW_GUEST_SESSIONS === "true";

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim();
  if (!e) return null;
  if (e.length > 100) return null;
  return e;
}

export async function GET(request: NextRequest) {
  const previewIdentity =
    getPreviewIdentity();
  // No preview account may be mistaken for a signed existing C03 user.
  if (usesC03ExistingOnlyAuth() && previewIdentity) {
    return NextResponse.json({ detail: "C03 preview identity not admitted" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }

  if (previewIdentity) {
    if (
      process.env.AOE2WAR_SHADOW_MODE ===
      "true"
    ) {
      const prisma = getPrisma();

      const shadowUser =
        await prisma.user.findUnique({
          where: {
            uid: previewIdentity.uid,
          },
        });

      const shadowVerification =
        shadowUser
          ? await fetchUserVerification(
              prisma,
              previewIdentity.uid,
            )
          : null;

      return NextResponse.json({
        uid: previewIdentity.uid,
        preview: true,
        shadow: true,
        user: shadowUser
          ? toUserApi(
              shadowUser as unknown as UserCoreRow,
              shadowVerification,
            )
          : null,
      });
    }

    return NextResponse.json({
      uid: previewIdentity.uid,
      preview: true,
      user: {
        uid: previewIdentity.uid,
        email: null,
        inGameName:
          previewIdentity.name,
        isAdmin: false,
        canReviewOwnReplayResults:
          false,
        steamId: null,
        steamPersonaName:
          previewIdentity.name,
        verificationLevel: 1,
        verificationMethod:
          "preview",
        verified: true,
      },
    });
  }

  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  // C03 physically rejects the legacy website Prisma datasource. Existing
  // signed user sessions MUST use the 21-field scoped reader directly.
  if (usesC03ExistingOnlyAuth()) {
    const user = await readC03ExistingUser(uid);
    if (!user) return NextResponse.json({ detail: "User not found" }, { status: 401 });
    return NextResponse.json({ uid, user }, { headers: {
      "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
    } });
  }
  const prisma = getPrisma();
  if (usesNonfinancialProductionAuth()) {
    const user = await readProductionUser(prisma, uid);
    if (!user) return NextResponse.json({ detail: "User not found" }, { status: 401 });
    return NextResponse.json({ uid, user }, { headers: {
      "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
    } });
  }
  const user = await prisma.user.findUnique({ where: { uid } });
  // GET and the automatically supported HEAD are observations. Arrival and
  // optional identity changes belong to the verified callback or explicit POST.
  const verification = user ? await fetchUserVerification(prisma, uid) : null;

  return NextResponse.json({
    uid,
    user: user
      ? toUserApi(user as unknown as UserCoreRow, verification)
      : null,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providedEmail = normalizeEmail(body.email);

  let uid = await getSessionUid(request);
  if (usesC03ExistingOnlyAuth()) {
    if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });
    if (!isProductionAuthMutationOrigin(request)) {
      return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
    }
    // No protected users update: a separately scoped NONFINANCIAL presence
    // writer touches only c03_b_sidecar.user_presence.
    if (!await touchC03ExistingSession(uid, providedEmail)) {
      return NextResponse.json({ detail: "User not found" }, { status: 401 });
    }
    const user = await readC03ExistingUser(uid);
    if (!user) return NextResponse.json({ detail: "User not found" }, { status: 401 });
    return NextResponse.json({ uid, user }, { headers: {
      "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
    } });
  }
  const prisma = getPrisma();
  if (usesNonfinancialProductionAuth()) {
    if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });
    if (!isProductionAuthMutationOrigin(request)) {
      return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
    }
    if (!await touchProductionSession(prisma, uid, providedEmail)) {
      return NextResponse.json({ detail: "User not found" }, { status: 401 });
    }
    const user = await readProductionUser(prisma, uid);
    return NextResponse.json({ uid, user }, { headers: {
      "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
    } });
  }
  if (!uid) {
    if (!ALLOW_GUEST_SESSIONS) {
      return NextResponse.json(
        { detail: "Guest sessions are disabled. Sign in with Steam to continue." },
        { status: 401 }
      );
    }

    uid = newSessionUid();
    allowUserOnlineSession(uid);
    const user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: false,
        lastSeen: new Date(),
      },
    });

    const token = await signSession(uid);
    const response = NextResponse.json({
      uid,
      user: toUserApi(
        user as unknown as UserCoreRow,
        await fetchUserVerification(prisma, uid)
      ),
    });
    setSessionCookie(response, token);
    return response;
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  let user = existing;

  if (!user) {
    user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: false,
        lastSeen: new Date(),
      },
    });
  } else if (providedEmail && providedEmail !== user.email) {
    user = await prisma.user.update({
      where: { uid },
      data: {
        email: providedEmail,
        lastSeen: new Date(),
      },
    });
  } else {
    user = await prisma.user.update({
      where: { uid },
      data: { lastSeen: new Date() },
    });
  }

  return NextResponse.json({
    uid,
    user: user
      ? toUserApi(user as unknown as UserCoreRow, await fetchUserVerification(prisma, uid))
      : null,
  });
}

export async function DELETE(request: NextRequest) {
  if (usesNonfinancialProductionAuth() && !isProductionAuthMutationOrigin(request)) {
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  }
  const uid = await getSessionUid(request);
  let presenceCleared = false;

  if (uid) {
    forceUserOnlineOffline(uid);
    livingKingdomHub.removeUser(uid);
    // Presence is an independent live rail; logout no longer invalidates the
    // expensive replay-derived public player directory.
    // Preserve the durable last-seen timestamp. The explicit offline fence is
    // the authoritative immediate logout signal for this server process.
    presenceCleared = true;
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set(
    "X-AoE2WAR-Presence-Cleared",
    String(presenceCleared),
  );
  clearSessionCookie(response);
  return response;
}
