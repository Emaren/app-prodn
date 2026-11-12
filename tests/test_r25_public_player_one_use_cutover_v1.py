"""Fail-shut one-use cutover tests. No root, systemd, real site or FINANCIAL."""
import datetime as dt
from contextlib import nullcontext
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest import TestCase,main
from unittest.mock import patch,Mock
import urllib.parse

SRC=Path(__file__).resolve().parents[1]/"scripts/release/r25_public_player_one_use_cutover_v1.py"
spec=importlib.util.spec_from_file_location("public_player_controller",SRC)
c=importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(c)

HANDLE=[c.SNIPER_AVATAR_HANDLE]+["user-u-"+digit*32+"-featured" for digit in ("2","3")]

class Headers(dict):
    def get(self,k,default=None):
        return super().get(k,default)

def good_response(url):
    if any(x in url for x in ("api/media-assets/avatar/","/api/media-assets/")):
        ident=urllib.parse.urlparse(url).path.split("/")[-1]
        return (200,Headers({"X-AoE2WAR-Media-Proxy":"direct-managed",
                            "Content-Type":"image/webp",
                            "Cache-Control":"public, max-age=86400, stale-while-revalidate=604800"}),("real-"+ident).encode())
    path=urllib.parse.urlparse(url).path
    if path==c.SNIPER:
        return 200,Headers({"Content-Type":"text/html"}),b"<h1>Sniper</h1> Exact replay statistics are temporarily unavailable"
    if path=="/api/traffic/public":
        return 200,Headers({"Content-Type":"application/json"}),json.dumps({
            "coverageEndedAt":"2026-10-19",
            "points":[{"date":"2026-10-19","values":{"confirmedHuman":3}}]*131}).encode()
    if path=="/api/bets":
        return 503,Headers({"Cache-Control":"private, no-store, max-age=0"}),b'{"detail":"Bet board unavailable."}'
    if path=="/api/profile-documents":
        return 401,Headers({"Cache-Control":"private, no-store, max-age=0"}),b'{"error":"Unauthorized"}'
    if path in ("/api/auth/session","/api/admin/kingdom-presence"):
        return 401,Headers({"Content-Type":"application/json"}),b'{"error":"Unauthorized"}'
    return 200,Headers({"Content-Type":"text/html"}),b"Valid public HTML"

class PublicHealth(TestCase):
    def test_normal_public_positive_and_managed_portraits(self):
        proof=c.check_public(HANDLE,good_response)
        self.assertEqual(proof["managed_portraits"],3)
        self.assertEqual(proof["public_probes"],22)
    def test_https_streamed_digest_rejected(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.startswith(c.PUBLIC) and c.SNIPER in url:
                body+=b'9265000\\"digest\\":\\"936992806\\"'
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"PLAYER_DETAIL_STREAMED_NEXT_ERROR"):
            c.check_public(HANDLE,fake)
    def test_https_mismatched_public_status_rejected(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.startswith(c.PUBLIC) and url.endswith("/players"):
                code=500
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"HTTP_STATUS"):
            c.check_public(HANDLE,fake)
    def test_betting_finance_must_stay_503(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.endswith("/api/bets"):code=200
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"HTTP_STATUS"):
            c.check_public(HANDLE,fake)
    def test_private_document_must_stay_anonymous_401_no_store(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.endswith("/api/profile-documents"):h=Headers({})
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"PRIVATE_DOCUMENT_NO_STORE"):
            c.check_public(HANDLE,fake)
    def test_traffic_untested_future_days_do_not_become_zeros(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.endswith("/api/traffic/public"):
                body=json.dumps({"coverageEndedAt":"2026-11-10","points":[]}).encode()
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"CANONICAL_TRAFFIC_DRIFT"):
            c.check_public(HANDLE,fake)
    def test_portrait_fallback_rejected(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.startswith("http://127.0.0.1:3032/api/media-assets"):
                h["X-AoE2WAR-Media-Proxy"]="fallback"
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"MANAGED_PORTRAIT_MIME_CACHE_OR_DIRECT"):
            c.check_public(HANDLE,fake)
    def test_portrait_hash_mismatch_rejected(self):
        def fake(url):
            code,h,body=good_response(url)
            if url.startswith("http://127.0.0.1:3032/api/media-assets"):
                body+=b"unauthorized change"
            return code,h,body
        with self.assertRaisesRegex(c.Hold,"MANAGED_PORTRAIT_BYTES_OR_CACHE_CHANGED"):
            c.check_public(HANDLE,fake)

