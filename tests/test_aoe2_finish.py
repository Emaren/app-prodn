from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile
import unittest
from unittest import mock
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_finish.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_finish", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FinishTests(unittest.TestCase):
    def test_forced_post_release_docs_refresh_even_when_plan_is_current(self):
        plan = {"blocked": False, "changes_needed": False}
        with patch.object(
            MODULE.aoe2_update,
            "collect_plan",
            return_value=plan,
        ), patch.object(
            MODULE,
            "documentation_plan_summary",
            return_value={},
        ), patch.object(MODULE, "run_live") as run_live:
            result = MODULE.reconcile_documentation(
                label="Post-release current-state",
                progress=MODULE.Progress(enabled=False),
                json_mode=False,
                force_control_refresh=True,
            )

        args = run_live.call_args.args[0]
        self.assertIn("--force-control-refresh", args)
        self.assertEqual(result["result"], "RECONCILED")

    def test_documentation_reconcile_propagates_context_preservation(self):
        plan = {
            "blocked": False,
            "changes_needed": True,
            "baseline_refreshes": [],
            "central_sync": True,
            "context_projects": ["AoE2HDBets"],
            "blocked_source_docs": [],
            "unknown_p1": [],
        }
        with patch.object(
            MODULE.aoe2_update,
            "collect_plan",
            return_value=plan,
        ), patch.object(MODULE, "run_live") as run_live:
            MODULE.reconcile_documentation(
                label="Pre-release",
                progress=MODULE.Progress(enabled=False),
                json_mode=False,
                defer_context=True,
                preserve_context_history=True,
            )

        args = run_live.call_args.args[0]
        self.assertIn("--preserve-context-history", args)
        self.assertIn("--defer-context", args)

    def test_local_worktree_wins_when_vps_clean(self):
        plan = MODULE.source_plan(
            local_dirty=2,
            production_dirty=0,
            local_head="a" * 40,
            github_head="a" * 40,
            production_head="b" * 40,
        )
        self.assertEqual(plan.mode, "local_worktree")

    def test_vps_worktree_requires_exact_shared_base(self):
        plan = MODULE.source_plan(
            local_dirty=0,
            production_dirty=2,
            local_head="a" * 40,
            github_head="a" * 40,
            production_head="a" * 40,
        )
        self.assertEqual(plan.mode, "vps_worktree")

        with self.assertRaises(MODULE.FinishError):
            MODULE.source_plan(
                local_dirty=0,
                production_dirty=1,
                local_head="a" * 40,
                github_head="a" * 40,
                production_head="b" * 40,
            )

    def test_two_dirty_authorities_fail_closed(self):
        with self.assertRaises(MODULE.FinishError):
            MODULE.source_plan(
                local_dirty=1,
                production_dirty=1,
                local_head="a" * 40,
                github_head="a" * 40,
                production_head="a" * 40,
            )

    def test_history_reconcile_when_clean_heads_differ(self):
        plan = MODULE.source_plan(
            local_dirty=0,
            production_dirty=0,
            local_head="a" * 40,
            github_head="b" * 40,
            production_head="a" * 40,
        )
        self.assertEqual(plan.mode, "history_reconcile")

    def test_sensitive_paths(self):
        self.assertTrue(MODULE.is_sensitive_path(".env"))
        self.assertTrue(MODULE.is_sensitive_path("secrets/id_rsa"))
        self.assertTrue(MODULE.is_sensitive_path("x/private.pem"))
        self.assertFalse(MODULE.is_sensitive_path(".env.production.example"))
        self.assertFalse(MODULE.is_sensitive_path("lib/secretPolicy.ts"))

    def test_needs_deploy(self):
        clean = {
            "local": {"head": "a"},
            "production": {
                "reachable": True,
                "dirty_count": 0,
                "source_sha": "a",
                "service": "active",
                "version_parity": True,
            },
            "certification": {"status": "CERTIFIED", "release_sha": "a"},
        }
        self.assertFalse(MODULE.needs_deploy(clean))
        changed = {**clean, "local": {"head": "b"}}
        self.assertTrue(MODULE.needs_deploy(changed))

    def test_checkpoint_receipt_replaces_one_atomic_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "finish.json"
            payload = {"status": "RUNNING", "phases": {}}
            MODULE.checkpoint_receipt(path, payload)
            payload["status"] = "CERTIFIED"
            MODULE.checkpoint_receipt(path, payload)
            stored = MODULE.json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(stored["status"], "CERTIFIED")
            self.assertIn("updated_at", stored)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_production_role_can_be_forced_without_path_guessing(self):
        with patch.dict(MODULE.os.environ, {"AOE2_FINISH_HOST_ROLE": "production"}):
            self.assertTrue(MODULE.is_production_checkout())
        with patch.dict(MODULE.os.environ, {"AOE2_FINISH_HOST_ROLE": "operator"}):
            self.assertFalse(MODULE.is_production_checkout())

    def test_environment_value_parser_never_executes_content(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "bridge.env"
            path.write_text(
                "# comment\nexport AOE2WAR_OS_BRIDGE_TOKEN='fixed-token'\n",
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.parse_environment_value(path, "AOE2WAR_OS_BRIDGE_TOKEN"),
                "fixed-token",
            )

    def test_delegated_bridge_run_defers_reload_to_parent(self):
        with patch.dict(
            MODULE.os.environ,
            {"AOE2WAR_OPERATOR_BRIDGE_RUN_ID": "run-123"},
        ):
            result = MODULE.reload_operator_bridge_after_release(
                MODULE.Progress(enabled=False)
            )
        self.assertEqual(result["status"], "PARENT_SELF_RELOAD_PENDING")

    def test_context_overlap_captures_and_checkpoints_result(self):
        receipt = {}
        checkpoints = []
        with patch.object(
            MODULE.aoe2_update,
            "capture_context",
            return_value={
                "AoE2HDBets": {
                    "sha256": "a" * 64,
                    "bytes": 123,
                }
            },
        ):
            state = MODULE.start_pre_release_context_overlap(
                projects=["AoE2HDBets"],
                receipt=receipt,
                checkpoint=lambda: checkpoints.append("checkpoint"),
                progress=MODULE.Progress(enabled=False),
            )
            MODULE.settle_pre_release_context_overlap(
                state=state,
                receipt=receipt,
                checkpoint=lambda: checkpoints.append("checkpoint"),
                progress=MODULE.Progress(enabled=False),
            )

        overlap = receipt["pre_release_context_overlap"]
        self.assertEqual(overlap["status"], "PASSED")
        self.assertEqual(overlap["projects"], ["AoE2HDBets"])
        self.assertIn("AoE2HDBets", overlap["archives"])
        self.assertGreaterEqual(len(checkpoints), 2)

    def test_external_source_authorities_fail_closed_on_dirty_repo(self):
        with tempfile.TemporaryDirectory() as temp:
            base = pathlib.Path(temp)
            external = base / "external"
            docs = base / "docs"
            external.mkdir()
            docs.mkdir()
            with (
                patch.object(
                    MODULE.aoe2_update,
                    "SOURCES",
                    {"app-prodn": MODULE.ROOT, "api-prodn": external},
                ),
                patch.object(MODULE.aoe2_update, "DOCS", docs),
                patch.object(
                    MODULE.aoe2_update,
                    "git_output",
                    side_effect=lambda _repo, command, *args: (
                        "main" if command == "branch" else "a" * 40
                    ),
                ),
                patch.object(
                    MODULE.aoe2_update,
                    "status_paths",
                    side_effect=lambda repo: {"changed.py"} if repo == external else set(),
                ),
                patch.object(
                    MODULE.aoe2_update,
                    "remote_sha",
                    return_value="a" * 40,
                ),
            ):
                result = MODULE.external_source_authority_snapshot()

        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(
            result["repositories"]["api-prodn"]["status"],
            "DIRTY",
        )
        self.assertTrue(any("api-prodn" in item for item in result["blockers"]))


    def test_feature_handoff_requires_exact_clean_main(self):
        MODULE.validate_feature_handoff_state(
            feature_branch="feature/test",
            feature_head="b" * 40,
            canonical_branch="main",
            canonical_head="a" * 40,
            github_head="a" * 40,
            canonical_dirty=False,
            feature_descends_from_main=True,
        )

        with self.assertRaises(
            MODULE.FinishError
        ):
            MODULE.validate_feature_handoff_state(
                feature_branch="feature/test",
                feature_head="b" * 40,
                canonical_branch="main",
                canonical_head="a" * 40,
                github_head="c" * 40,
                canonical_dirty=False,
                feature_descends_from_main=True,
            )

        with self.assertRaises(
            MODULE.FinishError
        ):
            MODULE.validate_feature_handoff_state(
                feature_branch="feature/test",
                feature_head="b" * 40,
                canonical_branch="main",
                canonical_head="a" * 40,
                github_head="a" * 40,
                canonical_dirty=False,
                feature_descends_from_main=False,
            )



    def test_feature_baseline_refresh_allows_generated_paths_only(self):
        MODULE.validate_feature_baseline_paths(
            [
                "docs/DOCUMENTATION_CONTROL_PLANE.md",
                "docs/document-registry.json",
            ]
        )

        with self.assertRaises(
            MODULE.FinishError
        ):
            MODULE.validate_feature_baseline_paths(
                [
                    "docs/DOCUMENTATION_CONTROL_PLANE.md",
                    "docs/RELEASE_ENGINEERING.md",
                ]
            )



    def test_decode_nul_paths_preserves_first_character(self):
        payload = (
            b"docs/DOCUMENTATION_CONTROL_PLANE.md\0"
            b"docs/document-registry.json\0"
        )

        self.assertEqual(
            MODULE.decode_nul_paths(
                payload
            ),
            [
                "docs/DOCUMENTATION_CONTROL_PLANE.md",
                "docs/document-registry.json",
            ],
        )




class MaintenanceRunnerHandoffTests(unittest.TestCase):
    def test_finish_reconciles_runner_before_operational_doctor(self):
        import inspect

        source = inspect.getsource(MODULE.execute_finish)

        self.assertIn(
            '"maintenance_runner_reconciliation"',
            source,
        )
        self.assertIn(
            "reconcile_maintenance_runner",
            source,
        )
        self.assertIn(
            '"operational_preflight"',
            source,
        )
        self.assertLess(
            source.index('"maintenance_runner_reconciliation"'),
            source.index('"operational_preflight"'),
        )

    def test_runner_reconciliation_is_lock_serialized_and_wolo_guarded(self):
        import inspect

        source = inspect.getsource(MODULE.reconcile_maintenance_runner)

        self.assertIn('exec 8<>"$RELEASE_LOCK"', source)
        self.assertIn('exec 7<>"$RETENTION_LOCK"', source)
        self.assertIn('exec 9<>"$ARCHIVE_LOCK"', source)
        self.assertLess(
            source.index('exec 8<>"$RELEASE_LOCK"'),
            source.index('exec 7<>"$RETENTION_LOCK"'),
        )
        self.assertLess(
            source.index('exec 7<>"$RETENTION_LOCK"'),
            source.index('exec 9<>"$ARCHIVE_LOCK"'),
        )

        self.assertIn('test "$(listener_count 8092)" = "1"', source)
        self.assertIn('test "$(listener_count 8093)" = "1"', source)
        self.assertIn('test "$PID_AFTER" = "$PID_BEFORE"', source)
        self.assertIn('test "$RESTART_AFTER" = "$RESTART_BEFORE"', source)
        self.assertIn('test "$H4" -gt "$H3"', source)
        self.assertIn('"wolo_mutated": False', source)

    def test_runner_reconciliation_is_atomic_and_receipted(self):
        import inspect

        source = inspect.getsource(MODULE.reconcile_maintenance_runner)

        self.assertIn('TMP="$INSTALLED.partial.$"', source)
        self.assertIn('bash -n "$TMP"', source)
        self.assertIn('mv -f "$TMP" "$INSTALLED"', source)
        self.assertIn('chmod 0755 "$TMP"', source)
        self.assertIn('chown root:root "$TMP"', source)
        self.assertIn("maintenance-runner-sync-receipts", source)
        self.assertIn('os.chmod(tmp, 0o444)', source)

    def test_runner_reconciliation_waits_for_release_seam_and_reports_holders(self):
        import inspect

        source = inspect.getsource(MODULE.reconcile_maintenance_runner)

        self.assertIn("flock -w 300 8", source)
        self.assertIn("flock -w 15 7", source)
        self.assertIn("flock -w 15 9", source)
        self.assertIn("lock_holders()", source)
        self.assertIn("release lock did not clear within 300s", source)
        self.assertIn("holders=", source)


    def test_runner_reconciliation_template_renders_before_remote_execution(self):
        contract = MODULE.aoe2_doctor.load_contract()
        source = (
            MODULE.ROOT
            / contract["maintenance_safety"]["runner_source"]
        )
        source_text = source.read_text(encoding="utf-8")
        expected_sha = MODULE.hashlib.sha256(
            source_text.encode("utf-8")
        ).hexdigest()

        completed = mock.Mock(
            returncode=0,
            stdout=(
                "status\tNOOP\n"
                f"installed_sha256\t{expected_sha}\n"
                "receipt_path\t"
                "/tmp/maintenance-runner-sync-receipts/test.json\n"
            ),
        )

        with patch.object(
            MODULE,
            "git_output",
            return_value="a" * 40,
        ), patch.object(
            MODULE.subprocess,
            "run",
            return_value=completed,
        ):
            result = MODULE.reconcile_maintenance_runner(
                progress=MODULE.Progress(enabled=False),
            )

        self.assertEqual(result["status"], "NOOP")
        self.assertEqual(result["installed_sha256"], expected_sha)

    def test_runner_reconciliation_is_enabled_in_operations_contract(self):
        contract_path = pathlib.Path(__file__).resolve().parents[1] / "config" / "aoe2war-operations.json"
        contract = MODULE.json.loads(contract_path.read_text(encoding="utf-8"))

        self.assertIs(
            contract["finish"]["auto_maintenance_runner_reconcile"],
            True,
        )



class LearnedRootHeadroomRecoveryTests(unittest.TestCase):
    def contract(self):
        return {
            "canonical": {
                "volume_mount": (
                    "/mnt/HC_Volume_105319120"
                ),
            },
            "capacity": {
                "root_free_warn_gib": 5.0,
                "volume_used_critical_percent": 92.0,
            },
            "finish": {
                "auto_root_headroom_recovery": True,
                "root_headroom_journal_limit_mib": 100,
            },
        }

    def production(self):
        return {
            "source_sha": "a" * 40,
            "active_build_id": "active-build",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }

    def snapshot(self):
        return {
            "root": {
                "available_bytes": 4 * 1024 ** 3,
            },
            "volume": {
                "used_percent": 60.0,
            },
        }

    def test_generated_recovery_script_is_strictly_bounded(self):
        script = MODULE.remote_root_headroom_recovery_script(
            volume="/mnt/HC_Volume_105319120",
            floor_kb=5 * 1024 * 1024,
            journal_limit_mib=100,
            expected_source_sha="a" * 40,
            expected_active_build_id="active-build",
        )

        # Approved low-value reclaim classes.
        self.assertIn(
            "/var/lib/apt/lists",
            script,
        )
        self.assertIn(
            "/var/cache/apt",
            script,
        )
        self.assertIn(
            "journalctl",
            script,
        )
        self.assertIn(
            "--vacuum-size=",
            script,
        )
        self.assertIn(
            "/var/log/nginx",
            script,
        )
        self.assertIn(
            "-name '*.log.1'",
            script,
        )

        # Recovery counters are shell arithmetic, never command substitutions.
        for variable in (
            "APT_RECLAIMED_KB",
            "JOURNAL_RECLAIMED_KB",
            "NGINX_OPEN_SKIPPED",
            "DELTA",
            "NGINX_RECLAIMED_KB",
            "NGINX_ARCHIVED",
            "RECLAIMED_KB",
        ):
            self.assertIn(
                f"{variable}=$((",
                script,
            )
            self.assertNotIn(
                f"{variable}=$(\\n",
                script,
            )

        # Rotated logs are preserved before deletion.
        self.assertIn(
            "sha256sum",
            script,
        )
        self.assertIn(
            "NGINX_SHA256SUMS",
            script,
        )
        self.assertIn(
            "cp -a",
            script,
        )
        self.assertIn(
            'rm -- "$logfile"',
            script,
        )

        self.assertLess(
            script.index("cp -a"),
            script.index('rm -- "$logfile"'),
        )

        # Open rotated logs are never removed.
        self.assertIn(
            "/proc/[0-9]*/fd/*",
            script,
        )
        self.assertIn(
            "NGINX_OPEN_SKIPPED",
            script,
        )

        # Runtime + Wolo are proof-only.
        self.assertIn(
            'cat .next/BUILD_ID',
            script,
        )
        self.assertIn(
            "127.0.0.1:3030/api/bets",
            script,
        )
        self.assertIn(
            ":8092",
            script,
        )
        self.assertIn(
            ":8093",
            script,
        )

        # Explicitly forbidden cleanup classes.
        self.assertNotIn(
            'rm -rf -- "$APP/.next"',
            script,
        )
        self.assertNotIn(
            'rm -rf -- "$APP/node_modules"',
            script,
        )
        self.assertNotIn(
            "/var/lib/postgresql/",
            script,
        )
        self.assertNotIn(
            "/usr/local/bin/wolochaind-mainnet",
            script,
        )
        self.assertNotIn(
            "rm -rf /tmp",
            script,
        )

    def test_recovery_accepts_only_capacity_and_identity_proof(self):
        output = "\n".join(
            [
                "status\tRECOVERED",
                "receipt_dir\t/mnt/HC_Volume_105319120/"
                "aoe2war/root-headroom-recoveries/test",
                "before_kb\t4194304",
                "after_kb\t6291456",
                "reclaimed_kb\t2097152",
                "apt_reclaimed_kb\t300000",
                "journal_reclaimed_kb\t90000",
                "nginx_reclaimed_kb\t1707152",
                "nginx_archived_count\t2",
                "nginx_open_skipped_count\t0",
                "source_sha\t" + ("a" * 40),
                "active_build_id\tactive-build",
                "service\tactive",
                "wolo_8092_count\t1",
                "wolo_8093_count\t1",
            ]
        )

        with (
            mock.patch.object(
                MODULE.aoe2_doctor,
                "load_contract",
                return_value=self.contract(),
            ),
            mock.patch.object(
                MODULE,
                "ssh_text",
                return_value=(0, output),
            ),
        ):
            result = MODULE.recover_root_headroom(
                snapshot=self.snapshot(),
                production=self.production(),
            )

        self.assertEqual(
            result["status"],
            "RECOVERED",
        )

        self.assertEqual(
            result["active_build_id"],
            "active-build",
        )

    def test_recovery_fails_closed_when_approved_classes_are_insufficient(self):
        output = "\n".join(
            [
                "status\tINSUFFICIENT",
                "receipt_dir\t/mnt/HC_Volume_105319120/"
                "aoe2war/root-headroom-recoveries/test",
                "before_kb\t4194304",
                "after_kb\t5000000",
                "reclaimed_kb\t805696",
            ]
        )

        with (
            mock.patch.object(
                MODULE.aoe2_doctor,
                "load_contract",
                return_value=self.contract(),
            ),
            mock.patch.object(
                MODULE,
                "ssh_text",
                return_value=(45, output),
            ),
        ):
            with self.assertRaisesRegex(
                MODULE.FinishError,
                "approved reclaim classes",
            ):
                MODULE.recover_root_headroom(
                    snapshot=self.snapshot(),
                    production=self.production(),
                )

    def test_recovery_refuses_unsafe_wolo_precondition(self):
        production = self.production()
        production["wolo_8093_count"] = 0

        with mock.patch.object(
            MODULE.aoe2_doctor,
            "load_contract",
            return_value=self.contract(),
        ):
            with self.assertRaisesRegex(
                MODULE.FinishError,
                "Wolo listener counts",
            ):
                MODULE.recover_root_headroom(
                    snapshot=self.snapshot(),
                    production=production,
                )

    def test_finish_wires_recovery_only_for_low_root(self):
        import inspect

        source = inspect.getsource(
            MODULE.execute_finish
        )

        self.assertIn(
            "root_below_release_floor",
            source,
        )

        self.assertIn(
            "recover_root_headroom",
            source,
        )

        self.assertLess(
            source.index(
                "root_below_release_floor"
            ),
            source.index(
                "recover_root_headroom"
            ),
        )

        self.assertIn(
            "preflight_capacity_before_recovery",
            source,
        )

        self.assertIn(
            "root_headroom_recovery",
            source,
        )


if __name__ == "__main__":
    unittest.main()
