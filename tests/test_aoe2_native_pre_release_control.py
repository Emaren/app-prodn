from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_native_pre_release_control.py"
SPEC = importlib.util.spec_from_file_location("aoe2_native_pre_release_control", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class NativePreReleaseControlTests(unittest.TestCase):
    def test_control_is_exactly_locked_to_32388(self):
        self.assertEqual(MODULE.GAME_ID, 32388)
        self.assertEqual(MODULE.REPLAY_BYTES, 665734)
        self.assertEqual(
            MODULE.REPLAY_SHA256,
            "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
        )
        self.assertEqual(MODULE.ROSTER, (1, 2, 3, 4))

    def test_evidence_inventory_binds_all_regular_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nested").mkdir()
            (root / "a.txt").write_bytes(b"a")
            (root / "nested" / "b.bin").write_bytes(b"bb")
            inventory = MODULE.evidence_inventory(root)
            self.assertEqual(set(inventory), {"a.txt", "nested/b.bin"})
            self.assertEqual(
                inventory["nested/b.bin"]["sha256"],
                MODULE.hashlib.sha256(b"bb").hexdigest(),
            )

    def test_parse_last_json_ignores_non_json_runner_output(self):
        payload = MODULE.parse_last_json(
            "progress\nnot json\n"
            + json.dumps({"status": "blocked", "candidateOnly": True})
            + "\n"
        )
        self.assertEqual(payload, {"status": "blocked", "candidateOnly": True})
        self.assertIsNone(MODULE.parse_last_json("only diagnostic text\n"))

    def test_helper_build_uses_api_owned_builders(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            api = root / "api"
            (api / "scripts").mkdir(parents=True)
            for name in (
                "build_replay_memory_observer.py",
                "build_replay_playback_controller.py",
            ):
                (api / "scripts" / name).write_text("# test\n", encoding="utf-8")
            clang = root / "clang"
            lld = root / "lld-link"
            clang.write_text("", encoding="utf-8")
            lld.write_text("", encoding="utf-8")
            observer_dir = root / "work" / "observer"
            controller_dir = root / "work" / "controller"

            def fake_run(command, *, cwd, timeout=120):
                self.assertEqual(cwd, api)
                output = Path(command[command.index("--output") + 1])
                output.mkdir(parents=True)
                if "memory_observer" in Path(command[1]).name:
                    (output / "replay-memory-observer.exe").write_bytes(b"observer")
                else:
                    (output / "replay-playback-controller.exe").write_bytes(b"controller")
                (output / "build.json").write_text("{}\n", encoding="utf-8")
                return "{}\n"

            with (
                mock.patch.object(MODULE, "find_tool", side_effect=[clang, lld]),
                mock.patch.object(MODULE, "run_checked", side_effect=fake_run) as run,
            ):
                built = MODULE.build_helpers(api, root / "work")

            self.assertEqual(run.call_count, 2)
            self.assertEqual(
                built["observer"]["sha256"],
                MODULE.hashlib.sha256(b"observer").hexdigest(),
            )
            self.assertEqual(
                built["controller"]["sha256"],
                MODULE.hashlib.sha256(b"controller").hexdigest(),
            )
            self.assertEqual(Path(built["observer"]["path"]), observer_dir / "replay-memory-observer.exe")
            self.assertEqual(Path(built["controller"]["path"]), controller_dir / "replay-playback-controller.exe")

    def test_authority_contract_is_fail_closed_in_source(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('"HOLD_PENDING_INDEPENDENT_REVIEW"', source)
        self.assertIn('"engineEofObserved": False', source)
        self.assertIn('"wholeInputConsumptionProven": False', source)
        self.assertIn('"unknownGameExecutionEnabled": False', source)
        self.assertIn('"woloWrites": 0', source)
        self.assertIn('"HOLD_PROBE_INCOMPLETE"', source)
        self.assertIn('return result, 0 if probe_recorded else 4', source)
        self.assertIn('"--api-root"', source)
        self.assertIn('args.api_root.expanduser().resolve(strict=True)', source)
        self.assertIn('"--untracked-files=all"', source)


if __name__ == "__main__":
    unittest.main()
