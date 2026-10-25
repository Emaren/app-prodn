"""Adversarial, disposable Git fixtures for v4 REVIEW-ONLY scope verification.

Nothing in these tests stages, signs, deploys, calls SSH or touches mainnet.
"""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_renaissance_v4_scope as scope


def run(repo, *args):
    process = subprocess.run(["git", "-C", str(repo), *args], check=True,
                             capture_output=True, timeout=15)
    return process.stdout.decode("utf-8").strip()


class FrozenScopeTests(unittest.TestCase):
    def test_real_canonical_128_path_inventory_is_exactly_review_only(self):
        original = scope.read_inventory(scope.INVENTORY)
        self.assertEqual(128, len(original["files"]))
        self.assertEqual(63, sum(row["status"] == "A" for row in original["files"]))
        self.assertEqual(65, sum(row["status"] == "M" for row in original["files"]))
        self.assertEqual("REVIEW_ONLY_NOT_RELEASE_AUTHORIZATION", original["approval"])
        self.assertFalse(original["owner_signed"])
        self.assertFalse(original["release_authorized"])
        self.assertFalse(original["financial_release_authorized"])
        self.assertEqual("6d2a78224e5a5c647345d6b5ffc91bf94dc84b59",
                         original["candidate_source_sha"])
        self.assertEqual("6be434c00469afa4acb0623715c3bcf724f927f4",
                         original["baseline_production_sha"])
        self.assertEqual("d0568f80e290242898c8ddfb37ccb07b457e57ac",
                         original["baseline_tree_sha1"])
        self.assertEqual("2b8232c950ec58a8f0d16ea0c625528948b6b206",
                         original["candidate_tree_sha1"])

    def test_inventory_rejects_extra_financial_authority_or_retagged_object(self):
        original = scope.read_inventory(scope.INVENTORY)
        with tempfile.TemporaryDirectory() as dirname:
            file = Path(dirname) / "inventory.json"
            for change in (
                {"release_authorized": True},
                {"financial_release_authorized": True},
                {"owner_signed": True},
                {"candidate_source_sha": original["baseline_production_sha"]},
                {"counts": {"paths": 127, "added": 62, "modified": 65, "deleted": 0}},
                {"files": original["files"][:-1]},
                {"files": [*original["files"], original["files"][0]]},
                {"files": [dict(original["files"][0], path="prisma/schema.prisma"),
                           *original["files"][1:]]},
                {"files": [dict(original["files"][0], mode="120000"),
                           *original["files"][1:]]},
                {"files": [dict(original["files"][0], status="D"),
                           *original["files"][1:]]},
            ):
                with self.subTest(change=next(iter(change))):
                    file.write_text(json.dumps(dict(original, **change)))
                    with self.assertRaises(scope.Hold):
                        scope.read_inventory(file)
            file.write_text('{"schema":1,"schema":1}')
            with self.assertRaises(scope.Hold):
                scope.read_inventory(file)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="aoe2-v4-scope-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "candidate"
        self.repo.mkdir()
        run(self.repo, "init", "-q")
        run(self.repo, "config", "user.email", "fixture@example.invalid")
        run(self.repo, "config", "user.name", "Fixture")
        (self.repo / "README.md").write_text("before\n")
        run(self.repo, "add", "README.md")
        run(self.repo, "commit", "-qm", "baseline")
        self.base = run(self.repo, "rev-parse", "HEAD")
        (self.repo / "README.md").write_text("after\n")
        (self.repo / "app").mkdir()
        (self.repo / "app" / "page.tsx").write_text("export default function Page() { return null }\n")
        run(self.repo, "add", ".")
        run(self.repo, "commit", "-qm", "website only")
        self.head = run(self.repo, "rev-parse", "HEAD")
        self.inventory = {
            "baseline_production_sha": self.base,
            "candidate_source_sha": self.head,
            "baseline_tree_sha1": run(self.repo, "show", "-s", "--format=%T", self.base),
            "candidate_tree_sha1": run(self.repo, "show", "-s", "--format=%T", self.head),
            "files": [
                {"path": "README.md", "status": "M",
                 "blob_sha1": run(self.repo, "rev-parse", self.head + ":README.md"),
                 "mode": "100644"},
                {"path": "app/page.tsx", "status": "A",
                 "blob_sha1": run(self.repo, "rev-parse", self.head + ":app/page.tsx"),
                 "mode": "100644"},
            ],
        }

    def test_exact_fixture_is_source_review_only(self):
        result = scope.verify_scope(self.repo, self.inventory)
        self.assertEqual("SOURCE_INVENTORY_MATCH_REVIEW_ONLY", result["status"])
        self.assertFalse(result["owner_signature_verified"])
        self.assertFalse(result["release_authorized"])
        self.assertFalse(result["financial_release_authorized"])

    def test_wrong_candidate_and_wrong_ancestor_hold(self):
        for mutation in ({"candidate_source_sha": self.base},
                         {"baseline_production_sha": "f" * 40},
                         {"candidate_tree_sha1": "b" * 40},
                         {"baseline_tree_sha1": "c" * 40}):
            with self.subTest(mutation=mutation):
                with self.assertRaises(scope.Hold):
                    scope.verify_scope(self.repo, dict(self.inventory, **mutation))

    def test_dirty_worktree_holds_even_if_git_head_matches(self):
        (self.repo / "README.md").write_text("uncommitted\n")
        with self.assertRaises(scope.Hold):
            scope.verify_scope(self.repo, self.inventory)
        (self.repo / "README.md").write_text("after\n")
        (self.repo / "untracked-secret").write_text("never sent\n")
        with self.assertRaises(scope.Hold):
            scope.verify_scope(self.repo, self.inventory)

    def test_wrong_path_status_or_git_blob_hold(self):
        variants = (
            [dict(self.inventory["files"][0], status="A"), self.inventory["files"][1]],
            [dict(self.inventory["files"][0], blob_sha1="a" * 40), self.inventory["files"][1]],
            [dict(self.inventory["files"][0], mode="100755"), self.inventory["files"][1]],
            self.inventory["files"][:-1],
            [dict(self.inventory["files"][0], path="finance/fake.ts"),
             self.inventory["files"][1]],
        )
        for files in variants:
            with self.subTest(files=files):
                with self.assertRaises(scope.Hold):
                    scope.verify_scope(self.repo, dict(self.inventory, files=files))

    def test_broken_actual_file_or_extra_commit_holds(self):
        (self.repo / "app" / "page.tsx").write_text("export const newThing = true\n")
        run(self.repo, "add", ".")
        run(self.repo, "commit", "-qm", "new unreviewed source")
        with self.assertRaises(scope.Hold):
            scope.verify_scope(self.repo, self.inventory)

    def test_non_directory_or_symlink_candidate_holds(self):
        link = Path(self.temp.name) / "linked"
        link.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(scope.Hold):
            scope.verify_scope(link, self.inventory)


if __name__ == "__main__":
    unittest.main()
