-- B-owned NONFINANCIAL C03 schema review source only.
-- MUST be installed separately in a distinct nonfinancial database after
-- Central/A review and BEFORE A re-censuses protected auth DB objects.
-- No live execution, no automatic migrations, no FINANCIAL/user table grants.
-- Roles c03_auth_nonce_writer, c03_auth_presence_writer, c03_auth_reader
-- require separately audited owner/root-created LOGIN/HBA policy.
BEGIN;
CREATE SCHEMA c03_b_sidecar;
REVOKE ALL ON SCHEMA c03_b_sidecar FROM PUBLIC;

CREATE TABLE c03_b_sidecar.steam_verified_nonces (
  nonce_sha256 text PRIMARY KEY CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  uid text NOT NULL CHECK (uid ~ '^[a-zA-Z0-9_-]{1,100}$'),
  consumed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE c03_b_sidecar.user_presence (
  uid text PRIMARY KEY CHECK (uid ~ '^[a-zA-Z0-9_-]{1,100}$'),
  seen_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA c03_b_sidecar FROM PUBLIC;
-- Review-gated least privilege, no owner/grant to original web DB role.
-- c03_auth_nonce_writer has NO SELECT/UPDATE/DELETE/sequence privileges.
GRANT USAGE ON SCHEMA c03_b_sidecar TO c03_auth_nonce_writer, c03_auth_presence_writer;
GRANT INSERT ON c03_b_sidecar.steam_verified_nonces TO c03_auth_nonce_writer;
GRANT SELECT, INSERT, UPDATE ON c03_b_sidecar.user_presence TO c03_auth_presence_writer;
COMMIT;
