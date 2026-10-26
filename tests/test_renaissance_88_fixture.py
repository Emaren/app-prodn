"""Fail closed on any fixture leak into a real PostgreSQL or financial DB."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
class DisposablePgContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shell=(ROOT/"scripts/renaissance_88_pg_fixture.sh").read_text()
        cls.workflow=(ROOT/".github/workflows/renaissance-88-factory.yml").read_text()
        cls.chrome=(ROOT/"scripts/renaissance_88_browser.cjs").read_text()
    def test_requires_unique_scratch_dir_and_literal_fixture_opt_in(self):
        self.assertIn("RENAISSANCE_88_FIXTURE_ALLOWED",self.shell)
        self.assertIn('"$RUNNER_TEMP"/renaissance88-*',self.shell)
        self.assertIn('[[ ! -e "$DATA" ]]',self.shell)
        self.assertIn('pg_isready',self.shell)
        self.assertIn('127.0.0.1',self.shell)
        self.assertNotIn("--auth-host=reject",self.shell) # explicit isolated loopback
    def test_only_documented_custom_sequence_is_bootstrapped(self):
        schema=(ROOT/"prisma/schema.prisma").read_text()
        self.assertEqual(schema.count("dbgenerated(\"nextval("),1)
        self.assertIn("battle_public_number_seq",schema)
        self.assertIn("CREATE SEQUENCE public.battle_public_number_seq",self.shell)
        self.assertIn("brand-new test database",self.shell)
    def test_readonly_role_and_denied_write_probe(self):
        self.assertIn("renaissance_reader",self.shell)
        self.assertIn("default_transaction_read_only=on",self.shell)
        self.assertIn("GRANT SELECT ON ALL TABLES",self.shell)
        self.assertIn("must_not_write",self.shell)
        self.assertIn('if psql "$READER_URL"',self.shell)
        self.assertIn('[[ "$(psql "$READER_URL"',self.shell)
        self.assertIn("INSERT INTO users(uid,in_game_name,verified,is_admin,created_at)",self.shell)
        self.assertNotIn("INSERT INTO bets",self.shell.lower())
    def test_checksum_before_and_after_and_cleanup(self):
        for word in ("pg_dump","sha256sum","before.sha256","snapshot|verify","stop)",
                     "--restrict-key=Renaissance88FixtureDigest",
                     "immediate-repeat.sql","fixture dump is nondeterministic"):
            self.assertIn(word,self.shell)
        self.assertIn("bash scripts/renaissance_88_pg_fixture.sh verify",self.workflow)
        self.assertIn("bash scripts/renaissance_88_pg_fixture.sh stop",self.workflow)
    def test_source_and_runtime_match_literal_readonly_url(self):
        url="postgresql://renaissance_reader:local_fixture_only@127.0.0.1:55437/renaissance88"
        self.assertIn(url,self.shell)
        self.assertIn(url,self.workflow)
        self.assertIn(url,self.chrome)
        self.assertIn("before.sha256",self.chrome)
        self.assertIn("DATABASE_URL",self.chrome)
    def test_api_source_writes_must_not_be_exposed_as_authorized_get(self):
        policy=(ROOT/"scripts/renaissance_88_api_policy.cjs").read_text()
        self.assertNotIn('"/api/header-summary",',policy)
        self.assertNotIn('"/api/wolo/status",',policy)
        self.assertIn("SYNTHETIC_UNAVAILABLE",policy)
if __name__=="__main__":
    unittest.main()
