from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.native_replay_contract import (
    AUTHORITY, PARSER_CONTRACT, SCHEMA, NativeReplayContractError,
    build_stats_only_review_evidence, canonical_json, load_manifest_json, manifest_digest,
    validate_control_observations, validate_native_manifest,
)


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


WORKER = module("aoe2_native_replay_worker")
BRIDGE = module("aoe2_operator_bridge")


def manifest_fixture(count=4):
    value = {
        "schema": SCHEMA, "gameStatsId": 123, "replaySha256": "a" * 64,
        "sourceSnapshotSha256": "b" * 64, "logicalBattleId": "hd-platform-match:123",
        "sourceGameStatsIds": [123, 124],
        "archive": {"objectKey": "a" * 64 + ".aoe2record", "sha256": "a" * 64, "byteSize": 42},
        "roster": [
            {"slot": slot, "steamId": str(76561198100000000 + slot), "name": f"Player {slot}", "teamId": 0 if slot <= count // 2 else 1}
            for slot in range(1, count + 1)
        ],
        "parser": {**PARSER_CONTRACT, "status": "completed"},
        "result": {"known": True, "winningSlots": list(range(1, count // 2 + 1)), "provenance": "acceptedadjudication:12"},
        "financialExposure": {"markets": 0, "wagers": 0, "claims": 0, "settlements": 0},
        "candidateOnly": True, "executionKind": "control", "authority": dict(AUTHORITY),
    }
    value["manifestSha256"] = manifest_digest(value)
    return value


def reseal(value):
    value["manifestSha256"] = manifest_digest(value)
    return value


def envelope(value):
    return {
        "gameStatsId": value["gameStatsId"], "replaySha256": value["replaySha256"],
        "rosterSlots": [row["slot"] for row in value["roster"]], "candidateOnly": True,
        "nativePerformanceSeconds": 240, "timeoutSeconds": 300, "manifest": value,
    }


def observations(value):
    slots = [row["slot"] for row in value["roster"]]
    winners = value["result"]["winningSlots"]
    authority = {"authority_scope": "candidate_only", "terminal_authority": False,
                 "automatic_promotion_allowed": False, "settlement_authority": False}
    attempt = {
        **authority,
        "game_stats_id": value["gameStatsId"], "replay_sha256": value["replaySha256"],
        "run_id": "same-attempt", "cleanup_complete": True,
        "reason": "native_terminal_witness_recorded_candidate_only",
        **{key: False for key in (
            "production_results_mutated", "replay_truth_mutated", "betting_mutated", "wolo_mutated",
            "settlement_mutated", "control_gate_passed", "broad_execution_allowed",
        )},
    }
    receipt = {**authority, "observations": {
        "run_id": "same-attempt", "loaded": True, "terminal_outcome_proven": True,
        "roster_slots": slots, "result": {"outcome": "decisive", "winning_slots": winners,
            "losing_slots": [slot for slot in slots if slot not in winners]},
    }}
    validation = {**authority, "status": "recorded_terminal_witness", "file_integrity_verified": True,
        "observation_semantics_independently_verified": False}
    return attempt, receipt, validation


class ManifestContractTests(unittest.TestCase):
    def test_known_1v1_team_and_4v4_controls(self):
        for count in (2, 4, 6, 8):
            with self.subTest(count=count):
                value = manifest_fixture(count)
                self.assertEqual(validate_native_manifest(value), value)
                result = validate_control_observations(value, *observations(value), independently_verified=True)
                self.assertEqual(result["winningSlots"], value["result"]["winningSlots"])
                self.assertEqual(result["winningSteamIds"], [row["steamId"] for row in value["roster"][:count // 2]])
                self.assertEqual(result["winningTeamId"], 0)
                self.assertEqual(result["authority"], AUTHORITY)
                self.assertFalse(result["broadExecutionAllowed"])
                self.assertFalse(result["automaticPromotionAllowed"])

    def test_digest_binds_the_complete_snapshot(self):
        value = manifest_fixture()
        for key, changed in (("sourceSnapshotSha256", "c" * 64), ("logicalBattleId", "different")):
            bad = copy.deepcopy(value)
            bad[key] = changed
            with self.subTest(key=key), self.assertRaisesRegex(NativeReplayContractError, "SHA-256 mismatch"):
                validate_native_manifest(bad)
        bad = copy.deepcopy(value)
        bad["roster"][0]["name"] = "Another person"
        with self.assertRaisesRegex(NativeReplayContractError, "SHA-256 mismatch"):
            validate_native_manifest(bad)

    def test_unknown_candidate_remains_disabled_even_with_resealed_digest(self):
        value = manifest_fixture()
        value["result"]["known"] = False
        with self.assertRaisesRegex(NativeReplayContractError, "unknown native campaign is locked"):
            validate_native_manifest(reseal(value))

    def test_financial_exposure_rejected(self):
        for key in ("markets", "wagers", "claims", "settlements"):
            value = manifest_fixture()
            value["financialExposure"][key] = 1
            with self.subTest(key=key), self.assertRaisesRegex(NativeReplayContractError, "financially linked"):
                validate_native_manifest(reseal(value))

    def test_authority_escalation_rejected(self):
        for key in AUTHORITY:
            value = manifest_fixture()
            value["authority"][key] = True
            with self.subTest(key=key), self.assertRaisesRegex(NativeReplayContractError, "authority escalation"):
                validate_native_manifest(reseal(value))

    def test_archive_path_hash_container_and_missing_rejected(self):
        for changed in ({"objectKey": "../../attack.aoe2record"}, {"sha256": "c" * 64},
                        {"objectKey": "a" * 64 + ".aoe2mpgame"}, {"byteSize": 0}):
            value = manifest_fixture()
            value["archive"].update(changed)
            with self.subTest(changed=changed), self.assertRaises(NativeReplayContractError):
                validate_native_manifest(reseal(value))

    def test_arbitrary_runtime_fields_rejected(self):
        for key in ("executable", "bottle", "path", "shellCommand"):
            value = manifest_fixture()
            value[key] = "ignored-command-would-be-unsafe"
            with self.subTest(key=key), self.assertRaisesRegex(NativeReplayContractError, "invalid fields"):
                validate_native_manifest(reseal(value))

    def test_roster_identity_topology_and_slot_fail_closed(self):
        mutations = [
            lambda v: v["roster"][0].update(steamId="Zodiac"),
            lambda v: v["roster"][1].update(steamId=v["roster"][0]["steamId"]),
            lambda v: v["roster"][1].update(slot=1),
            lambda v: v["roster"][0].update(teamId=None),
            lambda v: v["roster"][0].update(teamId=True),
            lambda v: v["roster"][0].update(teamId=3),
            lambda v: v["result"].update(winningSlots=[1, 3]),
            lambda v: v.update(sourceGameStatsIds=[124]),
        ]
        for index, mutate in enumerate(mutations):
            value = manifest_fixture()
            mutate(value)
            with self.subTest(index=index), self.assertRaises(NativeReplayContractError):
                validate_native_manifest(reseal(value))

    def test_current_parser_contract_is_independent_from_result_authority(self):
        for key in PARSER_CONTRACT:
            value = manifest_fixture()
            value["parser"][key] = "old-or-unreviewed"
            with self.subTest(key=key), self.assertRaisesRegex(NativeReplayContractError, "parser contract"):
                validate_native_manifest(reseal(value))

    def test_manifest_json_duplicate_fields_rejected(self):
        value = canonical_json(manifest_fixture())
        value = value.replace('"candidateOnly":true', '"candidateOnly":true,"candidateOnly":false')
        with self.assertRaisesRegex(NativeReplayContractError, "duplicate fields"):
            load_manifest_json(value)

    def test_utf8_canonical_round_trip(self):
        value = manifest_fixture()
        value["roster"][0]["name"] = "Zodíac 🐉"
        reseal(value)
        self.assertEqual(load_manifest_json(canonical_json(value)), value)
        self.assertEqual(manifest_digest(dict(reversed(list(value.items())))), value["manifestSha256"])

    def test_terminal_absent_changed_mixed_attempt_or_cleanup_rejected(self):
        value = manifest_fixture()
        mutations = [
            lambda a, r, v: a.update(cleanup_complete=False),
            lambda a, r, v: r["observations"].update(run_id="other-attempt"),
            lambda a, r, v: r["observations"].update(terminal_outcome_proven=False),
            lambda a, r, v: r["observations"].update(loaded=False),
            lambda a, r, v: r["observations"]["result"].update(winning_slots=[3, 4], losing_slots=[1, 2]),
            lambda a, r, v: r["observations"]["result"].update(winning_slots=[1, 2, 3]),
            lambda a, r, v: a.update(wolo_mutated=True),
            lambda a, r, v: v.update(observation_semantics_independently_verified=True),
        ]
        for index, mutate in enumerate(mutations):
            args = observations(value)
            mutate(*args)
            with self.subTest(index=index), self.assertRaises(NativeReplayContractError):
                validate_control_observations(value, *args, independently_verified=True)
        with self.assertRaisesRegex(NativeReplayContractError, "independently revalidated"):
            validate_control_observations(value, *observations(value), independently_verified=False)

    def test_control_review_evidence_has_no_result_or_financial_authority(self):
        value = manifest_fixture()
        control = validate_control_observations(value, *observations(value), independently_verified=True)
        proposal = build_stats_only_review_evidence(value, control)
        self.assertTrue(proposal["candidateOnly"])
        self.assertTrue(proposal["requiresCommissionerApproval"])
        self.assertTrue(proposal["requestedAffectsStats"])
        for key in ("affectsStats", "affectsBets", "settlementAuthority", "woloAuthority"):
            self.assertIs(proposal[key], False)
        self.assertEqual(proposal["reviewerPath"], "/game-stats/123/review")
        self.assertEqual(proposal["completeRoster"], value["roster"])
        self.assertEqual(proposal["manifestSha256"], value["manifestSha256"])
        self.assertEqual(proposal["sourceSnapshotSha256"], value["sourceSnapshotSha256"])
        self.assertEqual(proposal["winningTeamKey"], "team:0")
        self.assertEqual(proposal["winningPlayerKeys"], ["steam:" + row["steamId"] for row in value["roster"][:2]])

    def test_review_evidence_rejects_failure_mixed_snapshot_and_escalation(self):
        value = manifest_fixture()
        control = validate_control_observations(value, *observations(value), independently_verified=True)
        for changed in ({"status": "FAIL"}, {"controlPassed": False}, {"manifestSha256": "f" * 64},
                        {"sourceSnapshotSha256": "f" * 64}, {"winningSlots": [3, 4]},
                        {"authority": {**AUTHORITY, "bets": True}}, {"automaticPromotionAllowed": True}):
            bad = {**control, **changed}
            with self.subTest(changed=changed), self.assertRaises(NativeReplayContractError):
                build_stats_only_review_evidence(value, bad)
        unknown = copy.deepcopy(value)
        unknown["result"]["known"] = False
        with self.assertRaisesRegex(NativeReplayContractError, "unknown native campaign"):
            build_stats_only_review_evidence(reseal(unknown), control)


class BridgeWorkerManifestTests(unittest.TestCase):
    def test_bridge_generalizes_known_control_only(self):
        value = manifest_fixture()
        command = BRIDGE.command_for_run({"id": "control-123", "action": "replay_native_run", "parameters": envelope(value)})
        self.assertEqual(command[-2:], ["--manifest-json", canonical_json(value)])
        self.assertEqual(command[command.index("--game-stats-id") + 1], "123")
        self.assertNotIn("shell", command)

    def test_bridge_revalidates_manifest_and_envelope(self):
        for key, changed in (("gameStatsId", 999), ("replaySha256", "c" * 64), ("rosterSlots", [1, 2])):
            parameters = envelope(manifest_fixture())
            parameters[key] = changed
            with self.subTest(key=key), self.assertRaisesRegex(BRIDGE.BridgeError, "differs from the immutable manifest"):
                BRIDGE.command_for_run({"id": "control", "action": "replay_native_run", "parameters": parameters})
        parameters = envelope(manifest_fixture())
        parameters["manifest"]["result"]["known"] = False
        reseal(parameters["manifest"])
        with self.assertRaisesRegex(BRIDGE.BridgeError, "unknown native campaign"):
            BRIDGE.command_for_run({"id": "control", "action": "replay_native_run", "parameters": parameters})

    def test_worker_independently_revalidates_and_does_not_start_invalid_request(self):
        value = manifest_fixture()
        args = argparse.Namespace(run_id="control-123", game_stats_id=124, replay_sha256=value["replaySha256"],
            roster_slot=[1, 2, 3, 4], native_performance_seconds=240, timeout_seconds=300,
            url="https://example.invalid", manifest_json=canonical_json(value))
        with patch.object(WORKER, "require_runtime") as runtime:
            with self.assertRaisesRegex(WORKER.WorkerError, "differs from the immutable manifest"):
                WORKER.run_native_attempt(args)
            runtime.assert_not_called()

    def test_worker_rejects_duplicate_execution_attempt(self):
        value = manifest_fixture()
        args = argparse.Namespace(run_id="same-attempt", game_stats_id=123, replay_sha256=value["replaySha256"],
            roster_slot=[1, 2, 3, 4], native_performance_seconds=240, timeout_seconds=300,
            url="https://example.invalid", manifest_json=canonical_json(value))
        with tempfile.TemporaryDirectory() as temp, patch.object(WORKER, "EVIDENCE_ROOT", Path(temp) / "instance/native-replay-worker/attempts"), \
             patch.object(WORKER, "require_runtime", return_value={}), patch.object(WORKER, "load_token", return_value="unused"), \
             patch.object(WORKER, "materialize_replay") as materialize:
            (Path(temp) / "instance/native-replay-worker/attempts/same-attempt").mkdir(parents=True)
            with self.assertRaisesRegex(WORKER.WorkerError, "already exists"):
                WORKER.run_native_attempt(args)
            materialize.assert_not_called()

    def test_fixed_serial_lock_rejects_concurrent_worker(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(WORKER, "EVIDENCE_ROOT", Path(temp) / "attempts"):
            with WORKER.native_execution_lock():
                with self.assertRaisesRegex(WORKER.WorkerError, "serial execution lock"):
                    with WORKER.native_execution_lock():
                        self.fail("concurrent worker entered")
            with WORKER.native_execution_lock():
                pass

    def test_evidence_root_uses_canonical_git_checkout_for_a_governed_source_worktree(self):
        with tempfile.TemporaryDirectory() as temp:
            common = Path(temp) / "api-prodn/.git"
            common.mkdir(parents=True)
            source = Path(temp) / "very-long-workspace-name/api-prodn/source"
            with patch.object(WORKER.subprocess, "check_output", return_value=str(common)) as git:
                root = WORKER.native_evidence_root(source)
            self.assertEqual(root, common.resolve().parent / "instance/native-replay-worker/attempts")
            self.assertEqual(git.call_args.kwargs["cwd"], source)
            self.assertNotIn("--output", BRIDGE.command_for_run({"id": "control", "action": "replay_native_run", "parameters": envelope(manifest_fixture())}))

    def test_download_revalidates_server_manifest_byte_count_and_hash(self):
        data = b"exact native replay bytes"
        value = manifest_fixture()
        value["replaySha256"] = hashlib.sha256(data).hexdigest()
        value["archive"] = {"sha256": value["replaySha256"], "objectKey": value["replaySha256"] + ".aoe2record", "byteSize": len(data)}
        reseal(value)
        for scenario in ("valid", "manifest_changed", "byte_count_changed", "bytes_changed"):
            expected = copy.deepcopy(value)
            if scenario == "byte_count_changed":
                expected["archive"]["byteSize"] += 1
                reseal(expected)
            response = io.BytesIO(data if scenario != "bytes_changed" else b"altered")
            response.headers = {
                "X-AoE2WAR-Replay-SHA256": expected["replaySha256"], "X-AoE2WAR-Game-Stats-ID": "123",
                "X-AoE2WAR-Replay-Extension": ".aoe2record", "Content-Length": str(len(data)),
                "X-AoE2WAR-Manifest-SHA256": expected["manifestSha256"] if scenario != "manifest_changed" else "f" * 64,
            }
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temp, \
                 patch.object(WORKER.urllib.request, "urlopen", return_value=response):
                kwargs = dict(base_url="https://example.invalid", token="unused", run_id="run",
                    expected_game_stats_id=123, expected_sha256=expected["replaySha256"], destination_dir=Path(temp), manifest=expected)
                if scenario == "valid":
                    path, count = WORKER.download_replay(**kwargs)
                    self.assertEqual(path.read_bytes(), data)
                    self.assertEqual(count, len(data))
                else:
                    with self.assertRaises(WORKER.WorkerError):
                        WORKER.download_replay(**kwargs)

    def test_manifest_terminal_failure_never_grants_control_or_promotes(self):
        value = manifest_fixture()
        payload = {"status": "loaded_without_terminal", "evidenceSha256": {}, "authority": dict(AUTHORITY)}
        result, code = WORKER.apply_manifest_control_validation(manifest=value, output=Path("/not-used"), payload=payload, candidate_exit_code=4)
        self.assertEqual(code, 4)
        self.assertEqual(result["trustedControlValidation"]["status"], "not_run")
        self.assertEqual(result["authority"], AUTHORITY)
        self.assertNotIn("statsOnlyReviewEvidence", result)

    def test_prelaunch_failure_diagnostic_is_immutable_bounded_and_credential_redacted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = WORKER.record_runner_failure(
                output=root / "attempt", game_stats_id=123, replay_sha256="a" * 64,
                runner_returncode=1, runner_output="x" * 12000 + "Steam wrapper conflict SECRET",
                token="SECRET", manifest=manifest_fixture(),
            )
            path = Path(payload["failureReceiptPath"])
            self.assertEqual(WORKER.sha256_file(path), payload["failureReceiptSha256"])
            self.assertNotIn("SECRET", path.read_text())
            self.assertIn("Steam wrapper conflict", payload["runnerOutputTail"])
            self.assertLess(len(payload["runnerOutputTail"]), 8100)
            self.assertIsNone(payload["cleanupComplete"])
            self.assertFalse(payload["terminalOutcomeProven"])
            self.assertEqual(path.stat().st_mode & 0o777, 0o400)
            with self.assertRaises(FileExistsError):
                WORKER.record_runner_failure(output=root / "attempt", game_stats_id=123, replay_sha256="a" * 64,
                    runner_returncode=1, runner_output="different", token="unused", manifest=manifest_fixture())


@unittest.skipUnless((WORKER.API_ROOT / "utils/replay_engine_witness.py").is_file(),
                     "independent API witness implementation is not present")
class NativeWitnessByteIntegrationTests(unittest.TestCase):
    """Synthetic native transcripts exercise the real existing byte referee.

    These controls test the transport/referee contract; they are explicitly not
    native playback receipts or evidence that the live control ladder passed.
    """

    def make_evidence(self, base, count=4):
        spec = importlib.util.spec_from_file_location("test_native_witness", WORKER.API_ROOT / "utils/replay_engine_witness.py")
        witness = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(witness)
        output = base / "attempt"
        output.mkdir()
        executable, data = base / "game.exe", base / "data.dat"
        executable.write_bytes(b"fixture executable, never run")
        data.write_bytes(b"fixture data, never run")
        replay_bytes = b"synthetic recorded replay fixture"
        value = manifest_fixture(count)
        value["replaySha256"] = hashlib.sha256(replay_bytes).hexdigest()
        value["archive"] = {"objectKey": value["replaySha256"] + ".aoe2record", "sha256": value["replaySha256"], "byteSize": len(replay_bytes)}
        reseal(value)
        artifact = output / value["archive"]["objectKey"]
        artifact.write_bytes(replay_bytes)
        slots = [row["slot"] for row in value["roster"]]
        plan = witness.create_plan(artifact, roster_slots=slots, replay_version="Version.HD",
            executable=executable, data_files=[data], runtime_version="unit fixture")
        witness.write_new_json(output / "plan.json", plan)
        winners = value["result"]["winningSlots"]
        requested = "Z:" + str(artifact).replace("/", "\\")
        performance = output / "replay-performanceOutput.txt"
        performance.write_text(requested + "\n" + "".join(
            f"{title}\n\tAverage: 1ms\n\tLow: 1ms\n\tHigh: 1ms\n\tSpike: 1ms\n" for title in ("Update", "Render")
        ) + "FPS\n\tAverage: 1fps\n\tLow: 1fps\n\tHigh: 1fps\n")
        terminal = output / "native-delta-001-Stats.txt"
        terminal.write_text("GAME OVER!\n" + "".join(f"  Player #{slot} {'Won' if slot in winners else 'Lost'}.\n" for slot in slots))
        invocation = {"replay_selection": {"requested_path": requested}, "steam_app_context": True}
        witness.write_new_json(output / "invocation.json", invocation)
        (output / "events.jsonl").write_text('{"kind":"fixture-never-launched"}\n')
        observation = {
            "native_performance_outputs": [witness.file_identity(performance)],
            "copied_native_logs": [{"source": {"path": str(base / "AILog/Stats.txt")}, "delta_copy": witness.file_identity(terminal)}],
        }
        witness.write_new_json(output / "observation.json", observation)
        receipt = witness.receipt_template(plan)
        for name in (performance.name, terminal.name, "invocation.json", "events.jsonl", "observation.json"):
            receipt["evidence"].append(witness.evidence_file(output / name, evidence_id=name, kind="log"))
        refs = [terminal.name]
        receipt["observations"] = {
            "run_id": "fixture-run", "observer": "fixture", "observed_at_utc": "2026-10-06T00:00:00Z", "launch_description": "never launched",
            "loaded": True, "load_evidence_refs": [performance.name], "roster_slots": slots, "roster_evidence_refs": refs,
            "recording_endpoint": {"kind": "terminal_outcome", "simulation_time_ms": None, "artifact_offset": None,
                "detail": "synthetic test fixture", "failure_category": None, "evidence_refs": refs},
            "game_over_banner": True, "game_over_evidence_refs": refs, "achievements_available": False, "achievements_evidence_refs": [],
            "terminal_outcome_proven": True, "terminal_evidence_refs": refs, "stats": [],
            "result": {"outcome": "decisive", "winning_slots": winners, "losing_slots": [slot for slot in slots if slot not in winners], "evidence_refs": refs},
        }
        witness.write_new_json(output / "receipt.json", receipt)
        witness.write_new_json(output / "validation.json", witness.validate_receipt(plan, receipt))
        attempt = observations(value)[0]
        attempt["run_id"] = "fixture-run"
        attempt["artifacts"] = [witness.file_identity(path) for path in sorted(output.iterdir())]
        witness.write_new_json(output / "attempt.json", attempt)
        return output, value, witness, WORKER.sha256_file(executable), WORKER.sha256_file(data)

    def refresh_integrity(self, output, witness):
        receipt = json.loads((output / "receipt.json").read_text())
        for item in receipt["evidence"]:
            item["file"] = witness.file_identity(item["file"]["path"])
        (output / "receipt.json").write_bytes(witness.canonical(receipt))
        plan = json.loads((output / "plan.json").read_text())
        (output / "validation.json").write_bytes(witness.canonical(witness.validate_receipt(plan, receipt)))
        attempt = json.loads((output / "attempt.json").read_text())
        attempt["artifacts"] = [witness.file_identity(path) for path in sorted(output.iterdir()) if path.name != "attempt.json"]
        (output / "attempt.json").write_bytes(witness.canonical(attempt))

    def test_real_witness_referee_accepts_synthetic_1v1_team_and_4v4_bytes(self):
        for count in (2, 6, 8):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as temp:
                output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp), count)
                with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha):
                    result = WORKER.independently_revalidate_control_evidence(output, value)
                    self.assertEqual(result["status"], "PASS")
                    self.assertEqual(result["winningSlots"], value["result"]["winningSlots"])
                    self.assertFalse(result["broadExecutionAllowed"])

    def test_worker_emits_review_evidence_only_after_rehashed_control_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp))
            payload = {"status": "candidate_terminal_witness", "evidenceSha256": {}}
            with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha):
                result, code = WORKER.apply_manifest_control_validation(manifest=value, output=output, payload=payload, candidate_exit_code=0)
            self.assertEqual(code, 0)
            self.assertEqual(result["status"], "candidate_terminal_witness_control_pass")
            self.assertEqual(result["statsOnlyReviewEvidence"]["controlValidationSha256"], result["evidenceSha256"]["trusted-control-validation.json"])
            self.assertFalse(result["statsOnlyReviewEvidence"]["affectsStats"])
            self.assertFalse(result["statsOnlyReviewEvidence"]["affectsBets"])

    def test_worker_never_emits_review_evidence_after_failed_referee(self):
        with tempfile.TemporaryDirectory() as temp:
            output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp))
            attempt = json.loads((output / "attempt.json").read_text())
            attempt["cleanup_complete"] = False
            (output / "attempt.json").write_bytes(witness.canonical(attempt))
            payload = {"status": "candidate_terminal_witness", "evidenceSha256": {}}
            with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha):
                result, code = WORKER.apply_manifest_control_validation(manifest=value, output=output, payload=payload, candidate_exit_code=0)
            self.assertEqual(code, 7)
            self.assertEqual(result["status"], "trusted_control_failed")
            self.assertNotIn("statsOnlyReviewEvidence", result)

    def test_altered_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp))
            (output / "native-delta-001-Stats.txt").write_text("altered terminal evidence")
            with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha), self.assertRaises((ValueError, WORKER.WorkerError)):
                WORKER.independently_revalidate_control_evidence(output, value)

    def test_resealed_incomplete_or_contradictory_raw_terminal_is_rejected(self):
        for text in ("GAME OVER!\n  Player #1 Won.\n", "GAME OVER!\n  Player #1 Lost.\n  Player #2 Lost.\n  Player #3 Won.\n  Player #4 Won.\n"):
            with self.subTest(text=text), tempfile.TemporaryDirectory() as temp:
                output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp))
                terminal = output / "native-delta-001-Stats.txt"
                terminal.write_text(text)
                observation = json.loads((output / "observation.json").read_text())
                observation["copied_native_logs"][0]["delta_copy"] = witness.file_identity(terminal)
                (output / "observation.json").write_bytes(witness.canonical(observation))
                self.refresh_integrity(output, witness)
                with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha), self.assertRaisesRegex(WORKER.WorkerError, "GAME OVER partition"):
                    WORKER.independently_revalidate_control_evidence(output, value)

    def test_resealed_missing_load_metrics_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            output, value, witness, exe_sha, data_sha = self.make_evidence(Path(temp))
            performance = output / "replay-performanceOutput.txt"
            performance.write_text("a filename without a completed native performance record")
            observation = json.loads((output / "observation.json").read_text())
            observation["native_performance_outputs"] = [witness.file_identity(performance)]
            (output / "observation.json").write_bytes(witness.canonical(observation))
            self.refresh_integrity(output, witness)
            with patch.object(WORKER, "EXPECTED_EXECUTABLE_SHA256", exe_sha), patch.object(WORKER, "EXPECTED_DATA_SHA256", data_sha), self.assertRaisesRegex(WORKER.WorkerError, "load is not proven"):
                WORKER.independently_revalidate_control_evidence(output, value)


if __name__ == "__main__":
    unittest.main()
