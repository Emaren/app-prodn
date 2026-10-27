"""Phase12 adversarial Sentinel ledger tests; synthetic verifier output is NOT host attestation."""
import datetime as dt,json,os,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from scripts import aoe2_storage_sentinel as s
NOW=dt.datetime(2026,10,27,20,0,tzinfo=dt.timezone.utc)
SHA="a"*40; VOLUME="a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42"
def pins():
 out={}
 for name in s.PLANES:
  out[name]=dict(collector_id="collector-"+name,public_key_pem="key-"+name,
    source_sha=SHA,filesystem_uuid=VOLUME if name.endswith("105319120") else "uuid-"+name,
    mount_source="/dev/sdb" if name.endswith("105319120") else "/dev/example",
    mountpoint="/mnt/HC_Volume_105319120" if name.endswith("105319120") else "/")
 return s.check_pins(out)
def receipt(seq=1,obs="2026-10-27T19:59:00Z",coverage="partial",future=False):
 return dict(schema="aoe2war.storage-sentinel.verified-input.v1",planes=[
  dict(plane=name,source_sha=SHA,collector_id="collector-"+name,sequence=seq,
       observed_at="2026-10-27T20:02:00Z" if future else obs,
       ttl_seconds=300,coverage=coverage,receipt_sha256=("%064x"%seq),
       backup_status="failed" if name.endswith("105319120") else "unknown",
       expired_generations=2 if name=="mac" else None,reviewed_generations=1 if name=="mac" else 0,
       capacity=dict(ordinary_free_bytes=7*s.GIB if name=="mac" else 20*s.GIB,
         effective_used_percent=92 if name.endswith("105319120") else 55))
 for name in s.PLANES])
