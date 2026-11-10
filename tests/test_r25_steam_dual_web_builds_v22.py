"""V22 two exact web source Steam fixture tests; synthetic data never authorizes HEL1."""
import ast
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch,MagicMock

FILE=Path(__file__).resolve().parents[1]/"scripts/release/r25_steam_refresh_two_web_builds_v22.py"
UNIT=FILE.with_suffix(".service")
spec=importlib.util.spec_from_file_location("v22_dual",FILE)
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(o):return (json.dumps(o,sort_keys=True,separators=(",",":"))+"\n").encode()
TEXT_GOLDEN={
'load_original':'334b27fa9da2fa7c5cdb911e445bfebe5a3be5c4a0bc031ded5b2fecc029fac2',
'verify_exact_retired_preview':'ceda965c67ddcc62019dd3286a5213081dc2147ee8622385245ea6dfd483eb00',
'load_c03_helper':'54e86118665ea581ea22fca8aa926831792027f0712363efe9d8d36bda765417',
'load_c04_helper':'4f03e5edbf4e95ae446aaaeecb5912fd30bd64e00940ffe7f7324ca654f0cb3a',
'nginx_config_has_no_retired_3031':'c3479b2237eb7e59ce735be42154abfb3d4cc8983be7fccb32bd57ece834fd7a',
'native_snapshot':'2764e6464630e41af6270b1c4f2191757d738cdf25f7f7626d1f800920770fca',
'read_live_steam_lease_seconds':'bc8c08928c5e0b65a6b26f2666a45c9589b59e29cf121ef2dd41230e78b5cbc9',
'strict_lease_seconds_with_gc_retry':'35f4796db30e17288b5ae4048d90d1d5cafde534783dddcee53cac127a4f4e12',
'lease_expiry_readonly_wait':'ff5e81b865dc78b39893a106b4253755b548d9de8fff91feff34e0bacd064013',
'load_c01_exact_delta_helper':'790e7de3798cd1d4805a07272268556e2624d3803927676f896739c87a1c5b23',
'c04_socket_backlog_identity_rows':'550a0b8ea6c1cfcd551cf746c578b6f2b3166af12478a172e2603b2843ca0b5e',
}
def proof():
 p=v.PROFILES["candidate"]
 overlay={
 "schema":"aoe2war.runtime-artifact.v1","archive":"runtime.tar.gz","format":"tar.gz",
 "sha256":v.PLAYER_CI_ARCHIVE_SHA,"bytes":615988730,
 "source_sha":p["source"],"build_id":p["build"],"build_version":p["version"],
 "files":45044,"manifest_sha256":v.PLAYER_CI_MANIFEST_SHA,"tree_sha256":v.PLAYER_CI_TREE_SHA,
 "machine":"x86_64","node_version":"v22.22.0",
 "readonly_backend_upstream":"http://127.0.0.1:3331"}
 permit={
 "schema":"aoe2war.r25.public-player.central-permit.v1",
 "central_scope":"PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET",
 "approved_source_sha":p["source"],"approved_build_id":p["build"],
 "approved_candidate_unit_sha256":v.PUBLIC_PLAYER_UNIT_SHA,
 "controller_sha256":v.PLAYER_CONTROLLER_SHA,"ci_archive_sha256":v.PLAYER_CI_ARCHIVE_SHA,
 "allowed_operation":"ONE_USE_RESTRICTED_3032_ONLY",
 "codex_financial_capture_active":False,
 "financial_writers_authorized":False,"web_financial_mutations_authorized":False,
 "managed_avatar_handles":["user-u-1301e0492fdf4a229d941940413497e1-featured",
                             "user-u-"+"2"*32+"-featured","user-u-"+"3"*32+"-featured"],
 "central_comment_url":"https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6775729943"}
 raws={"overlay":encode(overlay),"permit":encode(permit)}
 previous="0"*64
 for num,(state,data) in enumerate([
 ("PREPARED",{"original_web_pid":"701398","unit_sha256":v.NEW_UNIT_SHA,
             "permit_sha256":sha(raws["permit"])}),
 ("EXTRACTING",{}),
 ("STAGED",{"files_and_links":45046,"source":p["source"],"build":p["build"],
            "created_empty_bind_targets":[".next/cache","public/downloads"]})
 ],1):
  obj={"schema":"r25.one-use.journal.event.v1","number":num,"state":state,
       "prev_sha256":previous,"utc":"2026-11-10T18:45:00+00:00",
       "source_sha":p["source"],"build_id":p["build"],"data":data}
  b=encode(obj);raws[f"{num:04d}.json"]=b;previous=sha(b)
 return raws

