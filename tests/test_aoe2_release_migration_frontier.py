"""Adversarial offline tests for the read-only production migration preflight."""
import importlib.util
import io
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location(
    "aoe2_release_migration_frontier", SCRIPTS / "aoe2_release_migration_frontier.py"
)
FRONTIER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(FRONTIER)

SHIP_SPEC = importlib.util.spec_from_file_location(
    "aoe2_release_ship_frontier_test", SCRIPTS / "aoe2_release_ship.py"
)
SHIP = importlib.util.module_from_spec(SHIP_SPEC)
assert SHIP_SPEC and SHIP_SPEC.loader
SHIP_SPEC.loader.exec_module(SHIP)


def path(name):
    return f"prisma/migrations/{name}/migration.sql"


class SourceAndFrontierTests(unittest.TestCase):
    def setUp(self):
        self.sources = {"first": "a" * 64, "second": "b" * 64}
        self.rows = [["first", "a" * 64, "A"]]

    def test_exact_pending_sealed_is_only_structurally_eligible(self):
        result = FRONTIER.compare_frontier(self.sources, self.rows, [path("second")])
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["pending"], ["second"])
        self.assertFalse(result["execution_authorized"])

    def test_historical_pending_outside_new_manifest_blocks(self):
        names = ["20261014_103500_old", "20261014_133000_old",
                 "20261014_150000_old", "20261014_164500_old",
                 "20261014_191500_old", "20261015_151500_new"]
        source = {"earlier": "a" * 64, **{n: "b" * 64 for n in names}}
        result = FRONTIER.compare_frontier(
            source, [["earlier", "a" * 64, "A"]],
            [path("20261015_151500_new")],
        )
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(len(result["pending_outside_manifest"]), 5)
        self.assertIn("outside sealed manifest", " ".join(result["errors"]))
        self.assertFalse(result["execution_authorized"])

    def test_applied_checksum_drift_blocks(self):
        result = FRONTIER.compare_frontier(
            self.sources, [["first", "c" * 64, "A"]],
            [path("second")]
        )
        self.assertIn("checksum mismatch", " ".join(result["errors"]))

    def test_foreign_completed_migration_blocks(self):
        result = FRONTIER.compare_frontier(
            self.sources,
            self.rows + [["foreign", "f" * 64, "A"]],
            [path("second")],
        )
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("absent from release source", " ".join(result["errors"]))

    def test_duplicate_successful_rows_blocks(self):
        result = FRONTIER.compare_frontier(
            self.sources, self.rows + self.rows, [path("second")]
        )
        self.assertIn("duplicate successful", " ".join(result["errors"]))

    def test_unfinished_migration_blocks(self):
        result = FRONTIER.compare_frontier(
            self.sources, self.rows + [["second", "b" * 64, "U"]],
            [path("second")],
        )
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("unfinished", " ".join(result["errors"]))

    def test_historical_rolledback_record_is_preserved_not_counted(self):
        result = FRONTIER.compare_frontier(
            self.sources, self.rows + [["earlier_rolledback", "c" * 64, "R"]],
            [path("second")],
        )
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["rolled_back_count"], 1)

    def test_duplicate_manifest_and_unknown_manifest_blocks(self):
        result = FRONTIER.compare_frontier(
            self.sources, self.rows,
            [path("second"), path("second"), path("unknown")],
        )
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("duplicate migration", " ".join(result["errors"]))
        self.assertIn("absent from source", " ".join(result["errors"]))

    def test_malformed_records_fail_closed(self):
        for records in (
            "not-a-list", [["first", "a" * 64]], [["first", "g" * 64, "A"]],
            [["first", "a" * 64, "BOGUS"]], [["first|injected", "a" * 64, "A"]],
            [["first", 42, "A"]],
        ):
            with self.subTest(records=records):
                with self.assertRaises(FRONTIER.MigrationFrontierError):
                    FRONTIER.compare_frontier(self.sources, records, [path("second")])

    def test_sources_reject_symlinks_and_missing_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            migration = root / "prisma" / "migrations"
            migration.mkdir(parents=True)
            with self.assertRaises(FRONTIER.MigrationFrontierError):
                FRONTIER.migration_sources(root)
            (migration / "one").mkdir()
            (migration / "one" / "migration.sql").write_text("SELECT 1;\n")
            self.assertEqual(len(FRONTIER.migration_sources(root)), 1)
            (migration / "two").mkdir()
            (migration / "two" / "migration.sql").symlink_to(
                migration / "one" / "migration.sql"
            )
            with self.assertRaises(FRONTIER.MigrationFrontierError):
                FRONTIER.migration_sources(root)

    def test_remote_read_only_probe_requires_correct_identity(self):
        class Result:
            returncode = 0
            stdout = '{"schema": 1, "kind": "wrong", "records": []}'
        with mock.patch.object(FRONTIER.subprocess, "run", return_value=Result()):
            with self.assertRaises(FRONTIER.MigrationFrontierError):
                FRONTIER.production_records("hel1", "/var/www/test")

    def test_remote_probe_never_leaks_error_stderr(self):
        class Result:
            returncode = 31
            stderr = "PGPASSWORD=sensitive-secret"
        with mock.patch.object(FRONTIER.subprocess, "run", return_value=Result()):
            with self.assertRaises(FRONTIER.MigrationFrontierError) as context:
                FRONTIER.production_records("hel1", "/var/www/test")
        self.assertNotIn("sensitive-secret", str(context.exception))

    def test_remote_probe_uses_noninteractive_ssh_and_readonly_sql(self):
        self.assertIn("TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
                      FRONTIER.REMOTE_READ_ONLY_PROBE)
        self.assertIn("default_transaction_read_only=on", FRONTIER.REMOTE_READ_ONLY_PROBE)
        self.assertNotIn("sudo", FRONTIER.REMOTE_READ_ONLY_PROBE)
        class Result:
            returncode = 0
            stdout = '{"schema":1,"kind":"prisma-read-only-frontier","records":[]}'
        with mock.patch.object(FRONTIER.subprocess, "run", return_value=Result()) as run:
            self.assertEqual(FRONTIER.production_records("hel1", "/var/www/test"), [])
        self.assertIn("BatchMode=yes", run.call_args.args[0])


