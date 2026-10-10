import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import verify_watcher_164_github_draft as verifier


class WatcherDraftProofTests(unittest.TestCase):
    def test_reject_invalid_remote_draft_source_and_live_release(self):
        good = {
            "tag_name": "v1.6.4",
            "target_commitish": verifier.SOURCE_SHA,
            "draft": True,
            "prerelease": False,
            "assets": [],
        }
        for invalid in (
            {**good, "target_commitish": "0" * 40},
            {**good, "draft": False},
            {**good, "tag_name": "v1.6.3"},
            {**good, "prerelease": True},
        ):
            with patch.object(verifier.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout=json.dumps([invalid])
            )):
                with self.assertRaises(verifier.DraftProofError):
                    verifier.fetch_draft()

    def test_uses_authenticated_list_not_tag_endpoint_for_drafts(self):
        expected = {
            "tag_name": "v1.6.4",
            "target_commitish": verifier.SOURCE_SHA,
            "draft": True,
            "prerelease": False,
            "assets": [],
        }
        with patch.object(verifier.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=json.dumps([
                {"tag_name": "v1.6.3", "draft": False},
                expected,
            ])
        )) as mocked:
            self.assertEqual(verifier.fetch_draft(), expected)
            cmd = mocked.call_args.args[0]
            self.assertIn("releases?per_page=100", cmd[-1])
            self.assertNotIn("/tags/", cmd[-1])
        for releases in ([], [expected, expected], {"tag_name": "v1.6.4"}):
            with patch.object(verifier.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout=json.dumps(releases)
            )):
                with self.assertRaises(verifier.DraftProofError):
                    verifier.fetch_draft()

    def test_exact_digest_and_size_multiset_allows_gh_space_rewriting(self):
        rows = [
            {"sha256": "a" * 64, "bytes": 42},
            {"sha256": "b" * 64, "bytes": 100},
        ]
        github = {
            "assets": [
                {"name": "AoE2HDBets.Watcher.Setup.1.6.4.exe",
                 "digest": "sha256:" + "a" * 64, "size": 42},
                {"name": "latest.yml", "digest": "sha256:" + "b" * 64, "size": 100},
            ]
        }
        with patch.object(verifier, "validate_bundle", return_value=rows), \
             patch.object(verifier, "all_release_files", return_value=["a", "b"]):
            self.assertEqual(verifier.prove_draft(Path("/unimportant"), github), rows)
            bad = {**github, "assets": [
                github["assets"][0],
                {**github["assets"][1], "size": 101},
            ]}
            with self.assertRaises(verifier.DraftProofError):
                verifier.prove_draft(Path("/unimportant"), bad)
            missing = {**github, "assets": [
                github["assets"][0],
                {**github["assets"][1], "digest": None},
            ]}
            with self.assertRaises(verifier.DraftProofError):
                verifier.prove_draft(Path("/unimportant"), missing)
            duplicate = {**github, "assets": [
                github["assets"][0], {**github["assets"][1], "name": github["assets"][0]["name"]},
            ]}
            with self.assertRaises(verifier.DraftProofError):
                verifier.prove_draft(Path("/unimportant"), duplicate)


if __name__ == "__main__":
    unittest.main()
