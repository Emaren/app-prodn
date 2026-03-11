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
  verifySteamCallback,
} from "@/lib/steamAuth";

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
  return NextResponse.redirect(url);
}

function buildFailurePath(request: NextRequest, detail: string) {
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const target = new URL(returnTo, getAppBaseUrl(request));
  target.searchParams.set("auth", "steam-error");
  target.searchParams.set("detail", detail);
  return target.toString();
}

export async function GET(request: NextRequest) {
  if (!requestLooksLikeSteamCallback(request)) {
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    return NextResponse.redirect(buildSteamAuthUrl(request, returnTo));
  }

  try {
    const steamId = await verifySteamCallback(request);
    const profile = await fetchSteamProfile(steamId);
    const prisma = getPrisma();

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

    await hydrateSteamIdentity(prisma, uid);

    const token = await signSession(uid);
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const response = makeRedirect(request, returnTo);
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Steam sign-in failed";
    return NextResponse.redirect(buildFailurePath(request, detail));
  }
}
