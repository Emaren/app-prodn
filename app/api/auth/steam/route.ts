import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hydrateSteamIdentity } from "@/lib/steamIdentity";
import {
  getSessionUid,
  newSessionUid,
  setSessionCookie,
  signSession,
} from "@/lib/session";
import {
  buildSteamAuthUrl,
  fetchSteamProfile,
  getAppBaseUrl,
  requestLooksLikeSteamCallback,
  sanitizeReturnTo,
  newSteamAuthState,
  STEAM_AUTH_STATE_COOKIE,
  verifySteamCallback,
} from "@/lib/steamAuth";
import { allowUserOnlineSession } from "@/lib/userOnlinePresence";
import { completeProductionSteamLogin, usesNonfinancialProductionAuth, usesC03ExistingOnlyAuth } from "@/lib/productionAuth";
import { admitVerifiedExistingSteamCallback } from "@/lib/c03ExistingSteamFlow";
import { c03ExistingReader, c03NonceWriter } from "@/lib/c03ExistingSteamPg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SteamIdentityRow = {
  uid: string;
  steam_id: string | null;
  verification_level: number | null;
  verification_method: string | null;
};

function makeRedirect(request: NextRequest, path: string) {
  const url = new URL(path, getAppBaseUrl(request));
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function buildFailurePath(request: NextRequest, detail: string) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const target = new URL(returnTo, getAppBaseUrl(request));
  target.searchParams.set("auth", "steam-error");
  target.searchParams.set("detail", detail);
  return target.toString();
}

function clearSteamState(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.cookies.set(STEAM_AUTH_STATE_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
  });
  return response;
}

export async function HEAD() {
  // Next otherwise dispatches HEAD through GET, including its callback writes.
  return new NextResponse(null, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(request: NextRequest) {
  if (!requestLooksLikeSteamCallback(request)) {
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const state = newSteamAuthState();
    const response = NextResponse.redirect(buildSteamAuthUrl(request, returnTo, state));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set(STEAM_AUTH_STATE_COOKIE, state, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 300,
    });
    return response;
  }

  // Emit only a finite, reviewed stage label; never print OpenID assertions,
  // Steam identities, session tokens, SQL text, provider responses, or errors.
  let callbackStage: "openid_verification" | "community_profile" | "prisma_connect" |
    "scoped_db_login" | "session_sign" | "response_cookie" = "openid_verification";
  try {
    const steamId = await verifySteamCallback(request);
    if (usesC03ExistingOnlyAuth()) {
      // Existing-user only: no getPrisma(), no complete_steam_login SECDEF,
      // no newSessionUid(), no public.users mutation and no account linking.
      // The OpenID provider assertion, browser state cookie and signed nonce
      // were already verified by verifySteamCallback() above.
      callbackStage = "scoped_db_login";
      const existing = await admitVerifiedExistingSteamCallback({
        steamId,
        responseNonce: request.nextUrl.searchParams.get("openid.response_nonce") ?? "",
        signedSessionUid: await getSessionUid(request),
      }, c03ExistingReader, c03NonceWriter);
      allowUserOnlineSession(existing.uid); // in-memory only
      callbackStage = "session_sign";
      const token = await signSession(existing.uid);
      callbackStage = "response_cookie";
      const response = makeRedirect(request, sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo")));
      setSessionCookie(response, token);
      return clearSteamState(response);
    }
    callbackStage = "community_profile";
    const profile = await fetchSteamProfile(steamId);
    callbackStage = "prisma_connect";
    const prisma = getPrisma();
    if (usesNonfinancialProductionAuth()) {
      callbackStage = "scoped_db_login";
      const uid = await completeProductionSteamLogin(prisma, {
        steamId, sessionUid: await getSessionUid(request), newUid: newSessionUid(),
        personaName: profile.personaName,
        responseNonce: request.nextUrl.searchParams.get("openid.response_nonce") ?? "",
      });
      allowUserOnlineSession(uid);
      callbackStage = "session_sign";
      const token = await signSession(uid);
      callbackStage = "response_cookie";
      const response = makeRedirect(request, sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo")));
      setSessionCookie(response, token);
      return clearSteamState(response);
    }

    const existingBySteamRows = await prisma.$queryRaw<SteamIdentityRow[]>`
      SELECT uid, steam_id, verification_level, verification_method
      FROM public.users
      WHERE steam_id = ${steamId}
      LIMIT 1
    `;
    const existingBySteam = existingBySteamRows[0] ?? null;

    const sessionUid = await getSessionUid(request);
    const sessionUserRows = sessionUid
      ? await prisma.$queryRaw<SteamIdentityRow[]>`
          SELECT uid, steam_id, verification_level, verification_method
          FROM public.users
          WHERE uid = ${sessionUid}
          LIMIT 1
        `
      : [];
    const sessionUser = sessionUserRows[0] ?? null;

    let uid = existingBySteam?.uid || sessionUser?.uid || newSessionUid();

    if (existingBySteam) {
      await prisma.$executeRaw`
        UPDATE public.users
        SET
          steam_persona_name = ${profile.personaName},
          verification_level = GREATEST(COALESCE(verification_level, 0), 1),
          verification_method = ${
            existingBySteam.verification_method === "watcher"
              ? existingBySteam.verification_method
              : "steam"
          }
        WHERE uid = ${existingBySteam.uid}
      `;
      uid = existingBySteam.uid;
    } else if (sessionUser && !sessionUser.steam_id) {
      await prisma.$executeRaw`
        UPDATE public.users
        SET
          steam_id = ${steamId},
          steam_persona_name = ${profile.personaName},
          verification_level = GREATEST(COALESCE(verification_level, 0), 1),
          verification_method = ${
            sessionUser.verification_method === "watcher"
              ? sessionUser.verification_method
              : "steam"
          }
        WHERE uid = ${sessionUser.uid}
      `;
      uid = sessionUser.uid;
    } else {
      await prisma.user.create({
        data: {
          uid,
          isAdmin: false,
        },
      });

      await prisma.$executeRaw`
        UPDATE public.users
        SET
          steam_id = ${steamId},
          steam_persona_name = ${profile.personaName},
          verification_level = 1,
          verification_method = ${"steam"}
        WHERE uid = ${uid}
      `;
    }

    allowUserOnlineSession(uid);

    // The successful callback is the earliest authoritative arrival signal.
    // The page heartbeat takes over after the redirect completes.
    await prisma.user.update({
      where: { uid },
      data: { lastSeen: new Date() },
    });

    await hydrateSteamIdentity(prisma, uid);

    const token = await signSession(uid);
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const response = makeRedirect(request, returnTo);
    setSessionCookie(response, token);
    return clearSteamState(response);
  } catch {
    // The deployed callback previously hid the failing boundary. Never emit
    // exception objects, input data or provider messages into production logs.
    if (usesNonfinancialProductionAuth()) {
      console.warn("AOE2WAR_NONFINANCIAL_STEAM_CALLBACK_HOLD_STAGE:" + callbackStage);
    }
    return clearSteamState(NextResponse.redirect(buildFailurePath(request, "STEAM_SIGN_IN_FAILED")));
  }
}
