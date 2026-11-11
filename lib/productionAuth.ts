import type { NextRequest } from "next/server";
import { toUserApi, type UserCoreRow } from "@/lib/userDto";
import { c03ExistingReader, c03TouchNonfinancialPresence } from "@/lib/c03ExistingSteamPg";

export const NONFINANCIAL_PRODUCTION_PROFILE = "nonfinancial-production-v1";
export const PRODUCTION_WEB_ORIGIN = "https://aoe2war.com";

export const C03_EXISTING_ONLY_PROFILE = "nonfinancial-c03-existing-only-v1";

export function usesC03ExistingOnlyAuth() {
  return process.env.AOE2WAR_RUNTIME_PROFILE === C03_EXISTING_ONLY_PROFILE;
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

export async function touchProductionSession(prisma: AuthDatabase, uid: string, email: string | null = null) {
  if (usesC03ExistingOnlyAuth()) {
    const rows = await c03ExistingReader.readExistingUser(uid);
    if (rows.length !== 1 || rows[0]?.uid !== uid) return false;
    // C03 cannot modify protected public.users.email or last_seen. A
    // different requested email is a separately authorized account mutation.
    if (email !== null && rows[0]?.email !== email) {
      throw new Error("HOLD:C03_PROTECTED_EMAIL_UPDATE_DENIED");
    }
    return c03TouchNonfinancialPresence(uid);
  }
  const rows = await prisma.$queryRaw<Array<{ touched: boolean }>>`
    SELECT aoe2war_auth_v1.touch_session(${uid}::text, ${email}::text) AS touched
  `;
  return rows[0]?.touched === true;
}

export async function readProductionUser(prisma: AuthDatabase, uid: string) {
  if (usesC03ExistingOnlyAuth()) {
    const rows = await c03ExistingReader.readExistingUser(uid);
    const row = rows[0];
    if (!row || rows.length !== 1 || row.uid !== uid
        || typeof row.isAdmin !== "boolean" || Object.hasOwn(row, "token")) return null;
    const { token: legacyToken, ...user } = toUserApi({
      ...(row as unknown as UserCoreRow), token: null,
    });
    void legacyToken;
    return user;
  }
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
