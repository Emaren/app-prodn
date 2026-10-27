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
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.path=Path(self.temp.name)/"private";self.path.mkdir(mode=0o700)
  self.db=s.open_db(self.path/"journal.sqlite3")
  self.keys=pins();s.enroll(self.db,self.keys,"test-operator")
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
 def test_ack_and_crash_safe_retry(self):
  with self.fake():s.receive(self.db,self.keys,{},NOW)
  ident=self.db.execute("SELECT id FROM events LIMIT 1").fetchone()[0]
  s.ack(self.db,ident,"operator-reviewed",NOW)
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