class Activation(TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="r25-3032-no-live-")
        self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        self.new=root/"candidate";self.new.mkdir()
        (self.new/".next").mkdir()
        (self.new/".aoe2war-source-sha").write_text(c.CANDIDATE+"\n")
        (self.new/".next/BUILD_ID").write_text(c.BUILD+"\n")
        self.patches=[]
        for thing,value in [("NEW_PATH",self.new)]:
            p=patch.object(c,thing,value);p.start();self.addCleanup(p.stop)
        self.unit=(b"WorkingDirectory="+c.host_guard.ORIGINAL_DIR.encode()+b"\n"+
                   b"ReadOnlyPaths="+c.host_guard.ORIGINAL_DIR.encode()+b"\n"+
                   b"BindReadOnlyPaths="+c.host_guard.ORIGINAL_DIR.encode()+b"\n"+
                   b"BindPaths="+c.host_guard.ORIGINAL_DIR.encode()+b"\n")
        self.original_sha=c.sha(self.unit)
        self.new_unit=self.unit.replace(c.host_guard.ORIGINAL_DIR.encode(),
                                         c.host_guard.CANDIDATE_DIR.encode())
        self.backup=patch.object(c.host_guard,"UNIT_SHA",self.original_sha)
        self.backup.start();self.addCleanup(self.backup.stop)
        self.candidate_pin=patch.object(c,"UNIT_CANDIDATE_SHA",c.sha(self.new_unit))
        self.candidate_pin.start();self.addCleanup(self.candidate_pin.stop)
        self.mock=Mock()
        self.commands=[]
        def fake_cmd(args,timeout=50):
            self.commands.append(tuple(args))
            if self.mock.fail_start and args[:2]==["systemctl","start"]:
                raise c.Hold("MOCK_START_FAILED")
            return ""
        self.fake_cmd=fake_cmd
        self.events=[]
        self.facts={}
        self.saved=[]
        for attr,replacement in (
            ("state",lambda:"STAGED"),
            ("read_safe",lambda *a,**k:self.unit),
            ("append_event",lambda name,extra=None:self.events.append(name)),
            ("load_events",lambda:[{"state":x} for x in self.events]),
            ("atomic_unit_replace",lambda *a,**k:self.saved.append(("swap",a[1]))),
            ("cmd",self.fake_cmd),
        ):
            patcher=patch.object(c,attr,replacement);patcher.start();self.addCleanup(patcher.stop)
        guard=patch.object(c.host_guard,"evaluate",lambda *a,**k:None)
        guard.start();self.addCleanup(guard.stop)
        guard=patch.object(c.host_guard,"collect",lambda : (self.facts,self.unit))
        guard.start();self.addCleanup(guard.stop)
        guard=patch.object(c,"prop",lambda *a,**k:
            "0" if a[1]=="MainPID" else "active" if a[0].endswith(".timer") else "inactive")
        guard.start();self.addCleanup(guard.stop)
        self.mock.fail_start=False
        # Activation behavioral tests simulate a future separately source-
        # qualified Steam compatibility admission; NEVER the current V20.
        for key,value in (
            ("require_steam_active_target_compatible",lambda obj:{"lease_seconds":150}),
            ("steam_transition_lock",lambda:nullcontext(3)),
            ("strict_nft_lease_under_transition_lock",lambda:245),
            ("v22_enroll_bound",lambda profile,permit_sha,fd:{"status":"PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION",
                 "profile":profile,"finance_authorized":False}),
        ):
            steam=patch.object(c,key,value)
            steam.start();self.addCleanup(steam.stop)

    def test_successful_activation_keeps_rollback_window_open(self):
        with patch.object(c,"read_post_state",return_value={"new_pid":"9999"}),patch.object(c,"check_public",return_value={"public_probes":18,"managed_portraits":3}):
            result=c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertEqual(result["status"],"PASS_PUBLIC_PLAYER_RELEASE_DEPLOYED")
        self.assertIn("COMPLETED",self.events)
        self.assertNotIn("ROLLED_BACK",self.events)
        self.assertTrue(any(x[0]=="swap" for x in self.saved))
    def test_failed_3032_restart_forces_original_restoration(self):
        self.mock.fail_start=True
        with patch.object(c,"rollback_unit",return_value={"status":"PASS_RESTRICTED_3032_ROLLBACK"}):
            with self.assertRaisesRegex(c.Hold,"ORIGINAL_RESTORED"):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertIn("RECOVERY_INTENT",self.events)
        self.assertNotIn("COMPLETED",self.events)
    def test_steam_readmission_failure_forces_rollback(self):
        with patch.object(c,"read_post_state",side_effect=c.Hold("STEAM_READMISSION_FAILED")),patch.object(c,"rollback_unit",return_value={"status":"PASS_RESTRICTED_3032_ROLLBACK"}):
            with self.assertRaisesRegex(c.Hold,"ORIGINAL_RESTORED"):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertIn("RECOVERY_INTENT",self.events)
        self.assertNotIn("COMPLETED",self.events)
    def test_https_failed_after_installation_triggers_restore(self):
        with patch.object(c,"read_post_state",return_value={"new_pid":"100"}),patch.object(c,"check_public",side_effect=c.Hold("HTTPS_CONTENT_DRIFT")),patch.object(c,"rollback_unit",return_value={"status":"PASS_RESTRICTED_3032_ROLLBACK"}):
            with self.assertRaisesRegex(c.Hold,"ORIGINAL_RESTORED"):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertIn("CANDIDATE_STARTED",self.events)
        self.assertNotIn("PUBLIC_VERIFIED",self.events)
    def test_unrecoverable_restart_is_explicit_fail_shut_hold(self):
        self.mock.fail_start=True
        with patch.object(c,"rollback_unit",side_effect=c.Hold("RESTORE_FAILED")):
            with self.assertRaisesRegex(c.Hold,"AUTO_ROLLBACK_FAILED"):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertIn("FAIL_SHUT_HOLD",self.events)
    def test_steam_timer_lock_conflict_does_not_restart_healthy_web(self):
        with patch.object(c,"steam_transition_lock",side_effect=c.Hold("V22_TIMER_REFRESH_RACE")):
            with self.assertRaisesRegex(c.Hold,"ACTIVATION_REFUSED_BEFORE_STOP_INTENT"):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY","approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,"stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertNotIn("STOP_INTENT",self.events)
        self.assertIn("ABORTED",self.events)
        self.assertFalse(any(x[:2]==("systemctl","stop") for x in self.commands))
    def test_competing_writer_before_activation_detected(self):
        with patch.object(c.host_guard,"evaluate",side_effect=c.host_guard.Hold("UNIT_CHANGED")):
            with self.assertRaises(c.host_guard.Hold):
                c.activate({"managed_avatar_handles":HANDLE,
                            "approved_phase":"ACTIVATE_ONLY",
                            "approval_nonce":"2"*32,
                            "_permit_sha":"a"*64,
                            "stage_permit_sha256":"b"*64,
                            "staged_event_sha256":"c"*64,
                            "approved_steam_v22_source_sha256":"d"*64})
        self.assertNotIn("STOP_INTENT",self.events)

