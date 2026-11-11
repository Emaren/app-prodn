/**
 * B-owned NONFINANCIAL C03 projected-reader and nonce/presence sidecar adapter.
 * Source-only. Requires three separately restricted PostgreSQL logins and an
 * independently admitted nonfinancial sidecar schema. No HBA/grant/DDL writes.
 * Session A must independently baseline protected auth object/ACL changes.
 */
import { Pool } from "pg";
import type { ExistingSteamReader, NonfinancialNonceWriter } from "./c03ExistingSteamFlow";

type C03Scope = "reader" | "nonce" | "presence";
type C03Connection = { url: string; database: string; role: string };
const EXPECTED_ROLES: Record<C03Scope, string> = {
  reader: "c03_auth_reader",
  nonce: "c03_auth_nonce_writer",
  presence: "c03_auth_presence_writer",
};
const ENV: Record<C03Scope, [string, string]> = {
  reader: ["AOE2WAR_C03_READER_DATABASE_URL", "AOE2WAR_C03_READER_DATABASE_NAME"],
  nonce: ["AOE2WAR_C03_NONCE_DATABASE_URL", "AOE2WAR_C03_SIDECAR_DATABASE_NAME"],
  presence: ["AOE2WAR_C03_PRESENCE_DATABASE_URL", "AOE2WAR_C03_SIDECAR_DATABASE_NAME"],
};
// The repository uses the existing pg runtime import without @types/pg.
 // Infer the concrete Pool instance from its constructor rather than
 // treating the bundled namespace as an ambient TypeScript Pool type.
type ScopedPool = ReturnType<typeof createScopedPool>;
// This repository's pg runtime declaration is namespace-only. Declare
// the narrow parameterized SQL query and release interface rather than
// calling an untyped generic client or importing extra permissions.
type ScopedClient = {
  query<T extends Record<string, unknown>>(
    statement: string, values?: unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
};
const POOLS = new Map<C03Scope, ScopedPool>();
function scoped(scope: C03Scope): C03Connection {
  const [urlVar, dbVar] = ENV[scope];
  const url = process.env[urlVar];
  const database = process.env[dbVar];
  if (!url || !database || !/^[a-z0-9_]{4,64}$/.test(database)) {
    throw new Error("HOLD:C03_SEPARATE_DATABASE_CREDENTIALS_NOT_ENROLLED");
  }
  const readerDb = process.env.AOE2WAR_C03_READER_DATABASE_NAME;
  const sidecarDb = process.env.AOE2WAR_C03_SIDECAR_DATABASE_NAME;
  if (!readerDb || !sidecarDb || readerDb === sidecarDb) {
    throw new Error("HOLD:C03_NONFINANCIAL_SIDECAR_NOT_DISTINCT");
  }
  // Do not trust the URL username as proof of effective PostgreSQL role.
  return { url, database, role: EXPECTED_ROLES[scope] };
}
function createScopedPool(cfg: C03Connection, scope: C03Scope) {
  return new Pool({
    connectionString: cfg.url,
    max: 3,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    application_name: "aoe2war-c03-" + scope,
  });
}
function pool(scope: C03Scope): ScopedPool {
  const existing = POOLS.get(scope);
  if (existing) return existing;
  const cfg = scoped(scope);
  const created = createScopedPool(cfg, scope);
  POOLS.set(scope, created);
  return created;
}
async function runScoped<T extends Record<string, unknown>>(
  scope: C03Scope,
  work: (client: ScopedClient) => Promise<T[] | void>,
): Promise<T[] | void> {
  const cfg = scoped(scope);
  const client = await pool(scope).connect();
  try {
    // Every acquisition checks the physical SQL role/database, not config
    // strings alone. Reader and sidecar must have distinct actual databases.
    const binding = await client.query<{ role: string; database: string }>(
      "SELECT current_user AS role, current_database() AS database"
    );
    if (binding.rows.length !== 1 || binding.rows[0]?.role !== cfg.role ||
        binding.rows[0]?.database !== cfg.database) {
      throw new Error("HOLD:C03_PG_EFFECTIVE_ROLE_OR_DATABASE_DRIFT");
    }
    return await work(client);
  } finally {
    client.release();
  }
}

export const c03ExistingReader: ExistingSteamReader = {
  async resolveExistingSteam(steamId) {
    const rows = await runScoped<{uid:string;verification_level:number}>(
      "reader",
      async (client) => {
        const result = await client.query<{uid:string;verification_level:number}>(
          "SELECT uid, verification_level FROM c03_auth_ro.resolve_existing_steam($1::text)",
          [steamId],
        );
        return result.rows;
      },
    );
    return rows ?? [];
  },
  async readExistingUser(uid) {
    const rows = await runScoped<Record<string,unknown>>("reader", async (client) => {
      const result = await client.query<Record<string,unknown>>(
        "SELECT * FROM c03_auth_ro.read_user($1::text)", [uid],
      );
      return result.rows;
    });
    return rows ?? [];
  },
};
export const c03NonceWriter: NonfinancialNonceWriter = {
  async insertVerifiedCallbackNonce(nonceSha256, uid) {
    await runScoped("nonce", async (client) => {
      // Explicit INSERT only. Unique violation (23505) must propagate and
      // prevent cookie signing; no UPSERT or optimistic replay acceptance.
      await client.query(
        "INSERT INTO c03_b_sidecar.steam_verified_nonces (nonce_sha256, uid) VALUES ($1::text, $2::text)",
        [nonceSha256, uid],
      );
    });
  },
};
export async function c03TouchNonfinancialPresence(uid: string): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(uid)) return false;
  await runScoped("presence", async (client) => {
    // NONFINANCIAL sidecar only, completely different credential and DB.
    await client.query(
      "INSERT INTO c03_b_sidecar.user_presence (uid, seen_at) VALUES ($1::text, NOW()) " +
      "ON CONFLICT (uid) DO UPDATE SET seen_at=excluded.seen_at",
      [uid],
    );
  });
  return true;
}
