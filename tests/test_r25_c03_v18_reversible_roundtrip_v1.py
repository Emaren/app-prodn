"""Source-pinned V18 rollback/return: exact nonfunded ISOLATED simulation.

All success/adversarial tests use a fake host. No service, SQL, Steam, or nft
mutation is performed. A physical rehearsal is separately gated.
"""
import dataclasses
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts/release/r25_c03_v18_reversible_roundtrip_v1.py"
spec = importlib.util.spec_from_file_location("c03_v18_roundtrip", SRC)
m = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = m
spec.loader.exec_module(m)


class FakeHost:
    """Models one actual port3032 slot, two source hashes, and Steam renewal."""
    def __init__(self, fail_at=None, tamper=None, third=False):
        self.target = "candidate"
        self.enrolled = "candidate"
        self.pid = 465815
        self.running = True
        self.timer = True
        self.count = 3 if third else 2
        self.fail_at = fail_at
        self.failed_once = False
        self.tamper = tamper or {}
        self.events = []
        self.check_calls = 0

    def fail(self, action):
        if self.fail_at == action and not self.failed_once:
            self.failed_once = True
            raise m.Hold("SIMULATED_" + action)

    def snapshot(self):
        self.check_calls += 1
        t = self.target
        fields = dict(
            profile=self.enrolled,
            unit_sha=m.CANDIDATE_UNIT_SHA if t == "candidate" else m.ORIGINAL_UNIT_SHA,
            pid=self.pid if self.running else 0,
            build_version=m.BUILD_VERSION if t == "candidate" else m.ORIGINAL_VERSION,
            build_id=m.BUILD_ID if t == "candidate" else m.ORIGINAL_BUILD_ID,
            app_source=m.APP_SOURCE if t == "candidate" else m.ORIGINAL_SOURCE,
            steam_unit_sha=m.V18_UNIT_SHA,
            steam_source_sha=m.V18_SOURCE_SHA,
            fin_snapshot=m.FIN_SNAPSHOT,
            nft_shape=m.NFT_SHAPE,
            memory_max=m.MEMORY_MAX,
            memory_current=1100000000,
            restarts=0,
            web_active=self.running,
            steam_timer_active=self.timer,
            finance_ports_closed=True,
            legacy_masked=True,
            validator_pid=1009,
            rollback_3030_pid=2625090,
            app_runtime_count=self.count,
        )
        fields.update(self.tamper)
        return m.Snapshot(**fields)

    def stop_timer(self):
        self.fail("stop_timer")
        self.events.append("stop_timer")
        self.timer = False

    def stop_web(self):
        self.fail("stop_web")
        self.events.append("stop_web")
        self.running = False

    def install_web_unit(self, profile):
        self.fail("install_" + profile)
        if self.running:
            raise m.Hold("UNIT_CHANGED_WHILE_SERVER_ACTIVE")
        assert profile in ("candidate", "rollback")
        self.events.append("install_" + profile)
        self.target = profile

    def start_web(self):
        self.fail("start_" + self.target)
        if self.running:
            raise m.Hold("PARALLEL_NEXT_RUNTIME")
        self.events.append("start_" + self.target)
        self.pid += 11
        self.running = True

    def wait_health(self, profile):
        self.fail("health_" + profile)
        if not self.running or self.target != profile:
            raise m.Hold("WRONG_RUNTIME_HEALTH")
        self.events.append("health_" + profile)

    def enroll(self, profile):
        self.fail("enroll_" + profile)
        if not self.running or profile != self.target:
            raise m.Hold("STEAM_BOUND_TO_WRONG_PID")
        self.enrolled = profile
        self.events.append("enroll_" + profile)

    def refresh_steam(self):
        self.fail("refresh_" + self.target)
        if self.enrolled != self.target:
            raise m.Hold("STEAM_WRONG_PROFILE_REFRESH")
        self.events.append("refresh_" + self.target)

    def start_timer(self):
        self.fail("start_timer")
        self.events.append("start_timer")
        self.timer = True