class SteamV22ExactCompatibility(TestCase):
    def test_original_v20_executable_is_not_candidate_authority(self):
        with patch.object(c,"approved_v22_source_sha",side_effect=c.Hold("V22_SOURCE_NOT_INSTALLED")):
            with self.assertRaisesRegex(c.Hold,"V22_SOURCE_NOT_INSTALLED"):
                c.require_steam_active_target_compatible({})
    def test_only_strict_exact_candidate_with_lease_headroom_passes(self):
        info={"status":"PASS_STEAM_V22_TWO_WEB_BUILDS_SOURCE_BOUND_READONLY",
              "active_profile":"rollback","source_sha":c.host_guard.BASELINE,
              "candidate_source_sha":c.CANDIDATE,"finance_authorized":False,
              "web_activation_authorized":False,"steam_lease_min_seconds":245}
        with patch.object(c,"approved_v22_source_sha",return_value="f"*64),patch.object(c,"run_v22",return_value=__import__("json").dumps(info)):
            self.assertEqual(c.require_steam_active_target_compatible({})["lease_seconds"],245)
    def test_forged_profile_or_expired_lease_refused_before_web_stop(self):
        base={"status":"PASS_STEAM_V22_TWO_WEB_BUILDS_SOURCE_BOUND_READONLY",
              "active_profile":"rollback","source_sha":c.host_guard.BASELINE,
              "candidate_source_sha":c.CANDIDATE,"finance_authorized":False,
              "web_activation_authorized":False,"steam_lease_min_seconds":150}
        for changes in ({"active_profile":"candidate"},{"candidate_source_sha":"f"*40},
                        {"finance_authorized":True},{"steam_lease_min_seconds":99}):
            check=dict(base,**changes)
            with patch.object(c,"approved_v22_source_sha",return_value="f"*64),patch.object(c,"run_v22",return_value=__import__("json").dumps(check)):
                with self.assertRaisesRegex(c.Hold,"V22_TWO_BUILD_PRECUTOVER_NOT_PROVEN"):
                    c.require_steam_active_target_compatible({})