class V22Bounded(unittest.TestCase):
 def test_original_protected_v20_functions_are_exact_text_sha(self):
  t=ast.parse(FILE.read_text())
  text=FILE.read_text()
  actual={n.name:sha(ast.get_source_segment(text,n).encode())
          for n in t.body if isinstance(n,ast.FunctionDef)}
  for n,h in TEXT_GOLDEN.items():
   with self.subTest(n=n):self.assertEqual(actual.get(n),h)
 def test_exactly_two_source_build_unit_identities(self):
  self.assertEqual(set(v.PROFILES),{"rollback","candidate"})
  self.assertEqual(v.PROFILES["rollback"]["source"],"b1ef050b954be734c9f34147361e0d02d7c89b19")
  self.assertEqual(v.PROFILES["candidate"]["source"],"6662c33a0ecf25e5b4bd11283fe98a4842a69eb0")
  self.assertEqual(v.PROFILES["candidate"]["build"],"brqExtuPGWtj1iKPCdur-")
  self.assertEqual(v.PROFILES["candidate"]["unit_sha"],v.PUBLIC_PLAYER_UNIT_SHA)
 def test_timer_unit_changes_only_one_execstart_path(self):
  b=UNIT.read_bytes()
  before=b"/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py"
  after=b"/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py"
  self.assertEqual(b.count(after),1)
  self.assertEqual(sha(b),v.STEAM_V22_UNIT_SHA256)
  self.assertEqual(sha(b.replace(after,before)),v.STEAM_V20_UNIT_SHA256)
 def test_known_github_overlay_is_real_source_bound_hash(self):
  self.assertEqual(sha(proof()["overlay"]),v.PLAYER_CI_OVERLAY_SHA)
 def test_rollback_origin_can_be_verified_without_new_source_forgery(self):
  self.assertEqual(v.origin_sha_for("rollback"),
                   "c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7")
  with self.assertRaisesRegex(RuntimeError,"PROFILE_OUTSIDE_EXACT_PAIR"):
   v.origin_sha_for("all")
 def test_active_profile_schema_rejects_unknown_profile(self):
  j={"schema":"aoe2war.app.traffic-steam-v22.active.v1","profile":"forged",
      "source_sha":"x","stage_receipt_sha256":"a"*64,"finance_authorized":False}
  with patch.object(v,"verified",return_value=encode(j)):
   with self.assertRaisesRegex(RuntimeError,"UNREVIEWED_ACTIVE_WEB_BUILD"):
    v.active_profile()

class GenuineStaging(unittest.TestCase):
 def setUp(self):self.raws=proof()
 def reader(self,path,mode):
  if path==v.PLAYER_CI_OVERLAY:return self.raws["overlay"]
  if path==v.PLAYER_STAGE_PERMIT:return self.raws["permit"]
  if path.parent==v.PLAYER_STAGE_JOURNAL:return self.raws[path.name]
  raise AssertionError("unexpected path")
 def change(self,name,fun):
  obj=json.loads(self.raws[name]);fun(obj);self.raws[name]=encode(obj)
 def rechained(self):
  self.change("0001.json",lambda x:x["data"].update(permit_sha256=sha(self.raws["permit"])))
  self.change("0002.json",lambda x:x.update(prev_sha256=sha(self.raws["0001.json"])))
  self.change("0003.json",lambda x:x.update(prev_sha256=sha(self.raws["0002.json"])))
 def test_valid_synthetic_receipt_with_real_ci_overlay(self):
  r=v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
  self.assertEqual(r["origin_sha"],sha(self.raws["0003.json"]))
  self.assertEqual(r["overlay_sha"],v.PLAYER_CI_OVERLAY_SHA)
 def test_missing_genuine_stage_is_a_real_hold(self):
  del self.raws["0003.json"]
  with self.assertRaises(KeyError):v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_forged_overlay_bytes_rejected(self):
  self.raws["overlay"]+=b"z"
  with self.assertRaisesRegex(RuntimeError,"PLAYER_CI_OVERLAY_BYTES"):
   v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_forged_chain_number_rejected(self):
  self.change("0003.json",lambda o:o.update(number=4))
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_JOURNAL_CHAIN"):
   v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_replayed_second_event_rejected(self):
  self.raws["0002.json"]=self.raws["0001.json"]
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_JOURNAL_CHAIN"):
   v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_wrong_staged_file_count_and_missing_bind_targets(self):
  self.change("0003.json",lambda o:o["data"].update(files_and_links=45045))
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_EXACT_EXTRACTED_SET"):
   v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_false_finance_authority_refused_even_with_correctly_chained_receipt(self):
  obj=json.loads(self.raws["permit"]);obj["financial_writers_authorized"]=True
  self.raws["permit"]=encode(obj);self.rechained()
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_PERMIT_NOT_SOURCE_AUTHORIZED"):
   v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
 def test_wrong_source_controller_or_unit_permit_refused(self):
  for k in ("approved_source_sha","controller_sha256","approved_candidate_unit_sha256"):
   with self.subTest(k=k):
    old=self.raws.copy()
    obj=json.loads(self.raws["permit"]);obj[k]="f"*40
    self.raws["permit"]=encode(obj);self.rechained()
    with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_PERMIT_NOT_SOURCE_AUTHORIZED"):
     v.player_stage_proof(read=self.reader,list_entries=lambda:["0001.json","0002.json","0003.json"])
    self.raws=old

