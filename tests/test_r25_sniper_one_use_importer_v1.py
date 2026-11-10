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
        return m.release(self.root,probes=False,accept=lambda: {"status":"PASS_FAKE_PARITY"},**kw)
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
        self.assertEqual(self.staged(),[])
        entries=self.journal()
        self.assertEqual(entries[0]["event"],"BEGIN")
        self.assertEqual(entries[-1]["event"],"COMPLETED")
        self.assertEqual(sum(x["event"]=="TEMP_INTENT" for x in entries),4)
        self.assertEqual(sum(x["event"]=="PREPARED" for x in entries),4)
        self.assertEqual(sum(x["event"]=="INSTALLED" for x in entries),4)
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
        finally:os.close(fd)
        result=m.rollback(self.dst,reason="INTERRUPTED_BEFORE_PREPARED")
        self.assertIn(stage.name,result["removed"])
        self.assertFalse(stage.exists())

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
