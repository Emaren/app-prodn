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
        for role in MODULE.ROLES:
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
        for role, private in self.keys.items():
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
        self.write_packet(p, phase="PRE_ACTIVATE")
        self.assertEqual(self.admit(phase="PRE_ACTIVATE", stage=stage)["phase"],
                         "PRE_ACTIVATE")
        changed = {**stage, "artifact_sha256": "b" * 64}
        with self.assertRaisesRegex(MODULE.AdmissionHOLD, "artifact"):
            self.admit(phase="PRE_ACTIVATE", stage=changed)

    def test_no_source_controller_has_environment_bypass(self):
        self.assertNotIn("os.getenv", SCRIPT.read_text())
        stage = (SCRIPT.parents[0] / "aoe2_release_stage.py").read_text()
        activate = (SCRIPT.parents[0] / "aoe2_release_ship.py").read_text()
        self.assertIn('require_admission(\n            "PRE_STAGE"', stage)
        self.assertIn('require_admission(\n            "PRE_ACTIVATE"', activate)


if __name__ == "__main__":
    unittest.main()
