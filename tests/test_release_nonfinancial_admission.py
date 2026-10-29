import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_nonfinancial_admission.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_nonfinancial_admission", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NonfinancialWitnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.trust, self.packets = root / "trust", root / "packets"
        self.trust.mkdir(mode=0o700)
        self.packets.mkdir(mode=0o700)
        self.keys = {}
        registry = {"schema": 1, "keys": {}}
        for role in MODULE.TRUST_ROLES:
            private = root / (role + "-private.pem")
            public = self.trust / (role + ".pub.pem")
            subprocess.run([MODULE.OPENSSL, "genpkey", "-algorithm", "Ed25519",
                            "-out", str(private)], check=True, capture_output=True)
            subprocess.run([MODULE.OPENSSL, "pkey", "-in", str(private),
                            "-pubout", "-out", str(public)], check=True,
                           capture_output=True)
            der = subprocess.run([MODULE.OPENSSL, "pkey", "-pubin", "-in",
                                  str(public), "-outform", "DER"], check=True,
                                 capture_output=True).stdout
            self.keys[role] = private
            registry["keys"][role] = {
                "file": role + ".pub.pem",
                "spki_sha256": MODULE.digest(der),
            }
        (self.trust / "trust.json").write_bytes(MODULE.canonical(registry))
        self.release, self.previous = "b" * 40, "a" * 40
        self.manifest_sha, self.gate_sha = "d" * 64, "e" * 64
        self.manifest = {
            "release_sha": self.release,
            "previous_production_sha": self.previous,
            "scope_sha256": "f" * 64,
            "changed_files": ["app/admin/storage-os/page.tsx", "docs/STORAGE_OS.md"],
            "migration_paths": [],
        }
        self.now = datetime(2026, 10, 29, 0, 30, tzinfo=timezone.utc)
        self.issued = self.now - timedelta(seconds=30)
        self.expire = self.now + timedelta(seconds=180)
        self.lease_id = "1" * 64
        self.nonce = "2" * 64
        self.phase = "PRE_STAGE"
        self.payload = self.make_payload()

    def make_payload(self, *, phase="PRE_STAGE", stage=None):
        p = {
            "kind": "aoe2war-w1-nonfinancial-release-v1",
            "phase": phase,
            "release_sha": self.release,
            "previous_source_sha": self.previous,
            "manifest_sha256": self.manifest_sha,
            "gate_sha256": self.gate_sha,
            "controller_sha256": MODULE.controller_digest(),
            "scope_sha256": self.manifest["scope_sha256"],
            "changed_paths_sha256": MODULE.digest(
                MODULE.canonical(sorted(self.manifest["changed_files"]))),
            "lease_path": MODULE.LOCK, "lease_id": self.lease_id,
            "nonce": self.nonce,
            "issued_at": self.issued.isoformat().replace("+00:00", "Z"),
            "expires_at": self.expire.isoformat().replace("+00:00", "Z"),
            "active_build_id": "existing-build",
            "source_review": {
                "status": "INDEPENDENTLY_REVIEWED",
                "transitive_closure_sha256": "3" * 64,
                "import_edges_sha256": "4" * 64,
                "finance_surface_sha256": "5" * 64,
                "unresolved_import_edges": [],
                "changed_financial_writers": [],
                "financial_migration_paths": [],
                "unchecked_producer_edges": [],
            },
            "protected": {
                port: {"count": 1, "pid": 1234 + int(port),
                       "executable_sha256": "6" * 64, "unit_sha256": "7" * 64,
                       "config_sha256": "8" * 64, "source_sha256": "9" * 64}
                for port in ("8092", "8093")
            },
            "wolo_finance_p1": "HOLD",
            "financial_movement_authorized": False,
        }
        p["protected"]["writers"] = {
            "hd_sha256": "a" * 64, "de_sha256": "b" * 64,
            "settlement_sha256": "c" * 64, "custody_sha256": "d" * 64,
        }
        if phase == "PRE_ACTIVATE" and stage:
            p.update({
                "stage_receipt_sha256": "e" * 64,
                "staged_build_id": stage["staged_build_id"],
                "artifact_sha256": stage["artifact_sha256"],
                "dependency_sha256": stage["candidate_node_modules_sha256"],
                "pre_stage_packet_sha256": MODULE.digest(
                    (self.packets / (self.release + "-PRE_STAGE.json")).read_bytes()),
            })
        return p

    def write_packet(self, payload, *, phase=None):
        phase = phase or payload["phase"]
        challenge = {
            "nonce": payload["nonce"],
            "phase": phase,
            "release_sha": self.release,
            "lease_id": payload["lease_id"],
            "issued_at": payload["issued_at"],
            "expires_at": payload["expires_at"],
        }
        (self.trust / ("challenge-" + phase + ".json")).write_bytes(
            MODULE.canonical(challenge))
        signatures = {}
        for role in MODULE.ROLES:
            private = self.keys[role]
            with tempfile.TemporaryDirectory() as tmp:
                message = Path(tmp) / "msg"
                sig = Path(tmp) / "sig"
                message.write_bytes(MODULE.DOMAIN + role.encode() + b"\n"
                                    + MODULE.canonical(payload))
                subprocess.run([MODULE.OPENSSL, "pkeyutl", "-sign", "-rawin",
                                "-inkey", str(private), "-in", str(message),
                                "-out", str(sig)], check=True, capture_output=True)
                signatures[role] = base64.b64encode(sig.read_bytes()).decode()
        packet = {"schema": 1, "payload": payload, "signatures": signatures}
        (self.packets / (self.release + "-" + phase + ".json")).write_bytes(
            MODULE.canonical(packet))
        host_payload = {
            "kind": "aoe2war-hel1-root-nonce-consumption-v1",
            "host": "hel1", "phase": phase,
            "release_sha": self.release, "nonce": payload["nonce"],
            "lease_id": payload["lease_id"],
            "packet_sha256": MODULE.digest(MODULE.canonical(packet)),
            "protected": payload["protected"], "root_journal_status": "CONSUMED",
            "root_journal_sha256": "f" * 64,
            "observed_at": self.now.isoformat().replace("+00:00", "Z"),
        }
        with tempfile.TemporaryDirectory() as tmp:
            message, sig = Path(tmp) / "msg", Path(tmp) / "sig"
            message.write_bytes(MODULE.DOMAIN + b"host\n"
                                + MODULE.canonical(host_payload))
            subprocess.run([MODULE.OPENSSL, "pkeyutl", "-sign", "-rawin",
                            "-inkey", str(self.keys["host"]), "-in", str(message),
                            "-out", str(sig)], check=True, capture_output=True)
            host_claim = {"schema": 1, "payload": host_payload,
                          "signature_base64": base64.b64encode(sig.read_bytes()).decode()}
        (self.trust / ("host-claim-" + phase + ".json")).write_bytes(
            MODULE.canonical(host_claim))
        return packet

    def admit(self, *, phase="PRE_STAGE", stage=None, consume=False, now=None):
        # The checked-in production caller NEVER allows alternate key roots;
        # the test-only patched file reader avoids needing root-owned fixtures.
        original = MODULE.ordinary
        def fixture_read(path, *, trusted=False):
            return original(path, trusted=False)
        with mock.patch.object(MODULE, "ordinary", side_effect=fixture_read):
            return MODULE.require_admission(
                phase, manifest=self.manifest, manifest_sha=self.manifest_sha,
                gate_sha=self.gate_sha, active_build_id="existing-build",
                stage_receipt=stage,
                stage_sha="e" * 64 if stage else "",
                consume=consume, trust=self.trust, packets=self.packets, now=now or self.now,
            )

    def test_all_three_real_ed25519_signatures_and_first_use_journal(self):
        self.write_packet(self.payload)
        result = self.admit(consume=True)
        self.assertEqual(result["status"], "ADMITTED_SOURCE_ONLY")
        self.assertTrue(result["consumed"])
        self.assertEqual(len(list(self.packets.glob("USED-*"))), 1)
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "replayed"):
            self.admit(consume=True)

    def test_readonly_preview_does_not_consume_nonce(self):
        self.write_packet(self.payload)
        self.assertFalse(self.admit(consume=False)["consumed"])
        self.assertFalse(list(self.packets.glob("USED-*")))

    def test_missing_packet_trust_or_nonce_is_hold(self):
        with self.assertRaises(MODULE.AdmissionHOLD):
            self.admit()
        self.write_packet(self.payload)
        (self.trust / "challenge-PRE_STAGE.json").unlink()
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "unreadable"):
            self.admit()

    def test_expiry_future_and_overlong_window_are_hold(self):
        self.write_packet(self.payload)
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "expired"):
            self.admit(now=self.now + timedelta(minutes=11))
        for new_expiry in (self.issued + timedelta(minutes=15),
                           self.issued):
            p = {**self.payload, "expires_at": new_expiry.isoformat().replace("+00:00", "Z")}
            self.write_packet(p)
            with self.assertRaisesRegex(MODULE.AdmissionHOLD, "TTL"):
                self.admit()

    def test_payload_substitution_invalidates_signature(self):
        self.write_packet(self.payload)
        path = self.packets / (self.release + "-PRE_STAGE.json")
        packet = json.loads(path.read_text())
        packet["payload"]["protected"]["8092"]["pid"] += 1
        path.write_bytes(MODULE.canonical(packet))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "signature"):
            self.admit()

    def test_host_root_claim_is_required_and_cannot_be_substituted(self):
        self.write_packet(self.payload)
        host = self.trust / "host-claim-PRE_STAGE.json"
        host.unlink()
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "unreadable"):
            self.admit()
        self.write_packet(self.payload)
        claim = json.loads(host.read_text())
        claim["payload"]["root_journal_sha256"] = "0" * 64
        host.write_bytes(MODULE.canonical(claim))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "signature"):
            self.admit()
        self.write_packet(self.payload)
        claim = json.loads(host.read_text())
        claim["payload"]["observed_at"] = (
            self.now - timedelta(minutes=15)).isoformat().replace("+00:00", "Z")
        host.write_bytes(MODULE.canonical(claim))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "stale"):
            self.admit()

    def test_boolean_float_or_string_listener_count_fails_when_signed(self):
        # JSON true == Python 1 and 1.0 == 1; source signing alone
        # must not turn either into a measured single listening process.
        for malformed in (True, 1.0, "1"):
            p = json.loads(json.dumps(self.payload))
            p["protected"]["8092"]["count"] = malformed
            self.write_packet(p)
            with self.subTest(count=malformed), self.assertRaisesRegex(
                MODULE.AdmissionHOLD, "listener fingerprint"
            ):
                self.admit()

    def test_schema_true_or_float_never_masquerades_as_integer_v1(self):
        packet = self.write_packet(self.payload)
        for malformed in (True, 1.0):
            p = {**packet, "schema": malformed}
            (self.packets / (self.release + "-PRE_STAGE.json")).write_bytes(
                MODULE.canonical(p))
            with self.subTest(packet_schema=malformed), self.assertRaisesRegex(
                MODULE.AdmissionHOLD, "noncanonical"
            ):
                self.admit()
        self.write_packet(self.payload)
        trustfile = self.trust / "trust.json"
        registry = json.loads(trustfile.read_text())
        registry["schema"] = True
        trustfile.write_bytes(MODULE.canonical(registry))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "trust schema"):
            self.admit()
        registry["schema"] = 1
        trustfile.write_bytes(MODULE.canonical(registry))
        hostfile = self.trust / "host-claim-PRE_STAGE.json"
        host = json.loads(hostfile.read_text())
        host["schema"] = True
        hostfile.write_bytes(MODULE.canonical(host))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "host journal claim"):
            self.admit()

    def test_independent_finance_signer_is_required(self):
        packet = self.write_packet(self.payload)
        del packet["signatures"]["finance"]
        (self.packets / (self.release + "-PRE_STAGE.json")).write_bytes(
            MODULE.canonical(packet))
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "roles"):
            self.admit()

    def test_transitive_finance_and_unknown_edges_fail_even_when_signed(self):
        for field, bad in (
            ("changed_financial_writers", ["lib/bets.ts"]),
            ("unchecked_producer_edges", ["app/page.tsx -> queueEnsure"]),
            ("unresolved_import_edges", ["opaque"]),
        ):
            p = json.loads(json.dumps(self.payload))
            p["source_review"][field] = bad
            self.write_packet(p)
            with self.assertRaisesRegex(MODULE.AdmissionHOLD, "transitive"):
                self.admit()

    def test_changed_manifest_financial_migration_hold(self):
        self.write_packet(self.payload)
        self.manifest["migration_paths"] = ["prisma/migrations/any/migration.sql"]
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "migrations"):
            self.admit()

    def test_controller_source_and_lease_substitution_hold(self):
        for key, value, word in (
            ("controller_sha256", "0" * 64, "controller"),
            ("lease_path", "/tmp/foreign.lock", "lease"),
            ("changed_paths_sha256", "0" * 64, "changed-file"),
        ):
            p = {**self.payload, key: value}
            self.write_packet(p)
            with self.assertRaisesRegex(MODULE.AdmissionHOLD, word):
                self.admit()

    def test_pre_activate_requires_exact_staged_artifact_and_chain(self):
        self.write_packet(self.payload)
        stage = {"staged_build_id": "real-stage-build",
                 "artifact_sha256": "f" * 64,
                 "candidate_node_modules_sha256": "a" * 64}
        p = self.make_payload(phase="PRE_ACTIVATE", stage=stage)
        p["nonce"] = "a" * 64  # a distinct second owner challenge
        self.write_packet(p, phase="PRE_ACTIVATE")
        self.assertEqual(self.admit(phase="PRE_ACTIVATE", stage=stage)["phase"],
                         "PRE_ACTIVATE")
        changed = {**stage, "artifact_sha256": "b" * 64}
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "artifact"):
            self.admit(phase="PRE_ACTIVATE", stage=changed)

    def test_missing_independent_admission_blocks_stage_before_ssh(self):
        import contextlib
        import io
        stage_path = SCRIPT.parents[0] / "aoe2_release_stage.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_stage_missing_proof", stage_path)
        controller = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(controller)
        data = {"local": {"head": "b" * 40},
                "production": {"active_build_id": "existing-build"}}
        with (
            mock.patch.object(controller, "load_manifest",
                              return_value=(SCRIPT, {"release_sha": "b" * 40,
                                                    "previous_production_sha": "a" * 40},
                                            "d" * 64)),
            mock.patch.object(controller, "gate_integrity",
                              return_value=(SCRIPT, "e" * 64)),
            mock.patch.object(controller, "watcher_distribution_version",
                              return_value=""),
            mock.patch.object(controller, "production_transport",
                              return_value=({}, None)),
            mock.patch.object(controller, "validation_errors", return_value=[]),
            mock.patch("aoe2_release_nonfinancial_admission.require_admission",
                       side_effect=MODULE.AdmissionHOLD("missing independent witness")),
            mock.patch.object(controller, "run") as remote_ssh,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(controller.stage_release(data, json_output=True), 2)
            remote_ssh.assert_not_called()

    def test_missing_independent_admission_blocks_activation_before_ssh(self):
        import contextlib
        import io
        ship_path = SCRIPT.parents[0] / "aoe2_release_ship.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_ship_missing_proof", ship_path)
        controller = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(controller)
        data = {"production": {"active_build_id": "existing-build"}}
        receipt = {"release_sha": "b" * 40, "staged_build_id": "stage-build",
                   "artifact_sha256": "c" * 64}
        manifest = {"release_sha": "b" * 40,
                    "previous_production_sha": "a" * 40}
        with (
            mock.patch.object(controller, "load_stage_receipt",
                              return_value=(SCRIPT, receipt, "d" * 64,
                                            SCRIPT, manifest, "e" * 64,
                                            SCRIPT, "f" * 64)),
            mock.patch.object(controller, "verify_production_migration_receipt"),
            mock.patch.object(controller, "production_transport",
                              return_value=({}, None)),
            mock.patch.object(controller, "activation_validation_errors",
                              return_value=[]),
            mock.patch("aoe2_release_nonfinancial_admission.require_admission",
                       side_effect=MODULE.AdmissionHOLD("no host root claim")),
            mock.patch.object(controller, "run") as remote_ssh,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(controller.activate_release(
                data, stage_receipt="synthetic.json", dry_run=False,
                json_output=True), 2)
            remote_ssh.assert_not_called()

    def test_signed_invalid_phase_receipts_stop_before_controller_ssh(self):
        # Exercise REAL Ed25519 parsing/verification via a test-only trust-root
        # adapter, not a mocked verifier raising a synthetic HOLD.
        import contextlib
        import io

        def verify_with_fixture(phase, **kwargs):
            original = MODULE.ordinary

            def read_fixture(path, *, trusted=False):
                return original(path, trusted=False)

            with mock.patch.object(MODULE, "ordinary",
                                   side_effect=read_fixture):
                return MODULE.require_admission(
                    phase, trust=self.trust, packets=self.packets,
                    now=self.now, **kwargs
                )

        stage_path = SCRIPT.parents[0] / "aoe2_release_stage.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_stage_signed_negative", stage_path)
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        stage_data = {"local": {"head": self.release},
                      "production": {"active_build_id": "existing-build"}}
        stage_patches = (
            mock.patch.object(stage, "load_manifest",
                              return_value=(SCRIPT, self.manifest,
                                            self.manifest_sha)),
            mock.patch.object(stage, "gate_integrity",
                              return_value=(SCRIPT, self.gate_sha)),
            mock.patch.object(stage, "watcher_distribution_version",
                              return_value=""),
            mock.patch.object(stage, "production_transport",
                              return_value=({}, None)),
            mock.patch.object(stage, "validation_errors", return_value=[]),
        )
        for invalid in ("wrong_scope", "wrong_lease", "malformed_count",
                        "stale_build", "replayed_nonce"):
            payload = json.loads(json.dumps(self.payload))
            if invalid == "wrong_scope":
                payload["scope_sha256"] = "0" * 64
            elif invalid == "wrong_lease":
                payload["lease_path"] = "/tmp/invalid-release-lease"
            elif invalid == "malformed_count":
                payload["protected"]["8092"]["count"] = True
            self.write_packet(payload)
            stage_data["production"]["active_build_id"] = (
                "changed-live-build" if invalid == "stale_build"
                else "existing-build"
            )
            if invalid == "replayed_nonce":
                self.admit(consume=True)
            with (
                *stage_patches,
                mock.patch("aoe2_release_nonfinancial_admission.require_admission",
                           side_effect=verify_with_fixture),
                mock.patch.object(stage, "run") as ssh,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.subTest(phase="PRE_STAGE", invalid=invalid):
                    self.assertEqual(stage.stage_release(
                        stage_data, json_output=True), 2)
                    ssh.assert_not_called()

        # An independently signed PRE_STAGE exists, but the new PRE_ACTIVATE
        # packet swaps the staged artifact; SSH must still be impossible.
        self.write_packet(self.payload)
        stage_receipt = {"staged_build_id": "verified-stage-build",
                         "artifact_sha256": "f" * 64,
                         "candidate_node_modules_sha256": "a" * 64}
        activation_payload = self.make_payload(
            phase="PRE_ACTIVATE", stage=stage_receipt)
        activation_payload["nonce"] = "a" * 64
        activation_payload["artifact_sha256"] = "1" * 64
        self.write_packet(activation_payload, phase="PRE_ACTIVATE")
        ship_path = SCRIPT.parents[0] / "aoe2_release_ship.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_ship_signed_negative", ship_path)
        ship = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ship)
        with (
            mock.patch.object(ship, "load_stage_receipt",
                              return_value=(
                                  SCRIPT, stage_receipt, "e" * 64,
                                  SCRIPT, self.manifest, self.manifest_sha,
                                  SCRIPT, self.gate_sha)),
            mock.patch.object(ship, "verify_production_migration_receipt"),
            mock.patch.object(ship, "production_transport",
                              return_value=({}, None)),
            mock.patch.object(ship, "activation_validation_errors",
                              return_value=[]),
            mock.patch("aoe2_release_nonfinancial_admission.require_admission",
                       side_effect=verify_with_fixture),
            mock.patch.object(ship, "run") as ssh,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(ship.activate_release(
                {"production": {"active_build_id": "existing-build"}},
                stage_receipt="signed-synthetic.json",
                dry_run=False, json_output=True), 2)
            ssh.assert_not_called()

    def test_no_source_controller_has_environment_bypass(self):
        self.assertNotIn("os.getenv", SCRIPT.read_text())
        stage = (SCRIPT.parents[0] / "aoe2_release_stage.py").read_text()
        activate = (SCRIPT.parents[0] / "aoe2_release_ship.py").read_text()
        self.assertIn('require_admission(\n            "PRE_STAGE"', stage)
        self.assertIn('require_admission(\n            "PRE_ACTIVATE"', activate)


if __name__ == "__main__":
    unittest.main()