class V18Reversible(unittest.TestCase):
    def test_positive_exact_two_way_real_transitions(self):
        h=FakeHost()
        r=m.reversible_cycle(h)
        self.assertEqual(r["status"],"PASS_V18_ROLLBACK_AND_RETURN_TO_EXACT_B1EF_NO_FINANCE")
        self.assertEqual(r["final"]["profile"],"candidate")
        self.assertEqual(r["final"]["pid"],465837)
        self.assertFalse(r["finance_authorized"])
        self.assertFalse(r["C03_APP_HANDOFF_ACCEPTED"])
        self.assertEqual(h.events,[
            "stop_timer","stop_web","install_rollback","start_rollback",
            "health_rollback","enroll_rollback","refresh_rollback","start_timer",
            "stop_timer","stop_web","install_candidate","start_candidate",
            "health_candidate","enroll_candidate","refresh_candidate","start_timer",
        ])
        self.assertEqual([e["to"] for e in r["events"] if e["transition"]=="WEB_STOPPED_BEFORE_UNIT_REPLACEMENT"],
                         ["rollback","candidate"])

    def test_initial_identity_finance_memory_or_process_drift_denied_before_mutation(self):
        for field,value in (
            ("unit_sha","f"*64),("build_id","wrong"),
            ("app_source","f"*40),("steam_unit_sha","a"*64),
            ("steam_source_sha","z"*64),("fin_snapshot","0"*64),
            ("nft_shape","e"*64),("memory_max",9999999999),
            ("memory_current",m.MEMORY_MAX),
            ("finance_ports_closed",False),("legacy_masked",False),
            ("validator_pid",1001),("rollback_3030_pid",9),
            ("app_runtime_count",3),("web_active",False),
            ("steam_timer_active",False),("restarts",1),
        ):
            with self.subTest(field=field):
                h=FakeHost(tamper={field:value})
                r=m.reversible_cycle(h)
                self.assertEqual(r["status"],"HOLD_INCOMPLETE_V18_ROUNDTRIP")
                self.assertEqual(r["negative_recovery"],"PASS_NO_MUTATION_PRECHECK_DENIED")
                self.assertEqual(h.events,[])
                self.assertFalse(r["C03_APP_HANDOFF_ACCEPTED"])

    def test_injected_cross_controller_failure_recovers_candidate_without_claiming_pass(self):
        for point in ("stop_timer","stop_web","install_rollback",
                      "start_rollback","health_rollback","enroll_rollback",
                      "refresh_rollback","start_timer","install_candidate",
                      "start_candidate","health_candidate","enroll_candidate",
                      "refresh_candidate"):
            with self.subTest(point=point):
                h=FakeHost(fail_at=point)
                r=m.reversible_cycle(h)
                self.assertEqual(r["status"],"HOLD_INCOMPLETE_V18_ROUNDTRIP")
                self.assertEqual(r["negative_recovery"],
                                 "PASS_ORIGINAL_CANDIDATE_UNCHANGED"
                                 if point in ("stop_timer","stop_web")
                                 else "PASS_SAFE_RECOVERY_TO_CANDIDATE")
                self.assertTrue(r["final"]["web_active"])
                self.assertTrue(r["final"]["finance_ports_closed"])
                self.assertEqual(r["final"]["profile"],"candidate")

    def test_external_tamper_during_return_never_green(self):
        h=FakeHost()
        original=h.enroll
        def mutate(profile):
            original(profile)
            if profile=="candidate":
                h.tamper["nft_shape"]="f"*64
        h.enroll=mutate
        r=m.reversible_cycle(h)
        self.assertNotEqual(r["status"],"PASS_V18_ROLLBACK_AND_RETURN_TO_EXACT_B1EF_NO_FINANCE")
        self.assertFalse(r["C03_APP_HANDOFF_ACCEPTED"])
        self.assertTrue(any(e["transition"]=="RECOVERY_ATTEMPT_FAILED" for e in r["events"]))

    def test_unrestorable_candidate_falls_back_original_and_remains_hold(self):
        h=FakeHost(fail_at="health_candidate")
        # Force the only candidate re-admission to fail both times; rollback
        # must leave original restricted website alive instead of a 503 blank.
        original=h.wait_health
        def no_candidate(profile):
            if profile=="candidate":
                raise m.Hold("SIMULATED_PERMANENT_CANDIDATE_UNHEALTHY")
            return original(profile)
        h.wait_health=no_candidate
        r=m.reversible_cycle(h)
        self.assertEqual(r["status"],"HOLD_INCOMPLETE_V18_ROUNDTRIP")
        self.assertEqual(r["negative_recovery"],"PASS_SAFE_RECOVERY_TO_ROLLBACK")
        self.assertEqual(r["final"]["profile"],"rollback")
        self.assertTrue(r["final"]["web_active"])
        self.assertFalse(r["finance_authorized"])

    def test_disallow_production_auto_execution_and_receipt_symlinks(self):
        self.assertEqual(m.main([]),3)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            root.chmod(0o700)
            receipt=root/"receipt.json"
            digest=m.seal(receipt,{"status":"HOLD","finance_authorized":False})
            self.assertEqual(digest,hashlib.sha256(receipt.read_bytes()).hexdigest())
            self.assertEqual(receipt.stat().st_mode & 0o777,0o600)
            with self.assertRaisesRegex(m.Hold,"ONE_USE_RECEIPT_EXISTS"):
                m.seal(receipt,{"status":"PASS"})
            receipt.unlink()
            receipt.symlink_to("/etc/passwd")
            with self.assertRaisesRegex(m.Hold,"ONE_USE_RECEIPT_EXISTS"):
                m.seal(receipt,{"status":"PASS"})

    def test_reviewed_exact_shas_in_controller_contract(self):
        source=SRC.read_text()
        self.assertIn(m.APP_SOURCE,source)
        self.assertIn(m.CANDIDATE_UNIT_SHA,source)
        self.assertIn(m.ORIGINAL_UNIT_SHA,source)
        self.assertIn(m.V18_SOURCE_SHA,source)
        self.assertIn(m.V18_CONTROLLER_SHA,source)
        self.assertIn("HOLD_NO_AUTOMATIC_PRODUCTION_ROUNDTRIP",source)
        self.assertIn("UNIT_WRITE_WHILE_WEB_ACTIVE",source)
        self.assertNotIn("systemctl unmask",source)
        self.assertNotIn("GRANT ALL",source)
        self.assertNotIn("http://127.0.0.1:8092",source)
        self.assertNotIn("http://127.0.0.1:8093",source)

if __name__=="__main__":
    unittest.main()