class TimerAndLease(unittest.TestCase):
 def test_lease_110_seconds_is_positive(self):
  self.assertEqual(v.lease_transfer_headroom(read=lambda:[240,110]),110)
 def test_short_expired_or_malformed_lease_are_holds(self):
  for x in ([],[0],[90,200],[301],[True,220],[240.2],["240"]):
   with self.subTest(x=x):
    with self.assertRaisesRegex(RuntimeError,"LEASE_TOO_CLOSE_TO_EXPIRY"):
     v.lease_transfer_headroom(read=lambda x=x:x)
 def test_lock_conflicting_timer_or_enroll_refused(self):
  with tempfile.TemporaryDirectory() as p:
   path=Path(p)/"timer.lock";path.write_bytes(b"")
   with patch.object(v,"LOCK",path),patch.object(v,"verified",return_value=b""):
    fd=os.open(path,os.O_RDWR)
    try:
     fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
     with self.assertRaisesRegex(RuntimeError,"V22_STEAM_TIMER_ENROLL_RACE"):
      v.v22_timer_exclusive_lock(lambda:"UNSAFE")
    finally:
     fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
    self.assertEqual(v.v22_timer_exclusive_lock(lambda:"PASS_AFTER_UNLOCK"),"PASS_AFTER_UNLOCK")
 def test_candidate_is_not_allowed_as_original_pre_cutover(self):
  with patch.object(v,"static_check"),patch.object(v,"active_profile",return_value=("candidate",v.PROFILES["candidate"])):
   with self.assertRaisesRegex(RuntimeError,"PRE_CUTOVER_NOT_ORIGINAL"):
    v.v22_pre_cutover_ready()
 def test_subsequent_refresh_retains_lease_gc_and_funding_hold(self):
  source=FILE.read_text()
  for name in ("lease_expiry_readonly_wait","v22_timer_exclusive_lock","obj.refresh","native_snapshot","FIN_SNAPSHOT"):
   self.assertIn(name,source)
 def test_rollback_then_candidate_enroll_commands_are_exact_profiles(self):
  source=FILE.read_text()
  self.assertIn("check(name in PROFILES,'UNKNOWN_ENROLLMENT_PROFILE')",source)
  self.assertIn("origin_sha_for(name)",source)
  self.assertIn("obj.evidence()",source)
  self.assertIn("obj.expected_policy",source)

if __name__=="__main__":unittest.main(verbosity=2)

