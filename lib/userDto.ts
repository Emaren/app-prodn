// ~/projects/AoE2HDBets/app-prodn/lib/userDto.ts

export type UserCoreRow = {
  id: number;
  uid: string;
  email: string | null;
  inGameName: string | null;
  verified: boolean;
  walletAddress: string | null;
  lockName: boolean;
  createdAt: Date;
  token: string | null;
  lastSeen: Date | null;
  isAdmin: boolean;
} & Partial<{
  steamId: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verificationMethod: string;
  verifiedAt: Date | string | null;
}>;

export type UserVerificationRow = {
  steamId: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verificationMethod: string;
  verifiedAt: string | null;
};

export type UserApi = {
  id: number;
  uid: string;
  email: string | null;
  inGameName: string | null;
  verified: boolean;
  walletAddress: string | null;
  lockName: boolean;
  createdAt: string;
  token: string | null;
  lastSeen: string | null;
  isAdmin: boolean;

  steamId: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verificationMethod: string;
  verifiedAt: string | null;
};

export function toUserApi(core: UserCoreRow, ver?: Partial<UserVerificationRow> | null): UserApi {
  const coreVerifiedAt =
    core.verifiedAt instanceof Date ? core.verifiedAt.toISOString() : core.verifiedAt ?? null;

  const v: UserVerificationRow = {
    steamId: ver?.steamId ?? core.steamId ?? null,
    steamPersonaName: ver?.steamPersonaName ?? core.steamPersonaName ?? null,
    verificationLevel: ver?.verificationLevel ?? core.verificationLevel ?? 0,
    verificationMethod: ver?.verificationMethod ?? core.verificationMethod ?? "none",
    verifiedAt: ver?.verifiedAt ?? coreVerifiedAt,
  };

  return {
    id: core.id,
    uid: core.uid,
    email: core.email,
    inGameName: core.inGameName,
    verified: core.verified,
    walletAddress: core.walletAddress,
    lockName: core.lockName,
    createdAt: core.createdAt.toISOString(),
    token: core.token,
    lastSeen: core.lastSeen ? core.lastSeen.toISOString() : null,
    isAdmin: core.isAdmin,

    steamId: v.steamId,
    steamPersonaName: v.steamPersonaName,
    verificationLevel: v.verificationLevel,
    verificationMethod: v.verificationMethod,
    verifiedAt: v.verifiedAt,
  };
}

type PrismaLike = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export async function fetchUserVerification(prisma: PrismaLike, uid: string): Promise<UserVerificationRow> {
  const rows = await prisma.$queryRaw<
    Array<{
      steam_id: string | null;
      steam_persona_name: string | null;
      verification_level: number | null;
      verification_method: string | null;
      verified_at: Date | null;
    }>
  >`
    SELECT
      steam_id,
      steam_persona_name,
      verification_level,
      verification_method,
      verified_at
    FROM public.users
    WHERE uid = ${uid}
    LIMIT 1
  `;

  const r = rows[0];
  return {
    steamId: r?.steam_id ?? null,
    steamPersonaName: r?.steam_persona_name ?? null,
    verificationLevel: r?.verification_level ?? 0,
    verificationMethod: r?.verification_method ?? "none",
    verifiedAt: r?.verified_at ? r.verified_at.toISOString() : null,
  };
}