class Recovery(TestCase):
    def setUp(self):
        self.events=[]
        p=patch.object(c,"append_event",lambda name,extra=None:self.events.append(name))
        p.start();self.addCleanup(p.stop)
    def test_interrupted_after_unit_swap_can_recover(self):
        with patch.object(c,"load_events",return_value=[{"state":"UNIT_SWAPPED"}]),patch.object(c,"rollback_unit",return_value={"status":"PASS_RESTRICTED_3032_ROLLBACK"}):
            r=c.restore({"_permit_sha":"a"*64},"INTERRUPTED_PROCESS",manual=False)
        self.assertEqual(r["status"],"PASS_RESTRICTED_3032_ROLLBACK")
        self.assertIn("RECOVERY_INTENT",self.events)
    def test_interrupted_during_stage_aborts_without_touching_unit(self):
        with patch.object(c,"load_events",return_value=[{"state":"EXTRACTING"}]),patch.object(c.host_guard,"collect",return_value=({},b"OLD")),patch.object(c.host_guard,"evaluate",return_value={"status":"PASS"}),patch.object(c.host_guard,"UNIT_SHA",c.sha(b"OLD")):
            r=c.restore({},"INTERRUPTED_EXTRACT",manual=False)
        self.assertEqual(r["status"],"PASS_RELEASE_ABORTED_BEFORE_CUTOVER")
        self.assertIn("ABORTED",self.events)
    def test_completed_release_is_reversible_within_window(self):
        later=(c.now()+dt.timedelta(minutes=10)).isoformat()
        with patch.object(c,"load_events",return_value=[{"state":"COMPLETED","data":{"rollback_deadline":later}}]),patch.object(c,"rollback_unit",return_value={"status":"PASS_RESTRICTED_3032_ROLLBACK"}):
            r=c.restore({"_permit_sha":"a"*64},"OWNER_ACCEPTANCE_REJECTED",manual=True)
        self.assertEqual(r["status"],"PASS_RESTRICTED_3032_ROLLBACK")
    def test_expired_manual_rollback_does_not_overwrite_other_writer(self):
        ago=(c.now()-dt.timedelta(minutes=31)).isoformat()
        with patch.object(c,"load_events",return_value=[{"state":"COMPLETED","data":{"rollback_deadline":ago}}]),patch.object(c,"rollback_unit") as rollback:
            with self.assertRaisesRegex(c.Hold,"MANUAL_ROLLBACK_WINDOW_EXPIRED"):
                c.restore({},"LATE",manual=True)
        rollback.assert_not_called()
    def test_replay_of_completed_rollback_is_refused(self):
        with patch.object(c,"load_events",return_value=[{"state":"ROLLED_BACK"}]):
            with self.assertRaisesRegex(c.Hold,"RELEASE_ALREADY_TERMINATED"):
                c.restore({},"REPLAY",manual=False)

