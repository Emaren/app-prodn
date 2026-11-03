/**
 * A05 fail-closed datasource admission for the separately proposed
 * nonfinancial-production-v1 Steam identity profile.
 *
 * This is a source-only startup invariant, NOT SQL installation authority
 * and NOT approval to loosen the candidate nftables egress fence.
 * Never include DATABASE_URL or its credential in diagnostic errors.
 */
const PROFILE = "nonfinancial-production-v1";
const EXPECTED_ROLE = "aoe2war_web_prod";
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type AdmissionEnvironment = Readonly<Record<string, string | undefined>>;

export function requireNonfinancialAuthDatasource(
  rawDatabaseUrl: string,
  env: AdmissionEnvironment,
): void {
  if (env.AOE2WAR_RUNTIME_PROFILE !== PROFILE) return;

  if (env.NODE_ENV !== "production") {
    throw new Error("A05_AUTH_PRODUCTION_NODE_MODE_REQUIRED");
  }
  if (env.WARGRAPH_RUNTIME_DISABLED !== "true") {
    throw new Error("A05_AUTH_FINANCIAL_RUNTIME_FENCE_REQUIRED");
  }
  if (env.AOE2WAR_PROD_DB_PREVIEW === "true") {
    throw new Error("A05_AUTH_PREVIEW_READ_ONLY_DB_CONFLICT");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawDatabaseUrl.replace(/^postgresql\+asyncpg:/, "postgresql:"));
  } catch {
    throw new Error("A05_AUTH_DATASOURCE_INVALID");
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol) ||
      decodeURIComponent(parsed.username) !== EXPECTED_ROLE ||
      !LOCAL_DATABASE_HOSTS.has(parsed.hostname) ||
      !parsed.pathname || parsed.pathname === "/") {
    throw new Error("A05_AUTH_EXPECTS_LOCAL_SCOPED_POSTGRES_ROLE");
  }

  const directReadOnly = parsed.searchParams.get("default_transaction_read_only");
  const options = [
    parsed.searchParams.get("options") || "",
    env.PGOPTIONS || "",
  ].join(" ");
  if (/^(?:on|true|1)$/i.test(directReadOnly || "") ||
      /\bdefault_transaction_read_only\s*=\s*(?:on|true|1)\b/i.test(options) ||
      /\b(?:-c\s*)?default_transaction_read_only\s+(?:on|true|1)\b/i.test(options)) {
    throw new Error("A05_AUTH_READ_ONLY_CONNECTION_OPTIONS");
  }

  // Runtime Postgres must separately attest current_user, effective
  // transaction_read_only, role attributes, function grants and denied
  // financial updates. This static check alone never certifies those.
}
