"""Adversarial tests for Phase14 source-owned four-cache *guarded* wrapper.

All simulated; never touches a real user cache or invokes cleanup.
"""
import importlib.util
import io
from pathlib import Path
import stat
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "docs/review/fixtures/session_d_phase14_guarded_local_cache.py"
SPEC = importlib.util.spec_from_file_location("phase14_guarded_cache", FILE)
assert SPEC is not None and SPEC.loader is not None
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def preview(home, kib=150000):
    selected = {
        name: {
            "name": name,
            "path": str(home / suffix),
            "exists": name == "go_build_cache",
            "symlink": False,
            "allocated_bytes": kib * 1024 if name == "go_build_cache" else 0,
        }
        for name, suffix in MOD.ALLOWLIST.items()
    }
    return {"status": "PREVIEW", "apply": False}, selected


class GuardedLocalCacheTests(unittest.TestCase):
    def test_controller_allowlist_is_exactly_four_known_machine_cache_paths(self):
        self.assertEqual(MOD.ALLOWLIST, {
            "yarn_cache": "Library/Caches/Yarn",
            "go_build_cache": "Library/Caches/go-build",
            "pnpm_cache": "Library/Caches/pnpm",
            "core_simulator_cache": "Library/Developer/CoreSimulator/Caches",
        })
        for text in (".next", "node_modules", ".codex", "MobileSync", "Steam"):
            self.assertFalse(any(text in item for item in MOD.ALLOWLIST.values()))

    def test_symlinked_cache_cannot_pass_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            (home / "real").mkdir()
            (home / "Library").symlink_to(home / "real", target_is_directory=True)
            with self.assertRaises(MOD.Hold):
                MOD.assert_no_symlink_ancestors(home / "Library/Caches/Yarn", home)

    def test_read_only_default_never_invokes_apply(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(
            MOD.Path, "home", return_value=Path(temp)
        ), mock.patch.object(MOD, "validate_controller", return_value="a" * 40), mock.patch.object(
            MOD, "cache_identities", return_value={"test": 1}
        ), mock.patch.object(MOD, "source_preview", return_value=preview(Path(temp))), mock.patch.object(
            MOD, "df_kib", return_value={"available_kib": 9999}
        ), mock.patch.object(MOD, "call") as native, mock.patch.object(
            sys, "argv", ["phase14"]
        ), redirect_stdout(io.StringIO()):
            self.assertEqual(MOD.main(), 0)
            native.assert_not_called()

    def test_no_current_cache_does_not_execute_native(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(
            MOD.Path, "home", return_value=Path(temp)
        ), mock.patch.object(MOD, "validate_controller", return_value="a" * 40), mock.patch.object(
            MOD, "cache_identities", return_value={"test": 1}
        ), mock.patch.object(MOD, "source_preview", return_value=preview(Path(temp), 0)), mock.patch.object(
            MOD, "df_kib", return_value={"available_kib": 9999}
        ), mock.patch.object(
            MOD, "review_cache_roots", return_value=[]
        ), mock.patch.object(
            MOD, "call"
        ) as native, mock.patch.object(sys, "argv", ["phase14", "--apply"]), redirect_stdout(io.StringIO()):
            self.assertEqual(MOD.main(), 2)
            native.assert_not_called()

    def test_active_cache_consumer_blocks_before_native_apply(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(
            MOD.Path, "home", return_value=Path(temp)
        ), mock.patch.object(MOD, "validate_controller", return_value="a" * 40), mock.patch.object(
            MOD, "cache_identities", return_value={"test": 1}
        ), mock.patch.object(MOD, "source_preview", return_value=preview(Path(temp))), mock.patch.object(
            MOD, "df_kib", return_value={"available_kib": 9999}
        ), mock.patch.object(
            MOD, "lsof_has_consumers", side_effect=MOD.Hold("ACTIVE_PROCESS")
        ), mock.patch.object(
            MOD, "review_cache_roots", return_value=[]
        ), mock.patch.object(
            MOD, "call"
        ) as native, mock.patch.object(sys, "argv", ["phase14", "--apply"]), redirect_stdout(io.StringIO()):
            self.assertEqual(MOD.main(), 2)
            native.assert_not_called()

    def test_guarded_success_uses_only_existing_controller_and_seals_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            native_result = {
                "status": "PASS",
                "actions": [
                    {
                        "name": name,
                        "existed": name == "go_build_cache",
                        "removed": name == "go_build_cache",
                        "allocated_bytes_before": 150000 * 1024 if name == "go_build_cache" else 0,
                    }
                    for name in MOD.ALLOWLIST
                ],
                "receipt": "native-receipt",
            }
            df_readings = iter([
                {"available_kib": 1000},
                {"available_kib": 1020},
                {"available_kib": 15000},
            ])
            with mock.patch.object(MOD.Path, "home", return_value=home), mock.patch.object(
                MOD, "validate_controller", return_value="a" * 40
            ), mock.patch.object(
                MOD, "cache_identities", return_value={"test": 1}
            ), mock.patch.object(
                MOD, "source_preview", return_value=preview(home)
            ), mock.patch.object(
                MOD, "df_kib", side_effect=lambda: next(df_readings)
            ), mock.patch.object(
                MOD, "apfs_volume_usage", return_value={"status": "PASS"}
            ), mock.patch.object(
                MOD, "lsof_has_consumers"
            ), mock.patch.object(
                MOD, "call",
                return_value=types.SimpleNamespace(
                    returncode=0,
                    stdout=__import__("json").dumps(native_result),
                    stderr="",
                ),
            ) as native, mock.patch.object(
                MOD, "record_receipt", return_value=(Path("sealed.json"), "f" * 64)
            ) as receipt, mock.patch.object(
                sys, "argv", ["phase14", "--apply"]
            ), redirect_stdout(io.StringIO()):
                self.assertEqual(MOD.main(), 0)
                self.assertEqual(native.call_count, 1)
                args = native.call_args.args[0]
                self.assertEqual(args[1:], [
                    "storage", "local-maintain", "--apply", "--json",
                ])
                self.assertEqual(receipt.call_args.args[0]["data_ordinary_free_net_delta_kib"], 13980)

    def test_no_other_delete_apis_in_review_wrapper_source(self):
        content = FILE.read_text(encoding="utf-8")
        self.assertNotIn("shutil.rmtree(", content)
        self.assertNotIn(".unlink(", content)
        self.assertNotIn("git worktree prune", content)


if __name__ == "__main__":
    unittest.main()
