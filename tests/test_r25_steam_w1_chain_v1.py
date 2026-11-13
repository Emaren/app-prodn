"""Read-only four-mask extension of the original full protected systemd chain."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).parents[1] / "scripts/release/r25_steam_w1_four_mask_guard_v1.py"
spec = importlib.util.spec_from_file_location("w1_full_snapshot", SOURCE)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class FullChain(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.trusted = {
            u: {"FragmentPath": "/etc/systemd/system.control/" + u,
                "ActiveState": "inactive" if u.endswith(".service") else "failed",
                "Result": "success" if u.endswith(".service") else "resources"}
            for u in g.UNITS
        }
        self.witness = {"state": "PASS_PHYSICAL_W1_MASK_ONLY",
                        "receipt_sha256": g.RECEIPT_SHA256,
                        "financial_authorized": False, "units": self.trusted}
        def run(argv, maximum=None):
            self.assertIn(maximum, (65536, 131072))
            self.assertEqual(argv[0], "/usr/bin/systemctl")
            u = argv[2]
            self.assertIn(u, g.UNITS)
            if argv[1] == "cat":
                return ("# Unit " + u + " is masked.\n").encode()
            expected = (g.MASKED_SERVICE_FIELDS if u.endswith(".service")
                        else g.MASKED_TIMER_FIELDS)
            p = {k: {"Id": u, "FragmentPath": self.trusted[u]["FragmentPath"],
                     "ActiveState": self.trusted[u]["ActiveState"],
                     "Result": self.trusted[u]["Result"],
                     "MainPID": "0"}.get(k, "")
                 for k in g.ORIGINAL_UNIT_PROPERTIES if k in expected}
            return ("\n".join(k + "=" + v for k, v in p.items()) + "\n").encode()
        def original_unit(u):
            self.calls.append(u)
            if u in g.UNITS: raise AssertionError("old monitor guard would reject masked oneshot")
            if u == "other-drift.service": raise RuntimeError("ORIGINAL_UNRELATED_DRIFT")
            return {"original": u}
        def original_snapshot():
            names = list(g.UNITS) + ["postgresql@16-main.service",
                                     "wolochaind-mainnet.service"]
            if self.fail_other: names.append("other-drift.service")
            return {"units": {u: self.m.unit_state(u) for u in names},
                    "protected_sockets": {"3030": ["original-protected"], "8092": []}}
        self.fail_other = False
        self.m = SimpleNamespace(run=run, sha=lambda b: hashlib.sha256(b).hexdigest(),
                                 canonical=lambda d: json.dumps(d, sort_keys=True).encode(),
                                 unit_state=original_unit,
                                 production_protected=original_snapshot)
        self.original_unit = original_unit
        self.original_snapshot = original_snapshot

    def attach(self, observe=None):
        g.attach_to_original_protected_chain(
            self.m, attestor=observe or (lambda: copy.deepcopy(self.witness)))

    def test_full_mask_pass_original_other_units_unchanged(self):
        self.attach()
        s = self.m.production_protected()
        self.assertEqual(set(s["units"]), set(g.UNITS) |
                         {"postgresql@16-main.service", "wolochaind-mainnet.service"})
        self.assertEqual(self.calls, ["postgresql@16-main.service",
                                      "wolochaind-mainnet.service"])
        self.assertIs(self.m.unit_state, self.original_unit)
        proposal = g.inspect_only_full_fingerprint(self.m)
        self.assertEqual(proposal["unit_count"], 6)
        self.assertFalse(proposal["root_stage_authorized"])

    def test_original_unrelated_protected_drift_still_holds(self):
        self.fail_other = True
        self.attach()
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_UNRELATED_DRIFT"):
            self.m.production_protected()
        self.assertIs(self.m.unit_state, self.original_unit)

    def test_partial_original_snapshot_census_holds(self):
        self.m.production_protected = lambda: {
            "units": {u: self.m.unit_state(u) for u in g.UNITS[:-1]}}
        self.attach()
        with self.assertRaisesRegex(g.Hold, "FOUR_MASKS_NOT_IN_FULL_SNAPSHOT"):
            self.m.production_protected()

    def test_unaccepted_receipt_holds(self):
        for key, replacement in (
            ("receipt_sha256", "0" * 64),
            ("financial_authorized", True),
            ("units", {g.UNITS[0]: self.trusted[g.UNITS[0]]}),
        ):
            with self.subTest(key=key):
                obj = copy.deepcopy(self.witness)
                obj[key] = replacement
                self.m._w1_quarantine_attached = False
                self.m.production_protected = self.original_snapshot
                self.attach(observe=lambda: obj)
                with self.assertRaisesRegex(g.Hold, "W1_ATTESTATION_NOT_ACCEPTED"):
                    self.m.production_protected()

    def test_two_observations_detect_mask_toctou(self):
        count = [0]
        def observer():
            count[0] += 1
            value = copy.deepcopy(self.witness)
            if count[0] > 1: value["units"][g.UNITS[0]]["Result"] = "changed"
            return value
        self.attach(observe=observer)
        with self.assertRaisesRegex(g.Hold, "W1_MASK_TOCTOU_DRIFT"):
            self.m.production_protected()
        self.assertIs(self.m.unit_state, self.original_unit)

    def test_double_attachment_and_unattested_proposal_denied(self):
        self.attach()
        with self.assertRaisesRegex(g.Hold, "DUPLICATE_W1_ATTACHMENT"):
            self.attach()
        self.m._w1_quarantine_attached = False
        with self.assertRaisesRegex(g.Hold, "UNATTESTED_FINGERPRINT_PROPOSAL"):
            g.inspect_only_full_fingerprint(self.m)

    def test_root_readonly_fingerprint_auditor_refuses_unprivileged(self):
        from unittest.mock import patch
        with patch.object(g.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(g.Hold, "EXACT_READONLY_HEL1_ROOT_AUDITOR"):
                g.candidate_full_pair_for_independent_review()

    def test_bad_cli_action_denied_without_any_source_read(self):
        import subprocess
        import sys
        result = subprocess.run([sys.executable, "-I", "-B", str(SOURCE),
                                 "--unexpected-action"],
                                capture_output=True, text=True, timeout=6)
        self.assertEqual(result.returncode, 3)
        self.assertIn("HOLD_W1_QUARANTINE", result.stdout)

    def test_unrecognized_masked_systemd_property_shape_holds(self):
        previous = self.m.run
        target = next(u for u in g.UNITS if u.endswith(".service"))
        def altered(argv, maximum=None):
            original = previous(argv, maximum=maximum)
            if argv[1] == "show" and argv[2] == target:
                return original.replace(b"Result=success", b"")
            return original
        self.m.run = altered
        self.attach()
        with self.assertRaisesRegex(g.Hold, "ORIGINAL_MASKED_SNAPSHOT_FIELDS"):
            self.m.production_protected()
        self.assertIs(self.m.unit_state, self.original_unit)

    def test_original_guard_exception_restores_original_reader(self):
        self.m.production_protected = lambda: (_ for _ in ()).throw(
            RuntimeError("ORIGINAL_C03_C04_DRIFT"))
        self.attach()
        with self.assertRaisesRegex(RuntimeError, "ORIGINAL_C03_C04_DRIFT"):
            self.m.production_protected()
        self.assertIs(self.m.unit_state, self.original_unit)


if __name__ == "__main__":
    unittest.main()
