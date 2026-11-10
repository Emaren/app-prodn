"""Hostile source-only phase separation. Never makes real Steam/SQL/systemd calls."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
from unittest import TestCase,main
from unittest.mock import patch
import datetime as dt

SRC=Path(__file__).resolve().parents[1]/"scripts/release/r25_public_player_one_use_cutover_v1.py"
spec=importlib.util.spec_from_file_location("r25_one_use_phase_v2",SRC)
c=importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(c)

def permit_obj(phase,nonce,stage_sha="",stage_nonce="",event_sha=""):
    now=c.now()
    obj={
        "schema":"aoe2war.r25.public-player.central-permit.v1",
        "central_scope":"PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET",
        "approved_source_sha":c.CANDIDATE,"approved_build_id":c.BUILD,
        "approved_candidate_unit_sha256":c.UNIT_CANDIDATE_SHA,
        "controller_sha256":c.sha(SRC.read_bytes()),
        "ci_archive_sha256":c.archive_guard.ARCHIVE_SHA256,
        "codex_financial_capture_active":False,
        "financial_writers_authorized":False,
        "web_financial_mutations_authorized":False,
        "allowed_operation":"ONE_USE_RESTRICTED_3032_ONLY",
        "approved_phase":phase,"approval_nonce":nonce,
        "issued_at":(now-dt.timedelta(minutes=2)).isoformat().replace("+00:00","Z"),
        "expires_at":(now+dt.timedelta(minutes=12)).isoformat().replace("+00:00","Z"),
        "managed_avatar_handles":[c.SNIPER_AVATAR_HANDLE]+[
            "user-u-"+k*32+"-featured" for k in ("2","3")],
        "central_comment_url":"https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6775729943",
    }
    if phase=="ACTIVATE_ONLY":
        obj.update(stage_permit_sha256=stage_sha,stage_nonce=stage_nonce,
                   staged_event_sha256=event_sha)
    return obj

def raw(obj):return c.canonical(obj)+b"\n"

class PhaseContracts(TestCase):
    def setUp(self):
        self.stage=permit_obj("STAGE_ONLY","1"*32)
        self.stage_raw=raw(self.stage)
        self.stage_sha=c.sha(self.stage_raw)
        self.events=[{"state":"PREPARED","data":{
            "permit_phase":"STAGE_ONLY","permit_sha256":self.stage_sha,
            "stage_nonce":"1"*32}},
            {"state":"EXTRACTING","data":{}},
            {"state":"STAGED","data":{}}]
        self.staged_bytes=raw({"schema":"r25.one-use.journal.event.v1","state":"STAGED"})
        self.event_sha=c.sha(self.staged_bytes)
        self.active=permit_obj("ACTIVATE_ONLY","2"*32,
                        self.stage_sha,"1"*32,self.event_sha)
    def read(self,p,maxb):
        if p==c.STAGE_PERMIT_PATH:return self.stage_raw
        if p==c.ACTIVATE_PERMIT_PATH:return raw(self.active)
        if p==c.EVENTS/"0003.json":return self.staged_bytes
        raise AssertionError(f"unexpected file {p}")
    def call_permit(self,phase,path=None,sha_override=None):
        loc=path or (c.STAGE_PERMIT_PATH if phase=="stage" else c.ACTIVATE_PERMIT_PATH)
        data=self.stage_raw if loc==c.STAGE_PERMIT_PATH else raw(self.active)
        with (patch.object(c,"require_root",return_value=None),
              patch.object(c,"read_safe",side_effect=self.read),
              patch.object(c,"load_events",return_value=self.events)):
            return c.permit(loc,sha_override or c.sha(data),phase)
    def test_stage_permit_passes_stage_but_cannot_activate(self):
        self.assertEqual(self.call_permit("stage")["approved_phase"],"STAGE_ONLY")
        with self.assertRaisesRegex(c.Hold,"PERMIT_UNEXPECTED_PHASE_LOCATION"):
            self.call_permit("activate",path=c.STAGE_PERMIT_PATH)
    def test_distinct_activation_permit_validates_original_staged_hash(self):
        self.assertEqual(self.call_permit("activate")["approved_phase"],"ACTIVATE_ONLY")
    def test_activation_phase_replaced_with_stage_is_rejected(self):
        self.active["approved_phase"]="STAGE_ONLY"
        with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
            self.call_permit("activate")
    def test_activation_reused_staging_nonce_is_rejected(self):
        self.active["approval_nonce"]="1"*32
        with self.assertRaisesRegex(c.Hold,"ACTIVATION_STAGE_NONCE_OR_RECEIPT_DRIFT"):
            self.call_permit("activate")
    def test_replayed_activation_permit_cannot_approve_different_staged_event(self):
        self.staged_bytes+=b"forged"
        with self.assertRaisesRegex(c.Hold,"ACTIVATION_STAGE_NONCE_OR_RECEIPT_DRIFT"):
            self.call_permit("activate")
    def test_forged_stage_permit_bytes_are_rejected_after_staging(self):
        self.stage["approval_nonce"]="3"*32
        self.stage_raw=raw(self.stage)
        with self.assertRaisesRegex(c.Hold,"ACTIVATION_STAGING_PERMIT_CHANGED"):
            self.call_permit("activate")
    def test_stage_journal_nonce_rewrite_rejected(self):
        self.events[0]["data"]["stage_nonce"]="f"*32
        with self.assertRaisesRegex(c.Hold,"ACTIVATION_STAGE_NONCE_OR_RECEIPT_DRIFT"):
            self.call_permit("activate")
    def test_missing_true_staged_journal_rejected(self):
        self.events.pop()
        with self.assertRaisesRegex(c.Hold,"ACTIVATION_STAGING_EVENTS_UNAVAILABLE"):
            self.call_permit("activate")
    def test_invalid_phase_or_nonce_rejected(self):
        for val in ("activate","ANY","STAGE_ONLY_OR_ACTIVATE_ONLY"):
            self.active["approved_phase"]=val
            with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
                self.call_permit("activate")
        self.active["approved_phase"]="ACTIVATE_ONLY"
        for val in ("","a"*31,"x"*32,"a"*33):
            self.active["approval_nonce"]=val
            with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
                self.call_permit("activate")
    def test_wrong_activation_permit_sha_rejected(self):
        with self.assertRaisesRegex(c.Hold,"PERMIT_BYTES_NOT_CENTRAL_PINNED"):
            self.call_permit("activate",sha_override="a"*64)
    def test_stage_permit_containing_activation_fields_rejected(self):
        self.stage["stage_nonce"]="1"*32
        self.stage_raw=raw(self.stage)
        with self.assertRaisesRegex(c.Hold,"STAGE_PERMIT_CONTAINS_ACTIVATION_FIELDS"):
            self.call_permit("stage")
    def test_recovery_before_cutover_uses_stage_only_and_after_uses_activation(self):
        with patch.object(c,"load_events",return_value=self.events):
            self.assertEqual(self.call_permit("recover",path=c.STAGE_PERMIT_PATH)["approved_phase"],"STAGE_ONLY")
        self.events.append({"state":"STOP_INTENT","data":{"activation_nonce":"2"*32}})
        self.assertEqual(self.call_permit("recover")["approved_phase"],"ACTIVATE_ONLY")
        with self.assertRaisesRegex(c.Hold,"PERMIT_UNEXPECTED_PHASE_LOCATION"):
            self.call_permit("recover",path=c.STAGE_PERMIT_PATH)
    def test_interruption_does_not_add_unauthorized_stop_intent(self):
        with (patch.object(c,"state",return_value="STAGED"),
              patch.object(c.host_guard,"collect",return_value=({},b"old")),
              patch.object(c.host_guard,"evaluate"),
              patch.object(c,"read_safe",return_value=b"old"),
              patch.object(c.host_guard,"UNIT_SHA",c.sha(b"old")),
              patch.object(c,"NEW_PATH") as new_path):
            # No stage identity proof, so fail before any service operation.
            new_path.__truediv__.return_value=Path("/nonexistent/r25/v2")
            with patch.object(c,"cmd") as command:
                with self.assertRaises(Exception):
                    c.activate(self.stage)
                command.assert_not_called()
if __name__=="__main__":main()
