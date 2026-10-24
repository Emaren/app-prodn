"""Fail closed on actual watcher artifact releases; admit only exact unpublished nine-path draft."""
from __future__ import annotations
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import aoe2_release_stage as stage
from aoe2_release_gate import classify_risk
import aoe2_website_protected_release_v2 as ctrl
from aoe2_website_release_v2 import MAIN_SOURCE_SHA, PRODUCTION_SHA

NINE=(
    "components/kingdom-index/KingdomIndex.tsx",
    "config/kingdom-index-baseline.json",
    "config/kingdom-index-provisional-source-reviews.json",
    "config/kingdom-index-routes.json",
    "config/kingdom-index-watcher-166-source-review.json",
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
    "tests/kingdom-index-watcher-draft-score.test.mts",
    "yarn.lock",
)

class ExactMainDraftWatcherVaultTests(unittest.TestCase):
    def manifest(self,**overrides):
        return {
            "release_sha": MAIN_SOURCE_SHA,
            "previous_production_sha": PRODUCTION_SHA,
            "risk_class": "WATCHER",
            "changed_files": list(NINE),
            "migration_paths": [],
            **overrides,
        }

    def mock_git_versions(self, old="1.6.5", new="1.6.5"):
        def fake_git(argv,*,timeout=30):
            assert argv[:2] == ["git","show"]
            src=argv[2].split(":",1)[0]
            ver=old if src == PRODUCTION_SHA else new
            return SimpleNamespace(returncode=0,
                stdout='export const WATCHER_RELEASE = { version: "'+ver+'", };')
        return mock.patch.object(stage,"run",side_effect=fake_git)

    def test_exact_draft_remains_watcher_classified_but_never_releases_binary(self):
        self.assertEqual("WATCHER",classify_risk(list(NINE)))
        with self.mock_git_versions():
            self.assertEqual("",stage.watcher_distribution_version(self.manifest()))

    def test_non_draft_watcher_still_must_certify_distribution(self):
        altered=self.manifest(changed_files=list(NINE)+["lib/watcherRelease.ts"])
        with self.mock_git_versions():
            self.assertEqual("1.6.5",stage.watcher_distribution_version(altered))

    def test_version_change_requires_distribution_even_at_same_sha(self):
        with self.mock_git_versions(old="1.6.5",new="1.6.6"):
            self.assertEqual("1.6.6",stage.watcher_distribution_version(self.manifest()))

    def test_migration_or_other_prod_or_candidate_disqualifies_exception(self):
        invalid=[
           self.manifest(migration_paths=["prisma/migrations/unsafe.sql"]),
           self.manifest(previous_production_sha="a"*40),
           self.manifest(release_sha="b"*40)
        ]
        with self.mock_git_versions():
            for item in invalid:
                with self.subTest(invalid=item):
                    self.assertEqual("1.6.5",stage.watcher_distribution_version(item))

    def test_non_watcher_version_transition_still_requires_distribution(self):
        with self.mock_git_versions(old="1.6.5",new="1.6.6"):
            self.assertEqual("1.6.6",stage.watcher_distribution_version(
                self.manifest(risk_class="INFRASTRUCTURE")))

    def test_controller_acceptance_is_not_general_watcher_override(self):
        src=(ROOT/"scripts"/"aoe2_website_protected_release_v2.py").read_text()
        self.assertIn('"PRESENTATION", "INFRASTRUCTURE", "WATCHER"',src)
        self.assertIn('p.get("candidate_sha") == MAIN_SOURCE_SHA',src)
        self.assertIn('manifest.get("changed_files") == scope["paths"]',src)
        self.assertIn('manifest.get("migration_paths") == []',src)

if __name__=="__main__":
    unittest.main()
