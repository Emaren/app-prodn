from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_update.py"
if str(SCRIPT.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("aoe2_update_atomic", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def command(repo, *args):
    return subprocess.check_output(["git", *args], cwd=repo, text=True, stderr=subprocess.STDOUT).strip()


class AtomicFederationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.source = self.create_repository(self.workspace / "app-prodn", "source")
        document = {field: "fixture" for field in MODULE.FIELDS}
        document.update({
            "id": "aoe2war.app.fixture", "path": "README.md", "title": "Fixture",
            "reviewed_at": "2026-10-15", "review_interval_days": 90,
            "sha256": "a" * 64,
        })
        self.registry = {"repo": "app-prodn", "documents": [document],
                         "implementation_baseline": {"commit": "1" * 40}}
        (self.source / "docs").mkdir()
        self.write_json(self.source / "docs/document-registry.json", self.registry)
        command(self.source, "add", ".")
        command(self.source, "commit", "-m", "source registry")
        command(self.source, "push", "origin", "main")
        self.docs = self.create_repository(self.root / "docs", "docs")
        (self.docs / "catalog/registries").mkdir(parents=True)
        (self.docs / "catalog/runtime").mkdir()
        self.write_json(self.docs / "catalog/registries/app-prodn.json", self.registry)
        taxonomy = {"documents": [{
            **document, "repository": "app-prodn", "semantic_indexed": True,
            "source_sha256": document["sha256"],
        }], "expected_counts": {}}
        MODULE.recompute_taxonomy_counts(taxonomy)
        self.write_json(self.docs / "catalog/document-taxonomy.json", taxonomy)
        self.write_json(self.docs / "catalog/runtime/repository-state.json", {
            "schema_version": "1.2.0", "generated_at": "old", "repositories": [],
            "workspace_evidence": {},
        })
        (self.docs / ".gitignore").write_text(".venv-docs/\nsite/\n")
        command(self.docs, "add", ".")
        command(self.docs, "commit", "-m", "central seed")
        command(self.docs, "push", "origin", "main")
        (self.docs / ".venv-docs/bin").mkdir(parents=True)
        for name in ("python", "mkdocs"):
            (self.docs / f".venv-docs/bin/{name}").write_text("fixture")
        self.before = command(self.docs, "rev-parse", "HEAD")
        self.before_tree = command(self.docs, "rev-parse", "HEAD^{tree}")
        self.original_run = MODULE.run
        self.generated = None
        self.after_sync = None
        self.gate_failure = None
        self.after_build = None
        self.make_calls = []
        self.patchers = [
            mock.patch.object(MODULE, "DOCS", self.docs),
            mock.patch.object(MODULE, "WORKSPACE", self.workspace),
            mock.patch.object(MODULE, "VPSSENTRY", self.root / "vpssentry"),
            mock.patch.object(MODULE, "WOLOCHAIN", self.root / "wolochain"),
            mock.patch.object(MODULE, "SOURCES", {"app-prodn": self.source}),
            mock.patch.object(MODULE, "source_checker", return_value=(0, "valid metadata and review")),
            mock.patch.object(MODULE, "run", side_effect=self.run_command),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    @staticmethod
    def write_json(path, value):
        path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")

    def create_repository(self, path, remote_name):
        path.mkdir()
        remote = self.root / f"{remote_name}.git"
        subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
        command(path, "init", "-b", "main")
        command(path, "config", "user.email", "fixture@example.invalid")
        command(path, "config", "user.name", "Fixture")
        command(path, "remote", "add", "origin", str(remote))
        (path / "README.md").write_text("fixture\n")
        command(path, "add", ".")
        command(path, "commit", "-m", "seed")
        command(path, "push", "origin", "main")
        return path

    def run_command(self, args, *, cwd, timeout=180, env=None):
        cwd = pathlib.Path(cwd)
        if len(args) > 1 and args[1] == "scripts/sync_workspace.py":
            self.generated = cwd
            self.assertNotEqual(cwd, self.docs)
            registry = self.source / "docs/document-registry.json"
            (cwd / "catalog/registries/app-prodn.json").write_bytes(registry.read_bytes())
            self.write_json(cwd / "catalog/runtime/repository-state.json", {
                "schema_version": "1.2.0", "generated_at": "fresh timestamp",
                "workspace_evidence": {}, "repositories": [{
                    "id": "app-prodn", "documentation_snapshot": {
                        "branch": "main", "commit": command(self.source, "rev-parse", "HEAD"),
                    }, "registry_sha256": MODULE.sha256(registry),
                    "implementation_baseline": self.registry["implementation_baseline"],
                }],
            })
            if self.after_sync:
                return self.after_sync(cwd)
            return 0, "registry synchronized"
        if args[0] == "make":
            self.make_calls.append(args)
            self.assertNotEqual(cwd, self.docs)
            self.assertIn(f"WORKSPACE={self.workspace}", args)
            self.assertIn(f"VENV_MKDOCS={self.docs}/.venv-docs/bin/mkdocs", args)
            if args[1] == self.gate_failure:
                return 1, "fixture metadata/taxonomy/review/strict build gate failed"
            if args[1] == "build" and self.after_build:
                self.after_build(cwd)
            return 0, "validated"
        return self.original_run(args, cwd=cwd, timeout=timeout, env=env)

    def assert_canonical_unchanged(self):
        self.assertEqual(command(self.docs, "rev-parse", "HEAD"), self.before)
        self.assertEqual(command(self.docs, "rev-parse", "HEAD^{tree}"), self.before_tree)
        self.assertEqual(command(self.docs, "status", "--porcelain=v1", "--untracked-files=all"), "")
        # Git status may refresh stat-cache bytes; no staged file may change.
        self.assertEqual(command(self.docs, "write-tree"), self.before_tree)

    def failure_receipt(self):
        receipts = list((self.docs / ".git/aoe2war-federation").glob("run-*/failed-*.json"))
        self.assertTrue(receipts)
        receipt = receipts[-1]
        self.assertEqual(receipt.with_suffix(".json.sha256").read_text().split()[0], MODULE.sha256(receipt))
        data = json.loads(receipt.read_text())
        self.assertTrue(pathlib.Path(data["worktree"]).is_dir())
        self.assertEqual(MODULE.sha256(pathlib.Path(data["diff"])), data["diff_sha256"])
        return data

    def test_success_publishes_exact_validated_tree_then_fast_forwards_and_retry_is_current(self):
        callback = mock.Mock()
        result = MODULE.central_sync(before_publish=callback)
        callback.assert_called_once_with()
        self.assertEqual(result["status"], "synchronized")
        self.assertNotEqual(result["after"], self.before)
        self.assertEqual(command(self.docs, "rev-parse", "HEAD"), result["after"])
        self.assertEqual(MODULE.remote_sha(self.docs, "main"), result["after"])
        self.assertEqual(command(self.docs, "rev-parse", "HEAD^{tree}"), result["validated_tree"])
        self.assertEqual(command(self.docs, "status", "--porcelain"), "")
        receipt = pathlib.Path(result["receipt"])
        self.assertEqual(receipt.with_suffix(".json.sha256").read_text().split()[0], MODULE.sha256(receipt))
        self.assertEqual([args[1] for args in self.make_calls], ["docs-check", "audit-taxonomy", "build"])
        again = MODULE.central_sync()
        self.assertEqual(again["status"], "already-current")
        self.assertEqual(again["after"], result["after"])

    def test_partial_generator_failure_preserves_evidence_without_canonical_changes(self):
        def fail(stage):
            (stage / "docs-index.json").write_text("partial\n")
            return 1, "partial generator failure"
        self.after_sync = fail
        with self.assertRaisesRegex(MODULE.UpdateError, "raw registry synchronization failed"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        evidence = self.failure_receipt()
        self.assertIn("docs-index.json", evidence["changed_file_sha256"])

    def test_each_governance_gate_failure_is_atomic(self):
        for gate in ("docs-check", "audit-taxonomy", "build"):
            with self.subTest(gate=gate):
                self.gate_failure = gate
                with self.assertRaisesRegex(MODULE.UpdateError, f"central {gate} failed"):
                    MODULE.central_sync()
                self.assert_canonical_unchanged()
                self.failure_receipt()

    def test_generated_registry_hash_tamper_is_rejected(self):
        def tamper(stage):
            target = stage / "catalog/registries/app-prodn.json"
            registry = json.loads(target.read_text())
            registry["documents"][0]["title"] = "Tampered metadata"
            self.write_json(target, registry)
            return 0, "tampered"
        self.after_sync = tamper
        with self.assertRaisesRegex(MODULE.UpdateError, "source snapshot SHA mismatch"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        self.failure_receipt()

    def test_unknown_generated_path_is_rejected_and_retained(self):
        self.after_build = lambda stage: (stage / "unsafe.py").write_text("unsafe")
        with self.assertRaisesRegex(MODULE.UpdateError, "outside generated/control-plane allowlist"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        self.assertIn("unsafe.py", self.failure_receipt()["changed_file_sha256"])

    def test_source_commit_advancing_during_validation_blocks_publication(self):
        def change_source(stage):
            command(self.source, "commit", "--allow-empty", "-m", "source advanced")
            command(self.source, "push", "origin", "main")
        self.after_build = change_source
        with self.assertRaisesRegex(MODULE.UpdateError, "source authority changed"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        self.failure_receipt()

    def test_source_dirt_blocks_publication(self):
        self.after_build = lambda stage: (self.source / "README.md").write_text("source dirty\n")
        with self.assertRaisesRegex(MODULE.UpdateError, "source worktree is dirty|worktree is dirty"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()

    def test_source_checker_rejects_expired_review_before_generation(self):
        with mock.patch.object(MODULE, "source_checker", return_value=(1, "documentation review expired")):
            with self.assertRaisesRegex(MODULE.UpdateError, "documentation review expired"):
                MODULE.central_sync()
        self.assertIsNone(self.generated)
        self.assert_canonical_unchanged()

    def test_before_publish_financial_hold_failure_is_atomic(self):
        def reject():
            raise MODULE.UpdateError("Wolo hold fingerprint changed")
        with self.assertRaisesRegex(MODULE.UpdateError, "Wolo hold fingerprint changed"):
            MODULE.central_sync(before_publish=reject)
        self.assert_canonical_unchanged()
        self.failure_receipt()

    def test_commit_hook_mutation_is_rejected_before_push(self):
        hooks = self.docs / ".git/hooks"
        hook = hooks / "post-commit"
        hook.write_text("#!/bin/sh\nprintf 'hook mutation\\n' >> docs-index.json\n")
        hook.chmod(0o755)
        with self.assertRaisesRegex(MODULE.UpdateError, "determinism contract failed"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        self.assertEqual(MODULE.remote_sha(self.docs, "main"), self.before)
        self.failure_receipt()

    def test_remote_cas_race_cannot_overwrite_competing_commit(self):
        original = self.run_command
        raced = []
        def race(args, *, cwd, timeout=180, env=None):
            if args[:2] == ["git", "push"] and any(arg.startswith("--force-with-lease=") for arg in args):
                other = subprocess.check_output(
                    ["git", "commit-tree", self.before_tree, "-p", self.before, "-m", "competing"],
                    cwd=self.docs, text=True,
                ).strip()
                command(self.docs, "push", "origin", f"{other}:refs/heads/main")
                raced.append(other)
            return original(args, cwd=cwd, timeout=timeout, env=env)
        with mock.patch.object(MODULE, "run", side_effect=race):
            with self.assertRaisesRegex(MODULE.UpdateError, "publication failed"):
                MODULE.central_sync()
        self.assert_canonical_unchanged()
        self.assertEqual(MODULE.remote_sha(self.docs, "main"), raced[0])
        self.failure_receipt()

    def test_interrupted_generation_preserves_stage_and_retry_converges(self):
        self.after_sync = lambda stage: (_ for _ in ()).throw(KeyboardInterrupt())
        with self.assertRaises(KeyboardInterrupt):
            MODULE.central_sync()
        self.assert_canonical_unchanged()
        evidence = self.failure_receipt()
        self.after_sync = None
        result = MODULE.central_sync()
        self.assertEqual(result["status"], "synchronized")
        self.assertTrue(pathlib.Path(evidence["worktree"]).is_dir())

    def test_interrupted_after_push_recovers_only_proven_publication(self):
        with mock.patch.object(MODULE, "central_federation_fast_forward", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                MODULE.central_sync()
        self.assert_canonical_unchanged()
        evidence = self.failure_receipt()
        self.assertEqual(evidence["phase"], "canonical-fast-forward")
        callback = mock.Mock()
        result = MODULE.central_sync(before_publish=callback)
        callback.assert_called_once_with()
        self.assertTrue(result["recovered"])
        self.assertEqual(command(self.docs, "rev-parse", "HEAD"), result["after"])
        self.assertEqual(MODULE.remote_sha(self.docs, "main"), result["after"])
        self.assertTrue(pathlib.Path(evidence["diff"]).exists())

    def test_lost_push_acknowledgment_recovers_exact_remote_candidate(self):
        original = self.run_command
        def lost_acknowledgment(args, *, cwd, timeout=180, env=None):
            result = original(args, cwd=cwd, timeout=timeout, env=env)
            if args[:2] == ["git", "push"]:
                self.assertEqual(result[0], 0)
                return 1, "connection lost after remote accepted publication"
            return result
        with mock.patch.object(MODULE, "run", side_effect=lost_acknowledgment):
            with self.assertRaisesRegex(MODULE.UpdateError, "publication failed"):
                MODULE.central_sync()
        self.assert_canonical_unchanged()
        evidence = self.failure_receipt()
        self.assertEqual(evidence["phase"], "publishing")
        self.assertEqual(MODULE.remote_sha(self.docs, "main"), evidence["candidate"])
        result = MODULE.central_sync()
        self.assertTrue(result["recovered"])
        self.assertEqual(command(self.docs, "rev-parse", "HEAD"), evidence["candidate"])

    def test_recovery_refuses_changed_source(self):
        with mock.patch.object(MODULE, "central_federation_fast_forward", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                MODULE.central_sync()
        command(self.source, "commit", "--allow-empty", "-m", "source after publication")
        command(self.source, "push", "origin", "main")
        with self.assertRaisesRegex(MODULE.UpdateError, "source authority changed"):
            MODULE.central_sync()
        self.assert_canonical_unchanged()

    def test_recovery_preview_is_read_only_and_names_the_exact_publication(self):
        self.assertIsNone(MODULE.central_federation_recovery_preview())
        with mock.patch.object(MODULE, "central_federation_fast_forward", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                MODULE.central_sync()
        root = self.docs / ".git/aoe2war-federation"
        before_files = {str(path.relative_to(root)): MODULE.sha256(path)
                        for path in root.rglob("*") if path.is_file()}
        with mock.patch.object(MODULE, "central_federation_write_state") as write, \
             mock.patch.object(MODULE, "central_federation_receipt") as receipt, \
             mock.patch.object(MODULE, "central_federation_lock") as lock:
            preview = MODULE.central_federation_recovery_preview()
            write.assert_not_called()
            receipt.assert_not_called()
            lock.assert_not_called()
        self.assertIsNotNone(preview)
        self.assertEqual(preview["before"], self.before)
        self.assertEqual(preview["candidate"], MODULE.remote_sha(self.docs, "main"))
        self.assertEqual(preview["source_snapshot"]["app-prodn"]["commit"], command(self.source, "rev-parse", "HEAD"))
        self.assertEqual(before_files, {str(path.relative_to(root)): MODULE.sha256(path)
                                      for path in root.rglob("*") if path.is_file()})
        self.assert_canonical_unchanged()

    def test_recovery_preview_rejects_a_changed_retained_stage(self):
        with mock.patch.object(MODULE, "central_federation_fast_forward", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                MODULE.central_sync()
        preview = MODULE.central_federation_recovery_preview()
        (pathlib.Path(preview["worktree"]) / "docs-index.json").write_text("changed after publication\n")
        self.assertIsNone(MODULE.central_federation_recovery_preview())
        self.assert_canonical_unchanged()

    def test_recovery_preview_rejects_a_changed_source(self):
        with mock.patch.object(MODULE, "central_federation_fast_forward", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                MODULE.central_sync()
        command(self.source, "commit", "--allow-empty", "-m", "changed source after publication")
        command(self.source, "push", "origin", "main")
        self.assertIsNone(MODULE.central_federation_recovery_preview())
        self.assert_canonical_unchanged()

    def test_shared_git_common_dir_lock_rejects_another_caller(self):
        with MODULE.central_federation_lock():
            with self.assertRaisesRegex(MODULE.UpdateError, "shared lock"):
                MODULE.central_sync()
        self.assert_canonical_unchanged()

    def test_abandoned_process_journal_is_sealed_once_without_deleting_its_stage(self):
        with MODULE.central_federation_lock() as root:
            directory = root / "run-abandoned"
            directory.mkdir()
            stage = directory / "tree"
            command(self.docs, "worktree", "add", "--detach", str(stage), self.before)
            (stage / "docs-index.json").write_text("interrupted output\n")
            MODULE.central_federation_write_state(directory, {
                "phase": "generating", "before": self.before, "branch": "main",
                "worktree": str(stage),
            })
        result = MODULE.central_sync()
        self.assertEqual(result["status"], "synchronized")
        receipts = list(directory.glob("interrupted-*.json"))
        self.assertEqual(len(receipts), 1)
        receipt = receipts[0]
        self.assertEqual(receipt.with_suffix(".json.sha256").read_text().split()[0], MODULE.sha256(receipt))
        self.assertTrue((stage / "docs-index.json").is_file())
        MODULE.central_sync()
        self.assertEqual(len(list(directory.glob("interrupted-*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
