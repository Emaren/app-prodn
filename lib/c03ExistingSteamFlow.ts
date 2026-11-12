/**
 * B-owned C03 existing-user-only Steam callback admission.
 * NO legacy definer, public.users write, registration or linking.
 *
 * CRITICAL: input.steamId and signed responseNonce MUST only be passed
 * AFTER verifySteamCallback(request) has authenticated Steam OpenID, exact
 * browser state cookie and signed nonce freshness. This function does not
 * validate Steam provider assertions, and may not be used from user input.
 *
 * Actual reader and insert-only nonce roles live in two separate B/A-reviewed
 * PostgreSQL databases; their physical isolation is a separate gate.
 */
import { createHash } from "node:crypto";

export type ExistingSteamResolved = {
  uid: string;
  verification_level: number;
};
export type ExistingSteamReader = {
  resolveExistingSteam(verifiedSteamId: string): Promise<ExistingSteamResolved[]>;
  readExistingUser(uid: string): Promise<Record<string, unknown>[]>;
};
export type NonfinancialNonceWriter = {
  insertVerifiedCallbackNonce(nonceSha256: string, uid: string): Promise<void>;
};
export type VerifiedSteamCallbackInput = {
  steamId: string;
  responseNonce: string;
  signedSessionUid: string | null;
};

/** B's independent SQL login guard: current_user alone is NOT direct login.
 * A's restricted read facade requires session_user=c03_auth_reader; the
 * website also requires matching session_user/current_user/database on every
 * reader, nonce and presence connection. Never accept SET ROLE impersonation.
 */
export function isC03DirectLoginBinding(
  actual: { login_role?: unknown; role?: unknown; database?: unknown } | null | undefined,
  expected: { role: string; database: string },
): boolean {
  return !!actual
    && actual.login_role === expected.role
    && actual.role === expected.role
    && actual.database === expected.database;
}

export class C03ExistingOnlyHold extends Error {
  readonly code: string;
  constructor(code: string) {
    super("HOLD:C03_EXISTING_ONLY_" + code);
    this.code = code;
  }
}
function need(value: unknown, code: string): asserts value {
  if (!value) throw new C03ExistingOnlyHold(code);
}
const STEAM_ID = /^[0-9]{17}$/;
const UID = /^[a-zA-Z0-9_-]{1,100}$/;
const NONCE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z[!-~]{1,230}$/;

export async function admitVerifiedExistingSteamCallback(
  input: VerifiedSteamCallbackInput,
  reader: ExistingSteamReader,
  nonceWriter: NonfinancialNonceWriter,
): Promise<{ uid: string; user: Record<string, unknown>; nonceSha256: string }> {
  // No fallback to complete_steam_login or a mutable Prisma model.
  need(STEAM_ID.test(input.steamId), "PROVIDER_ID_NOT_VERIFIED");
  need(NONCE.test(input.responseNonce), "SIGNED_OPENID_NONCE_MISSING");
  need(input.signedSessionUid === null || UID.test(input.signedSessionUid),
       "SIGNED_SESSION_UID_INVALID");

  const identities = await reader.resolveExistingSteam(input.steamId);
  need(Array.isArray(identities) && identities.length === 1,
       "UNKNOWN_OR_AMBIGUOUS_STEAM_DENIED");
  const identity = identities[0];
  need(typeof identity.uid === "string" && UID.test(identity.uid)
       && Number.isSafeInteger(identity.verification_level)
       && identity.verification_level >= 1,
       "NOT_PREVIOUSLY_VERIFIED_LINKED_STEAM_USER");

  // Existing signed session is permitted only for the SAME stored UID.
  // Never link a new Steam ID to an already logged-in different account.
  need(input.signedSessionUid === null || input.signedSessionUid === identity.uid,
       "ACCOUNT_LINKING_OR_SWITCH_DENIED");

  const rows = await reader.readExistingUser(identity.uid);
  need(Array.isArray(rows) && rows.length === 1,
       "EXACT_21_FIELD_USER_NOT_FOUND");
  const user = rows[0];
  need(user && typeof user === "object"
       && user.uid === identity.uid
       && typeof user.isAdmin === "boolean"
       && !Object.hasOwn(user, "token"),
       "USER_PROJECTION_OR_ADMIN_MISMATCH");

  // Insert-only UNIQUE nonce digest in a distinct NONFINANCIAL database.
  // Duplicate violation or any sidecar outage MUST reject signed cookie.
  const nonceSha256 = createHash("sha256").update(input.responseNonce, "utf8").digest("hex");
  await nonceWriter.insertVerifiedCallbackNonce(nonceSha256, identity.uid);

  return { uid: identity.uid, user, nonceSha256 };
}

export const C03_BLOCKED_OPS = Object.freeze({
  firstRegistration: "REQUIRES_DISTINCT_FINANCIAL_AUTHORITY_AND_APPROVED_RELEASE",
  accountLinking: "REQUIRES_DISTINCT_FINANCIAL_AUTHORITY_AND_APPROVED_RELEASE",
  unknownSteamId: "NO_AUTH_COOKIE_OR_USER_CREATION",
  verificationReplay: "REJECT_AUTH_COOKIE",
  protectedLastSeen: "NEVER_UPDATE_PUBLIC_USERS",
  existingAdminAndOrdinary: "EXACT_UID_AND_RESTRICTED_21_FIELD_READER",
});