# The following fixture classes test actual disposable byte extraction and
# exact permit/rename hazards; no live service, C01 or SQL calls.
class OfflineExtraction(TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="r25-one-use-extract-")
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.input=self.root/"input";self.input.mkdir()
        self.output=self.root/"uninstalled-output"
        import os
        self.uid=os.geteuid()
        from tests.test_r25_public_player_artifact_qualification_v1 import fixture,entry
        self.entries=[
            entry(name=".next/BUILD_ID",data=(c.BUILD+"\n").encode()),
            entry(name="node_modules/lib/tool",data=b"exact executable payload",mode=0o555),
            entry(name="node_modules/.bin/tool",target="../lib/tool",kind="symlink",mode=0o777),
        ]
        self.expected=fixture(self.input,self.entries,source=c.CANDIDATE,inner_build=c.BUILD)
        original=c.archive_guard.verify_package
        self.v=patch.object(c.archive_guard,"verify_package",
                            side_effect=lambda folder:original(folder,self.expected))
        self.v.start();self.addCleanup(self.v.stop)
        n=patch.object(c.archive_guard,"FILE_COUNT",len(self.entries))
        n.start();self.addCleanup(n.stop)
        n=patch.object(c.archive_guard,"TREE_SHA256",self.expected["tree_sha256"])
        n.start();self.addCleanup(n.stop)
        n=patch.object(c.archive_guard,"ARCHIVE_SHA256",self.expected["archive_sha256"])
        n.start();self.addCleanup(n.stop)
        op=c.relative_parent
        p=patch.object(c,"relative_parent",lambda r,name:op(r,name,expected_uid=self.uid))
        p.start();self.addCleanup(p.stop)
        mt=c.ensure_bind_targets
        p=patch.object(c,"ensure_bind_targets",
                       lambda r,expected_uid=0:mt(r,expected_uid=self.uid))
        p.start();self.addCleanup(p.stop)
    def test_real_disposable_archive_extraction_mounts_and_contents(self):
        result=c.extract_verified(self.input,self.output)
        self.assertEqual(result["files_and_links"],5)
        self.assertEqual(result["created_empty_bind_targets"],[".next/cache","public/downloads"])
        self.assertTrue((self.output/"node_modules/.bin/tool").is_symlink())
        self.assertEqual((self.output/".next/BUILD_ID").read_text().strip(),c.BUILD)
        self.assertEqual((self.output/".aoe2war-source-sha").read_text().strip(),c.CANDIDATE)
        for item in result["created_empty_bind_targets"]:
            self.assertTrue((self.output/item).is_dir())
            self.assertEqual(list((self.output/item).iterdir()),[])
    def test_interrupted_file_stream_leaves_only_partial_private_stage_not_install(self):
        import os
        actual_write=os.write
        calls={"count":0}
        def interrupt(fd,part):
            calls["count"]+=1
            if calls["count"]==2:raise InterruptedError("simulated killed streaming writer")
            return actual_write(fd,part)
        with patch.object(c.os,"write",side_effect=interrupt):
            with self.assertRaises(InterruptedError):
                c.extract_verified(self.input,self.output)
        self.assertTrue(self.output.exists())
        self.assertFalse((self.root/"live").exists())
    def test_unexpected_stage_collision_must_not_overwrite(self):
        self.output.mkdir()
        unrelated=self.output/"unrelated-managed-avatar.webp"
        unrelated.write_bytes(b"owner-prestate")
        with self.assertRaisesRegex(c.Hold,"STAGING_ALREADY_EXISTS"):
            c.extract_verified(self.input,self.output)
        self.assertEqual(unrelated.read_bytes(),b"owner-prestate")
    def test_second_stream_content_fingerprint_detects_postverification_substitution(self):
        # Same path and size, corrupt a member in second pass after initial
        # verified manifest; never permit candidate installation.
        actual=c.archive_guard.canonical
        with (patch.object(c.archive_guard,"verify_package",return_value={"status":"PASS_INITIAL"}),
              patch.object(c.archive_guard,"canonical",side_effect=lambda rows:
                          actual(rows)+b"unauthorized-delta" if isinstance(rows,list) else actual(rows))):
            with self.assertRaisesRegex(c.Hold,"EXTRACTED_CONTENT_TREE_HASH_CHANGED"):
                c.extract_verified(self.input,self.output)
        self.assertTrue(self.output.exists())

    def test_nonempty_bind_target_rejected(self):
        first=self.output/".next/cache"
        first.mkdir(parents=True)
        (first/"unexpected").write_bytes(b"foreign")
        with self.assertRaisesRegex(c.Hold,"BIND_MOUNT_TARGET_NOT_EMPTY"):
            c.ensure_bind_targets(self.output,expected_uid=self.uid)
    def test_symlinked_bind_target_refused(self):
        import os
        (self.output/".next").mkdir(parents=True)
        (self.output/".next/cache").symlink_to(self.root)
        with self.assertRaisesRegex(c.Hold,"BIND_MOUNT_TARGET_UNSAFE"):
            c.ensure_bind_targets(self.output,expected_uid=self.uid)

