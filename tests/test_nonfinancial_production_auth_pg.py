"""Real private PostgreSQL auth privileges. Never uses DATABASE_URL or live data."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "config/nonfinancial-production-auth.sql"
ENABLED = os.environ.get("RUN_PRODUCTION_AUTH_PG_TESTS") == "1"
PG_BIN = Path(os.environ.get("AOE2WAR_TEST_PG_BIN", "/opt/homebrew/bin"))


@unittest.skipUnless(ENABLED, "Set RUN_PRODUCTION_AUTH_PG_TESTS=1 for isolated PostgreSQL auth controls")
class ProductionAuthPostgres(unittest.TestCase):
    @classmethod
    def sql(cls, statement, user="auth_fixture", check=True):
        result = subprocess.run([str(PG_BIN / "psql"), "-X", "-q", "-At",
            "-h", str(cls.socket), "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
            input=statement, capture_output=True, text=True, timeout=20,
            env={"PATH": os.environ.get("PATH", ""), "LC_ALL": "C"})
        if check and result.returncode:
            raise AssertionError(result.stderr)
        return result

    @classmethod
    def setUpClass(cls):
        cls.home = Path(tempfile.mkdtemp(prefix="aoe2-auth-pg-"))
        cls.data = cls.home / "data"
        cls.socket = cls.home / "socket"
        cls.socket.mkdir(mode=0o700)
        cls.started = False
        try:
            subprocess.run([str(PG_BIN / "initdb"), "-D", str(cls.data), "-U", "auth_fixture",
                "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"],
                capture_output=True, check=True, timeout=30)
            subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(cls.data), "-l", str(cls.home / "server.log"),
                "-o", "-h '' -k " + str(cls.socket), "-w", "start"], capture_output=True, check=True, timeout=30)
            cls.started = True
            cls.sql("""
                CREATE ROLE aoe2war_auth_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                CREATE ROLE aoe2war_web_prod LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                CREATE ROLE ordinary_fixture LOGIN NOINHERIT;
                -- Model the inspected HEL1 ACL; Homebrew PG14 has an older
                -- PUBLIC CREATE default that production does not grant.
                REVOKE CREATE ON SCHEMA public FROM PUBLIC;
                CREATE TABLE public.users (
                  id serial PRIMARY KEY, uid varchar(100) UNIQUE NOT NULL,
                  email varchar(100) UNIQUE, in_game_name text UNIQUE,
                  steam_id varchar(32) UNIQUE, steam_persona_name varchar(255),
                  verification_level integer NOT NULL DEFAULT 0,
                  verification_method varchar(32) NOT NULL DEFAULT 'none', last_seen timestamp,
                  is_admin boolean NOT NULL DEFAULT false, verified boolean NOT NULL DEFAULT false,
                  wallet_address text, token text,
                  lock_name boolean NOT NULL DEFAULT false,
                  created_at timestamp NOT NULL DEFAULT now(),
                  can_review_own_replay_results boolean NOT NULL DEFAULT false,
                  twitch_stream_url text, represented_country text,
                  represented_country_updated_at timestamp,
                  gender_division text NOT NULL DEFAULT 'Man', gender_division_updated_at timestamp,
                  verified_at timestamp, preferred_language text
                );
                CREATE TABLE public.pending_wolo_claims(id serial PRIMARY KEY, amount numeric NOT NULL DEFAULT 0);
                INSERT INTO public.pending_wolo_claims(amount) VALUES (500);
                CREATE TABLE public.game_stats(id integer PRIMARY KEY, winner text);
                INSERT INTO public.game_stats VALUES (1, 'Actual persisted fixture winner');
                CREATE TABLE public.api_keys(id integer PRIMARY KEY, key_hash text);
                CREATE TABLE public.war_satchel_ledger_postings(id integer PRIMARY KEY, amount numeric);
            """)
            cls.sql("BEGIN;\n" + SQL.read_text() + "\nCOMMIT;")
        except BaseException:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        if cls.started:
            subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(cls.data), "-m", "immediate", "-w", "stop"],
                capture_output=True, timeout=30)
            cls.started = False
        shutil.rmtree(cls.home)

    def setUp(self):
        self.sql("DELETE FROM public.users; DELETE FROM aoe2war_auth_v1.steam_nonces;")

    def nonce(self, delta=0):
        return (datetime.now(timezone.utc) + timedelta(seconds=delta)).strftime("%Y-%m-%dT%H:%M:%SZ") + uuid.uuid4().hex

    def login(self, steam="76561198000000001", session=None, new="u_" + "1" * 32, persona="Real Fixture", nonce=None):
        def literal(x):
            return "NULL" if x is None else "'" + x.replace("'", "''") + "'"
        values = ",".join(literal(x) for x in (steam, session, new, persona, nonce or self.nonce()))
        return self.sql("SELECT aoe2war_auth_v1.complete_steam_login(" + values + ");", "aoe2war_web_prod", check=False)

    def test_new_authentication_persists_only_auth_fields(self):
        result = self.login(persona="  Fixture   Warrior  ")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "u_" + "1" * 32)
        self.assertEqual(self.sql("SELECT is_admin,verified,wallet_address IS NULL,token IS NULL,verification_level,verification_method,in_game_name,last_seen IS NOT NULL FROM public.users;").stdout.strip(),
                         "f|f|t|t|1|steam|Fixture Warrior|t")
        self.assertEqual(self.sql("SELECT count(*) FROM aoe2war_auth_v1.steam_nonces;").stdout.strip(), "1")
        self.assertEqual(self.sql("SELECT amount FROM public.pending_wolo_claims;").stdout.strip(), "500")

    def test_existing_privileges_wallet_and_watcher_identity_preserved(self):
        self.sql("INSERT INTO public.users(uid,steam_id,is_admin,wallet_address,verification_level,verification_method) VALUES ('admin-existing','76561198000000001',true,'fixture-wallet',3,'watcher');")
        result = self.login()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "admin-existing")
        self.assertEqual(self.sql("SELECT count(*),bool_and(is_admin),min(wallet_address),min(verification_level),min(verification_method) FROM public.users;").stdout.strip(),
                         "1|t|fixture-wallet|3|watcher")

    def test_guest_link_only_when_previous_identity_is_unlinked(self):
        self.sql("INSERT INTO public.users(uid) VALUES ('legacy-guest');")
        self.assertEqual(self.login(session="legacy-guest").stdout.strip(), "legacy-guest")
        result = self.login(steam="76561198000000002", session="legacy-guest", new="u_" + "2" * 32)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "u_" + "2" * 32)
        self.assertEqual(self.sql("SELECT steam_id FROM public.users WHERE uid='legacy-guest';").stdout.strip(), "76561198000000001")

    def test_replay_expiry_and_future_nonce_are_rejected_atomically(self):
        nonce = self.nonce()
        self.assertEqual(self.login(nonce=nonce).returncode, 0)
        self.assertNotEqual(self.login(steam="76561198000000002", nonce=nonce, new="u_" + "2" * 32).returncode, 0)
        for seconds in (-3600, 3600):
            result = self.login(steam="76561198000000002", nonce=self.nonce(seconds), new="u_" + "2" * 32)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("AUTH_NONCE_EXPIRED_OR_FUTURE", result.stderr)
        self.assertEqual(self.sql("SELECT count(*) FROM public.users;").stdout.strip(), "1")

    def test_explicit_touch_and_transactional_probe(self):
        self.assertEqual(self.login().returncode, 0)
        result = self.sql("SELECT aoe2war_auth_v1.touch_session('u_" + "1" * 32 + "','fixture@example.invalid');", "aoe2war_web_prod")
        self.assertEqual(result.stdout.strip(), "t")
        self.assertEqual(self.sql("SELECT email FROM public.users;").stdout.strip(), "fixture@example.invalid")
        result = self.sql("BEGIN; SELECT aoe2war_auth_v1.touch_session('u_" + "1" * 32 + "','rolled-back@example.invalid'); ROLLBACK;", "aoe2war_web_prod")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.sql("SELECT email FROM public.users;").stdout.strip(), "fixture@example.invalid")
        self.assertEqual(self.sql("SELECT aoe2war_auth_v1.touch_session('absent',NULL);", "aoe2war_web_prod").stdout.strip(), "f")

    def test_runtime_cannot_write_tables_escalate_roles_or_create_objects(self):
        for statement in (
            "SELECT * FROM public.users LIMIT 0;",
            "SELECT token FROM public.users LIMIT 0;",
            "SELECT email FROM public.users LIMIT 0;",
            "SELECT is_admin FROM public.users LIMIT 0;",
            "SELECT can_review_own_replay_results FROM public.users LIMIT 0;",
            "SELECT wallet_address FROM public.users LIMIT 0;",
            "SELECT * FROM public.pending_wolo_claims LIMIT 0;",
            "UPDATE public.users SET is_admin=true WHERE false;",
            "UPDATE public.users SET wallet_address='forbidden' WHERE false;",
            "UPDATE public.users SET steam_id='76561198000000001' WHERE false;",
            "INSERT INTO public.users(uid,is_admin) VALUES ('forbidden',true);",
            "UPDATE public.pending_wolo_claims SET amount=0 WHERE false;",
            "DELETE FROM public.pending_wolo_claims WHERE false;",
            "INSERT INTO aoe2war_auth_v1.steam_nonces(nonce_sha256) VALUES ('forbidden');",
            "SET ROLE aoe2war_auth_owner;",
            "CREATE TABLE public.forbidden(id integer);",
        ):
            with self.subTest(statement=statement):
                result = self.sql(statement, "aoe2war_web_prod", check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("permission denied", result.stderr)

    def test_public_function_access_and_unreviewed_definer_admission_denied(self):
        result = self.sql("SELECT aoe2war_auth_v1.touch_session('fixture',NULL);", "ordinary_fixture", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.sql("CREATE FUNCTION public.fixture_financial_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';")
        try:
            result = self.sql("BEGIN;\n" + SQL.read_text() + "\nROLLBACK;", check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("AUTH_UNREVIEWED_DEFINER_AUTHORITY", result.stderr)
        finally:
            self.sql("DROP FUNCTION public.fixture_financial_definer();")

    def test_exact_sql_login_session_profile_pipeline_under_real_web_role(self):
        # No SELECT privilege is added by the fixture. The actual TS handlers,
        # JWT verification and scoped SQL execute as a real LOGIN role.
        for admin in (False, True):
            if admin:
                self.sql("UPDATE public.users SET is_admin=true,verified=true,wallet_address='existing-public-wallet',token='fixture-private-token',verification_level=3,verification_method='watcher';")
                before_id = self.sql("SELECT id FROM public.users;").stdout
            result = subprocess.run([shutil.which("node"), "--experimental-strip-types", "--test",
                "--test-name-pattern=native PostgreSQL", "tests/nonfinancial-production-auth.test.mts"],
                cwd=ROOT, capture_output=True, text=True, timeout=60,
                env={**os.environ, "AOE2WAR_AUTH_PG_SOCKET": str(self.socket),
                    "AOE2WAR_AUTH_PSQL": str(PG_BIN / "psql"),
                    "AOE2WAR_AUTH_PG_EXPECT_ADMIN": "1" if admin else "0"})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("native PostgreSQL", result.stdout)
            self.assertEqual(self.sql("SELECT has_table_privilege('aoe2war_web_prod','public.users','SELECT'),has_column_privilege('aoe2war_web_prod','public.users','token','SELECT');").stdout.strip(), "f|f")
            if admin:
                self.assertEqual(self.sql("SELECT id FROM public.users;").stdout, before_id)
                self.assertEqual(self.sql("SELECT token,verified,verification_level,verification_method,wallet_address FROM public.users;").stdout.strip(),
                    "fixture-private-token|t|3|watcher|existing-public-wallet")

    def test_projection_has_exact_one_identity_and_no_token_or_financial_columns(self):
        self.sql("INSERT INTO public.users(uid,is_admin,verified,wallet_address,token) VALUES ('admin-existing',true,true,'public-own-wallet','SECRET-NEVER-PROJECT');")
        result = self.sql("SELECT row_to_json(u) FROM aoe2war_auth_v1.read_user('admin-existing') u;", "aoe2war_web_prod")
        import json
        user = json.loads(result.stdout.strip())
        self.assertTrue(user["isAdmin"])
        self.assertTrue(user["verified"])
        self.assertEqual(user["walletAddress"], "public-own-wallet")
        self.assertNotIn("token", user)
        self.assertNotIn("balance", user)
        self.assertNotIn("SECRET-NEVER-PROJECT", result.stdout)
        self.assertEqual(self.sql("SELECT id,uid,in_game_name,steam_id FROM public.users LIMIT 0;", "aoe2war_web_prod").returncode, 0)
        self.assertEqual(self.sql("SELECT count(*) FROM aoe2war_auth_v1.read_user('missing');", "aoe2war_web_prod").stdout.strip(), "0")
        for uid in ("NULL", "''", "repeat('x',101)"):
            self.assertNotEqual(self.sql("SELECT * FROM aoe2war_auth_v1.read_user(" + uid + ");", "aoe2war_web_prod", check=False).returncode, 0)
        self.assertNotEqual(self.sql("SELECT * FROM aoe2war_auth_v1.read_user('admin-existing');", "ordinary_fixture", check=False).returncode, 0)

    def test_unsafe_public_schema_create_is_rejected(self):
        self.sql("GRANT CREATE ON SCHEMA public TO PUBLIC;")
        try:
            result = self.sql("BEGIN;\n" + SQL.read_text() + "\nROLLBACK;", check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("AUTH_RUNTIME_SCHEMA_CREATE_AUTHORITY", result.stderr)
        finally:
            self.sql("REVOKE CREATE ON SCHEMA public FROM PUBLIC;")

    def test_persisted_public_game_reads_work_without_secret_or_financial_authority(self):
        result = self.sql("SELECT id,winner FROM public.game_stats;", "aoe2war_web_prod")
        self.assertEqual(result.stdout.strip(), "1|Actual persisted fixture winner")
        for statement in (
            "UPDATE public.game_stats SET winner='forbidden' WHERE false;",
            "INSERT INTO public.game_stats VALUES (2,'forbidden');",
            "SELECT * FROM public.api_keys LIMIT 0;",
            "SELECT * FROM public.pending_wolo_claims LIMIT 0;",
            "SELECT * FROM public.war_satchel_ledger_postings LIMIT 0;",
        ):
            with self.subTest(statement=statement):
                result = self.sql(statement, "aoe2war_web_prod", check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("permission denied", result.stderr)


if __name__ == "__main__":
    unittest.main()
