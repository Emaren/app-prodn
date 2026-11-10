"""Independent disposable fixture: no real R25 file, PID, DB or key is changed."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/"scripts/release/r25_sniper_one_use_importer_v1.py"
sp=importlib.util.spec_from_file_location("sniper_importer",SCRIPT)
m=importlib.util.module_from_spec(sp)
sp.loader.exec_module(m)

class OneUsePublicSniper(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory(dir=Path.home())
        self.addCleanup(self.t.cleanup)
        self.root=Path(self.t.name)/"aoe2-managed-assets"
        self.src=self.root/"uploads"/"managed-assets"/"avatar"
        self.dst=self.root/"avatar"
        self.src.mkdir(parents=True)
        self.dst.mkdir()
        self.original_pins=copy.deepcopy(m.PINS)
        self.original_manifest=m.MANIFEST_SHA
        sample={name:(name.encode()*15)[:500] for name in sorted(m.PINS)}
        pins={name:(hashlib.sha256(body).hexdigest(),len(body),0o644,0,0)
              for name,body in sample.items()}
        for name,body in sample.items(): (self.src/name).write_bytes(body)
        manifest=[{"filename":name,"sha256":pins[name][0],"size":pins[name][1]} for name in sorted(pins)]
        m.PINS=pins
        m.MANIFEST_SHA=m.digest(m.canonical(manifest))
        self.addCleanup(lambda: setattr(m,"PINS",self.original_pins))
        self.addCleanup(lambda: setattr(m,"MANIFEST_SHA",self.original_manifest))
        self.source_shas={name:hashlib.sha256((self.src/name).read_bytes()).hexdigest() for name in pins}

    def run_release(self,**kw):
        kw.setdefault("accept", lambda: {"status":"PASS_FAKE_LOOPBACK"})
        kw.setdefault("accept_public", lambda local: {
            "status":"PASS_3_OF_3_PUBLIC_HTTPS_MIME_CACHE_PARITY",
            "fixture_only":True,
        })
        return m.release(self.root,probes=False,**kw)
    def has_media(self):
        return sorted(x.name for x in self.dst.iterdir() if x.name in m.PINS)
    def staged(self):
        return sorted(x.name for x in self.dst.iterdir() if x.name.startswith(m.STAGE_PREFIX) and x.name!=m.JOURNAL_NAME)
    def journal(self):
        return [json.loads(x) for x in (self.dst/m.JOURNAL_NAME).read_text().splitlines()]

    def test_positive_install_one_use_verified_all_four(self):
        result=self.run_release()
        self.assertEqual(result["status"],"DEPLOYED_FOUR_PINNED_SNIPER_MEDIA")
        self.assertEqual(set(self.has_media()),set(m.PINS))
        for name in m.PINS:
            self.assertEqual((self.src/name).read_bytes(),(self.dst/name).read_bytes())
        self.assertEqual(self.staged(),[])
        entries=self.journal()
        self.assertEqual(entries[0]["event"],"BEGIN")
        self.assertEqual(entries[-1]["event"],"COMPLETED")
        self.assertEqual(sum(x["event"]=="TEMP_INTENT" for x in entries),4)
        self.assertEqual(sum(x["event"]=="TEMP_OPENED" for x in entries),4)
        self.assertEqual(sum(x["event"]=="PREPARED" for x in entries),4)
        self.assertEqual(sum(x["event"]=="INSTALLED" for x in entries),4)
        self.assertEqual(sum(x["event"]=="PENDING_PUBLIC_ACCEPTANCE" for x in entries),1)
        self.assertEqual(sum(x["event"]=="LOOPBACK_VERIFIED" for x in entries),1)
        self.assertEqual(sum(x["event"]=="PUBLIC_VERIFIED" for x in entries),1)
        self.assertLess(next(i for i,x in enumerate(entries) if x["event"]=="PENDING_PUBLIC_ACCEPTANCE"),
                        next(i for i,x in enumerate(entries) if x["event"]=="PUBLIC_VERIFIED"))
        self.assertEqual(result["public_https"]["status"],"PASS_3_OF_3_PUBLIC_HTTPS_MIME_CACHE_PARITY")
        self.assertEqual({n:hashlib.sha256((self.src/n).read_bytes()).hexdigest() for n in m.PINS},
                         self.source_shas)
        with self.assertRaisesRegex(m.Hold,"JOURNAL_ALREADY_EXISTS_ONE_USE"):
            self.run_release()
        with self.assertRaisesRegex(m.Hold,"ALREADY_COMPLETED_NO_ROLLBACK"):
            m.rollback(self.dst)

    def test_after_link_before_journal_crash_auto_rollback(self):
        def fail(name):
            if name==sorted(m.PINS)[0]: raise RuntimeError("INJECT_AFTER_ATOMIC_LINK_BEFORE_ACK")
        with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK_INJECT_AFTER"):
            self.run_release(after_link=fail)
        self.assertEqual(self.has_media(),[])
        self.assertEqual(self.staged(),[])
        self.assertEqual(self.journal()[-1]["event"],"ROLLED_BACK")
        with self.assertRaisesRegex(m.Hold,"JOURNAL_ALREADY_EXISTS_ONE_USE"):
            self.run_release()

    def test_second_link_interrupt_cleans_previous_completed_files(self):
        stop=sorted(m.PINS)[1]
        def fail(name):
            if name==stop:raise RuntimeError("INJECT_SECOND_ATOMIC_LINK")
        with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK"):
            self.run_release(after_link=fail)
        self.assertEqual(self.has_media(),[])
        self.assertEqual(self.staged(),[])

    def test_parity_or_health_failure_forces_rollback(self):
        with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK"):
            m.release(self.root,probes=False,
                      accept=lambda: (_ for _ in ()).throw(m.Hold("INJECT_HTTP_PARITY_FAIL")))
        self.assertEqual(self.has_media(),[])
        self.assertEqual(self.journal()[-1]["event"],"ROLLED_BACK")

    def test_loopback_pass_then_public_https_failure_is_reversible(self):
        local_witness=[]
        def loopback():
            local_witness.append("PASS_LOOPBACK")
            return {"status":"PASS_3_OF_3_LOOPBACK_PORTRAIT_PARITY"}
        def public_fail(loopback):
            self.assertEqual(local_witness,["PASS_LOOPBACK"])
            raise m.Hold("INJECT_PUBLIC_HTTPS_404")
        with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK_INJECT_PUBLIC_HTTPS_404"):
            self.run_release(accept=loopback,accept_public=public_fail)
        self.assertEqual(self.has_media(),[])
        self.assertEqual(self.staged(),[])
        events=[x["event"] for x in self.journal()]
        self.assertIn("LOOPBACK_VERIFIED",events)
        self.assertIn("PENDING_PUBLIC_ACCEPTANCE",events)
        self.assertNotIn("PUBLIC_VERIFIED",events)
        self.assertNotIn("COMPLETED",events)
        self.assertEqual(events[-1],"ROLLED_BACK")

    def test_public_mime_cache_timeout_and_wrong_body_each_rollback(self):
        for reason in ("MIME","CACHE","TIMEOUT","BODY_MISMATCH"):
            with self.subTest(reason=reason):
                with self.t.__class__(dir=Path.home()) as temp:
                    # Each scenario needs its own unique one-use journal namespace.
                    root=Path(temp)/"aoe2-managed-assets"
                    src=root/"uploads"/"managed-assets"/"avatar"; dst=root/"avatar"
                    src.mkdir(parents=True); dst.mkdir()
                    for name in m.PINS:
                        (src/name).write_bytes((self.src/name).read_bytes())
                    with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK"):
                        m.release(root,probes=False,
                                  accept=lambda:{"status":"PASS_3_OF_3_LOOPBACK_PORTRAIT_PARITY"},
                                  accept_public=lambda local,reason=reason:(
                                    (_ for _ in ()).throw(m.Hold("INJECT_PUBLIC_"+reason))))
                    self.assertEqual({x.name for x in dst.iterdir() if x.name in m.PINS},set())
                    events=[json.loads(x)["event"] for x in (dst/m.JOURNAL_NAME).read_text().splitlines()]
                    self.assertIn("LOOPBACK_VERIFIED",events)
                    self.assertNotIn("COMPLETED",events)
                    self.assertEqual(events[-1],"ROLLED_BACK")

    def test_interrupt_in_pending_or_public_verified_state_rolls_back(self):
        for stop in ("PENDING_PUBLIC_ACCEPTANCE","LOOPBACK_VERIFIED","PUBLIC_VERIFIED"):
            with self.subTest(stop=stop):
                with tempfile.TemporaryDirectory(dir=Path.home()) as temp:
                    root=Path(temp)/"aoe2-managed-assets"
                    src=root/"uploads"/"managed-assets"/"avatar";dst=root/"avatar"
                    src.mkdir(parents=True);dst.mkdir()
                    for name in m.PINS:
                        (src/name).write_bytes((self.src/name).read_bytes())
                    def interrupt(state):
                        if state==stop:raise InterruptedError("INTERRUPT_AT_"+stop)
                    with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK"):
                        m.release(root,probes=False,
                            after_state=interrupt,
                            accept=lambda:{"status":"PASS_LOOPBACK"},
                            accept_public=lambda _:{"status":"PASS_3_OF_3_PUBLIC_HTTPS_MIME_CACHE_PARITY"})
                    self.assertFalse([x for x in dst.iterdir() if x.name in m.PINS])
                    events=[json.loads(x)["event"] for x in (dst/m.JOURNAL_NAME).read_text().splitlines()]
                    self.assertIn(stop,events)
                    self.assertNotIn("COMPLETED",events)
                    self.assertEqual(events[-1],"ROLLED_BACK")

    def test_unauthorized_live_injected_acceptor_cannot_run(self):
        with self.assertRaisesRegex(m.Hold,"LIVE_TEST_HOOKS_DENIED"):
            m.release(self.root,probes=True,accept=lambda:{"status":"FORGED"})

    def test_actual_https_request_parser_rejects_mime_cache_bytes(self):
        from unittest.mock import patch
        class FakeResponse:
            def __init__(self,mode):
                self.status=200 if mode!="STATUS" else 404
                self.mode=mode
            def read(self,limit):
                if self.mode=="TIMEOUT":raise TimeoutError("edge timeout")
                return b"RIFF"+b"1234"+(b"BAD!" if self.mode=="BODY" else b"WEBP")+b"data"
            def getheader(self,key,default=""):
                headers={
                   "content-type":"text/html" if self.mode=="MIME" else "image/webp",
                   "cache-control":"private, no-store" if self.mode=="CACHE" else m.CACHE,
                   "x-aoe2war-media-proxy":"silhouette" if self.mode=="FALLBACK" else "direct-managed",
                }
                return headers.get(key.lower(),default)
        class FakeConn:
            def __init__(self,mode):self.mode=mode
            def request(self,method,path,headers):
                self.path=path
                self.method=method
            def getresponse(self):return FakeResponse(self.mode)
            def close(self):pass
        for mode,why in (
            ("STATUS","PUBLIC_HTTPS_STATUS"),("TIMEOUT","edge timeout"),
            ("MIME","PUBLIC_HTTPS_MIME"),("CACHE","PUBLIC_HTTPS_CACHE"),
            ("BODY","PUBLIC_HTTPS_WEBP_BYTES"),("FALLBACK","PUBLIC_HTTPS_NOT_MANAGED")):
            with self.subTest(mode=mode):
                with patch.object(m.http.client,"HTTPSConnection",lambda *a,mode=mode,**k:FakeConn(mode)):
                    with self.assertRaisesRegex(Exception,why):
                        m.https_image(m.FEATURED[0])

    def test_concurrent_foreign_target_never_overwritten_other_owned_files_rollback(self):
        protected_name=sorted(m.PINS)[1]
        unrelated=self.dst/"DO_NOT_TOUCH_OTHER_WARRIOR.webp"
        unrelated.write_bytes(b"OTHER_WARRIOR_PUBLIC_BYTES")
        def competing_writer(name):
            if name==protected_name:
                (self.dst/name).write_bytes(b"FOREIGN_WRITER_SHOULD_SURVIVE")
        with self.assertRaisesRegex(m.Hold,"ROLLBACK_FOREIGN_OR_CHANGED_FILE"):
            self.run_release(before_link=competing_writer)
        self.assertEqual((self.dst/protected_name).read_bytes(),b"FOREIGN_WRITER_SHOULD_SURVIVE")
        self.assertEqual(unrelated.read_bytes(),b"OTHER_WARRIOR_PUBLIC_BYTES")
        self.assertFalse((self.dst/sorted(m.PINS)[0]).exists())
        self.assertTrue((self.dst/m.JOURNAL_NAME).exists())
        self.assertEqual(self.journal()[-1]["event"],"ROLLBACK_PARTIAL_HOLD")
        self.assertTrue(self.journal()[-1]["conflicts"])
        with self.assertRaisesRegex(m.Hold,"JOURNAL_ALREADY_EXISTS_ONE_USE"):
            self.run_release()

    def test_public_proof_requires_matching_real_https_bytes_for_all_three(self):
        values=[{"target":target,"sha256":hashlib.sha256(target.encode()).hexdigest(),"bytes":100}
                for target in m.FEATURED]
        values[-1]["sha256"]=m.PINS[m.NAME+".card.webp"][0]
        values[-1]["bytes"]=m.PINS[m.NAME+".card.webp"][1]
        local={"status":"PASS_3_OF_3_LOOPBACK_PORTRAIT_PARITY","cases":values}
        def fake_https(target):
            record=next(x for x in values if x["target"]==target)
            return {"sha256":record["sha256"],"bytes":record["bytes"],"mime":"image/webp",
                    "cache":m.CACHE,"proxy":"direct-managed"}
        with patch.object(m,"https_image",side_effect=fake_https):
            result=m.public_https_acceptance(local)
            self.assertEqual(result["status"],"PASS_3_OF_3_PUBLIC_HTTPS_MIME_CACHE_PARITY")
            self.assertEqual(len(result["cases"]),3)
            self.assertEqual(result["host"],"aoe2war.com")
        def wrong_https(target):
            record=fake_https(target)
            if target==m.FEATURED[-1]:
                record={**record,"sha256":"f"*64}
            return record
        with patch.object(m,"https_image",side_effect=wrong_https):
            with self.assertRaisesRegex(m.Hold,"PUBLIC_HTTPS_BODY_MISMATCH"):
                m.public_https_acceptance(local)

    def test_public_failure_cannot_mark_completed_or_remove_unrelated_assets(self):
        unrelated=self.dst/"zodiac-other-user.card.webp"
        unrelated.write_bytes(b"ZODIAC_ORIGINAL_UNRELATED")
        with self.assertRaisesRegex(m.Hold,"AUTO_ROLLBACK"):
            self.run_release(accept_public=lambda _: (_ for _ in ()).throw(
                m.Hold("INJECT_HTTPS_CACHE_MISMATCH")))
        self.assertEqual(unrelated.read_bytes(),b"ZODIAC_ORIGINAL_UNRELATED")
        self.assertEqual(self.has_media(),[])
        self.assertNotIn("COMPLETED",[x["event"] for x in self.journal()])
        self.assertEqual(self.journal()[-1]["event"],"ROLLED_BACK")

    def test_wrong_source_hash_denies_before_any_journal(self):
        name=sorted(m.PINS)[0]
        (self.src/name).write_bytes(b"tampered")
        with self.assertRaisesRegex(m.Hold,"FILE_SIZE|CONTENT_SHA"):
            self.run_release()
        self.assertEqual(list(self.dst.iterdir()),[])

    def test_existing_destination_is_a_hold_and_untouched(self):
        name=sorted(m.PINS)[0]
        (self.dst/name).write_bytes(b"FOREIGN")
        with self.assertRaisesRegex(m.Hold,"DESTINATION_NOT_EMPTY"):
            self.run_release()
        self.assertEqual((self.dst/name).read_bytes(),b"FOREIGN")
        self.assertFalse((self.dst/m.JOURNAL_NAME).exists())

    def test_source_symlink_rejected(self):
        name=sorted(m.PINS)[0]
        (self.src/name).unlink()
        (self.src/name).symlink_to(self.src/sorted(m.PINS)[1])
        with self.assertRaisesRegex(m.Hold,"FILE_MISSING_OR_SYMLINK"):
            self.run_release()

    def test_source_hardlink_rejected(self):
        name=sorted(m.PINS)[0]
        os.link(self.src/name,self.src/"bonus-link")
        with self.assertRaisesRegex(m.Hold,"FILE_TYPE_HARDLINK"):
            self.run_release()

    def test_unsafe_directory_symlink_rejected(self):
        self.dst.rmdir()
        self.dst.symlink_to(self.src)
        with self.assertRaisesRegex(m.Hold,"DIRECTORY_SYMLINK_OR_TYPE"):
            self.run_release()

    def test_unexpected_same_stem_asset_rejected(self):
        (self.dst/(m.NAME+".unreviewed.webp")).write_bytes(b"BAD")
        with self.assertRaisesRegex(m.Hold,"UNEXPECTED_SNIPER_FILES"):
            self.run_release()
        self.assertFalse((self.dst/m.JOURNAL_NAME).exists())

    def test_wrong_root_or_path_rejected(self):
        other=self.root/"fake"
        other.mkdir()
        with self.assertRaisesRegex(m.Hold,"PATH_SCOPE"):
            m.inspect_assets(self.root,other,self.dst)

    def test_manifest_pin_is_immutable(self):
        m.MANIFEST_SHA="a"*64
        with self.assertRaisesRegex(m.Hold,"MANIFEST_SHA_MISMATCH"):
            self.run_release()
        self.assertEqual(list(self.dst.iterdir()),[])

    def test_prepared_power_loss_recovery_only_own_inode(self):
        name=sorted(m.PINS)[0]
        fd=m.open_journal(self.dst)
        try:
            m.append(fd,"BEGIN",pre={"fixture":True})
            m.append(fd,"TEMP_INTENT",name=name)
            stage=self.dst/(m.STAGE_PREFIX+name+".tmp")
            stage.write_bytes((self.src/name).read_bytes())
            stage.chmod(0o644)
            inode=stage.stat().st_ino
            m.append(fd,"PREPARED",name=name,inode=inode)
            os.link(stage,self.dst/name)
            m.syncdir(self.dst)
        finally:os.close(fd)
        result=m.rollback(self.dst,reason="POWER_LOSS")
        self.assertIn(name,result["removed"])
        self.assertIn(stage.name,result["removed"])
        self.assertEqual(self.has_media(),[])
        self.assertEqual(self.staged(),[])
        self.assertEqual(self.journal()[-1]["event"],"ROLLED_BACK")

    def test_mid_stream_partial_temp_recovery(self):
        name=sorted(m.PINS)[0]
        fd=m.open_journal(self.dst)
        try:
            m.append(fd,"BEGIN",pre={"fixture":True})
            m.append(fd,"TEMP_INTENT",name=name)
            stage=self.dst/(m.STAGE_PREFIX+name+".tmp")
            stage.write_bytes(b"incomplete")
            m.append(fd,"TEMP_OPENED",name=name,inode=stage.stat().st_ino)
        finally:os.close(fd)
        result=m.rollback(self.dst,reason="INTERRUPTED_BEFORE_PREPARED")
        self.assertIn(stage.name,result["removed"])
        self.assertFalse(stage.exists())

    def test_unrecorded_temp_file_is_preserved_for_manual_review(self):
        name=sorted(m.PINS)[0]
        fd=m.open_journal(self.dst)
        try:
            m.append(fd,"BEGIN",pre={"fixture":True})
            m.append(fd,"TEMP_INTENT",name=name)
            temp=self.dst/(m.STAGE_PREFIX+name+".tmp")
            temp.write_bytes(b"FOREIGN-INJECTED-TEMP")
        finally:os.close(fd)
        with self.assertRaisesRegex(m.Hold,"ROLLBACK_FOREIGN_OR_CHANGED_FILE"):
            m.rollback(self.dst,reason="PRE_OPEN_FAILURE")
        self.assertEqual(temp.read_bytes(),b"FOREIGN-INJECTED-TEMP")

    def test_recovery_refuses_foreign_inode(self):
        name=sorted(m.PINS)[0]
        fd=m.open_journal(self.dst)
        try:
            m.append(fd,"BEGIN",pre={"fixture":True})
            m.append(fd,"TEMP_INTENT",name=name)
            m.append(fd,"PREPARED",name=name,inode=123456789)
        finally:os.close(fd)
        (self.dst/name).write_bytes((self.src/name).read_bytes())
        with self.assertRaisesRegex(m.Hold,"ROLLBACK_FOREIGN_OR_CHANGED_FILE"):
            m.rollback(self.dst)
        self.assertTrue((self.dst/name).exists())

    def test_group_acl_parser_refuses_named_acl_and_default_grants(self):
        good="user::rwx\ngroup::rwx\nother::r-x\n"
        self.assertTrue(m.plain_media_acl(good))
        self.assertFalse(m.plain_media_acl(good+"user:other:rwx\n"))
        self.assertFalse(m.plain_media_acl(good+"default:group::rwx\n"))
        self.assertFalse(m.plain_media_acl(good.replace("other::r-x","other::rwx")))
        self.assertFalse(m.plain_media_acl(good+"mask::rwx\n"))
        self.assertFalse(m.plain_media_acl(good+"group::rwx\n"))

    def test_wrong_source_script_cannot_write_finance(self):
        text=SCRIPT.read_text()
        for forbidden in ("psql ","chmod(","chown(","subprocess.Popen", "systemctl restart",
                          "8094/satchel","8095/satchel","git clean","shutil.copytree",
                          "os.replace(","os.rename(","mount -o","nginx -s","create_engine("):
            self.assertNotIn(forbidden,text)
        self.assertIn('mode.add_argument("--preflight"',text)
        self.assertIn('mode.add_argument("--apply"',text)
        self.assertIn('mode.add_argument("--rollback"',text)
        self.assertIn('need(args.approval==APPROVAL',text)

if __name__=="__main__":
    unittest.main()
