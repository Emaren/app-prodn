from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import sys
import threading
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_doctor.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_doctor", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DoctorTests(unittest.TestCase):
    def test_semver_core(self):
        self.assertEqual(MODULE.semver_core("v24.1.2"), "24.1.2")
        self.assertEqual(MODULE.semver_core("Python 3.13.5"), "3.13.5")
        self.assertIsNone(MODULE.semver_core("unknown"))

    def test_dependency_core_strips_range_prefix(self):
        self.assertEqual(MODULE.dependency_core("^7.4.0"), "7.4.0")
        self.assertEqual(MODULE.dependency_core("15.1.7"), "15.1.7")

    def test_version_prefix_matches(self):
        self.assertTrue(MODULE.version_prefix_matches("Python 3.13.5", "3.13"))
        self.assertFalse(MODULE.version_prefix_matches("Python 3.12.9", "3.13"))

    def test_version_at_least(self):
        self.assertTrue(MODULE.version_at_least("1.2.0", "1.2.0"))
        self.assertTrue(MODULE.version_at_least("v1.3.1", "1.2.0"))
        self.assertFalse(MODULE.version_at_least("1.1.9", "1.2.0"))
        self.assertFalse(MODULE.version_at_least("unknown", "1.2.0"))

    def test_parse_percent(self):
        self.assertEqual(MODULE.parse_percent("87%"), 87)
        self.assertEqual(MODULE.parse_percent("87"), 87)
        self.assertIsNone(MODULE.parse_percent(None))

    def test_map_missing_terms(self):
        self.assertEqual(
            MODULE.map_missing_terms("AoE2WAR Operator Bridge", ["AoE2WAR", "8092"]),
            ["8092"],
        )

    def test_score_deducts_findings(self):
        doctor = MODULE.Doctor()
        doctor.add("WARN", "Host", "x", "x", 2)
        doctor.add("INFO", "Host", "y", "y", 0)
        self.assertEqual(doctor.score(), 98)
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_blocker_sets_unsafe(self):
        doctor = MODULE.Doctor()
        doctor.add("BLOCKER", "Production", "down", "down", 10)
        self.assertEqual(doctor.status(), "UNSAFE")
        self.assertEqual(doctor.category_status("Production"), "FAIL")

    def test_collect_doctor_overlaps_estate_audit_with_independent_checks(self):
        audit_started = threading.Event()
        release_seen = threading.Event()
        allow_audit_finish = threading.Event()

        class FakeAudit:
            def payload(self):
                return {"p0": 0, "p1": 0, "estate": "HEALTHY"}

        def slow_audit():
            audit_started.set()
            self.assertTrue(release_seen.wait(1.0))
            self.assertTrue(allow_audit_finish.wait(1.0))
            return FakeAudit()

        def release_collect():
            self.assertTrue(audit_started.wait(1.0))
            release_seen.set()
            allow_audit_finish.set()
            return {}

        noops = [
            "check_contract",
            "check_production_summary",
            "check_staking_custody",
            "check_replay_api",
            "check_local_bridge",
            "check_host_and_server_bridge",
            "check_maintenance_safety",
            "check_toolchain",
            "check_architecture",
            "check_disaster_recovery",
        ]
        patches = [patch.object(MODULE, name) for name in noops]
        started = [item.start() for item in patches]
        try:
            with (
                patch.object(MODULE, "load_contract", return_value={}),
                patch.object(MODULE.aoe2_audit, "collect_audit", side_effect=slow_audit),
                patch.object(MODULE.aoe2_release, "collect", side_effect=release_collect),
            ):
                doctor = MODULE.collect_doctor()
        finally:
            for item in reversed(patches):
                item.stop()

        self.assertTrue(audit_started.is_set())
        self.assertTrue(release_seen.is_set())
        self.assertEqual(doctor.info["estate"]["p0"], 0)
        self.assertEqual(doctor.info["estate"]["p1"], 0)

    def test_collect_doctor_parallelizes_independent_probes_and_preserves_order(self):
        staking_started = threading.Event()
        replay_started = threading.Event()

        def add_marker(key, category="Host"):
            def check(doctor, *args):
                if key == "staking":
                    staking_started.set()
                    self.assertTrue(replay_started.wait(1.0))
                elif key == "replay":
                    replay_started.set()
                    self.assertTrue(staking_started.wait(1.0))
                doctor.add("WARN", category, key, key, 0)
                doctor.info[key] = True
            return check

        with (
            patch.object(MODULE, "load_contract", return_value={}),
            patch.object(MODULE, "check_contract"),
            patch.object(MODULE.aoe2_release, "collect", return_value={}),
            patch.object(MODULE, "check_production_summary", side_effect=add_marker("production", "Production")),
            patch.object(MODULE, "check_staking_custody", side_effect=add_marker("staking")),
            patch.object(MODULE, "check_replay_api", side_effect=add_marker("replay")),
            patch.object(MODULE, "check_local_bridge", side_effect=add_marker("local")),
            patch.object(MODULE, "check_host_and_server_bridge", side_effect=add_marker("host")),
            patch.object(MODULE, "check_maintenance_safety", side_effect=add_marker("maintenance")),
            patch.object(MODULE, "check_toolchain", side_effect=add_marker("toolchain", "Toolchain")),
            patch.object(MODULE, "check_architecture", side_effect=add_marker("architecture", "Architecture")),
            patch.object(MODULE, "check_disaster_recovery", side_effect=add_marker("recovery", "Disaster Recovery")),
        ):
            doctor = MODULE.collect_doctor(
                estate_payload={"p0": 0, "p1": 0, "estate": "HEALTHY"}
            )

        self.assertEqual(
            [item.key for item in doctor.findings],
            [
                "production",
                "staking",
                "replay",
                "local",
                "host",
                "maintenance",
                "toolchain",
                "architecture",
                "recovery",
            ],
        )

    def test_merge_doctor_rejects_info_collisions(self):
        target = MODULE.Doctor()
        source = MODULE.Doctor()
        target.info["release"] = {"one": 1}
        source.info["release"] = {"two": 2}
        with self.assertRaisesRegex(RuntimeError, "namespace collision"):
            MODULE.merge_doctor(target, source)

    def test_collect_doctor_uses_supplied_estate_without_new_audit(self):
        noops = [
            "check_contract",
            "check_production_summary",
            "check_staking_custody",
            "check_replay_api",
            "check_local_bridge",
            "check_host_and_server_bridge",
            "check_maintenance_safety",
            "check_toolchain",
            "check_architecture",
            "check_disaster_recovery",
        ]
        patches = [patch.object(MODULE, name) for name in noops]
        [item.start() for item in patches]
        try:
            with (
                patch.object(MODULE.aoe2_audit, "collect_audit", side_effect=AssertionError("unexpected audit")),
                patch.object(MODULE.aoe2_release, "collect", return_value={}),
            ):
                doctor = MODULE.collect_doctor(
                    estate_payload={"p0": 0, "p1": 0, "estate": "HEALTHY"}
                )
        finally:
            for item in reversed(patches):
                item.stop()

        self.assertEqual(doctor.info["estate"]["estate"], "HEALTHY")


    def test_maintenance_safety_problems_exact(self):
        policy = {
            "wolo_service": "wolochaind-mainnet.service",
            "wolo_oom_score_adjust": -900,
        }
        snapshot = {
            "node_service": "wolochaind-mainnet.service",
            "service_state": "active",
            "systemd_oom": "-900",
            "live_oom": "-900",
            "runner_sha": "a" * 64,
            "runner_source_sha": "a" * 64,
            "dropin_sha": "b" * 64,
            "dropin_source_sha": "b" * 64,
            "runner_mode": "755",
            "dropin_mode": "644",
        }
        self.assertEqual(
            MODULE.maintenance_safety_problems(policy, snapshot),
            [],
        )

    def test_maintenance_safety_problems_detect_drift(self):
        policy = {
            "wolo_service": "wolochaind-mainnet.service",
            "wolo_oom_score_adjust": -900,
        }
        snapshot = {
            "node_service": "wolochaind-mainnet.service",
            "service_state": "inactive",
            "systemd_oom": "0",
            "live_oom": "0",
            "runner_sha": "a",
            "runner_source_sha": "b",
            "dropin_sha": "c",
            "dropin_source_sha": "d",
            "runner_mode": "700",
            "dropin_mode": "600",
        }
        problems = MODULE.maintenance_safety_problems(policy, snapshot)
        self.assertGreaterEqual(len(problems), 7)
        self.assertTrue(any("service_state" in value for value in problems))
        self.assertTrue(any("live_oom" in value for value in problems))
        self.assertTrue(any("runner" in value for value in problems))

    def test_replay_api_implementation_authority_accepts_docs_only_descendants(self):
        baseline = "e" * 40
        local_head = "d" * 40
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = pathlib.Path(temp_dir)
            (repo / "docs").mkdir()
            (repo / "docs" / "document-registry.json").write_text(
                json.dumps(
                    {
                        "implementation_baseline": {
                            "branch": "main",
                            "commit": baseline,
                        }
                    }
                ),
                encoding="utf-8",
            )

            def fake_run(args, *, cwd=MODULE.ROOT, timeout=30):
                if args[:3] == ["git", "diff", "--name-only"]:
                    return (
                        0,
                        "\n".join(
                            [
                                "README.md",
                                "agent/README.agent.md",
                                "docs/REPLAY_ENGINE_ROOM_WORKER.md",
                                "docs/document-registry.json",
                            ]
                        ),
                    )
                if args[:3] == ["git", "merge-base", "--is-ancestor"]:
                    return 0, ""
                raise AssertionError(f"unexpected command: {args}")

            with patch.object(MODULE, "run", side_effect=fake_run):
                source, problems, evidence = MODULE.replay_api_implementation_authority(
                    repo,
                    local_head,
                    "main",
                )

        self.assertEqual(source, baseline)
        self.assertEqual(problems, [])
        self.assertEqual(evidence["non_documentation_changes"], [])

    def test_replay_api_implementation_authority_rejects_code_after_baseline(self):
        baseline = "e" * 40
        local_head = "d" * 40
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = pathlib.Path(temp_dir)
            (repo / "docs").mkdir()
            (repo / "docs" / "document-registry.json").write_text(
                json.dumps(
                    {
                        "implementation_baseline": {
                            "branch": "main",
                            "commit": baseline,
                        }
                    }
                ),
                encoding="utf-8",
            )

            def fake_run(args, *, cwd=MODULE.ROOT, timeout=30):
                if args[:3] == ["git", "diff", "--name-only"]:
                    return 0, "utils/replay_engine.py"
                raise AssertionError(f"unexpected command: {args}")

            with patch.object(MODULE, "run", side_effect=fake_run):
                source, problems, evidence = MODULE.replay_api_implementation_authority(
                    repo,
                    local_head,
                    "main",
                )

        self.assertIsNone(source)
        self.assertTrue(any("implementation changed" in value for value in problems))
        self.assertEqual(evidence["non_documentation_changes"], ["utils/replay_engine.py"])

    def test_replay_api_accepts_production_at_docs_only_implementation_baseline(self):
        baseline = "e" * 40
        local_head = "d" * 40
        migration = "abc123"

        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = pathlib.Path(temp_dir) / "AoE2HDBets"
            app_root = workspace / "app-prodn"
            api_root = workspace / "api-prodn"
            app_root.mkdir(parents=True)
            (api_root / "docs").mkdir(parents=True)
            (api_root / ".venv" / "bin").mkdir(parents=True)
            (api_root / "docs" / "document-registry.json").write_text(
                json.dumps(
                    {
                        "implementation_baseline": {
                            "branch": "main",
                            "commit": baseline,
                        }
                    }
                ),
                encoding="utf-8",
            )

            def fake_run(args, *, cwd=MODULE.ROOT, timeout=30):
                if args == ["git", "rev-parse", "HEAD"]:
                    return 0, local_head
                if args == ["git", "branch", "--show-current"]:
                    return 0, "main"
                if args == ["git", "status", "--porcelain", "--untracked-files=all"]:
                    return 0, ""
                if args[:4] == ["git", "ls-remote", "--exit-code", "origin"]:
                    return 0, f"{local_head}\trefs/heads/main"
                if str(args[0]).endswith("/alembic") and args[1:] == ["heads"]:
                    return 0, f"{migration} (head)"
                if args[:3] == ["git", "diff", "--name-only"]:
                    return 0, "README.md\ndocs/document-registry.json"
                if args[:3] == ["git", "merge-base", "--is-ancestor"]:
                    return 0, ""
                if args[:3] == ["git", "cat-file", "-e"]:
                    return 0, ""
                raise AssertionError(f"unexpected command: {args}")

            remote_output = "\n".join(
                [
                    f"head\t{baseline}",
                    "branch\tmain",
                    "dirty\t0",
                    "service\tactive",
                    "port_count\t1",
                    'health\t{"status":"ok"}',
                    f"migration_current\t{migration}",
                ]
            )
            contract = {
                "canonical": {"production_host": "hel1"},
                "components": {
                    "replay_api": {
                        "local_repo": "../api-prodn",
                        "production_repo": "/var/www/AoE2HDBets/api-prodn",
                        "service": "aoe2hdbets-api.service",
                        "branch": "main",
                        "health_url": "http://127.0.0.1:3330/health",
                    }
                },
            }
            doctor = MODULE.Doctor()
            with (
                patch.object(MODULE, "ROOT", app_root),
                patch.object(MODULE, "run", side_effect=fake_run),
                patch.object(MODULE, "ssh", return_value=(0, remote_output)),
            ):
                MODULE.check_replay_api(doctor, contract)

        self.assertNotIn("replay-api-proof", {item.key for item in doctor.findings})
        replay = doctor.info["replay_api"]
        self.assertEqual(replay["implementation_authority"]["commit"], baseline)
        self.assertTrue(replay["production"]["implementation_equivalent"])

    def test_staking_custody_healthy_has_no_blocker(self):
        doctor = MODULE.Doctor()
        contract = {"canonical": {"public_base_url": "https://aoe2war.example"}}
        payload = {
            "rewardDistributionReady": False,
            "operatorFunding": {
                "stakingWalletBalanceWolo": 120,
                "totalConfirmedStakedWolo": 100,
                "requiredStakingWalletBalanceWolo": 110,
                "operatorTopUpNeededWolo": 0,
                "walletUnderfunded": False,
                "operationalReserveHealthy": True,
            },
        }
        with patch.object(MODULE, "run", return_value=(0, MODULE.json.dumps(payload))):
            MODULE.check_staking_custody(doctor, contract)

        keys = {item.key for item in doctor.findings}
        self.assertNotIn("staking-custody-underfunded", keys)
        self.assertNotIn("staking-reward-distribution-unsafe", keys)
        self.assertFalse(doctor.info["staking_custody"]["reward_distribution_ready"])

    def test_staking_custody_underfunded_but_rewards_paused(self):
        doctor = MODULE.Doctor()
        contract = {"canonical": {"public_base_url": "https://aoe2war.example"}}
        payload = {
            "rewardDistributionReady": False,
            "rewardDistributionReadyDetail": "paused",
            "operatorFunding": {
                "stakingWalletBalanceWolo": 90,
                "totalConfirmedStakedWolo": 100,
                "requiredStakingWalletBalanceWolo": 110,
                "operatorTopUpNeededWolo": 20,
                "walletUnderfunded": True,
                "operationalReserveHealthy": False,
            },
        }
        with patch.object(MODULE, "run", return_value=(0, MODULE.json.dumps(payload))):
            MODULE.check_staking_custody(doctor, contract)

        keys = {item.key for item in doctor.findings}
        self.assertIn("staking-custody-underfunded", keys)
        self.assertNotIn("staking-reward-distribution-unsafe", keys)

    def test_staking_custody_underfunded_without_reward_pause_is_second_blocker(self):
        doctor = MODULE.Doctor()
        contract = {"canonical": {"public_base_url": "https://aoe2war.example"}}
        payload = {
            "operatorFunding": {
                "stakingWalletBalanceWolo": 90,
                "totalConfirmedStakedWolo": 100,
                "requiredStakingWalletBalanceWolo": 110,
                "operatorTopUpNeededWolo": 20,
                "walletUnderfunded": True,
                "operationalReserveHealthy": False,
            },
        }
        with patch.object(MODULE, "run", return_value=(0, MODULE.json.dumps(payload))):
            MODULE.check_staking_custody(doctor, contract)

        keys = {item.key for item in doctor.findings}
        self.assertIn("staking-custody-underfunded", keys)
        self.assertIn("staking-reward-distribution-unsafe", keys)

    def test_staking_custody_probe_failure_warns(self):
        doctor = MODULE.Doctor()
        contract = {"canonical": {"public_base_url": "https://aoe2war.example"}}
        with patch.object(MODULE, "run", return_value=(22, "curl failed")):
            MODULE.check_staking_custody(doctor, contract)

        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(
            findings["staking-custody-observability"].severity,
            "WARN",
        )

    def test_phased_only_host_update_is_informational(self):
        doctor = MODULE.Doctor()
        MODULE.add_host_update_findings(
            doctor,
            {
                "updates": "1",
                "updates_total": "1",
                "updates_actionable": "0",
                "updates_phased_deferred": "1",
                "updates_other_deferred": "0",
                "updates_probe_ok": "1",
                "updates_phased_names": "dnsmasq-base",
            },
        )

        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["updates-phased-deferred"].severity, "INFO")
        self.assertNotIn("updates-pending", findings)
        self.assertEqual(doctor.status(), "HEALTHY")
        self.assertEqual(doctor.score(), 100)
        self.assertEqual(doctor.info["host_update_classification"]["phased_deferred"], 1)

    def test_actionable_host_update_remains_attention(self):
        doctor = MODULE.Doctor()
        MODULE.add_host_update_findings(
            doctor,
            {
                "updates": "2",
                "updates_total": "2",
                "updates_actionable": "2",
                "updates_phased_deferred": "0",
                "updates_other_deferred": "0",
                "updates_probe_ok": "1",
            },
        )

        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["updates-pending"].severity, "WARN")
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_nonphased_deferred_update_requires_review(self):
        doctor = MODULE.Doctor()
        MODULE.add_host_update_findings(
            doctor,
            {
                "updates": "1",
                "updates_total": "1",
                "updates_actionable": "0",
                "updates_phased_deferred": "0",
                "updates_other_deferred": "1",
                "updates_probe_ok": "1",
                "updates_other_deferred_names": "held-package",
            },
        )

        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["updates-deferred-review"].severity, "WARN")
        self.assertIn("held-package", findings["updates-deferred-review"].detail)
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_failed_update_classification_fails_safe(self):
        doctor = MODULE.Doctor()
        MODULE.add_host_update_findings(
            doctor,
            {
                "updates": "3",
                "updates_total": "3",
                "updates_actionable": "3",
                "updates_probe_ok": "0",
            },
        )

        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["updates-classification"].severity, "WARN")
        self.assertEqual(findings["updates-pending"].severity, "WARN")
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_fresh_clean_vpssentry_security_is_healthy(self):
        doctor = MODULE.Doctor()
        MODULE.add_vpssentry_security_findings(doctor, {
            "vpssentry_probe_ok": "1",
            "vpssentry_ts": "2026-09-15T01:00:00+00:00",
            "vpssentry_age_seconds": "120",
            "vpssentry_critical_count": "0",
            "vpssentry_critical_ids": "",
        })
        self.assertEqual(doctor.status(), "HEALTHY")
        self.assertEqual(doctor.score(), 100)
        self.assertEqual(doctor.info["vpssentry_security"]["critical_count"], 0)

    def test_critical_vpssentry_security_indicator_is_blocker(self):
        doctor = MODULE.Doctor()
        MODULE.add_vpssentry_security_findings(doctor, {
            "vpssentry_probe_ok": "1",
            "vpssentry_ts": "2026-09-15T01:00:00+00:00",
            "vpssentry_age_seconds": "120",
            "vpssentry_critical_count": "1",
            "vpssentry_critical_ids": "service-hardening-gap",
        })
        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["vpssentry-critical-threat"].severity, "BLOCKER")
        self.assertIn("service-hardening-gap", findings["vpssentry-critical-threat"].detail)
        self.assertEqual(doctor.status(), "UNSAFE")

    def test_stale_vpssentry_security_telemetry_warns(self):
        doctor = MODULE.Doctor()
        MODULE.add_vpssentry_security_findings(doctor, {
            "vpssentry_probe_ok": "1",
            "vpssentry_age_seconds": "721",
            "vpssentry_critical_count": "0",
        })
        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["security-telemetry-stale"].severity, "WARN")
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_unavailable_vpssentry_security_telemetry_warns(self):
        doctor = MODULE.Doctor()
        MODULE.add_vpssentry_security_findings(doctor, {"vpssentry_probe_ok": "0"})
        findings = {item.key: item for item in doctor.findings}
        self.assertEqual(findings["security-telemetry-unavailable"].severity, "WARN")
        self.assertEqual(doctor.status(), "ATTENTION")


if __name__ == "__main__":
    unittest.main()
