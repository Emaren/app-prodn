"""Disposable lock handoff, exact candidate enroll, replay, and no-restart gates."""
from __future__ import annotations
from contextlib import nullcontext
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch,MagicMock

ROOT=Path(__file__).resolve().parents[1]
def mod(path,name):
 spec=importlib.util.spec_from_file_location(name,ROOT/path)
 value=importlib.util.module_from_spec(spec)
 assert spec and spec.loader
 spec.loader.exec_module(value)
 return value
c=mod("scripts/release/r25_public_player_one_use_cutover_v1.py","r25_serial_controller")
v=mod("scripts/release/r25_steam_refresh_two_web_builds_v22.py","r25_serial_v22")

class FakeRootLock:
    """Real file descriptor and inode; spoof root uid ONLY for tiny tests."""
    def __init__(self,path):self.path=path
    def __fspath__(self):return os.fspath(self.path)
    def lstat(self):
        s=self.path.lstat()
        return SimpleNamespace(st_mode=s.st_mode,st_uid=0,st_nlink=s.st_nlink,
                               st_size=s.st_size,st_ino=s.st_ino,st_dev=s.st_dev)
    def __str__(self):return str(self.path)

class ControllerLock(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory(prefix="r25-v22-timer-lock-")
        self.addCleanup(t.cleanup)
        p=Path(t.name)/"steam-refresh-v22.lock"
        p.write_bytes(b"")
        p.chmod(0o600)
        self.path=p
        fake=FakeRootLock(p)
        q=patch.object(c,"V22_LOCK",fake)
        q.start();self.addCleanup(q.stop)
    def test_holds_real_lock_across_nested_controller_work(self):
        with c.steam_transition_lock() as fd:
            self.assertGreaterEqual(fd,3)
            self.assertEqual(os.fstat(fd).st_ino,self.path.stat().st_ino)
    def test_parallel_timer_or_controller_cannot_reenter(self):
        with c.steam_transition_lock():
            with self.assertRaisesRegex(c.Hold,"V22_TIMER_REFRESH_RACE"):
                with c.steam_transition_lock():pass
    def test_owner_or_mode_drift_holds_before_acquisition(self):
        self.path.chmod(0o666)
        with self.assertRaisesRegex(c.Hold,"V22_LOCK_OWNER_OR_SIZE_DRIFT"):
            with c.steam_transition_lock():pass
    def test_unchanged_old_v20_unit_cannot_be_accepted_as_v22(self):
        obj={"approved_steam_v22_source_sha256":"a"*64}
        with patch.object(c.V22_SOURCE.__class__,"lstat",side_effect=FileNotFoundError()):
            with self.assertRaises(FileNotFoundError):
                c.require_steam_active_target_compatible(obj)

class LockedLease(unittest.TestCase):
    def setup_result(self,ttl=245):
        return {"nftables":[
          {"set":{"name":"steam4","table":"aoe2war_web_prod","family":"inet",
                  "flags":["timeout"],"elem":[{"elem":{"expires":ttl,"val":"192.0.2.1"}}]}},
          {"set":{"name":"steam6","table":"aoe2war_web_prod","family":"inet",
                  "flags":["timeout"],"elem":[]}}]}
    def read(self,data):
        with patch.object(c,"cmd",return_value=json.dumps(data)):
            return c.strict_nft_lease_under_transition_lock()
    def test_exact_245_second_lease_passes(self):
        self.assertEqual(self.read(self.setup_result()),245)
    def test_less_than_180_seconds_fails_before_stop(self):
        for ttl in (0,1,40,99,179):
            with self.subTest(ttl=ttl),self.assertRaises(c.Hold):
                self.read(self.setup_result(ttl))
    def test_missing_set_forged_flags_or_expiry_fails(self):
        for d in (
            {"nftables":[self.setup_result()["nftables"][0]]},
            {"nftables":[dict(set=dict(self.setup_result()["nftables"][0]["set"],flags=[])),
                        self.setup_result()["nftables"][1]]},
            {"nftables":[dict(set=dict(self.setup_result()["nftables"][0]["set"],
                    elem=[{"elem":{"val":"192.0.2.1","expires":"240s"}}])),
                        self.setup_result()["nftables"][1]]},
        ):
            with self.assertRaises(c.Hold):self.read(d)

class SteamIdentity(unittest.TestCase):
    def test_enroll_passes_same_controller_fd_and_strict_candidate(self):
        captured=[]
        def run(*args,**kwargs):
            captured.append((args,kwargs))
            return json.dumps({"status":"PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION",
                               "profile":"candidate","source_sha":c.CANDIDATE,
                               "finance_authorized":False})
        with patch.object(c,"run_v22",side_effect=run):
            got=c.v22_enroll_bound("candidate","b"*64,9)
        self.assertEqual(got["profile"],"candidate")
        self.assertEqual(captured[0][1]["pass_fd"],9)
        self.assertIn("--inherited-controller-lock-fd",captured[0][0])
        self.assertIn("--activation-permit-sha256",captured[0][0])
    def test_forged_enrollment_source_is_not_pass(self):
        with patch.object(c,"run_v22",return_value=json.dumps({
            "status":"PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION",
            "profile":"candidate","source_sha":"f"*40,"finance_authorized":False})):
            with self.assertRaisesRegex(c.Hold,"V22_ENROLL_RECEIPT_NOT_EXACT"):
                c.v22_enroll_bound("candidate","b"*64,8)
    def test_stray_finance_flag_in_receipt_refuses(self):
        with patch.object(c,"run_v22",return_value=json.dumps({
            "status":"PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION",
            "profile":"candidate","source_sha":c.CANDIDATE,"finance_authorized":True})):
            with self.assertRaisesRegex(c.Hold,"V22_ENROLL_RECEIPT_NOT_EXACT"):
                c.v22_enroll_bound("candidate","b"*64,8)
    def test_unknown_or_missing_activation_is_not_enrollment(self):
        for profile,permit in (("unknown","b"*64),("candidate","")):
            with self.assertRaises(c.Hold):
                c.v22_enroll_bound(profile,permit,8)

class V22ActivationEvidence(unittest.TestCase):
    def setUp(self):
        self.stage={"origin_sha":"a"*64,"central_permit_sha":"b"*64,
                    "terminal":False}
        self.obj={
          "schema":"aoe2war.r25.public-player.central-permit.v1",
          "approved_phase":"ACTIVATE_ONLY",
          "central_scope":"PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET",
          "approved_source_sha":v.PROFILES["candidate"]["source"],
          "approved_build_id":v.PROFILES["candidate"]["build"],
          "approved_candidate_unit_sha256":v.PUBLIC_PLAYER_UNIT_SHA,
          "controller_sha256":v.PLAYER_CONTROLLER_SHA,
          "ci_archive_sha256":v.PLAYER_CI_ARCHIVE_SHA,
          "approved_steam_v22_source_sha256":hashlib.sha256(b"V22_PROOF_BYTES").hexdigest(),
          "approved_steam_v22_unit_sha256":v.STEAM_V22_UNIT_SHA256,
          "allowed_operation":"ONE_USE_RESTRICTED_3032_ONLY",
          "financial_writers_authorized":False,
          "web_financial_mutations_authorized":False,
          "codex_financial_capture_active":False,
          "approval_nonce":"3"*32,"stage_nonce":"1"*32,
          "stage_permit_sha256":"b"*64,"staged_event_sha256":"a"*64,
        }
    def verify(self,source=None):
        payload=(json.dumps(self.obj,separators=(",",":"),sort_keys=True)+"\n").encode()
        real=source if source is not None else b"V22_PROOF_BYTES"
        with (patch.object(v,"player_stage_proof",return_value=self.stage),
              patch.object(v,"verified",return_value=real)):
            return v.candidate_activation_permit_digest(
                hashlib.sha256(payload).hexdigest(),
                reader=lambda p,mode:payload)
    def test_positive_exact_activation_proof_source_bound(self):
        self.assertEqual(self.verify()["phase"],"ACTIVATE_ONLY")
    def test_stage_only_cannot_candidate_enroll(self):
        self.obj["approved_phase"]="STAGE_ONLY"
        with self.assertRaisesRegex(RuntimeError,"V22_CANDIDATE_ENROLL_WRONG_PHASE_OR_NONCE"):
            self.verify()
    def test_forged_v22_source_does_not_inherit_permit(self):
        with self.assertRaisesRegex(RuntimeError,"V22_CANDIDATE_ENROLL_WRONG_PHASE_OR_NONCE"):
            self.verify(source=b"MALICIOUS_DIFFERENT_V22")
    def test_replayed_staged_digest_does_not_inherit_activation(self):
        self.stage["origin_sha"]="f"*64
        with self.assertRaisesRegex(RuntimeError,"V22_CANDIDATE_ENROLL_STAGE_RECEIPT_DRIFT"):
            self.verify()
    def test_same_nonce_and_unauthorized_finance_rejected(self):
        self.obj["approval_nonce"]="1"*32
        with self.assertRaisesRegex(RuntimeError,"V22_CANDIDATE_ENROLL_WRONG_PHASE_OR_NONCE"):
            self.verify()
        self.obj["approval_nonce"]="3"*32
        self.obj["financial_writers_authorized"]=True
        with self.assertRaisesRegex(RuntimeError,"V22_CANDIDATE_ENROLL_WRONG_PHASE_OR_NONCE"):
            self.verify()

class V22CommandGate(unittest.TestCase):
    def test_direct_candidate_enroll_without_controller_fd_fails_before_enroll(self):
        import sys
        with (patch.object(v.sys,"argv",["v22","--phase","enroll","--profile","candidate"]),
              patch.object(v,"v22_timer_exclusive_lock") as timer,
              patch.object(v,"enroll") as enroll):
            with self.assertRaisesRegex(RuntimeError,
                                        "V22_CANDIDATE_REQUIRES_SERIALIZED_CONTROLLER_LOCK"):
                v.main()
            timer.assert_not_called()
            enroll.assert_not_called()
    def test_steam_timer_refresh_never_accepts_inherited_controller_fd(self):
        with patch.object(v.sys,"argv",[
                "v22","--phase","refresh","--inherited-controller-lock-fd","3"]):
            with self.assertRaisesRegex(RuntimeError,"V22_INHERITED_LOCK_ENROLL_ONLY"):
                v.main()

if __name__=="__main__":unittest.main(verbosity=2)