class ShipPlannerFrontierTests(unittest.TestCase):
    def setUp(self):
        self.release = "b" * 40
        self.manifest = {
            "release_sha": self.release,
            "migration_paths": [path("sixth")],
            "risk_class": "DATABASE",
        }
        self.data = {"local": {"head": self.release}}

    def _run_ship(self, frontier, migration_contract=None):
        import aoe2_release_migration_frontier
        import aoe2_release_auto
        if migration_contract is None:
            migration_contract = (self.manifest, ["sixth"])
        stream = io.StringIO()
        with (
            mock.patch.object(SHIP, "load_manifest",
                return_value=(pathlib.Path("/tmp/test-manifest"), self.manifest, "1" * 64)),
            mock.patch.object(SHIP, "gate_integrity",
                return_value=(pathlib.Path("/tmp/test-gate"), "2" * 64)),
            mock.patch.object(SHIP, "production_transport",
                return_value=({}, None)),
            mock.patch.object(SHIP, "validation_errors",
                return_value=[]),
            mock.patch.object(aoe2_release_migration_frontier,
                "inspect_release_frontier", return_value=frontier),
            mock.patch.object(aoe2_release_auto,
                "migration_contract", return_value=migration_contract),
            mock.patch.object(SHIP, "build_plan") as build_plan,
            redirect_stdout(stream),
        ):
            rc = SHIP.ship_release(self.data, dry_run=True)
        return rc, stream.getvalue(), build_plan.called

    def test_ship_preflight_rejects_five_historical_pending(self):
        frontier = {
            "source_count": 118,
            "completed_count": 112,
            "pending": ["first", "second", "third", "fourth", "fifth", "sixth"],
            "errors": ["pending migrations outside sealed manifest: first, second, third, fourth, fifth"],
        }
        rc, output, planned = self._run_ship(frontier)
        self.assertEqual(rc, 2)
        self.assertIn("first, second, third, fourth, fifth", output)
        self.assertIn("No migrations were applied", output)
        self.assertFalse(planned)

    def test_ship_preflight_rejects_sql_policy_even_when_frontier_exact(self):
        import aoe2_release_auto
        frontier = {
            "source_count": 118, "completed_count": 117,
            "pending": ["sixth"], "errors": [],
        }
        with mock.patch.object(aoe2_release_auto, "migration_contract",
              side_effect=aoe2_release_auto.AutoShipError(
                  "migration contract rejects destructive SQL (CREATE OR REPLACE)"
              )):
            # Exercise the same guard without allowing any remote mutation.
            with (
                mock.patch.object(SHIP, "load_manifest",
                    return_value=(pathlib.Path("/tmp/test-manifest"), self.manifest, "1" * 64)),
                mock.patch.object(SHIP, "gate_integrity",
                    return_value=(pathlib.Path("/tmp/test-gate"), "2" * 64)),
                mock.patch.object(SHIP, "production_transport", return_value=({}, None)),
                mock.patch.object(SHIP, "validation_errors", return_value=[]),
                mock.patch.object(sys.modules["aoe2_release_migration_frontier"],
                    "inspect_release_frontier", return_value=frontier),
                mock.patch.object(SHIP, "build_plan") as plan,
                redirect_stdout(io.StringIO()) as output,
            ):
                rc = SHIP.ship_release(self.data, dry_run=True)
        self.assertEqual(rc, 2)
        self.assertIn("CREATE OR REPLACE", output.getvalue())
        plan.assert_not_called()


if __name__ == "__main__":
    unittest.main()
