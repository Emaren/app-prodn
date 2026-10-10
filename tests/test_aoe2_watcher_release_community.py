import base64
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import assemble_watcher_164_community as assembler
from aoe2_watcher_release import canonical_files, validate_bundle


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fixture(root):
    windows, mac, linux = (root / s for s in ("windows", "mac", "linux"))
    for p in (windows, mac, linux):
        p.mkdir()
    win_bytes = {
        "AoE2HDBets Watcher Setup 1.6.4.exe": b"test-signed-installer",
        "AoE2HDBets Watcher 1.6.4.exe": b"test-signed-portable",
    }
    for name, data in win_bytes.items():
        (windows / name).write_bytes(data)
    with (windows / "SIGNED_WINDOWS_SHA256.txt").open("w") as f:
        for name, data in win_bytes.items():
            f.write(f"{sha(data)}  {name}\n")
    native_zip = b"unit-test-native-zip"
    mac_sha512 = base64.b64encode(hashlib.sha512(native_zip).digest()).decode()
    names = canonical_files(assembler.VERSION)
    for name in names:
        if name in win_bytes or name == "latest.yml":
            continue
        parent = linux if name.endswith(".AppImage") or name == "latest-linux.yml" else mac
        if name == "latest-mac.yml":
            (parent / name).write_text(
                f"version: 1.6.4\nfiles:\n"
                f"  - url: AoE2HDBets Watcher-1.6.4-arm64-mac.zip\n"
                f"    sha512: {mac_sha512}\n"
                f"path: AoE2HDBets Watcher-1.6.4-arm64-mac.zip\n"
                f"sha512: {mac_sha512}\n"
            )
        elif name == "latest-linux.yml":
            (parent / name).write_text(
                "version: 1.6.4\npath: AoE2HDBets Watcher-1.6.4.AppImage\n"
            )
        elif name.endswith("-arm64-mac.zip"):
            (parent / name).write_bytes(native_zip)
        else:
            (parent / name).write_bytes(("payload:" + name).encode())
    return windows, mac, linux, {name: sha(data) for name, data in win_bytes.items()}


class AssembleCommunityReleaseTests(unittest.TestCase):
    def test_successful_complete_community_bundle(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            windows, mac, linux, digests = fixture(root)
            with patch.dict(assembler.SIGNED_WINDOWS, digests, clear=True):
                result = assembler.build_bundle(windows, mac, linux, root / "assembled")
            self.assertEqual(len(result), 12)
            appimage = linux / "AoE2HDBets Watcher-1.6.4.AppImage"
            expected_linux_sha = base64.b64encode(
                hashlib.sha512(appimage.read_bytes()).digest()
            ).decode()
            linux_pointer = (root / "assembled" / "latest-linux.yml").read_text()
            self.assertIn(expected_linux_sha, linux_pointer)
            self.assertIn("path: AoE2HDBets Watcher-1.6.4.AppImage", linux_pointer)
            manifest = json.loads((root / "assembled" / "watcher-release-manifest-1.6.4.json").read_text())
            self.assertEqual(manifest["distribution_policy"]["macos"], "unsigned-manual-only-no-autoupdate")
            self.assertEqual(manifest["windows_signing_run_id"], assembler.WINDOWS_RUN)
            self.assertEqual(len(validate_bundle(root / "assembled", "1.6.4")), 12)

    def test_signed_windows_mismatch_stops_before_mutating_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            windows, mac, linux, _ = fixture(root)
            output = root / "not-created"
            with self.assertRaisesRegex(assembler.BundleAssemblyError, "not authoritative"):
                assembler.build_bundle(windows, mac, linux, output)
            self.assertFalse(output.exists())

    def test_missing_native_mac_zip_cannot_create_valid_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            windows, mac, linux, digests = fixture(root)
            (mac / "AoE2HDBets Watcher-1.6.4-arm64-mac.zip").unlink()
            with patch.dict(assembler.SIGNED_WINDOWS, digests, clear=True):
                with self.assertRaisesRegex(assembler.BundleAssemblyError, "expected one copy"):
                    assembler.build_bundle(windows, mac, linux, root / "assembled")

    def test_local_mac_requires_matching_git_source_and_clean_tree(self):
        with tempfile.TemporaryDirectory() as temp:
            dist = Path(temp) / "dist"
            dist.mkdir()
            def response(stdout):
                return SimpleNamespace(returncode=0, stdout=stdout)
            with patch.object(assembler.subprocess, "run", side_effect=[
                response(assembler.SOURCE_SHA + "\\n"), response("")
            ]):
                assembler.require_local_mac_build(dist)
            with patch.object(assembler.subprocess, "run", return_value=response(
                "0" * 40 + "\\n"
            )):
                with self.assertRaisesRegex(assembler.BundleAssemblyError, "source"):
                    assembler.require_local_mac_build(dist)

    def test_github_runs_must_be_exact_sha_success_and_workflow(self):
        correct = {
            "name": "Watcher CI", "event": "pull_request",
            "headSha": assembler.SOURCE_SHA, "conclusion": "success",
        }
        with patch.object(assembler.subprocess, "run", return_value=SimpleNamespace(
            returncode=0, stdout=json.dumps(correct)
        )):
            assembler.require_run(assembler.CI_RUN, "Watcher CI", "pull_request")
        for wrong in (
            {**correct, "headSha": "0" * 40},
            {**correct, "event": "push"},
            {**correct, "conclusion": "failure"},
        ):
            with patch.object(assembler.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout=json.dumps(wrong)
            )):
                with self.assertRaises(assembler.BundleAssemblyError):
                    assembler.require_run(assembler.CI_RUN, "Watcher CI", "pull_request")

    def test_conflicting_duplicate_artifacts_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            windows, _, _, digests = fixture(root)
            subdir = windows / "other"
            subdir.mkdir()
            (subdir / "AoE2HDBets Watcher 1.6.4.exe").write_bytes(b"evil")
            with patch.dict(assembler.SIGNED_WINDOWS, digests, clear=True):
                with self.assertRaisesRegex(assembler.BundleAssemblyError, "expected one copy"):
                    assembler.verify_windows(windows)


if __name__ == "__main__":
    unittest.main()
