from __future__ import annotations

import fcntl
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_operator_bridge.py"
SPEC = importlib.util.spec_from_file_location("aoe2_operator_bridge", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class OperatorBridgeTests(unittest.TestCase):
    def test_command_map_read_actions(self):
        self.assertEqual(
            MODULE.command_for_run({"action": "audit"}),
            [str(MODULE.CLI), "audit", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "doctor"}),
            [str(MODULE.CLI), "doctor"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "brain"}),
            [str(MODULE.CLI), "brain", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "control_refresh"}),
            [str(MODULE.CLI), "control", "refresh"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "storage_status"}),
            [str(MODULE.CLI), "storage", "status", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "storage_plan"}),
            [str(MODULE.CLI), "storage", "plan", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "storage_campaign_status"}),
            [str(MODULE.CLI), "storage", "campaign", "status", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "storage_db_snapshot_status"}),
            [str(MODULE.CLI), "storage", "db-snapshots", "status", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "storage_db_snapshot_verify"}),
            [
                str(MODULE.CLI),
                "storage",
                "db-snapshots",
                "plan",
                "--json",
                "--verify-hashes",
            ],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "update_plan"}),
            [str(MODULE.CLI), "update", "--json"],
        )

    def test_deploy_requires_exact_local_head(self):
        with patch.object(MODULE, "local_head", return_value="a" * 40):
            with self.assertRaises(MODULE.BridgeError):
                MODULE.command_for_run(
                    {"action": "deploy", "expectedSourceSha": "b" * 40}
                )
            self.assertEqual(
                MODULE.command_for_run(
                    {"action": "deploy", "expectedSourceSha": "a" * 40}
                ),
                [str(MODULE.CLI), "deploy"],
            )

    def test_finish_is_fixed_command_with_bounded_parameters(self):
        self.assertEqual(
            MODULE.command_for_run(
                {
                    "action": "finish",
                    "parameters": {"message": "Ship the war room", "dryRun": True},
                }
            ),
            [
                str(MODULE.CLI),
                "finish",
                "--json",
                "--message",
                "Ship the war room",
                "--dry-run",
            ],
        )

    def test_finish_can_preserve_context_history(self):
        self.assertEqual(
            MODULE.command_for_run(
                {
                    "action": "finish",
                    "parameters": {
                        "message": "Seal evidence",
                        "preserveContextHistory": True,
                    },
                }
            ),
            [
                str(MODULE.CLI),
                "finish",
                "--json",
                "--message",
                "Seal evidence",
                "--preserve-context-history",
            ],
        )

    def test_native_replay_command_is_fixed_and_identity_bound(self):
        command = MODULE.command_for_run(
            {
                "id": "20260923120000-abcd1234",
                "action": "replay_native_run",
                "parameters": {
                    "gameStatsId": 32388,
                    "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                    "rosterSlots": [1, 2, 3, 4],
                    "candidateOnly": True,
                    "nativePerformanceSeconds": 240,
                    "timeoutSeconds": 300,
                },
            },
            base_url="https://example.invalid",
        )
        self.assertEqual(
            command,
            [
                sys.executable,
                str(MODULE.NATIVE_REPLAY_WORKER),
                "--run-id",
                "20260923120000-abcd1234",
                "--game-stats-id",
                "32388",
                "--replay-sha256",
                "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                "--native-performance-seconds",
                "240",
                "--timeout-seconds",
                "300",
                "--url",
                "https://example.invalid",
                "--roster-slot",
                "1",
                "--roster-slot",
                "2",
                "--roster-slot",
                "3",
                "--roster-slot",
                "4",
            ],
        )

    def test_native_replay_command_rejects_non_canary_game(self):
        with self.assertRaisesRegex(
            MODULE.BridgeError,
            "locked to trusted control GameStats #32388",
        ):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 99999,
                        "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                        "rosterSlots": [1, 2],
                        "candidateOnly": True,
                        "nativePerformanceSeconds": 240,
                        "timeoutSeconds": 300,
                    },
                }
            )

    def test_native_replay_command_rejects_wrong_canary_roster(self):
        with self.assertRaisesRegex(
            MODULE.BridgeError,
            "does not match trusted 32388 slots 1,2,3,4",
        ):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 32388,
                        "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                        "rosterSlots": [1, 2, 3],
                        "candidateOnly": True,
                        "nativePerformanceSeconds": 240,
                        "timeoutSeconds": 300,
                    },
                }
            )

    def test_native_replay_command_rejects_wrong_canary_sha(self):
        with self.assertRaisesRegex(
            MODULE.BridgeError,
            "does not match the trusted 32388 canary",
        ):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 32388,
                        "replaySha256": "a" * 64,
                        "rosterSlots": [1, 2],
                        "candidateOnly": True,
                        "nativePerformanceSeconds": 240,
                        "timeoutSeconds": 300,
                    },
                }
            )

    def test_native_replay_command_rejects_bounds_wider_than_engine(self):
        with self.assertRaises(MODULE.BridgeError):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 32388,
                        "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                        "rosterSlots": [1, 2, 3, 4],
                        "candidateOnly": True,
                        "nativePerformanceSeconds": 241,
                        "timeoutSeconds": 300,
                    },
                }
            )
        with self.assertRaises(MODULE.BridgeError):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 32388,
                        "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                        "rosterSlots": [1, 2, 3, 4],
                        "candidateOnly": True,
                        "nativePerformanceSeconds": 240,
                        "timeoutSeconds": 301,
                    },
                }
            )

    def test_native_replay_command_rejects_untrusted_parameters(self):
        with self.assertRaises(MODULE.BridgeError):
            MODULE.command_for_run(
                {
                    "id": "run",
                    "action": "replay_native_run",
                    "parameters": {
                        "gameStatsId": 32388,
                        "replaySha256": "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
                        "rosterSlots": [1, 2],
                        "candidateOnly": False,
                        "nativePerformanceSeconds": 240,
                        "timeoutSeconds": 300,
                    },
                }
            )

    def test_token_file(self):
        with tempfile.TemporaryDirectory() as temp:
            token_file = Path(temp) / "token"
            token_file.write_text("secret-token\n", encoding="utf-8")
            with patch.dict(os.environ, {"AOE2WAR_OS_BRIDGE_TOKEN": ""}):
                self.assertEqual(MODULE.load_token(token_file), "secret-token")

    def test_try_parse_json(self):
        self.assertEqual(MODULE.try_parse_json('{"p0":0}'), {"p0": 0})
        self.assertIsNone(MODULE.try_parse_json("not json"))

    def test_idle_heartbeat_cadence_is_real_and_bounded(self):
        with patch.object(MODULE, "post_bridge") as post:
            last = MODULE.maybe_idle_heartbeat(
                last_heartbeat_at=100.0,
                token="token",
                base_url="https://example.invalid",
                now=109.9,
            )
            self.assertEqual(last, 100.0)
            post.assert_not_called()

            last = MODULE.maybe_idle_heartbeat(
                last_heartbeat_at=last,
                token="token",
                base_url="https://example.invalid",
                now=110.0,
            )
            self.assertEqual(last, 110.0)
            post.assert_called_once_with(
                {"op": "heartbeat"},
                token="token",
                base_url="https://example.invalid",
            )

            post.reset_mock()
            last = MODULE.maybe_idle_heartbeat(
                last_heartbeat_at=last,
                token="token",
                base_url="https://example.invalid",
                now=119.9,
            )
            self.assertEqual(last, 110.0)
            post.assert_not_called()

    def test_finish_lock_pauses_claims(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / "finish.lock"
            lock.touch()
            with lock.open("a+", encoding="utf-8") as handle:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(MODULE, "FINISH_LOCK", lock):
                    self.assertTrue(MODULE.finish_in_progress())
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            with patch.object(MODULE, "FINISH_LOCK", lock):
                self.assertFalse(MODULE.finish_in_progress())


if __name__ == "__main__":
    unittest.main()
