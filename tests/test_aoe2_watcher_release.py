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
SCRIPT = ROOT / "scripts" / "aoe2_watcher_release.py"
SPEC = importlib.util.spec_from_file_location(
    "aoe2_watcher_release", SCRIPT
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def fake_bundle(root: pathlib.Path, version: str = "9.9.9"):
    canonical = MODULE.canonical_files(version)
    payloads: dict[str, bytes] = {
        f"AoE2HDBets Watcher Setup {version}.exe": b"installer",
        f"AoE2HDBets Watcher {version}.exe": b"portable",
        f"AoE2HDBets Watcher-{version}-arm64.dmg": b"dmg",
        "aoe2hdbets-watcher-direct.zip": b"direct",
        f"AoE2HDBets Watcher-{version}.AppImage": b"appimage",
        f"AoE2HDBets Watcher-{version}-arm64.dmg.blockmap": b"blockmap",
        "latest.yml": (
            f"version: {version}\n"
            f"path: AoE2HDBets Watcher Setup {version}.exe\n"
        ).encode(),
        "latest-mac.yml": (
            f"version: {version}\n"
            f"path: AoE2HDBets Watcher-{version}-arm64.dmg\n"
        ).encode(),
        "latest-linux.yml": (
            f"version: {version}\n"
            f"path: AoE2HDBets Watcher-{version}.AppImage\n"
        ).encode(),
    }
    root.mkdir(parents=True, exist_ok=True)
    for name, data in payloads.items():
        (root / name).write_bytes(data)

    rows = []
    for name in canonical:
        path = root / name
        rows.append({
            "filename": name,
            "bytes": path.stat().st_size,
            "sha256": MODULE.sha256_file(path),
        })

    (root / f"SHA256SUMS-{version}.txt").write_text(
        "".join(
            f"{row['sha256']}  {row['filename']}\n"
            for row in rows
        ),
        encoding="utf-8",
    )
    (root / f"watcher-release-manifest-{version}.json").write_text(
        json.dumps({
            "schema": 1,
            "version": version,
            "files": rows,
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    return MODULE.validate_bundle(root, version)


def public_release_for(
    inventory: list[dict], version: str = "9.9.9"
) -> dict:
    return {
        "id": 123,
        "tag_name": f"v{version}",
        "draft": False,
        "prerelease": False,
        "published_at": "2026-09-21T00:00:00Z",
        "assets": [
            {
                "name": f"asset-{index}",
                "digest": f"sha256:{row['sha256']}",
            }
            for index, row in enumerate(inventory)
        ],
    }


class WatcherReleaseBundleTests(unittest.TestCase):
    def test_certified_bundle_and_public_release_are_exact(self):
        with tempfile.TemporaryDirectory() as temp:
            inventory = fake_bundle(pathlib.Path(temp))
            proof = MODULE.prove_public_release(
                inventory,
                public_release_for(inventory),
            )

        self.assertEqual(proof["tag_name"], "v9.9.9")
        self.assertEqual(proof["asset_count"], 11)
        self.assertEqual(proof["digest_matched_files"], 11)

    def test_public_release_digest_multiset_must_match_exactly(self):
        with tempfile.TemporaryDirectory() as temp:
            inventory = fake_bundle(pathlib.Path(temp))
            release = public_release_for(inventory)
            release["assets"][0]["digest"] = "sha256:" + "0" * 64

            with self.assertRaisesRegex(
                MODULE.WatcherReleasePromotionError,
                "digest multiset does not exactly match",
            ):
                MODULE.prove_public_release(inventory, release)

            release = public_release_for(inventory)
            release["assets"].append(dict(release["assets"][0]))
            with self.assertRaisesRegex(
                MODULE.WatcherReleasePromotionError,
                "digest multiset does not exactly match",
            ):
                MODULE.prove_public_release(inventory, release)

    def test_bundle_rejects_checksum_manifest_disagreement(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            fake_bundle(root)
            sums = root / "SHA256SUMS-9.9.9.txt"
            lines = sums.read_text(encoding="utf-8").splitlines()
            lines[0] = "0" * 64 + "  " + lines[0].split("  ", 1)[1]
            sums.write_text("\n".join(lines) + "\n", encoding="utf-8")

            with self.assertRaisesRegex(
                MODULE.WatcherReleasePromotionError,
                "checksum and release manifest disagree",
            ):
                MODULE.validate_bundle(root, "9.9.9")

    def test_promotion_order_keeps_updater_pointers_last(self):
        order = MODULE.promotion_order("1.6.0")
        self.assertEqual(
            order[-3:],
            ["latest.yml", "latest-mac.yml", "latest-linux.yml"],
        )
        self.assertLess(
            order.index("SHA256SUMS-1.6.0.txt"),
            order.index("latest.yml"),
        )
        self.assertLess(
            order.index("watcher-release-manifest-1.6.0.json"),
            order.index("latest.yml"),
        )


class WatcherReleasePolicyTests(unittest.TestCase):
    def test_checked_in_policy_is_exact_and_fail_closed(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        self.assertEqual(
            policy["download_root"], MODULE.CANONICAL_DOWNLOAD_ROOT
        )
        self.assertEqual(
            policy["staging_root"], MODULE.CANONICAL_STAGING_ROOT
        )
        self.assertEqual(
            policy["apply_host"], MODULE.CANONICAL_APPLY_HOST
        )
        self.assertEqual(
            policy["github_repo"], MODULE.CANONICAL_GITHUB_REPO
        )
        self.assertEqual(policy["wolo_ports"], [8092, 8093])

        altered = dict(policy)
        altered["download_root"] = "/tmp/not-canonical"
        with self.assertRaisesRegex(
            MODULE.WatcherReleasePromotionError,
            "must be exactly",
        ):
            MODULE.validate_policy(altered)

    def test_promotion_plan_binds_public_proof_and_order(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            inventory = fake_bundle(root)
            policy = MODULE.policy_from_contract(MODULE.load_contract())
            with mock.patch.object(
                MODULE,
                "github_release",
                return_value=public_release_for(inventory),
            ):
                plan = MODULE.build_plan(root, "9.9.9", policy)

        MODULE.verify_plan(plan)
        self.assertEqual(plan["public_release"]["asset_count"], 11)
        self.assertEqual(
            plan["promotion_order"],
            MODULE.promotion_order("9.9.9"),
        )
        self.assertEqual(plan["wolo_mutation_allowed"], False)

        tampered = dict(plan)
        tampered["promotion_order"] = list(reversed(plan["promotion_order"]))
        with self.assertRaisesRegex(
            MODULE.WatcherReleasePromotionError,
            "plan digest is invalid",
        ):
            MODULE.verify_plan(tampered)

    def test_uncertain_remote_apply_does_not_auto_cleanup_stage(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        plan = {
            "version": "9.9.9",
            "bundle_digest_sha256": "a" * 64,
        }
        argv = [
            "--apply",
            "--version",
            "9.9.9",
            "--source",
            "/tmp/fake-dist",
        ]

        with (
            mock.patch.object(
                MODULE, "policy_from_contract", return_value=policy
            ),
            mock.patch.object(MODULE, "load_contract", return_value={}),
            mock.patch.object(MODULE, "build_plan", return_value=plan),
            mock.patch.object(
                MODULE,
                "stage_path",
                return_value=(
                    MODULE.CANONICAL_STAGING_ROOT
                    + "/promote-9.9.9-aaaaaaaaaaaa"
                ),
            ),
            mock.patch.object(MODULE, "create_remote_stage"),
            mock.patch.object(MODULE, "transfer_bundle"),
            mock.patch.object(
                MODULE,
                "invoke_remote",
                side_effect=[
                    {"status": "READY"},
                    MODULE.WatcherReleasePromotionError(
                        "transport lost after remote worker start"
                    ),
                ],
            ),
            mock.patch.object(
                MODULE, "cleanup_failed_stage"
            ) as cleanup,
            mock.patch.object(
                MODULE, "package_version", return_value="9.9.9"
            ),
            mock.patch.object(
                MODULE.Path, "resolve", return_value=pathlib.Path("/tmp/fake-dist")
            ),
            mock.patch.dict(
                "sys.modules",
                {"aoe2_release": mock.MagicMock()},
            ),
        ):
            aoe2_release = __import__("aoe2_release")
            lease = mock.MagicMock()
            lease.__enter__.return_value = None
            lease.__exit__.return_value = False
            aoe2_release.global_release_lease.return_value = lease
            rc = MODULE.main(argv)

        self.assertEqual(rc, 2)
        cleanup.assert_not_called()

    def test_preexisting_stage_is_never_cleaned_on_create_refusal(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        plan = {
            "version": "9.9.9",
            "bundle_digest_sha256": "a" * 64,
        }
        argv = [
            "--apply",
            "--version",
            "9.9.9",
            "--source",
            "/tmp/fake-dist",
        ]

        with (
            mock.patch.object(
                MODULE, "policy_from_contract", return_value=policy
            ),
            mock.patch.object(MODULE, "load_contract", return_value={}),
            mock.patch.object(MODULE, "build_plan", return_value=plan),
            mock.patch.object(
                MODULE,
                "stage_path",
                return_value=(
                    MODULE.CANONICAL_STAGING_ROOT
                    + "/promote-9.9.9-aaaaaaaaaaaa"
                ),
            ),
            mock.patch.object(
                MODULE,
                "invoke_remote",
                return_value={"status": "READY"},
            ),
            mock.patch.object(
                MODULE,
                "create_remote_stage",
                side_effect=MODULE.WatcherReleasePromotionError(
                    "stage already exists"
                ),
            ),
            mock.patch.object(
                MODULE, "cleanup_failed_stage"
            ) as cleanup,
            mock.patch.object(
                MODULE.Path, "resolve",
                return_value=pathlib.Path("/tmp/fake-dist"),
            ),
            mock.patch.dict(
                "sys.modules",
                {"aoe2_release": mock.MagicMock()},
            ),
        ):
            aoe2_release = __import__("aoe2_release")
            lease = mock.MagicMock()
            lease.__enter__.return_value = None
            lease.__exit__.return_value = False
            aoe2_release.global_release_lease.return_value = lease
            rc = MODULE.main(argv)

        self.assertEqual(rc, 2)
        cleanup.assert_not_called()


class WatcherReleaseIntegrationTests(unittest.TestCase):
    def test_operator_cli_routes_watcher_release(self):
        with tempfile.TemporaryDirectory() as temp:
            fake_root = pathlib.Path(temp)
            bin_dir = fake_root / "bin"
            scripts_dir = fake_root / "scripts"
            config_dir = fake_root / "config"
            bin_dir.mkdir()
            scripts_dir.mkdir()
            config_dir.mkdir()

            cli = bin_dir / "aoe2war"
            shutil.copy2(ROOT / "bin" / "aoe2war", cli)
            release = bin_dir / "aoe2war-release"
            release.write_text(
                "#!/usr/bin/env bash\nexit 99\n",
                encoding="utf-8",
            )
            release.chmod(0o755)
            worker = scripts_dir / "aoe2_watcher_release.py"
            worker.write_text(
                "import json,sys\n"
                "print(json.dumps(sys.argv[1:]))\n",
                encoding="utf-8",
            )

            routed = subprocess.run(
                [str(cli), "watcher-release", "--json"],
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
            "watcher-release [--apply] [--json]",
            help_result.stdout,
        )

    def test_release_gate_compiles_and_tests_watcher_release_lane(self):
        gate_script = ROOT / "scripts" / "aoe2_release_gate.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_gate_watcher_release", gate_script
        )
        gate = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(gate)

        self.assertEqual(
            gate.path_risk("scripts/aoe2_watcher_release.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            gate.path_risk("tests/test_aoe2_watcher_release.py"),
            "INFRASTRUCTURE",
        )

        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": [
                "config/aoe2war-operations.json",
                "scripts/aoe2_watcher_release.py",
            ],
        }
        commands = gate.command_plan(scope, "INFRASTRUCTURE")
        release_tests = next(
            args
            for label, args, _timeout in commands
            if label == "release-engineering-tests"
        )
        compile_args = next(
            args
            for label, args, _timeout in commands
            if label == "release-python-compile"
        )
        self.assertIn(
            "tests/test_aoe2_watcher_release.py", release_tests
        )
        self.assertIn(
            "scripts/aoe2_watcher_release.py", compile_args
        )


if __name__ == "__main__":
    unittest.main()
