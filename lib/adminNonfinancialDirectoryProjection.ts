/** Pure, defensive serialization for the already-admitted nonfinancial user view. */
export const ADMIN_DIRECTORY_SCHEMA =
  "aoe2war.admin.nonfinancial-user-directory.v1" as const;
export const ADMIN_DIRECTORY_LIMIT = 1000;

export type AdminDirectoryProfileRow = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  steamId: string | null;
  verified: boolean;
  verificationLevel: number;
  createdAt: Date;
};

export type AdminDirectoryProfile = {
  uid: string;
  displayName: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  steamId: string | null;
  verified: boolean;
  verificationLevel: number;
  registeredAt: string;
};

export function projectAdminDirectory(
  rows: readonly AdminDirectoryProfileRow[],
) {
  if (rows.length > ADMIN_DIRECTORY_LIMIT) {
    throw new Error("HOLD:ADMIN_DIRECTORY_SOURCE_OVER_BOUNDED_LIMIT");
  }
  const seen = new Set<string>();
  const users: AdminDirectoryProfile[] = rows.map((row) => {
    if (!Number.isSafeInteger(row.id) || row.id < 1 ||
        typeof row.uid !== "string" || row.uid.length < 1 ||
        row.uid.length > 100 || seen.has(row.uid) ||
        typeof row.verified !== "boolean" ||
        !Number.isSafeInteger(row.verificationLevel) ||
        !(row.createdAt instanceof Date) ||
        !Number.isFinite(row.createdAt.getTime())) {
      throw new Error("HOLD:ADMIN_DIRECTORY_SOURCE_ROW_INVALID");
    }
    seen.add(row.uid);
    const inGameName = row.inGameName?.trim() || null;
    const steamPersonaName = row.steamPersonaName?.trim() || null;
    const steamId = row.steamId?.trim() || null;
    return {
      uid: row.uid,
      displayName: inGameName || steamPersonaName || row.uid,
      inGameName, steamPersonaName, steamId,
      verified: row.verified,
      verificationLevel: row.verificationLevel,
      registeredAt: row.createdAt.toISOString(),
    };
  });
  return {
    schema: ADMIN_DIRECTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    summary: {
      registeredAccounts: users.length,
      verifiedProfiles: users.filter((item) => item.verified).length,
      steamLinkedProfiles: users.filter((item) => Boolean(item.steamId)).length,
    },
    users,
    unavailable: {
      perAccountAdminRole: "REQUIRES_SEPARATE_ADMIN_READER",
      warriorClaimState: "REQUIRES_SEPARATE_CLAIM_READER",
      honorsAndClans: "REQUIRES_SEPARATE_NONFINANCIAL_READER",
      financialAndWolo: "RESTRICTED",
      inboxAndTraffic: "REQUIRES_SEPARATE_NONFINANCIAL_READER",
    },
  } as const;
}
