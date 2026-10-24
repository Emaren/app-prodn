"""Independent NONPRODUCTION controller tests; never access VPS or signer service."""
from __future__ import annotations

import base64
import copy
import importlib.util
import hashlib
import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
import sys
sys.path.insert(0, str(SCRIPTS))
import aoe2_website_protected_release_v2 as CONTROL
import aoe2_website_release_v2 as AUTH


class ProtectedWebsiteControllerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.trust = self.root / "trust"
        self.trust.mkdir(mode=0o700)
        self.now = datetime(2026, 10, 24, 22, 30, tzinfo=timezone.utc)
        self.private = {}
        for role in (*AUTH.ROLES, "source_reviewer", "runtime_witness"):
            secret = self.root / (role + ".key")
            public = self.trust / (role + ".pem")
            p = subprocess.run(["openssl", "genpkey", "-algorithm", "RSA",
                                "-pkeyopt", "rsa_keygen_bits:2048",
                                "-out", str(secret)], capture_output=True, timeout=20)
            self.assertEqual(0, p.returncode)
            q = subprocess.run(["openssl", "pkey", "-in", str(secret),
                                "-pubout", "-out", str(public)],
                               capture_output=True, timeout=10)
            self.assertEqual(0, q.returncode)
            self.private[role] = secret
        self.scope = {
            "candidate": AUTH.MAIN_SOURCE_SHA,
            "base": AUTH.PRODUCTION_SHA,
            "paths": sorted({
                "components/kingdom-index/KingdomIndex.tsx",
                "config/kingdom-index-baseline.json",
                "config/kingdom-index-provisional-source-reviews.json",
                "config/kingdom-index-routes.json",
                "config/kingdom-index-watcher-166-source-review.json",
                "docs/DOCUMENTATION_CONTROL_PLANE.md",
                "docs/document-registry.json",
                "tests/kingdom-index-watcher-draft-score.test.mts",
                "yarn.lock",
            }),
            "scope_sha256": "a" * 64,
        }
        self.compliance = {
            "base_sha": AUTH.PRODUCTION_SHA,
            "candidate_sha": AUTH.MAIN_SOURCE_SHA,
            "scope_sha256": self.scope["scope_sha256"],
            "changed_paths": self.scope["paths"],
            "reviewed_at": "2026-10-24T22:25:00Z",
            "legacy_financial_get_side_effects_exist": True,
            "passive_health_probes_only": True,
            "dependencies_transitively_reviewed": True,
            "fast_uri_319_reviewed": True,
            "ssr_layout_server_actions_reviewed": True,
            "restart_financial_worker_impact_proven": True,
            "new_financial_source_paths": [],
            "new_financial_writes": False,
            "migration_paths": [],
            "unresolved_financial_effects": [],
            "wolo_p1_unwaived": True,
            "funded_activation": False,
        }

    def sign(self, role, payload):
        with tempfile.TemporaryDirectory() as name:
            msg = Path(name) / "message"
            msg.write_bytes(AUTH.canonical(payload))
            p = subprocess.run(["openssl", "dgst", "-sha256", "-sign",
                                str(self.private[role]), str(msg)],
                               capture_output=True, timeout=15)
            self.assertEqual(0, p.returncode)
            return base64.b64encode(p.stdout).decode("ascii")

    def receipt(self, payload=None):
        payload = payload or self.compliance
        return {"schema": 2,
                "kind": "aoe2war-website-source-finance-boundary-v2",
                "payload": payload,
                "signatures": {
                    role: self.sign(role, payload)
                    for role in ("source_reviewer", "finance_reviewer")
                }}

    def packet(self, payload=None):
        payload = payload or self.compliance
        return {"payload": {
            "financial_noninterference_sha256": CONTROL.digest(payload),
            "source_review_sha256": CONTROL.digest(payload)}}

    def test_valid_independent_source_and_finance_contract_does_not_authorize_by_itself(self):
        result = CONTROL.verify_signed_noninterference(
            self.receipt(), scope=self.scope, packet=self.packet(),
            trust_root=self.trust, now=self.now, allow_test_root=True)
        self.assertTrue(result["legacy_financial_get_side_effects_exist"])
        self.assertFalse(result["new_financial_writes"])

    def test_transitive_unknown_and_restart_risks_fail_closed(self):
        for key, value in (
            ("dependencies_transitively_reviewed", False),
            ("ssr_layout_server_actions_reviewed", False),
            ("restart_financial_worker_impact_proven", False),
            ("new_financial_writes", True),
            ("new_financial_source_paths", ["lib/bets.ts"]),
            ("migration_paths", ["prisma/migrations/unsafe.sql"]),
            ("unresolved_financial_effects", ["startup job side effects"]),
            ("wolo_p1_unwaived", False),
            ("passive_health_probes_only", False),
        ):
            with self.subTest(key=key):
                changed = dict(self.compliance, **{key: value})
                with self.assertRaises(AUTH.Hold):
                    CONTROL.verify_signed_noninterference(
                        self.receipt(changed), scope=self.scope,
                        packet=self.packet(changed), trust_root=self.trust,
                        now=self.now, allow_test_root=True)

    def test_runtime_witness_key_must_not_impersonate_any_human_signer(self):
        (self.trust / "runtime_witness.pem").write_bytes(
            (self.trust / "owner.pem").read_bytes())
        with self.assertRaisesRegex(AUTH.Hold, "impersonates"):
            CONTROL.verify_signed_noninterference(
                self.receipt(), scope=self.scope, packet=self.packet(),
                trust_root=self.trust, now=self.now, allow_test_root=True)

    def test_rewritten_source_approval_or_path_refused(self):
        tampered = copy.deepcopy(self.receipt())
        tampered["payload"]["changed_paths"].append("lib/warChest.ts")
        with self.assertRaises(AUTH.Hold):
            CONTROL.verify_signed_noninterference(
                tampered, scope=self.scope, packet=self.packet(),
                trust_root=self.trust, now=self.now, allow_test_root=True)

    def test_fifth_source_reviewer_cannot_duplicate_finance_or_owner(self):
        (self.trust / "source_reviewer.pem").write_bytes(
            (self.trust / "finance_reviewer.pem").read_bytes())
        with self.assertRaisesRegex(AUTH.Hold, "impersonates"):
            CONTROL.verify_signed_noninterference(
                self.receipt(), scope=self.scope, packet=self.packet(),
                trust_root=self.trust, now=self.now, allow_test_root=True)

    def observation(self):
        immutable = {
            "wolo8092": {"pid": 1012, "exe_sha256": "0" * 64, "inode": 1001},
            "wolo8093": {"pid": 1010, "exe_sha256": "0" * 64, "inode": 1001},
            "consensus": {"pid": 1009, "exe_sha256": "1" * 64, "inode": 1002},
            "wolo_config_sha256": "2" * 64,
            "financial_writers_sha256": "3" * 64,
            "signer_capabilities_sha256": "4" * 64,
            "financial_hold_sha256": "5" * 64,
            "source_p1_original": {
                "key": "vps-source-drift", "status": "BLOCKED",
                "detail": "Wolo legacy source drift P1 remains fully unresolved",
            },
        }
        payload = {
            "observed_at": "2026-10-24T22:29:30Z",
            "source_p1_open": True,
            "financial_release_authorized": False,
            "custody_authorized": False,
            "claim_889_resolved": False,
            "immutable": immutable,
            "website": {"source_sha": AUTH.PRODUCTION_SHA,
                        "build_id": "fQ3sweWsBmfRKrrYGYz4w"},
        }
        return {"schema": 1, "kind": "aoe2war-independent-runtime-witness-v1",
                "payload": payload, "signature": self.sign("runtime_witness", payload)}

    def test_witness_signed_and_stale_or_tampered_refused(self):
        receipt = self.observation()
        truth = CONTROL.verify_witness_receipt(
            receipt, trust_root=self.trust, now=self.now, allow_test_root=True)
        self.assertEqual("BLOCKED", truth["immutable"]["source_p1_original"]["status"])
        altered = copy.deepcopy(receipt)
        altered["payload"]["immutable"]["consensus"]["pid"] = 999
        with self.assertRaisesRegex(AUTH.Hold, "invalid independently signed"):
            CONTROL.verify_witness_receipt(
                altered, trust_root=self.trust, now=self.now, allow_test_root=True)
        with self.assertRaisesRegex(AUTH.Hold, "stale"):
            CONTROL.verify_witness_receipt(
                receipt, trust_root=self.trust,
                now=self.now + timedelta(minutes=5), allow_test_root=True)

    def test_prestage_witness_rebind_fails_on_wolo_or_production_change(self):
        initial = self.observation()
        current = copy.deepcopy(initial)
        changed = copy.deepcopy(current)
        changed["payload"]["immutable"]["wolo8092"]["pid"] = 999
        packet = {"payload": {
            "candidate_sha": AUTH.MAIN_SOURCE_SHA,
            "wolo_prestate_sha256": CONTROL.digest(initial["payload"]),
        }}
        with self.assertRaises(AUTH.Hold):
            CONTROL.evidence_bind(
                packet, initial, changed, target=AUTH.MAIN_SOURCE_SHA,
                trust_root=self.trust, now=self.now, allow_test_root=True)

    def test_exact_nine_candidate_postactivation_probes_are_passive(self):
        ship = (SCRIPTS / "aoe2_release_ship.py").read_text()
        self.assertIn('if [ "$RELEASE" = "' + AUTH.MAIN_SOURCE_SHA + '" ]; then', ship)
        self.assertIn('STATISTICS_PREWARM="SKIPPED_NONINTERFERENCE"', ship)
        self.assertIn('critical_get http://127.0.0.1:3030/api/deployment-version', ship)
        # Other releases retain original smoke checks in the guarded else paths.
        self.assertIn('critical_get http://127.0.0.1:3030/api/bets', ship)
        rollback = (SCRIPTS / "aoe2_release_rollback.py").read_text()
        self.assertNotIn('critical_get http://127.0.0.1:3030/api/bets', rollback)
        self.assertNotIn('critical_get "$PUBLIC/api/lobby"', rollback)


    def test_signed_approvals_absent_never_dispatches_or_changes_production(self):
        # The only test of real dispatch is that it is *not* called without
        # authentic approvals. The global lock is mocked, never acquired.
        from contextlib import nullcontext
        from unittest.mock import Mock
        import aoe2_release as legacy_release
        source = self.observation()
        dispatch = Mock()
        with patch.object(CONTROL, "source_scope", return_value=self.scope), \
             patch.object(legacy_release, "deployment_lock", return_value=nullcontext()):
            with self.assertRaisesRegex(AUTH.Hold, "signed four-role"):
                CONTROL.verified_operation(
                    operation="stage", candidate_repo=self.root,
                    now=self.now, state_root=self.root, trust_root=self.trust,
                    observer=lambda **kwargs: source,
                    dispatch=dispatch, allow_test_root=True)
        dispatch.assert_not_called()



    def test_cli_forwards_required_source_finance_receipt(self):
        # No files are read and no production functions run in this parser test.
        from unittest.mock import Mock
        import sys
        fake = Mock(return_value={"status": "HOLD", "website_release_authorized": False})
        arguments = ["website-controller", "stage", "--candidate-repo",
                     str(self.root), "--packet", str(self.root / "signed.json"),
                     "--signed-wolo-prestate", str(self.root / "wolo.json"),
                     "--signed-noninterference", str(self.root / "finance.json")]
        with patch.object(sys, "argv", arguments), \
             patch.object(CONTROL, "verified_operation", fake):
            self.assertEqual(0, CONTROL.main())
        self.assertEqual(self.root / "finance.json",
                         fake.call_args.kwargs["noninterference_receipt"])

    def test_dispatch_executes_existing_release_libraries_without_child_lock(self):
        # Exercise the concrete production dispatch path in a non-VPS mock,
        # including both phases; the old implementation would spawn a child
        # aoe2_release.py process that tried to acquire the parent's flock.
        import aoe2_release as release
        import aoe2_release_stage as stage
        import aoe2_release_ship as ship
        from unittest.mock import Mock
        production = {"local": {"head": AUTH.MAIN_SOURCE_SHA,
                                "dirty_count": 0}}
        calls = []
        def stage_only(data, *, json_output):
            calls.append(("stage", data, json_output))
            print(json.dumps({"status": "STAGED",
                              "release_sha": AUTH.MAIN_SOURCE_SHA}))
            return 0
        def activation_only(data, *, stage_receipt, dry_run, json_output):
            calls.append(("activate", stage_receipt, dry_run, json_output))
            print(json.dumps({"status": "CERTIFIED",
                              "release_sha": AUTH.MAIN_SOURCE_SHA}))
            return 0
        with patch.object(release, "ROOT", self.root), \
             patch.object(stage, "ROOT", self.root), \
             patch.object(ship, "ROOT", self.root), \
             patch.object(release, "collect", return_value=production), \
             patch.object(stage, "stage_release", side_effect=stage_only), \
             patch.object(ship, "activate_release", side_effect=activation_only), \
             patch.object(CONTROL.subprocess, "run",
                          side_effect=AssertionError("nested release subprocess")):
            result = CONTROL._run_guarded_release(self.root, "stage")
            self.assertEqual("STAGED", result["status"])
            result = CONTROL._run_guarded_release(
                self.root, "activate", stage_receipt="exact-validated-stage")
            self.assertEqual("CERTIFIED", result["status"])
        self.assertEqual(["stage", "activate"], [v[0] for v in calls])
        self.assertEqual(("activate", "exact-validated-stage", False, True),
                         calls[-1])

    def test_operator_source_seal_fails_on_modified_and_hidden_execution_code(self):
        repo = self.root / "operator"
        repo.mkdir()
        (repo / "scripts").mkdir()
        required = [
            "aoe2_website_protected_release_v2.py",
            "aoe2_website_release_v2.py", "aoe2_release.py",
            "aoe2_release_ship.py", "aoe2_release_stage.py",
            "aoe2_release_gate.py",
        ]
        for name in required:
            (repo / "scripts" / name).write_text("# reviewed " + name + "\\n")

        def git(*args):
            p = subprocess.run(["git", "-C", str(repo), *args],
                               text=True, capture_output=True, check=False,
                               timeout=20)
            self.assertEqual(0, p.returncode, p.stderr)
            return p.stdout.strip()

        git("init", "-q")
        git("add", ".")
        git("-c", "user.name=ReviewFixture",
            "-c", "user.email=fixture@example.invalid",
            "commit", "-qm", "approved controller fixture")
        proof = CONTROL.operator_source_provenance(root=repo)
        self.assertEqual(40, len(proof["commit_sha"]))
        self.assertEqual(64, len(proof["inventory_sha256"]))
        script = repo / "scripts" / "aoe2_release_ship.py"
        original = script.read_text()
        script.write_text(original + "# unauthorized dispatch edit\\n")
        with self.assertRaisesRegex(AUTH.Hold, "dirty operator"):
            CONTROL.operator_source_provenance(root=repo)
        git("restore", "--", "scripts/aoe2_release_ship.py")
        for flag, undo in (("--assume-unchanged", "--no-assume-unchanged"),
                           ("--skip-worktree", "--no-skip-worktree")):
            with self.subTest(flag=flag):
                git("update-index", flag, "--", "scripts/aoe2_release_ship.py")
                script.write_text(original + "# hidden financial release edit\\n")
                self.assertEqual("", git("status", "--porcelain"))
                with self.assertRaisesRegex(AUTH.Hold, "hidden operator"):
                    CONTROL.operator_source_provenance(root=repo)
                git("update-index", undo, "--", "scripts/aoe2_release_ship.py")
                git("restore", "--", "scripts/aoe2_release_ship.py")
        self.assertEqual(proof, CONTROL.operator_source_provenance(root=repo))

    def test_review_signatures_cover_exact_operator_commit_and_executable_bytes(self):
        scope = self.scope
        trusted = {"commit_sha": "a" * 40, "inventory_sha256": "b" * 64}
        packet = {"payload": {
            "protected_dispatch_sha256": CONTROL.digest_file(Path(CONTROL.__file__)),
            "candidate_sha": AUTH.MAIN_SOURCE_SHA,
            "risk_class": "PRESENTATION",
            "operator_controller_commit_sha": trusted["commit_sha"],
            "operator_source_inventory_sha256": trusted["inventory_sha256"],
        }}
        with patch.object(CONTROL, "operator_source_provenance",
                          return_value=trusted), \
             patch.object(CONTROL, "assess", return_value={}):
            CONTROL.reviewer_packet_binding(
                packet, candidate_repo=self.root, scope=scope,
                trust_root=self.trust, now=self.now, allow_test_root=True)
            packet["payload"]["operator_source_inventory_sha256"] = "c" * 64
            with self.assertRaisesRegex(AUTH.Hold, "signed exact-source"):
                CONTROL.reviewer_packet_binding(
                    packet, candidate_repo=self.root, scope=scope,
                    trust_root=self.trust, now=self.now, allow_test_root=True)


if __name__ == "__main__":
    unittest.main()