class PhysicalAtomicUnitProof(TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="r25-unit-atomic-fixture-")
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/"web.service"
        self.path.write_bytes(b"old pinned unit")
        patcher=patch.object(c,"WEB_UNIT",self.path)
        patcher.start();self.addCleanup(patcher.stop)
    def test_competing_actual_unit_byte_change_cannot_be_overwritten(self):
        self.path.write_bytes(b"UNAUTHORIZED_NEW_UNIT")
        with self.assertRaisesRegex(c.Hold,"COMPETING_UNIT_WRITER"):
            c.atomic_unit_replace(b"new candidate",c.sha(b"old pinned unit"))
        self.assertEqual(self.path.read_bytes(),b"UNAUTHORIZED_NEW_UNIT")
    def test_linux_noreplace_eexist_is_a_hold_not_replace(self):
        import errno
        class FakeLib:
            def renameat2(self,*args):return -1
        with patch.object(c.ctypes,"CDLL",return_value=FakeLib()),patch.object(c.ctypes,"get_errno",return_value=errno.EEXIST):
            with self.assertRaisesRegex(c.Hold,"INSTALL_NOREPLACE_EEXIST"):
                c.no_replace(Path(self.tmp.name)/"stage",self.path)
        self.assertEqual(self.path.read_bytes(),b"old pinned unit")

class GenuinePermitBoundaries(TestCase):
    def make(self,expired=False):
        now=c.now()
        start=(now-dt.timedelta(hours=2)) if expired else now-dt.timedelta(minutes=5)
        end=start+dt.timedelta(minutes=30)
        obj={
            "schema":"aoe2war.r25.public-player.central-permit.v1",
            "central_scope":"PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET",
            "approved_source_sha":c.CANDIDATE,"approved_build_id":c.BUILD,
            "approved_candidate_unit_sha256":c.UNIT_CANDIDATE_SHA,
            "controller_sha256":c.sha(SRC.read_bytes()),
            "ci_archive_sha256":c.archive_guard.ARCHIVE_SHA256,
            "codex_financial_capture_active":False,
            "financial_writers_authorized":False,"web_financial_mutations_authorized":False,
            "allowed_operation":"ONE_USE_RESTRICTED_3032_ONLY",
            "approved_phase":"STAGE_ONLY","approval_nonce":"1"*32,
            "issued_at":start.isoformat().replace("+00:00","Z"),
            "expires_at":end.isoformat().replace("+00:00","Z"),
            "managed_avatar_handles":HANDLE,
            "central_comment_url":"https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6774289832",
        }
        return obj
    def run_permit(self,obj,phase="stage",sha_override=None,path=None):
        raw=c.canonical(obj)+b"\n"
        where=path or (c.STAGE_PERMIT_PATH if phase=="stage"
                       else c.ACTIVATE_PERMIT_PATH)
        # Entire object is synthetic, not a real owner approval.
        with patch.object(c,"require_root",return_value=None),patch.object(c,"read_safe",return_value=raw):
            return c.permit(where,sha_override or c.sha(raw),phase)
    def test_synthetic_matching_permit_exact_fields(self):
        self.assertEqual(self.run_permit(self.make())["approved_source_sha"],c.CANDIDATE)
    def test_mismatched_source_never_authorizes_cutover(self):
        obj=self.make();obj["approved_source_sha"]="0"*40
        with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
            self.run_permit(obj)
    def test_mismatched_central_controller_bytes_refused(self):
        obj=self.make();obj["controller_sha256"]="f"*64
        with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
            self.run_permit(obj)
    def test_expired_activation_not_rescued_by_rollback_right(self):
        obj=self.make(expired=True)
        with self.assertRaisesRegex(c.Hold,"PERMIT_UNEXPECTED_PHASE_LOCATION"):
            self.run_permit(obj,phase="activate",path=c.STAGE_PERMIT_PATH)
        self.assertEqual(self.run_permit(obj,phase="recover",
                         path=c.STAGE_PERMIT_PATH)["approved_source_sha"],c.CANDIDATE)
    def test_wrong_permit_digest_rejected(self):
        with self.assertRaisesRegex(c.Hold,"PERMIT_BYTES_NOT_CENTRAL_PINNED"):
            self.run_permit(self.make(),sha_override="e"*64)
    def test_funded_operations_or_active_codex_capture_refused(self):
        for bad_key in ("financial_writers_authorized","codex_financial_capture_active"):
            obj=self.make();obj[bad_key]=True
            with self.assertRaisesRegex(c.Hold,"PERMIT_FIELDS_DRIFT"):
                self.run_permit(obj)

if __name__=="__main__":main()
