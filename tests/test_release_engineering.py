import fcntl
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def state_data(*, local="a", github="a", prod="a", dirty=0, prod_dirty=0,
               reachable=True, staged=None, service="active", active="build",
               parity=True, docs_valid=True, w8092=1, w8093=1):
    return {
        "local": {"dirty_count": dirty, "head": local},
        "github": {"main_sha": github},
        "documentation": {"baseline_is_ancestor_of_local": docs_valid},
        "production": {
            "reachable": reachable,
            "source_sha": prod,
            "dirty_count": prod_dirty,
            "staged_build_id": staged,
            "service": service,
            "active_build_id": active,
            "version_parity": parity,
            "wolo_8092_count": w8092,
            "wolo_8093_count": w8093,
        },
        "certification": {"status": "legacy-unmanifested", "release_sha": None},
    }


class ReleaseEngineeringTests(unittest.TestCase):
    def test_run_preserves_leading_stdout_space(self):
        rc, out, _ = MODULE.run(
            ["python3", "-c", "import sys; sys.stdout.write(\" M file\\n\")"]
        )
        self.assertEqual(rc, 0)
        self.assertEqual(out, " M file")


    def test_docs_baseline_accepts_generated_branch_label(self):
        sha = "804cd13399c70e7f248c6e83beee425b92f242cd"
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            docs = root / "docs"
            docs.mkdir()
            (docs / "DOCUMENTATION_CONTROL_PLANE.md").write_text(
                f"Implementation baseline: `hotfix/client-flight-recorder-20260811` at `{sha}`\n",
                encoding="utf-8",
            )
            with patch.object(MODULE, "ROOT", root):
                self.assertEqual(MODULE.docs_baseline(), sha)

    def test_parse_kv(self):
        self.assertEqual(MODULE.parse_kv("head\tabc\nservice\tactive\n"), {"head": "abc", "service": "active"})

    def test_version_value(self):
        self.assertEqual(MODULE.version_value('{"buildVersion":"20260809-test"}'), "20260809-test")

    def test_dirty_paths_handles_rename(self):
        self.assertEqual(MODULE.dirty_paths([" M app/a.ts", "R  old.ts -> new.ts"]), ["app/a.ts", "new.ts"])

    def test_derive_state_dirty_wins(self):
        self.assertEqual(MODULE.derive_state(state_data(dirty=1))[0], "DIRTY")

    def test_derive_state_docs_invalid(self):
        self.assertEqual(MODULE.derive_state(state_data(docs_valid=False))[0], "DOCS_INVALID")

    def test_derive_state_diverged(self):
        self.assertEqual(MODULE.derive_state(state_data(local="b", github="a"))[0], "DIVERGED")

    def test_derive_state_production_dirty(self):
        self.assertEqual(MODULE.derive_state(state_data(prod_dirty=2))[0], "PRODUCTION_DIRTY")

    def test_derive_state_published(self):
        self.assertEqual(MODULE.derive_state(state_data(prod="old"))[0], "PUBLISHED")

    def test_derive_state_staged(self):
        self.assertEqual(MODULE.derive_state(state_data(staged="candidate"))[0], "STAGED")

    def test_derive_state_staged_wins_before_source_parity(self):
        state, nxt = MODULE.derive_state(
            state_data(local="new", github="new", prod="previous", staged="candidate")
        )
        self.assertEqual(state, "STAGED")
        self.assertIn("previous live source", nxt)
        self.assertIn("aoe2war deploy", nxt)

    def test_derive_state_runtime_unhealthy(self):
        self.assertEqual(MODULE.derive_state(state_data(service="failed"))[0], "RUNTIME_UNHEALTHY")

    def test_derive_state_runtime_unverified(self):
        self.assertEqual(MODULE.derive_state(state_data(parity=False))[0], "RUNTIME_UNVERIFIED")

    def test_derive_state_protected_service_alert(self):
        self.assertEqual(MODULE.derive_state(state_data(w8092=0))[0], "PROTECTED_SERVICE_ALERT")

    def test_derive_state_active_source_parity(self):
        self.assertEqual(MODULE.derive_state(state_data())[0], "ACTIVE_SOURCE_PARITY")

    def test_derive_state_certified(self):
        data = state_data()
        data["certification"] = {"status": "CERTIFIED", "release_sha": "a"}
        self.assertEqual(MODULE.derive_state(data)[0], "CERTIFIED")

    def test_published_state_preserves_certified_runtime_truth(self):
        data = state_data(prod="old")
        data["certification"] = {"status": "CERTIFIED", "release_sha": "old"}
        state, nxt = MODULE.derive_state(data)
        self.assertEqual(state, "PUBLISHED")
        self.assertIn("CERTIFIED", nxt)


    def test_deployment_lock_blocks_second_mutating_command(self):
        with tempfile.TemporaryDirectory() as temp:
            lock_path = pathlib.Path(temp) / "deploy.lock"
            with lock_path.open("a+", encoding="utf-8") as handle:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(MODULE.DeployLockBusy):
                    with MODULE.deployment_lock(lock_path):
                        pass

    def test_canonical_local_lease_blocks_another_holder(self):
        with tempfile.TemporaryDirectory() as temp:
            lock_path = pathlib.Path(temp) / "release.lock"
            with MODULE.local_global_release_lease(lock_path, "first"):
                with self.assertRaises(MODULE.DeployLockBusy):
                    with MODULE.local_global_release_lease(lock_path, "second"):
                        pass
            self.assertFalse(lock_path.with_suffix(".lock.meta").exists())

    def test_inherited_lease_requires_owner_or_parent_pid(self):
        values = {
            MODULE.GLOBAL_LEASE_ENV: "lease-token",
            MODULE.GLOBAL_LEASE_OWNER_ENV: str(os.getpid()),
        }
        with patch.dict(os.environ, values, clear=False):
            self.assertTrue(MODULE.inherited_global_lease())
            os.environ[MODULE.GLOBAL_LEASE_OWNER_ENV] = "99999999"
            self.assertFalse(MODULE.inherited_global_lease())

    def test_release_history_reads_only_certified_activation_receipts(self):
        original = MODULE.ACTIVATION_RECEIPT_DIR
        MODULE.STATE_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=MODULE.STATE_DIR) as temp:
            receipt_dir = pathlib.Path(temp)
            MODULE.ACTIVATION_RECEIPT_DIR = receipt_dir
            try:
                certified = {
                    "schema": 1,
                    "kind": "aoe2war-activation-result",
                    "status": "CERTIFIED",
                    "generated_at": "2026-08-10T03:00:00Z",
                    "release_sha": "a" * 40,
                    "previous_production_sha": "b" * 40,
                    "risk_class": "INFRASTRUCTURE",
                    "active_build_id": "build-new",
                    "candidate_build_version": "version-new",
                    "fast_rollback": ".next-rollback-test",
                    "durable_rollback": "/durable/test",
                }
                (receipt_dir / "good.json").write_text(
                    json.dumps(certified), encoding="utf-8"
                )
                rejected = dict(certified, status="FAILED")
                (receipt_dir / "bad.json").write_text(
                    json.dumps(rejected), encoding="utf-8"
                )
                history = MODULE.release_history(limit=10)
                self.assertEqual(len(history), 1)
                self.assertEqual(history[0]["release_sha"], "a" * 40)
                self.assertEqual(history[0]["active_build_id"], "build-new")
            finally:
                MODULE.ACTIVATION_RECEIPT_DIR = original

if __name__ == "__main__":
    unittest.main()
