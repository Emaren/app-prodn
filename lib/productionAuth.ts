import type { NextRequest } from "next/server";
import { toUserApi, type UserCoreRow } from "@/lib/userDto";

export const NONFINANCIAL_PRODUCTION_PROFILE = "nonfinancial-production-v1";
export const PRODUCTION_WEB_ORIGIN = "https://aoe2war.com";

export function usesNonfinancialProductionAuth() {
  return process.env.AOE2WAR_RUNTIME_PROFILE === NONFINANCIAL_PRODUCTION_PROFILE;
}

type AuthDatabase = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export function isProductionAuthMutationOrigin(request: NextRequest) {
  return request.headers.get("origin") === PRODUCTION_WEB_ORIGIN;
}

export async function completeProductionSteamLogin(prisma: AuthDatabase, input: {
  steamId: string; sessionUid: string | null; newUid: string;
  personaName: string | null; responseNonce: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ uid: string }>>`
    SELECT aoe2war_auth_v1.complete_steam_login(
      ${input.steamId}::text, ${input.sessionUid}::text, ${input.newUid}::text,
      ${input.personaName}::text, ${input.responseNonce}::text
    ) AS uid
  `;
  const uid = rows[0]?.uid;
  if (typeof uid !== "string" || !uid || uid.length > 100) throw new Error("AUTH_LOGIN_NOT_PERSISTED");
  return uid;
}

export async function touchProductionSession(prisma: AuthDatabase, uid: string, email: string | null = null) {
  const rows = await prisma.$queryRaw<Array<{ touched: boolean }>>`
    SELECT aoe2war_auth_v1.touch_session(${uid}::text, ${email}::text) AS touched
  `;
  return rows[0]?.touched === true;
}

export async function readProductionUser(prisma: AuthDatabase, uid: string) {
  const rows = await prisma.$queryRaw<Array<Omit<UserCoreRow, "token">>>`
    SELECT * FROM aoe2war_auth_v1.read_user(${uid}::text)
  `;
  const row = rows[0];
  if (!row) return null;
  // Compatibility serialization is shared, but production never reads or
  // emits the legacy API token field. SQL returns only the reviewed projection.
  const { token: legacyToken, ...user } = toUserApi({ ...row, token: null });
  void legacyToken;
  return user;
}