class ExecutedTransitionSimulation(unittest.TestCase):
 def enroll_synthetic(self,profile):
  identity=v.PROFILES[profile]
  calls=[]
  m=MagicMock()
  m.production_nft_shape.return_value=v.NFT_SHAPE
  guard=MagicMock()
  guard.evidence.return_value=(m,{},v.FIN_SNAPSHOT)
  guard.expected_policy.return_value={"schema":"MOCK_PROTECTED_SCOPE","finance_authorized":False}
  def read(path,mode=None):
   if path==v.CURRENT_UNIT:return b"SYNTHETIC_UNIT_BYTES"
   if path==identity["origin"]:return b"SYNTHETIC_STAGE"
   raise AssertionError("foreign source "+str(path))
  def digest(data):
   if data==b"SYNTHETIC_UNIT_BYTES":return identity["unit_sha"]
   if data==b"SYNTHETIC_STAGE":return "a"*64
   return sha(data)
  def write(path,data,mode):
   calls.append((path,data,mode))
   return "a"*64
  fake_root=MagicMock()
  fake_root.is_dir.return_value=True
  fake_root.is_symlink.return_value=False
  fake_root.stat.return_value=MagicMock(st_uid=0,st_mode=0o40500)
  with (patch.object(v,"static_check"),patch.object(v,"verified",side_effect=read),
        patch.object(v,"digest",side_effect=digest),
        patch.object(v,"origin_sha_for",return_value="a"*64),
        patch.object(v,"native_snapshot",return_value=(None,m,v.FIN_SNAPSHOT)),
        patch.object(v,"verify_active_runtime",return_value=(701399,923452)),
        patch.object(v,"health",return_value=True),
        patch.object(v,"make_guard",return_value=guard),
        patch.object(v,"atomic_json",side_effect=write),
        patch.object(v,"ROOT",fake_root),
        patch.object(v.os,"geteuid",return_value=0)):
   v.enroll(profile)
  return calls
 def test_actual_candidate_enroll_generates_exact_profile_and_no_finance_authority(self):
  a=self.enroll_synthetic("candidate")
  self.assertEqual(len(a),4)
  self.assertEqual(a[0][1]["profile"],"candidate")
  self.assertEqual(a[0][1]["source_sha"],v.PROFILES["candidate"]["source"])
  self.assertFalse(a[0][1]["finance_authorized"])
  self.assertEqual(a[1][1]["build_id"],v.PROFILES["candidate"]["build"])
  self.assertFalse(a[1][1]["finance_authorized"])
 def test_original_build_restoration_enrolls_rollback_not_historical_4ab(self):
  a=self.enroll_synthetic("rollback")
  self.assertEqual(len(a),4)
  self.assertEqual(a[0][1]["source_sha"],v.PROFILES["rollback"]["source"])
  self.assertEqual(a[1][1]["unit_sha256"],v.NEW_UNIT_SHA)
  self.assertEqual(a[2][1]["approval_scope"],"STEAM_ONLY_EXISTING_UID990_NFT_SETS")
  self.assertFalse(a[2][1]["finance_authorized"])
 def test_subsequent_timer_refresh_invokes_guarded_policy_and_expiry_wait(self):
  calls=[]
  m=MagicMock()
  m.refresh.side_effect=lambda:calls.append("refresh")
  def guarded(f):
   calls.append("acquire-v22-timer-lock")
   return f()
  with (patch.object(v.sys,"argv",["steam_v22","--phase","refresh"]),
        patch.object(v,"make_guard",side_effect=lambda:(calls.append("guard"),m)[1]),
        patch.object(v,"lease_expiry_readonly_wait",side_effect=lambda:calls.append("expiry-check")),
        patch.object(v,"v22_timer_exclusive_lock",side_effect=guarded)):
   v.main()
  self.assertEqual(calls,["acquire-v22-timer-lock","guard","expiry-check","refresh"])
 def test_timer_collision_does_not_refresh_after_failed_lock(self):
  m=MagicMock()
  with (patch.object(v.sys,"argv",["steam_v22","--phase","refresh"]),
        patch.object(v,"make_guard",return_value=m),
        patch.object(v,"v22_timer_exclusive_lock",
          side_effect=RuntimeError("HOLD:V22_STEAM_TIMER_ENROLL_RACE"))):
   with self.assertRaisesRegex(RuntimeError,"V22_STEAM_TIMER_ENROLL_RACE"):
    v.main()
  m.refresh.assert_not_called()

class FollowOnJournalSafety(unittest.TestCase):
 def stage(self):
  return proof()
 def source_reader(self,items):
  def read(p,mode):
   if p==v.PLAYER_CI_OVERLAY:return items["overlay"]
   if p==v.PLAYER_STAGE_PERMIT:return items["permit"]
   return items[p.name]
  return read
 def test_terminal_rolled_back_journal_does_not_appear_active_candidate(self):
  a=self.stage();e=json.loads(a["0003.json"])
  e.update(number=4,state="ROLLED_BACK",prev_sha256=sha(a["0003.json"]))
  a["0004.json"]=encode(e)
  names=[f"{i:04d}.json" for i in range(1,5)]
  receipt=v.player_stage_proof(read=self.source_reader(a),list_entries=lambda:names)
  self.assertTrue(receipt["terminal"])
  self.assertEqual(receipt["last_state"],"ROLLED_BACK")
  # The original restricted R25 remains a separately valid rollback profile.
  self.assertEqual(v.origin_sha_for("rollback"),v.PROFILES["rollback"]["origin_sha"])
 def test_tampered_appended_event_link_fails(self):
  a=self.stage();e=json.loads(a["0003.json"])
  e.update(number=4,state="CANDIDATE_STARTED",prev_sha256="f"*64)
  a["0004.json"]=encode(e)
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_JOURNAL_CHAIN"):
   v.player_stage_proof(read=self.source_reader(a),
                        list_entries=lambda:[f"{i:04d}.json" for i in range(1,5)])
 def test_undeclared_foreign_journal_file_refused(self):
  a=self.stage()
  with self.assertRaisesRegex(RuntimeError,"PLAYER_STAGE_JOURNAL_UNRECOGNIZED"):
   v.player_stage_proof(read=self.source_reader(a),
                        list_entries=lambda:["0001.json","0002.json","0003.json","unexpected.lock"])