class TestSentinel(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=Path.home());self.addCleanup(self.temp.cleanup)
  self.path=Path(self.temp.name)/"private";self.path.mkdir(mode=0o700)
  self.db=s.open_db(self.path/"journal.sqlite3")
  self.keys=pins();s.enroll(self.db,self.keys,"test-operator")
  self.db.execute("UPDATE enrollment SET val=? WHERE key='created'",(s.stamp(NOW),))
 def fake(self,seq=1,**kw):
  return patch.object(s.subprocess,"run",return_value=SimpleNamespace(
   returncode=0,stdout=json.dumps(receipt(seq,**kw)),stderr=""))
 def test_realizable_pressure_and_distinct_protected_backup_hold(self):
  with self.fake():s.receive(self.db,self.keys,{"test":"opaque"},NOW)
  events=self.db.execute("SELECT rule,plane,severity FROM events WHERE active=1").fetchall()
  self.assertIn(("storage_pressure","mac","CRITICAL"),events)
  self.assertIn(("snapshot_admission_hold","hel1-volume-105319120","CRITICAL"),events)
  self.assertIn(("backup_failed","hel1-volume-105319120","HOLD"),events)
  self.assertIn(("scan_incomplete","hel1-root","HOLD"),events)
  self.assertFalse(any(rule=="cleanup_receipt" for rule,_,_ in events))
  self.assertNotIn("/dev",json.dumps(s.projection(self.db,NOW)))
 def test_dedup_and_monotonic_sequence_across_connection(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  initial=self.db.execute("SELECT count(*) FROM outbox").fetchone()[0]
  self.db.close();self.db=s.open_db(self.path/"journal.sqlite3")
  with self.fake(2,obs="2026-10-27T20:00:30Z"):
   s.receive(self.db,self.keys,{},NOW+dt.timedelta(seconds=100))
  self.assertEqual(self.db.execute("SELECT count(*) FROM outbox").fetchone()[0],initial)
  with self.fake(2,obs="2026-10-27T20:01:30Z"):
   with self.assertRaises(s.Hold):s.receive(self.db,self.keys,{},NOW+dt.timedelta(seconds=130))
  self.assertEqual(self.db.execute("SELECT seq FROM witness WHERE plane='mac'").fetchone()[0],2)
 def test_false_and_future_alerts_reject_without_ledger_mutation(self):
  with self.fake(future=True):
   with self.assertRaises(s.Hold):s.receive(self.db,self.keys,{},NOW)
  self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0],0)
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(returncode=2,stdout="",stderr="bad-signature")):
   with self.assertRaises(s.Hold):s.receive(self.db,self.keys,{},NOW)
  self.assertEqual(self.db.execute("SELECT seq FROM witness WHERE plane='mac'").fetchone()[0],0)
 def test_unseen_hosts_trigger_stale_without_invented_measurement(self):
  s.heartbeat(self.db,NOW+dt.timedelta(seconds=20*60),)
  self.assertEqual(self.db.execute("SELECT count(*) FROM events WHERE rule='collector_stale'").fetchone()[0],3)
  self.assertEqual(self.db.execute("SELECT count(*) FROM witness WHERE seq!=0").fetchone()[0],0)
 def test_unreviewed_generated_data_is_not_verified_reclaim(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  self.assertEqual(self.db.execute("SELECT count(*) FROM events WHERE rule='cleanup_candidate_review'").fetchone()[0],0)
 def test_protected_candidate_rejected_by_existing_storage_os_policy(self):
  signed=receipt()
  signed["planes"][0]["candidate_inventory"]={
   "kind":"aoe2war-storage-artifact-inventory",
   "items":[{"class":"next_build","path":"/Users/test/aoe2war-recovery/.next",
    "allocated_bytes":s.GIB,"coverage":"complete","source_authenticated":True,
    "symlink_or_mount":False,"dirty_or_untracked":False,
    "active_reference":False,"release_reference":False,"rebuild_verified":True,
    "restore_verified":True,"worktree_proven":True,"git_tracked":False,
    "tracked_dependency_lockfile":"yarn.lock","generation_rank":4,
    "snapshot_restore_dependencies_cleared":True,"owner_approved_scope":True}]}
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(
    returncode=0,stdout=json.dumps(signed),stderr="")):s.receive(self.db,self.keys,{},NOW)
  self.assertEqual(self.db.execute("SELECT count(*) FROM events WHERE rule='cleanup_candidate_review'").fetchone()[0],0)
 def test_cleared_then_recurrent_condition_reopens_after_ack(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  ident=self.db.execute("SELECT id FROM events WHERE plane='mac' AND rule='storage_pressure'").fetchone()[0]
  s.ack(self.db,ident,"test-operator",NOW)
  resolved=receipt(2,obs="2026-10-27T20:00:30Z",coverage="complete")
  for p in resolved["planes"]:
   p["backup_status"]="ok";p["expired_generations"]=0;p["reviewed_generations"]=0
   p["capacity"]["ordinary_free_bytes"]=25*s.GIB
   p["capacity"]["effective_used_percent"]=55
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(
    returncode=0,stdout=json.dumps(resolved),stderr="")):
   s.receive(self.db,self.keys,{},NOW+dt.timedelta(seconds=100))
  self.assertEqual(self.db.execute("SELECT active FROM events WHERE id=?",(ident,)).fetchone()[0],0)
  with self.fake(3,obs="2026-10-27T20:01:30Z"):
   s.receive(self.db,self.keys,{},NOW+dt.timedelta(seconds=180))
  active,acked=self.db.execute("SELECT active,ack_at FROM events WHERE id=?",(ident,)).fetchone()
  self.assertEqual(active,1);self.assertIsNone(acked)
  self.assertEqual(self.db.execute("SELECT count(*) FROM outbox WHERE id LIKE ?",(ident+":reopen:%",)).fetchone()[0],1)
 def test_watch_to_critical_creates_one_new_escalation(self):
  moderate=receipt()
  moderate["planes"][0]["capacity"]["ordinary_free_bytes"]=12*s.GIB
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(
    returncode=0,stdout=json.dumps(moderate),stderr="")):
   s.receive(self.db,self.keys,{},NOW)
  first=self.db.execute("SELECT id,severity FROM events WHERE plane='mac' AND rule='storage_pressure' AND active=1").fetchone()
  self.assertEqual(first[1],"WATCH")
  with self.fake(2,obs="2026-10-27T20:00:30Z"):
   s.receive(self.db,self.keys,{},NOW+dt.timedelta(seconds=90))
  active=self.db.execute("SELECT id,severity FROM events WHERE plane='mac' AND rule='storage_pressure' AND active=1").fetchone()
  self.assertEqual(active[1],"CRITICAL")
  self.assertNotEqual(first[0],active[0])
  self.assertEqual(self.db.execute("SELECT count(*) FROM outbox WHERE event_id=?",(active[0],)).fetchone()[0],1)
 def test_ack_requires_enrolled_operator_and_queues_one_private_confirmation(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  ident=self.db.execute("SELECT id FROM events WHERE plane='mac' AND rule='storage_pressure'").fetchone()[0]
  with self.assertRaises(s.Hold):s.ack(self.db,ident,"unapproved-operator",NOW)
  self.assertIsNone(self.db.execute("SELECT ack_at FROM events WHERE id=?",(ident,)).fetchone()[0])
  s.ack(self.db,ident,"test-operator",NOW)
  s.ack(self.db,ident,"test-operator",NOW)
  rows=self.db.execute("SELECT id,body FROM outbox WHERE id LIKE ?",(ident+":ack:%",)).fetchall()
  self.assertEqual(len(rows),1)
  self.assertIn("STORAGE SENTINEL ACK",rows[0][1])
  self.assertIn("ACK is awareness, NOT repair",rows[0][1])
  status=s.operator_status(self.db,NOW)
  self.assertEqual(status["schema"],"aoe2war.storage-sentinel.operator-status.v1")
  entry=next(x for x in status["incidents"] if x["event_id"]==ident)
  self.assertIsNotNone(entry["acknowledged_at"])
  self.assertEqual(entry["ack_delivery_status"],"PENDING")
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(
    returncode=0,stdout="DELIVERED_OR_ALREADY_PRESENT\\n",stderr="")):
   with patch.object(s,"now",return_value=NOW):
    s.deliver(self.db,10)
  after=s.operator_status(self.db,NOW)
  entry=next(x for x in after["incidents"] if x["event_id"]==ident)
  self.assertEqual(entry["delivery_status"],"DELIVERED")
  self.assertEqual(entry["ack_delivery_status"],"DELIVERED")
 def test_ack_and_crash_safe_retry(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  ident=self.db.execute("SELECT id FROM events LIMIT 1").fetchone()[0]
  s.ack(self.db,ident,"test-operator",NOW)
  self.assertIsNotNone(self.db.execute("SELECT ack_at FROM events WHERE id=?",(ident,)).fetchone()[0])
  with patch.object(s.subprocess,"run",return_value=SimpleNamespace(returncode=2,stdout="",stderr="down")):
   with patch.object(s,"now",return_value=NOW):s.deliver(self.db,1)
  self.assertEqual(self.db.execute("SELECT status FROM outbox LIMIT 1").fetchone()[0],"pending")
  self.assertEqual(self.db.execute("SELECT attempts FROM outbox LIMIT 1").fetchone()[0],1)
 def test_protected_data_never_enters_inbox_or_public_projection(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  text="\n".join(x[0] for x in self.db.execute("SELECT body FROM outbox"))
  for secret in ("/Users/","/dev/","private.pem","traffic_history","a9a085d9","systemctl","rm -rf"):
   self.assertNotIn(secret,text)
  self.assertIn("/aoe2war-os/storage-atlas",text)
 def test_no_private_chat_post_can_masquerade(self):
  route=(s.ROOT/"app/api/contact-emaren/route.ts").read_text()
  self.assertIn("System notifications cannot be authored from public chat.",route)
  bridge=(s.ROOT/"scripts/aoe2_storage_sentinel_inbox.mts").read_text()
  self.assertIn("SENDER_UID=\"aoe2war-storage-sentinel\"",bridge)
  self.assertIn("pg_advisory_xact_lock",bridge)
  self.assertIn("verificationMethod",bridge)
  self.assertNotIn("fetch(",bridge)
if __name__=="__main__":unittest.main()
