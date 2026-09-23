from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_native_replay_worker.py"
SPEC = importlib.util.spec_from_file_location("aoe2_native_replay_worker", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class NativeReplayWorkerTests(unittest.TestCase):
    def test_materialize_32388_prefers_exact_local_control(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "control.aoe2record"
            source.write_bytes(b"native-control-bytes")
            expected = MODULE.hashlib.sha256(source.read_bytes()).hexdigest()
            destination_dir = base / "out"
            destination_dir.mkdir()

            with patch.dict(
                MODULE.TRUSTED_LOCAL_CONTROLS,
                {32388: source},
                clear=True,
            ), patch.object(MODULE, "download_replay") as download:
                artifact, byte_size, artifact_source = MODULE.materialize_replay(
                    game_stats_id=32388,
                    replay_sha256=expected,
                    base_url="https://example.invalid",
                    token="unused",
                    run_id="run",
                    destination_dir=destination_dir,
                )

            download.assert_not_called()
            self.assertEqual(artifact_source, "trusted_local_control")
            self.assertEqual(byte_size, len(b"native-control-bytes"))
            self.assertEqual(artifact.read_bytes(), b"native-control-bytes")
            self.assertEqual(MODULE.sha256_file(artifact), expected)

    def test_materialize_32388_rejects_wrong_local_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            source = base / "control.aoe2record"
            source.write_bytes(b"wrong-control-bytes")
            destination_dir = base / "out"
            destination_dir.mkdir()

            with patch.dict(
                MODULE.TRUSTED_LOCAL_CONTROLS,
                {32388: source},
                clear=True,
            ):
                with self.assertRaises(MODULE.WorkerError):
                    MODULE.materialize_replay(
                        game_stats_id=32388,
                        replay_sha256="a" * 64,
                        base_url="https://example.invalid",
                        token="unused",
                        run_id="run",
                        destination_dir=destination_dir,
                    )

    def test_trusted_control_not_run_without_terminal_candidate(self):
        payload = {
            "status": "loaded_without_terminal",
            "evidenceSha256": {},
        }
        result, exit_code = MODULE.apply_trusted_control_validation(
            game_stats_id=32388,
            output=Path("/does/not/matter"),
            payload=payload,
            candidate_exit_code=4,
        )
        self.assertEqual(exit_code, 4)
        self.assertEqual(result["status"], "loaded_without_terminal")
        self.assertEqual(
            result["trustedControlValidation"]["status"],
            "not_run",
        )

    def test_non_control_candidate_is_left_candidate_only(self):
        payload = {
            "status": "candidate_terminal_witness",
            "evidenceSha256": {},
        }
        result, exit_code = MODULE.apply_trusted_control_validation(
            game_stats_id=99999,
            output=Path("/does/not/matter"),
            payload=payload,
            candidate_exit_code=0,
        )
        self.assertIs(result, payload)
        self.assertEqual(exit_code, 0)
        self.assertNotIn("trustedControlValidation", result)

    def test_32388_control_pass_is_recorded_and_hashed(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            control = {
                "status": "PASS",
                "control_passed": True,
                "game_stats_id": 32388,
                "trusted_winning_slots": [1, 2],
                "observed_winning_slots": [1, 2],
                "broad_execution_allowed": False,
                "automatic_promotion_allowed": False,
                "settlement_authority": False,
            }

            def fake_run(command, **kwargs):
                self.assertEqual(command[0], sys.executable)
                self.assertEqual(Path(command[1]), MODULE.TERMINAL_CONTROL_VALIDATOR)
                self.assertEqual(Path(command[2]), output)
                self.assertEqual(command[3], "--output")
                control_path = Path(command[4])
                control_path.write_text(json.dumps(control), encoding="utf-8")
                return type(
                    "Completed",
                    (),
                    {"returncode": 0, "stdout": json.dumps(control)},
                )()

            payload = {
                "status": "candidate_terminal_witness",
                "evidenceSha256": {},
            }
            with patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                result, exit_code = MODULE.apply_trusted_control_validation(
                    game_stats_id=32388,
                    output=output,
                    payload=payload,
                    candidate_exit_code=0,
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(
                result["status"],
                "candidate_terminal_witness_control_pass",
            )
            self.assertTrue(result["trustedControlValidation"]["control_passed"])
            self.assertRegex(
                result["evidenceSha256"]["trusted-control-validation.json"],
                r"^[0-9a-f]{64}$",
            )

    def test_32388_control_failure_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            payload = {
                "status": "candidate_terminal_witness",
                "evidenceSha256": {},
            }
            completed = type(
                "Completed",
                (),
                {
                    "returncode": 1,
                    "stdout": "winner partition disagrees with trusted control",
                },
            )()
            with patch.object(MODULE.subprocess, "run", return_value=completed):
                result, exit_code = MODULE.apply_trusted_control_validation(
                    game_stats_id=32388,
                    output=output,
                    payload=payload,
                    candidate_exit_code=0,
                )

            self.assertEqual(exit_code, 7)
            self.assertEqual(result["status"], "trusted_control_failed")
            self.assertEqual(result["trustedControlValidation"]["status"], "FAIL")
            self.assertIn(
                "disagrees with trusted control",
                result["trustedControlValidation"]["detail"],
            )


if __name__ == "__main__":
    unittest.main()
