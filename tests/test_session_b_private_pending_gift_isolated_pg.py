"""Opt-in isolated PostgreSQL 16 test of the EXACT public pending-gift SQL view.

Run: RUN_PUBLIC_GIFT_CONSENT_PG_TESTS=1 python3 -B -m unittest
  tests/test_session_b_private_pending_gift_isolated_pg.py -v

No live DB connection, host listener, Chain service, WAL backup, or grant changes.
The only role, view and synthetic records exist inside a disposable private
Unix-socket-only PostgreSQL instance. Skipped unless deliberately enrolled.
"""
from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "config/nonfinancial-public-read-model-v1.sql"


@unittest.skipUnless(
    os.environ.get("RUN_PUBLIC_GIFT_CONSENT_PG_TESTS") == "1",
    "private isolated PostgreSQL fixture requires explicit local opt-in",
)
class PrivateGiftPostgresAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0:
            raise RuntimeError("HOLD_ISOLATED_TEST_MUST_NOT_RUN_AS_ROOT")
        cls.binary = {}
        for name in ("initdb", "pg_ctl", "psql"):
            binary = shutil.which(name)
            if not binary:
                raise RuntimeError("HOLD_ISOLATED_POSTGRES_BINARY_MISSING:" + name)
            cls.binary[name] = binary
        cls.temp = tempfile.TemporaryDirectory(prefix="aoe2war-b-gift-", dir="/tmp")
        cls.base = Path(cls.temp.name)
        cls.data = cls.base / "pg"
        cls.socket = cls.base / "s"
        cls.socket.mkdir(mode=0o700)
        cls.port = 53783
        cls.started = False
        try:
            subprocess.run([
                cls.binary["initdb"], "-D", str(cls.data),
                "--auth-local=trust", "--no-instructions", "--no-sync"
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
            subprocess.run([
                cls.binary["pg_ctl"], "-D", str(cls.data), "-l",
                str(cls.base / "postgres.log"),
                "-o", "-c listen_addresses= -k " + str(cls.socket) + " -p " + str(cls.port),
                "-w", "start"
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
            cls.started = True
            source = MODEL.read_text()
            match = re.search(
                r"(CREATE OR REPLACE VIEW aoe2war_public_v1\.pending_player_gift_totals\s+"
                r"WITH \(security_barrier=true\) AS\s+[\s\S]*?GROUP BY user_id;)", source
            )
            if not match:
                raise RuntimeError("HOLD_EXACT_PUBLIC_VIEW_SOURCE_MISSING")
            cls.view_sql = match.group(1)
            schema = """
                CREATE ROLE aoe2war_web_prod NOLOGIN;
                CREATE SCHEMA aoe2war_public_v1;
                REVOKE ALL ON SCHEMA aoe2war_public_v1 FROM PUBLIC;
                GRANT USAGE ON SCHEMA aoe2war_public_v1 TO aoe2war_web_prod;
                CREATE TABLE public.user_gifts (
                    user_id integer NOT NULL,
                    kind text NOT NULL,
                    status text NOT NULL,
                    amount bigint NOT NULL,
                    display_on_profile boolean
                );
                REVOKE ALL ON public.user_gifts FROM PUBLIC,aoe2war_web_prod;
                INSERT INTO public.user_gifts VALUES
                  (11,'WOLO','pending',100000,true),
                  (11,'WOLO','pending',100,false),
                  (11,'WOLO','pending',75,null),
                  (11,'WOLO','accepted',55,true),
                  (11,'BADGE','pending',45,true),
                  (12,'WOLO','pending',200,true),
                  (13,'WOLO','pending',40,false);
            """ + cls.view_sql + """
                REVOKE ALL ON aoe2war_public_v1.pending_player_gift_totals
                    FROM PUBLIC,aoe2war_web_prod;
                GRANT SELECT ON aoe2war_public_v1.pending_player_gift_totals
                    TO aoe2war_web_prod;
            """
            cls.sql(schema)
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "started", False):
            subprocess.run([
                cls.binary["pg_ctl"], "-D", str(cls.data), "-m", "immediate",
                "-w", "stop"
            ], capture_output=True, text=True, timeout=20, check=False)
            cls.started = False
        if hasattr(cls, "temp"):
            cls.temp.cleanup()

    @classmethod
    def sql(cls, text: str, *, expect_success: bool = True) -> subprocess.CompletedProcess[str]:
        r = subprocess.run([
            cls.binary["psql"], "-X", "-q", "-A", "-t", "-F", "|",
            "-h", str(cls.socket), "-p", str(cls.port),
            "-U", os.environ.get("USER") or subprocess.check_output(["id", "-un"], text=True).strip(),
            "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", text,
        ], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        if expect_success and r.returncode != 0:
            raise AssertionError("HOLD_ISOLATED_PG_SQL_" + r.stderr[:350])
        if not expect_success and r.returncode == 0:
            raise AssertionError("HOLD_RESTRICTED_ROLE_DID_NOT_DENY_SQL")
        return r

    def test_public_consent_true_only_and_no_hidden_only_user(self):
        r = self.sql("""
          SET ROLE aoe2war_web_prod;
          SELECT user_id,pending_count,pending_amount
          FROM aoe2war_public_v1.pending_player_gift_totals ORDER BY user_id;
        """)
        rows = [line for line in r.stdout.strip().splitlines() if line]
        self.assertEqual(rows, ["11|1|100000", "12|1|200"])
        self.assertTrue(all("75" not in line and "100|" not in line for line in rows))

    def test_hidden_gifts_still_exist_in_base_storage(self):
        r = self.sql("""
          SELECT user_id,amount,COALESCE(display_on_profile::text,'null')
          FROM public.user_gifts
          WHERE status='pending' AND display_on_profile IS NOT TRUE
          ORDER BY user_id,amount;
        """)
        self.assertEqual(r.stdout.strip().splitlines(), [
            "11|75|null", "11|100|false", "13|40|false",
        ])

    def test_restricted_role_cannot_read_raw_private_gifts(self):
        r = self.sql("SET ROLE aoe2war_web_prod; SELECT * FROM public.user_gifts;", expect_success=False)
        self.assertIn("permission denied", r.stderr.lower())

    def test_restricted_role_cannot_mutate_raw_gifts(self):
        for statement in (
            "UPDATE public.user_gifts SET amount=0 WHERE user_id=11",
            "DELETE FROM public.user_gifts WHERE user_id=11",
            "INSERT INTO public.user_gifts VALUES (11,'WOLO','pending',1,true)",
        ):
            with self.subTest(statement=statement.split()[0]):
                r = self.sql("SET ROLE aoe2war_web_prod; " + statement + ";", expect_success=False)
                self.assertIn("permission denied", r.stderr.lower())

    def test_restricted_role_cannot_mutate_projection(self):
        r = self.sql(
            "SET ROLE aoe2war_web_prod; "
            "UPDATE aoe2war_public_v1.pending_player_gift_totals SET pending_amount=1;",
            expect_success=False,
        )
        self.assertTrue("cannot update view" in r.stderr.lower() or
                        "permission denied" in r.stderr.lower())

    def test_view_is_explicitly_security_barrier(self):
        r = self.sql("""
          SELECT reloptions::text FROM pg_class
          WHERE oid='aoe2war_public_v1.pending_player_gift_totals'::regclass;
        """)
        self.assertIn("security_barrier=true", r.stdout)

    def test_no_fixture_visitor_or_financial_movement(self):
        r = self.sql("SELECT count(*),sum(amount) FROM public.user_gifts;")
        self.assertEqual(r.stdout.strip(), "7|100515")


if __name__ == "__main__":
    unittest.main()
