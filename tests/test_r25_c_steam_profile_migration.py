"""Nonfinancial A05 Steam profile migration: exact field and no-replay tests."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "a05_steam_migrator", ROOT / "scripts/r25_c_migrate_steam_snapshot_root.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def policy():
    return {
        "schema": "aoe2war.app.approved-production-profile.v1",
        "profile": "nonfinancial-production-v1",
        "source_sha": m.APP_SHA,
        "port": 3032,
        "uid": 990,
        "unit": "aoe2hdbets-web-prod.service",
        "controller_sha256": m.OLD_CONTROLLER,
        "protected_snapshot_sha256": m.OLD_PROTECTED,
        "artifact": {"immutable": "wolo-protected"},
        "financial_authorized": False,
        "public_cutover_authorized": False,
        "steam_addresses": ["203.0.113.42"],
    }

class MigrationTests(unittest.TestCase):
    def test_policy_mutates_exactly_two_root_control_fields(self):
        baseline = policy()
        before = copy.deepcopy(baseline)
        raw = m.calculate_policy(baseline, m.NEW_PROTECTED)
        result = json.loads(raw)
        self.assertEqual(baseline, before)
        self.assertTrue(raw.endswith(b"\n"))
        self.assertEqual(set(baseline), set(result))
        self.assertEqual({k for k in baseline if baseline[k] != result[k]},
                         {"controller_sha256", "protected_snapshot_sha256"})
        self.assertEqual(result["controller_sha256"], m.NEW_CONTROLLER)
        self.assertEqual(result["protected_snapshot_sha256"], m.NEW_PROTECTED)
        self.assertEqual(result["artifact"], baseline["artifact"])
        self.assertIs(result["financial_authorized"], False)
        self.assertIs(result["public_cutover_authorized"], False)

    def test_wrong_source_or_protected_baseline_refuses(self):
        for key, value in [("schema", "unexpected"), ("profile", "funded"),
                           ("source_sha", "e" * 40), ("port", 3030),
                           ("uid", 1000), ("unit", "other.service"),
                           ("controller_sha256", "f" * 64),
                           ("protected_snapshot_sha256", "f" * 64)]:
            baseline = policy()
            baseline[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(m.Hold, "EXACT_NONFINANCIAL_POLICY_REQUIRED"):
                m.calculate_policy(baseline, m.NEW_PROTECTED)

    def test_root_files_exclusive_create_and_exact_byte_replace(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "policy.json"
            first = b'{"policy":"old"}\n'
            second = b'{"policy":"new"}\n'
            m.write_exact(dest, first, 0o400)
            with self.assertRaises(FileExistsError):
                m.write_exact(dest, second, 0o400)
            m.swapped(dest, second, 0o400, "d" * 32)
            self.assertEqual(dest.read_bytes(), second)
            self.assertEqual(dest.stat().st_mode & 0o777, 0o400)
            self.assertEqual(list(Path(temp).iterdir()), [dest])

    def test_authenticated_grant_rejects_financial_or_cutover(self):
        expected = {"schema": "aoe2war.app.steam-profile-migration-grant.v1",
                    "nonce": "a" * 32, "scope": "STEAM_PROFILE_CONTROLLER_ONLY",
                    "script_sha256": "b" * 64,
                    "old_policy_sha256": m.OLD_POLICY,
                    "old_controller_sha256": m.OLD_CONTROLLER,
                    "new_controller_sha256": m.NEW_CONTROLLER,
                    "source_ref": m.NEW_REF, "migration_ref": "c" * 40, "financial_authorized": False,
                    "public_cutover_authorized": False,
                    "delegated_ai_authorship_disclosed": True,
                    "max_uses": 1,
                    "issued_at": "2026-11-03T18:00:00Z",
                    "expires_at": "2026-11-03T18:10:00Z"}
        doc = {"id": 33, "issue_url": m.ISSUE_URL,
               "user": {"login": "Emaren", "id": 15059910},
               "body": "AOE2WAR_A05_STEAM_SNAPSHOT_MIGRATION\n" + json.dumps(expected)}
        from datetime import datetime, timezone
        with mock.patch.object(m, "github", return_value=doc):
            with mock.patch.object(m.datetime, "datetime", wraps=datetime) as mocked:
                mocked.now.return_value = datetime(2026, 11, 3, 18, 5, tzinfo=timezone.utc)
                self.assertEqual(m.grant(33, "a" * 32, "b" * 64, "c" * 40)["max_uses"], 1)
                for key in ("financial_authorized", "public_cutover_authorized"):
                    mutant = copy.deepcopy(doc)
                    decoded = copy.deepcopy(expected)
                    decoded[key] = True
                    mutant["body"] = "AOE2WAR_A05_STEAM_SNAPSHOT_MIGRATION\n" + json.dumps(decoded)
                    with mock.patch.object(m, "github", return_value=mutant), self.assertRaisesRegex(m.Hold, "GRANT_FIELD_DRIFT"):
                        m.grant(33, "a" * 32, "b" * 64, "c" * 40)

if __name__ == "__main__":
    unittest.main()
