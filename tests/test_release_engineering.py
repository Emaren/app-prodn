import fcntl
import io
import sys
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest import mock
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def state_data(*, local="a", github="a", prod="a", dirty=0, prod_dirty=0,
               reachable=True, staged=None, staged_modules=None,
               service="active", active="build", parity=True, docs_valid=True,
               w8092=1, w8093=1):
    return {
        "local": {"dirty_count": dirty, "head": local},
        "github": {"main_sha": github},
        "documentation": {"baseline_is_ancestor_of_local": docs_valid},
        "production": {
            "reachable": reachable,
            "source_sha": prod,
            "dirty_count": prod_dirty,
            "staged_build_id": staged,
            "staged_node_modules_present": (
                bool(staged) if staged_modules is None else staged_modules
            ),
            "service": service,
            "active_build_id": active,
            "version_parity": parity,
            "wolo_8092_count": w8092,
            "wolo_8093_count": w8093,
        },
        "certification": {"status": "legacy-unmanifested", "release_sha": None},
    }


class ReleaseEngineeringTests(unittest.TestCase):
    def test_run_preserves_leading_stdout_space(self):
        rc, out, _ = MODULE.run(
            ["python3", "-c", "import sys; sys.stdout.write(\" M file\\n\")"]
        )
        self.assertEqual(rc, 0)
        self.assertEqual(out, " M file")

    def test_state_authority_prefers_existing_canonical_operator_repo(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp) / "feature"
            operator = pathlib.Path(temp) / "canonical"
            (root / "config").mkdir(parents=True)
            operator.mkdir()
            (root / "config" / "aoe2war-operations.json").write_text(
                json.dumps({"canonical": {"operator_repo": str(operator)}}),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("AOE2_RELEASE_STATE_ROOT", None)
                self.assertEqual(
                    MODULE.resolve_state_authority_root(root),
                    operator.resolve(),
                )

    def test_state_authority_falls_back_to_current_root(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("AOE2_RELEASE_STATE_ROOT", None)
                self.assertEqual(
                    MODULE.resolve_state_authority_root(root),
                    root.resolve(),
                )

    def test_receipt_evidence_uses_canonical_state_authority(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            evidence = root / ".aoe2war-release" / "gates" / "proof.json"
            evidence.parent.mkdir(parents=True)
            evidence.write_text("proof", encoding="utf-8")
            import hashlib
            expected = hashlib.sha256(b"proof").hexdigest()
            with patch.object(MODULE, "STATE_AUTHORITY_ROOT", root):
                self.assertTrue(
                    MODULE.receipt_evidence_ok(
                        ".aoe2war-release/gates/proof.json",
                        expected,
                    )
                )

    def test_authority_display_path_is_relative_to_canonical_root(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            path = root / ".aoe2war-release" / "activation-receipts" / "x.json"
            with patch.object(MODULE, "STATE_AUTHORITY_ROOT", root):
                self.assertEqual(
                    MODULE.authority_display_path(path),
                    ".aoe2war-release/activation-receipts/x.json",
                )


    def test_docs_baseline_accepts_generated_branch_label(self):
        sha = "804cd13399c70e7f248c6e83beee425b92f242cd"
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            docs = root / "docs"
            docs.mkdir()
            (docs / "DOCUMENTATION_CONTROL_PLANE.md").write_text(
                f"Implementation baseline: `hotfix/client-flight-recorder-20260811` at `{sha}`\n",
                encoding="utf-8",
            )
            with patch.object(MODULE, "ROOT", root):
                self.assertEqual(MODULE.docs_baseline(), sha)

    def test_documentation_only_descendant_accepts_docs_owned_paths(self):
        with patch.object(MODULE, "is_ancestor", return_value=True), patch.object(
            MODULE,
            "run",
            return_value=(
                0,
                "docs/DOCUMENTATION_CONTROL_PLANE.md\nREADME.md\ncatalog-info.yaml\n",
                "",
            ),
        ):
            self.assertTrue(
                MODULE.documentation_only_descendant("a" * 40, "b" * 40)
            )

    def test_documentation_only_descendant_rejects_implementation_paths(self):
        with patch.object(MODULE, "is_ancestor", return_value=True), patch.object(
            MODULE,
            "run",
            return_value=(0, "docs/README.md\nscripts/aoe2_brain.py\n", ""),
        ):
            self.assertFalse(
                MODULE.documentation_only_descendant("a" * 40, "b" * 40)
            )

    def test_parse_kv(self):
        self.assertEqual(MODULE.parse_kv("head\tabc\nservice\tactive\n"), {"head": "abc", "service": "active"})

    def test_version_value(self):
        self.assertEqual(MODULE.version_value('{"buildVersion":"20260809-test"}'), "20260809-test")

    def test_public_version_retries_transient_probe_failures(self):
        responses = [
            (28, "", "timeout"),
            (0, "not-json", ""),
            (0, '{"buildVersion":"20260907-good"}', ""),
        ]
        with patch.object(MODULE, "run", side_effect=responses) as mocked_run, patch.object(
            MODULE.time, "sleep"
        ) as mocked_sleep:
            self.assertEqual(
                MODULE.public_version(attempts=3, retry_delay_seconds=0.01),
                "20260907-good",
            )
        self.assertEqual(mocked_run.call_count, 3)
        self.assertEqual(mocked_sleep.call_count, 2)

    def test_public_version_returns_first_valid_version_without_masking_mismatch(self):
        with patch.object(
            MODULE,
            "run",
            return_value=(0, '{"buildVersion":"20260907-other"}', ""),
        ) as mocked_run, patch.object(MODULE.time, "sleep") as mocked_sleep:
            self.assertEqual(
                MODULE.public_version(attempts=3, retry_delay_seconds=0.01),
                "20260907-other",
            )
        self.assertEqual(mocked_run.call_count, 1)
        mocked_sleep.assert_not_called()

    def test_public_version_fails_closed_after_bounded_transient_failures(self):
        with patch.object(
            MODULE,
            "run",
            return_value=(28, "", "timeout"),
        ) as mocked_run, patch.object(MODULE.time, "sleep") as mocked_sleep:
            self.assertIsNone(
                MODULE.public_version(attempts=3, retry_delay_seconds=0.01)
            )
        self.assertEqual(mocked_run.call_count, 3)
        self.assertEqual(mocked_sleep.call_count, 2)

    def test_dirty_paths_handles_rename(self):
        self.assertEqual(MODULE.dirty_paths([" M app/a.ts", "R  old.ts -> new.ts"]), ["app/a.ts", "new.ts"])

    def test_derive_state_dirty_wins(self):
        self.assertEqual(MODULE.derive_state(state_data(dirty=1))[0], "DIRTY")

    def test_derive_state_docs_invalid(self):
        self.assertEqual(MODULE.derive_state(state_data(docs_valid=False))[0], "DOCS_INVALID")

    def test_derive_state_diverged(self):
        self.assertEqual(MODULE.derive_state(state_data(local="b", github="a"))[0], "DIVERGED")

    def test_derive_state_production_dirty(self):
        self.assertEqual(MODULE.derive_state(state_data(prod_dirty=2))[0], "PRODUCTION_DIRTY")

    def test_derive_state_published(self):
        self.assertEqual(MODULE.derive_state(state_data(prod="old"))[0], "PUBLISHED")

    def test_derive_state_staged(self):
        self.assertEqual(MODULE.derive_state(state_data(staged="candidate"))[0], "STAGED")

    def test_derive_state_rejects_unpaired_staged_runtime(self):
        state, nxt = MODULE.derive_state(
            state_data(staged="candidate", staged_modules=False)
        )
        self.assertEqual(state, "STAGING_INCOMPLETE")
        self.assertIn("node_modules", nxt)

    def test_derive_state_staged_wins_before_source_parity(self):
        state, nxt = MODULE.derive_state(
            state_data(local="new", github="new", prod="previous", staged="candidate")
        )
        self.assertEqual(state, "STAGED")
        self.assertIn("previous live source", nxt)
        self.assertIn("aoe2war deploy", nxt)

    def test_derive_state_runtime_unhealthy(self):
        self.assertEqual(MODULE.derive_state(state_data(service="failed"))[0], "RUNTIME_UNHEALTHY")

    def test_derive_state_runtime_unverified(self):
        self.assertEqual(MODULE.derive_state(state_data(parity=False))[0], "RUNTIME_UNVERIFIED")

    def test_derive_state_protected_service_alert(self):
        self.assertEqual(MODULE.derive_state(state_data(w8092=0))[0], "PROTECTED_SERVICE_ALERT")

    def test_derive_state_active_source_parity(self):
        self.assertEqual(MODULE.derive_state(state_data())[0], "ACTIVE_SOURCE_PARITY")

    def test_derive_state_certified(self):
        data = state_data()
        data["certification"] = {"status": "CERTIFIED", "release_sha": "a"}
        self.assertEqual(MODULE.derive_state(data)[0], "CERTIFIED")

    def test_published_state_preserves_certified_runtime_truth(self):
        data = state_data(prod="old")
        data["certification"] = {"status": "CERTIFIED", "release_sha": "old"}
        state, nxt = MODULE.derive_state(data)
        self.assertEqual(state, "PUBLISHED")
        self.assertIn("CERTIFIED", nxt)


    def test_deployment_lock_blocks_second_mutating_command(self):
        with tempfile.TemporaryDirectory() as temp:
            lock_path = pathlib.Path(temp) / "deploy.lock"
            with lock_path.open("a+", encoding="utf-8") as handle:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(MODULE.DeployLockBusy):
                    with MODULE.deployment_lock(lock_path):
                        pass

    def test_canonical_local_lease_blocks_another_holder(self):
        with tempfile.TemporaryDirectory() as temp:
            lock_path = pathlib.Path(temp) / "release.lock"
            with MODULE.local_global_release_lease(lock_path, "first"):
                with self.assertRaises(MODULE.DeployLockBusy):
                    with MODULE.local_global_release_lease(lock_path, "second"):
                        pass
            self.assertFalse(lock_path.with_suffix(".lock.meta").exists())

    def test_inherited_lease_requires_owner_or_parent_pid(self):
        values = {
            MODULE.GLOBAL_LEASE_ENV: "lease-token",
            MODULE.GLOBAL_LEASE_OWNER_ENV: str(os.getpid()),
        }
        with patch.dict(os.environ, values, clear=False):
            self.assertTrue(MODULE.inherited_global_lease())
            os.environ[MODULE.GLOBAL_LEASE_OWNER_ENV] = "99999999"
            self.assertFalse(MODULE.inherited_global_lease())

    def test_release_history_reads_only_certified_activation_receipts(self):
        original = MODULE.ACTIVATION_RECEIPT_DIR
        MODULE.STATE_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=MODULE.STATE_DIR) as temp:
            receipt_dir = pathlib.Path(temp)
            MODULE.ACTIVATION_RECEIPT_DIR = receipt_dir
            try:
                certified = {
                    "schema": 1,
                    "kind": "aoe2war-activation-result",
                    "status": "CERTIFIED",
                    "generated_at": "2026-08-10T03:00:00Z",
                    "release_sha": "a" * 40,
                    "previous_production_sha": "b" * 40,
                    "risk_class": "INFRASTRUCTURE",
                    "active_build_id": "build-new",
                    "candidate_build_version": "version-new",
                    "fast_rollback": ".next-rollback-test",
                    "durable_rollback": "/durable/test",
                }
                (receipt_dir / "good.json").write_text(
                    json.dumps(certified), encoding="utf-8"
                )
                rejected = dict(certified, status="FAILED")
                (receipt_dir / "bad.json").write_text(
                    json.dumps(rejected), encoding="utf-8"
                )
                history = MODULE.release_history(limit=10)
                self.assertEqual(len(history), 1)
                self.assertEqual(history[0]["release_sha"], "a" * 40)
                self.assertEqual(history[0]["active_build_id"], "build-new")
            finally:
                MODULE.ACTIVATION_RECEIPT_DIR = original

class MutatingShipSourceP1Tests(unittest.TestCase):
    def _plan(self, **changes):
        value = {
            "blocked": False,
            "unknown_p0": [],
            "unknown_p1": [],
            "auto_remediable_p1": [],
            "blocked_source_docs": [],
        }
        value.update(changes)
        return value

    def _evaluate(self, plan):
        provider = SimpleNamespace(collect_plan=mock.Mock(return_value=plan))
        with patch.dict(sys.modules, {"aoe2_update": provider}):
            errors = MODULE.mutating_ship_source_blockers({"local": {"head": "a" * 40}})
        provider.collect_plan.assert_called_once_with(
            release_data={"local": {"head": "a" * 40}},
            defer_runtime_provenance=True,
        )
        return errors

    def test_existing_real_wolo_p1_refused_before_any_ship_mutation(self):
        p1 = {"area": "WoloChain", "key": "vps-source-drift",
              "detail": "VPS runtime differs from reviewed baseline"}
        errors = self._evaluate(self._plan(blocked=True, unknown_p1=[p1]))
        self.assertIn("WoloChain/vps-source-drift", errors[0])

    def test_remediable_label_does_not_auto_clear_wolo_p1(self):
        p1 = {"area": "WoloChain", "key": "vps-source-drift",
              "detail": "still needs independent disposition"}
        errors = self._evaluate(self._plan(auto_remediable_p1=[p1]))
        self.assertIn("WoloChain/vps-source-drift", errors[0])

    def test_other_finish_unknown_findings_fail_closed(self):
        errors = self._evaluate(self._plan(
            blocked=True,
            unknown_p0=[{"area": "Release", "key": "unreviewed-source"}],
        ))
        self.assertIn("Release/unreviewed-source", errors[0])

    def test_unblocked_plan_no_wolo_source_drift_allows_next_protected_gate(self):
        self.assertEqual(self._evaluate(self._plan()), [])

    def test_missing_or_broken_update_plan_fails_closed(self):
        provider = SimpleNamespace(collect_plan=mock.Mock(
            side_effect=RuntimeError("evidence inspection unavailable"),
        ))
        with patch.dict(sys.modules, {"aoe2_update": provider}):
            self.assertIn("unavailable", MODULE.mutating_ship_source_blockers({})[0])
        self.assertTrue(self._evaluate({"status": "UNVERIFIED"}))

    def test_every_mutating_ship_entrypoint_refuses_source_p1_before_action(self):
        modes = ([], ["--stage"], ["--activate", "fake-stage-receipt"],
                 ["--prepare-only"])
        fake_node = SimpleNamespace(
            ensure_build_node_runtime=mock.Mock(),
            BuildNodeError=RuntimeError,
        )
        for mode in modes:
            with self.subTest(mode=mode):
                with patch.dict(sys.modules, {"aoe2_node_runtime": fake_node}):
                    with patch.object(sys, "argv", ["aoe2war-release", "ship", *mode]):
                        with patch.object(MODULE, "collect", return_value={}):
                            with patch.object(
                                MODULE, "mutating_ship_source_blockers",
                                return_value=["WoloChain/vps-source-drift"],
                            ) as guard:
                                with patch.object(
                                    MODULE, "run_mutating_release",
                                ) as mutator:
                                    output = io.StringIO()
                                    with redirect_stdout(output):
                                        rc = MODULE.main()
                self.assertEqual(rc, 2)
                self.assertIn("SOURCE/P1 PREFLIGHT BLOCKED", output.getvalue())
                guard.assert_called_once_with({})
                mutator.assert_not_called()

    def test_read_only_ship_dry_run_does_not_invoke_mutation_p1_guard(self):
        fake_node = SimpleNamespace(
            ensure_build_node_runtime=mock.Mock(),
            BuildNodeError=RuntimeError,
        )
        fake_ship = SimpleNamespace(ship_release=mock.Mock(return_value=2))
        with patch.dict(sys.modules, {
            "aoe2_node_runtime": fake_node,
            "aoe2_release_ship": fake_ship,
        }):
            with patch.object(sys, "argv", [
                "aoe2war-release", "ship", "--dry-run",
            ]):
                with patch.object(MODULE, "collect", return_value={}):
                    with patch.object(
                        MODULE, "mutating_ship_source_blockers",
                    ) as guard:
                        self.assertEqual(MODULE.main(), 2)
        guard.assert_not_called()
        fake_ship.ship_release.assert_called_once()


    def test_all_malformed_evidence_lists_refuse_without_silent_skip(self):
        for field in ("unknown_p0", "unknown_p1", "auto_remediable_p1",
                      "blocked_source_docs"):
            with self.subTest(field=field):
                for bad in (None, {}, "ignored", ["not a finding"]):
                    evidence = self._plan(**{field: bad})
                    result = self._evaluate(evidence)
                    self.assertTrue(result)
                    self.assertIn("malformed " + field, result[0])

    def test_nonboolean_blocked_flag_refuses(self):
        for value in (0, "", "false", None):
            with self.subTest(value=value):
                errors = self._evaluate(self._plan(blocked=value))
                self.assertIn("blocked flag", errors[0])

    def test_locked_action_refreshes_source_and_refuses_new_p1_before_action(self):
        fresh = {"production": {"source_sha": "c" * 40}}
        action = mock.Mock(return_value=0)
        with patch.object(MODULE, "collect", return_value=fresh) as collector:
            with patch.object(
                MODULE, "mutating_ship_source_blockers",
                return_value=["WoloChain/vps-source-drift newly observed"],
            ) as guard:
                output = io.StringIO()
                with redirect_stdout(output):
                    result = MODULE.locked_mutating_ship(action)
        self.assertEqual(result, 2)
        self.assertIn("LOCKED MUTATING SHIP", output.getvalue())
        collector.assert_called_once()
        guard.assert_called_once_with(fresh)
        action.assert_not_called()

    def test_locked_action_uses_fresh_snapshot_only_when_source_clear(self):
        fresh = {"production": {"source_sha": "d" * 40}}
        action = mock.Mock(return_value=17)
        with patch.object(MODULE, "collect", return_value=fresh):
            with patch.object(
                MODULE, "mutating_ship_source_blockers", return_value=[],
            ):
                self.assertEqual(MODULE.locked_mutating_ship(action), 17)
        action.assert_called_once_with(fresh)

    def test_locked_snapshot_read_error_refuses_mutation(self):
        action = mock.Mock(return_value=0)
        with patch.object(
            MODULE, "collect", side_effect=RuntimeError("VPS unavailable"),
        ):
            self.assertEqual(MODULE.locked_mutating_ship(action), 2)
        action.assert_not_called()

    def test_mutating_dispatch_executes_locked_check_before_all_four_actions(self):
        fake_node = SimpleNamespace(
            ensure_build_node_runtime=mock.Mock(),
            BuildNodeError=RuntimeError,
        )
        fake_ship = SimpleNamespace(activate_release=mock.Mock(return_value=0))
        fake_stage = SimpleNamespace(stage_release=mock.Mock(return_value=0))
        fake_auto = SimpleNamespace(ship_all=mock.Mock(return_value=0))
        initial = {"local": {"head": "a" * 40}}
        fresh = {"local": {"head": "b" * 40}}
        modes = ([], ["--stage"], ["--activate", "existing-receipt"],
                 ["--prepare-only"])
        for mode in modes:
            with self.subTest(mode=mode):
                fake_ship.activate_release.reset_mock()
                fake_stage.stage_release.reset_mock()
                fake_auto.ship_all.reset_mock()
                state = {"checks": 0}

                def guard(_snapshot):
                    state["checks"] += 1
                    return [] if state["checks"] == 1 else [
                        "WoloChain/vps-source-drift changed while awaiting lease"
                    ]

                with patch.dict(sys.modules, {
                    "aoe2_node_runtime": fake_node,
                    "aoe2_release_ship": fake_ship,
                    "aoe2_release_stage": fake_stage,
                    "aoe2_release_auto": fake_auto,
                }):
                    with patch.object(sys, "argv", [
                        "aoe2war-release", "ship", *mode,
                    ]):
                        with patch.object(
                            MODULE, "collect", side_effect=[initial, fresh],
                        ):
                            with patch.object(
                                MODULE, "mutating_ship_source_blockers",
                                side_effect=guard,
                            ):
                                # Test the exact callable while standing in for
                                # lock acquisition. The real lock remains owned
                                # by run_mutating_release in production.
                                with patch.object(
                                    MODULE, "run_mutating_release",
                                    side_effect=lambda action: action(),
                                ):
                                    with redirect_stdout(io.StringIO()):
                                        rc = MODULE.main()
                self.assertEqual(rc, 2)
                self.assertEqual(state["checks"], 2)
                fake_ship.activate_release.assert_not_called()
                fake_stage.stage_release.assert_not_called()
                fake_auto.ship_all.assert_not_called()


if __name__ == "__main__":
    unittest.main()
