/**
 * Read-only C03 admin identity gate. This module has NO PostgreSQL import
 * and provides NO financial/admin data-access authority.
 *
 * Actual auth UID must originate from the verified signed session; the
 * reader must be A's scoped 21-field existing-user projection.
 */
export type C03AdminCandidate = {
  uid: string;
  isAdmin: boolean;
  id: number;
};

export async function c03ExistingAdminIdentity<T extends C03AdminCandidate>(
  signedUid: string | null,
  readExisting: (uid: string) => Promise<T | null>,
): Promise<T | null> {
  if (typeof signedUid !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(signedUid)) return null;
  const user = await readExisting(signedUid);
  if (!user || user.uid !== signedUid ||
      user.isAdmin !== true || !Number.isSafeInteger(user.id) || user.id <= 0) {
    return null;
  }
  return user;
}

/**
 * Authenticated admin identity is NOT an admission to legacy Prisma.
 * Protected admin route reads and writes require separately authorized
 * nonfinancial projections; every attempt through the old DB HOLDS.
 */
export function c03DeniedLegacyAdminData<T extends object>(): T {
  const deny = () => {
    throw new Error("HOLD:C03_PROTECTED_ADMIN_PRISMA_NOT_ADMITTED");
  };
  return new Proxy(Object.create(null) as T, {
    get: deny,
    set: deny,
    apply: deny,
    ownKeys: deny,
    getOwnPropertyDescriptor: deny,
  });
}
