from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_watcher_downloads.py"
SPEC = importlib.util.spec_from_file_location("aoe2_watcher_downloads", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def runtime_fixture():
    return {
        "source_sha": "a" * 40,
        "source_dirty_count": 0,
        "active_build_id": "build-current",
        "service": "active",
        "wolo_listener_counts": {"8092": 1, "8093": 1},
    }


def policy_fixture(root: pathlib.Path):
    downloads = root / "downloads"
    downloads.mkdir()
    return {
        "production_host": "hel1",
        "apply_host": "root@hel1",
        "production_repo": str(root / "app"),
        "service": "aoe2hdbets-web.service",
        "download_root": str(downloads),
        "receipt_root": str(root / "receipts"),
        "lock_path": str(root / "watcher-downloads.lock"),
        "github_repo": "Emaren/aoe2-watcher",
        "wolo_ports": [8092, 8093],
    }


class WatcherDownloadRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.policy = policy_fixture(self.root)
        self.downloads = pathlib.Path(self.policy["download_root"])

    def test_strict_patterns_cover_only_versioned_release_evidence(self):
        expected = {
            "AoE2HDBets Watcher Setup 1.6.1.exe": "1.6.1",
            "AoE2HDBets Watcher 1.6.1.exe": "1.6.1",
            "AoE2HDBets Watcher-1.6.1-arm64.dmg": "1.6.1",
            "AoE2HDBets Watcher-1.6.1-arm64.dmg.blockmap": "1.6.1",
            "AoE2HDBets Watcher-1.6.1.AppImage": "1.6.1",
            "SHA256SUMS-1.6.1.txt": "1.6.1",
            "watcher-release-manifest-1.6.1.json": "1.6.1",
        }
        for name, version in expected.items():
            self.assertEqual(MODULE.strict_version(name), version)
        for name in (
            "latest.yml",
            "latest-mac.yml",
            "aoe2hdbets-watcher-direct.zip",
            "watcher-v1510-desktop.png",
            "../AoE2HDBets Watcher 1.6.1.exe",
        ):
            self.assertIsNone(MODULE.strict_version(name))

    def test_plan_protects_current_previous_and_retires_only_public_digest_matches(self):
        old = self.downloads / "AoE2HDBets Watcher 1.6.1.exe"
        previous = self.downloads / "AoE2HDBets Watcher 1.6.2.exe"
        current = self.downloads / "AoE2HDBets Watcher 1.6.3.exe"
        unproven = self.downloads / "SHA256SUMS-1.5.13.txt"
        old.write_bytes(b"old-public")
        previous.write_bytes(b"previous")
        current.write_bytes(b"current")
        unproven.write_bytes(b"unique")

        proofs = {
            "1.6.1": {
                "tag_name": "v1.6.1",
                "asset_digests": [MODULE.sha256_file(old)],
            }
        }
        with mock.patch.object(MODULE, "collect_runtime", return_value=runtime_fixture()):
            plan = MODULE.build_plan(
                self.policy,
                current="1.6.3",
                previous="1.6.2",
                expected_source_sha="a" * 40,
                public_proofs=proofs,
            )

        rows = {row["name"]: row for row in plan["entries"]}
        self.assertEqual(
            rows[old.name]["action"], "RETIRE_PUBLIC_DUPLICATE"
        )
        self.assertEqual(
            rows[previous.name]["action"], "PROTECT_CURRENT_OR_PREVIOUS"
        )
        self.assertEqual(
            rows[current.name]["action"], "PROTECT_CURRENT_OR_PREVIOUS"
        )
        self.assertEqual(
            rows[unproven.name]["action"], "KEEP_UNPROVEN_HISTORY"
        )
        self.assertEqual(plan["candidate_count"], 1)
        self.assertEqual(plan["unproven_count"], 1)
        self.assertEqual(plan["eligible_bytes"], len(b"old-public"))

    def test_symlink_matching_release_name_fails_closed(self):
        outside = self.root / "outside"
        outside.write_bytes(b"must-survive")
        link = self.downloads / "AoE2HDBets Watcher 1.6.1.exe"
        link.symlink_to(outside)
        with mock.patch.object(MODULE, "collect_runtime", return_value=runtime_fixture()):
            with self.assertRaisesRegex(
                MODULE.WatcherDownloadRetentionError,
                "plain regular file",
            ):
                MODULE.build_plan(
                    self.policy,
                    current="1.6.3",
                    previous="1.6.2",
                    expected_source_sha="a" * 40,
                    public_proofs={},
                )
        self.assertEqual(outside.read_bytes(), b"must-survive")

    def test_plan_digest_changes_when_candidate_bytes_change(self):
        candidate = self.downloads / "AoE2HDBets Watcher 1.6.1.exe"
        candidate.write_bytes(b"one")
        with mock.patch.object(MODULE, "collect_runtime", return_value=runtime_fixture()):
            first = MODULE.build_plan(
                self.policy,
                current="1.6.3",
                previous="1.6.2",
                expected_source_sha="a" * 40,
                public_proofs={
                    "1.6.1": {"asset_digests": [MODULE.sha256_file(candidate)]}
                },
            )
            candidate.write_bytes(b"two")
            second = MODULE.build_plan(
                self.policy,
                current="1.6.3",
                previous="1.6.2",
                expected_source_sha="a" * 40,
                public_proofs={},
            )
        self.assertNotEqual(
            first["plan_digest_sha256"], second["plan_digest_sha256"]
        )

    def test_checked_in_policy_is_exact(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        self.assertEqual(policy["download_root"], MODULE.CANONICAL_DOWNLOAD_ROOT)
        self.assertEqual(policy["apply_host"], "root@hel1")
        self.assertEqual(policy["github_repo"], "Emaren/aoe2-watcher")
        self.assertEqual(policy["wolo_ports"], [8092, 8093])

    def test_operator_cli_routes_watcher_downloads(self):
        with tempfile.TemporaryDirectory() as temp:
            fake_root = pathlib.Path(temp)
            bin_dir = fake_root / "bin"
            scripts_dir = fake_root / "scripts"
            bin_dir.mkdir()
            scripts_dir.mkdir()
            cli = bin_dir / "aoe2war"
            shutil.copy2(ROOT / "bin" / "aoe2war", cli)
            (bin_dir / "aoe2war-release").write_text(
                "#!/usr/bin/env bash\nexit 99\n", encoding="utf-8"
            )
            (bin_dir / "aoe2war-release").chmod(0o755)
            worker = scripts_dir / "aoe2_watcher_downloads.py"
            worker.write_text(
                "import json,sys\nprint(json.dumps(sys.argv[1:]))\n",
                encoding="utf-8",
            )
            routed = subprocess.run(
                [str(cli), "watcher-downloads", "--json"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            help_result = subprocess.run(
                [str(cli), "--help"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertEqual(json.loads(routed.stdout), ["--json"])
        self.assertIn(
            "watcher-downloads [--apply] [--json]", help_result.stdout
        )


if __name__ == "__main__":
    unittest.main()
