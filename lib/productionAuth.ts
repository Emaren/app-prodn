import type { NextRequest } from "next/server";
import { toUserApi, type UserCoreRow } from "@/lib/userDto";

export const NONFINANCIAL_PRODUCTION_PROFILE = "nonfinancial-production-v1";
export const PRODUCTION_WEB_ORIGIN = "https://aoe2war.com";

export const C03_EXISTING_ONLY_PROFILE = "nonfinancial-c03-existing-only-v1";

export function usesC03ExistingOnlyAuth() {
  if (process.env.AOE2WAR_RUNTIME_PROFILE !== C03_EXISTING_ONLY_PROFILE) return false;
  // This is a distinct admitted maintenance profile, never a preview/dev
  // shortcut to the existing 21-field protected reader.
  if (process.env.NODE_ENV !== "production" ||
      process.env.AOE2WAR_R25_ISOLATED_WEB !== "true" ||
      process.env.WARGRAPH_RUNTIME_DISABLED !== "true" ||
      process.env.AOE2WAR_PROD_DB_PREVIEW === "true" ||
      process.env.AOE2WAR_SHADOW_MODE === "true" ||
      process.env.ALLOW_GUEST_SESSIONS === "true") {
    throw new Error("HOLD:C03_ISOLATED_PRODUCTION_ONLY_PROFILE_REQUIRED");
  }
  return true;
}

export function usesNonfinancialProductionAuth() {
  return process.env.AOE2WAR_RUNTIME_PROFILE === NONFINANCIAL_PRODUCTION_PROFILE
    || usesC03ExistingOnlyAuth();
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
  if (usesC03ExistingOnlyAuth()) {
    throw new Error("HOLD:C03_LEGACY_MUTATING_SECURITY_DEFINER_DENIED");
  }
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

export async function touchProductionSession(prisma: AuthDatabase | null, uid: string, email: string | null = null) {
  // This shared module is imported into client-facing modules (e.g. clans).
  // Never import pg or a server-only C03 module here. Actual scoped C03 SQL
  // is available solely through API route imports of c03ProductionAuthServer.
  if (usesC03ExistingOnlyAuth()) {
    throw new Error("HOLD:C03_USE_EXPLICIT_SERVER_ONLY_SESSION_ADAPTER");
  }
  if (!prisma) throw new Error("HOLD:C03_LEGACY_PRISMA_READ_DENIED");
  const rows = await prisma.$queryRaw<Array<{ touched: boolean }>>`
    SELECT aoe2war_auth_v1.touch_session(${uid}::text, ${email}::text) AS touched
  `;
  return rows[0]?.touched === true;
}

export async function readProductionUser(prisma: AuthDatabase | null, uid: string) {
  if (usesC03ExistingOnlyAuth()) {
    throw new Error("HOLD:C03_USE_EXPLICIT_SERVER_ONLY_USER_READER");
  }
  if (!prisma) throw new Error("HOLD:C03_LEGACY_PRISMA_READ_DENIED");
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
