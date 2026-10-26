"""Disposable SHA-256 source REVIEW tests. No signing, host or deployment IO."""
from __future__ import annotations

import copy
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_renaissance_v4_release_manifest as manifest


class V4ManifestReviewTests(unittest.TestCase):
    def setUp(self):
        high = sorted(path for paths in manifest.RISK_PATHS.values() for path in paths)
        names = sorted(high + [f"safe-review-{i:03d}.txt" for i in range(128-len(high))])
        self.inventory = {
            "baseline_tree_sha1": "a"*40, "candidate_tree_sha1": "b"*40,
            "files": [{
                "path": path, "blob_sha1": f"{i+1:040x}",
                "mode": "100644", "status": "A" if i < 63 else "M",
            } for i, path in enumerate(names)],
        }
        self.repo = Path("/tmp/disposable-v4-candidate")
        self.data = b"actual immutable bytes of a reviewed candidate file\n"
        self.risks = {path: risk for risk, paths in manifest.RISK_PATHS.items()
                      for path in paths}

    def patched(self, *, wrong_risk=False, blob_size=None, wrong_head=False):
        size = len(self.data) if blob_size is None else blob_size
        def text_git(_repo, *args):
            if args == ("rev-parse", "HEAD"):
                return "f"*40 if wrong_head else manifest.scope.FROZEN_TARGET
            if args[:2] == ("cat-file", "-s"):
                return str(size)
            if args[:2] == ("cat-file", "-t"):
                return "blob"
            raise AssertionError(f"unreviewed Git command {args}")
        return [
            patch.object(manifest.scope, "verify_scope", return_value={
                "status": "SOURCE_INVENTORY_MATCH_REVIEW_ONLY", "paths": 128}),
            patch.object(manifest.scope, "text_git", side_effect=text_git),
            patch.object(manifest.scope, "git", return_value=self.data),
            patch.object(manifest.gate, "path_risk",
                         side_effect=lambda path: "DOCUMENTATION" if wrong_risk
                         else self.risks.get(path, "WEBSITE")),
        ]

    def result(self, **kwargs):
        with ExitStack() as stack:
            for p in self.patched(**kwargs):
                stack.enter_context(p)
            return manifest.generate(self.repo, self.inventory)

    def test_source_sha256_is_deterministic_and_no_authority_granted(self):
        first, again = self.result(), self.result()
        self.assertEqual(manifest.canonical(first), manifest.canonical(again))
        self.assertEqual(len(first["files"]), 128)
        self.assertEqual(first["files"][0]["bytes"], len(self.data))
        self.assertEqual(first["files"][0]["content_sha256"],
                         manifest.sha256(self.data))
        self.assertEqual(first["original_protected_high_risk_paths"],
                         manifest.RISK_PATHS)
        self.assertEqual(first["high_risk_review_status"],
                         "OWNER_AND_INDEPENDENT_REVIEW_REQUIRED")
        self.assertFalse(first["ci_claims"]["independently_accepted"])
        for key in ("signed_release_manifest", "website_stage_authorized",
                    "website_activation_authorized", "financial_release_authorized",
                    "owner_pre_stage_signature_verified",
                    "owner_pre_activate_signature_verified"):
            self.assertIs(first[key], False, key)
        for key in ("controller_implementation_sha", "staged_artifact_sha256",
                    "gate_receipt_sha256", "previous_live_build_id"):
            self.assertIsNone(first[key], key)

    def test_mutation_cannot_launder_reviewer_into_owner_authority(self):
        first = self.result()
        with ExitStack() as stack:
            for p in self.patched(): stack.enter_context(p)
            self.assertEqual(
                manifest.verify(self.repo, self.inventory, first)["status"],
                "SOURCE_REVIEW_SHA256_MATCH_NOT_AUTHORIZED")
            for key, value in (
                ("signed_release_manifest", True),
                ("website_stage_authorized", True),
                ("financial_release_authorized", True),
                ("candidate_source_sha", "f"*40),
                ("source_content_aggregate_sha256", "0"*64),
            ):
                with self.subTest(key=key):
                    altered = copy.deepcopy(first)
                    altered[key] = value
                    with self.assertRaises(manifest.scope.Hold):
                        manifest.verify(self.repo, self.inventory, altered)
            changed = copy.deepcopy(first)
            changed["files"][0]["content_sha256"] = "e"*64
            with self.assertRaises(manifest.scope.Hold):
                manifest.verify(self.repo, self.inventory, changed)

    def test_original_risk_classifier_cannot_be_downgraded(self):
        with self.assertRaisesRegex(manifest.scope.Hold, "risk classification drift"):
            self.result(wrong_risk=True)

    def test_wrong_head_or_oversized_blob_fails(self):
        with self.assertRaisesRegex(manifest.scope.Hold, "HEAD changed"):
            self.result(wrong_head=True)
        with self.assertRaisesRegex(manifest.scope.Hold, "oversized Git blob"):
            self.result(blob_size=manifest.MAX_BLOB + 1)

    def test_changed_migration_source_requires_separate_financial_database_gate(self):
        row = next(x for x in self.inventory["files"] if x["path"] == "safe-review-000.txt")
        row["path"] = "prisma/migrations/20261025_change/migration.sql"
        self.inventory["files"].sort(key=lambda x: x["path"])
        with self.assertRaisesRegex(manifest.scope.Hold, "Prisma migration"):
            self.result()

    def test_fake_sha1_git_object_rejected(self):
        self.inventory["files"][0]["blob_sha1"] = "forged"
        with self.assertRaisesRegex(manifest.scope.Hold, "invalid Git blob identity"):
            self.result()


if __name__ == "__main__":
    unittest.main()
