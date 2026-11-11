/**
 * B-owned C03 restricted auth read / presence adapter. SERVER-ONLY.
 *
 * Imported only by server API routes. NEVER import this from productionAuth,
 * clans or any browser/client shared graph: it imports node-postgres directly.
 * The actual SQL role/database must be independently read and denied against
 * protected financial tables before physical activation.
 */
import { c03ExistingReader, c03TouchNonfinancialPresence } from "@/lib/c03ExistingSteamPg";
import { toUserApi, type UserCoreRow } from "@/lib/userDto";

export async function readC03ExistingUser(uid: string) {
  const rows = await c03ExistingReader.readExistingUser(uid);
  const row = rows[0];
  if (!row || rows.length !== 1 || row.uid !== uid ||
      typeof row.isAdmin !== "boolean" || Object.hasOwn(row, "token")) return null;
  const { token: legacyToken, ...user } = toUserApi({
    ...(row as unknown as UserCoreRow), token: null,
  });
  void legacyToken;
  return user;
}

export async function touchC03ExistingSession(
  uid: string, requestedEmail: string | null = null,
): Promise<boolean> {
  const rows = await c03ExistingReader.readExistingUser(uid);
  if (rows.length !== 1 || rows[0]?.uid !== uid) return false;
  if (requestedEmail !== null && rows[0]?.email !== requestedEmail) {
    throw new Error("HOLD:C03_PROTECTED_EMAIL_UPDATE_DENIED");
  }
  return c03TouchNonfinancialPresence(uid);
}
