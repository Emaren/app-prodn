"""Adversarial DATA-stage file-identity and one-way handoff tests.

All fixtures are private tempdirs on the developer machine. The protected
HEL1 UID0/dev2064/mount checks remain fixed in production and are not mocked.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).parents[1]/"docs/release/artifacts/aoe2war_factory_data_stage_v1.py"
spec=importlib.util.spec_from_file_location("factory_data_helper",SOURCE)
H=importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)

class DataStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mount=Path(self.tmp.name)/"DATA"
        self.mount.mkdir(mode=0o755)
        self.parent=self.mount/"aoe2war"
        self.parent.mkdir(mode=0o755)
        self.root=self.parent/"we2-factory-artifact-stage-v1"
        self.root.mkdir(mode=0o1770)
        self.root.chmod(0o1770)
        self.source="f5fcd0116c7b00092809abb047dfb01bdd5a1182"
        self.run=45065871693
        self.stage=H.stage_path(self.source,self.run,parent=self.root)
        self.stage.mkdir(mode=0o700)
        self.stage.chmod(0o700)
        self.archive=b"\x1f\x8bexample-bound-archive-payload"
        self.proof=b'{"status":"source-qualified"}'
        for name,data in ((H.ARCHIVE_NAME,self.archive),(H.PROOF_NAME,self.proof)):
            p=self.stage/name
            p.write_bytes(data);p.chmod(0o600)
        self.archsha=hashlib.sha256(self.archive).hexdigest()
        self.proofsha=hashlib.sha256(self.proof).hexdigest()
        self.kw=dict(
            mount=self.mount,parent=self.parent,root=self.root,
            device=self.mount.stat().st_dev,root_uid=os.geteuid(),
            root_gid=os.getegid(),sender_uid=os.geteuid(),
            sender_gid=os.getegid(),require_mount=False)
    def freeze(self):
        return H.freeze_checked_stage(self.stage,self.source,self.run,
          archive_sha=self.archsha,archive_bytes=len(self.archive),
          proof_sha=self.proofsha,**self.kw)
    def opened(self,inode):
        return H.opened_verified(self.stage,self.source,self.run,
          archive_sha=self.archsha,archive_bytes=len(self.archive),
          archive_inode=inode,proof_sha=self.proofsha,**self.kw)
    def test_exact_source_handoff_remains_on_data_and_fd_verified(self):
        original_dev=self.stage.stat().st_dev
        original_inode=(self.stage/H.ARCHIVE_NAME).stat().st_ino
        inode=self.freeze()
        self.assertEqual(inode,original_inode)
        self.assertEqual((self.stage/H.ARCHIVE_NAME).stat().st_dev,original_dev)
        self.assertEqual(stat.S_IMODE((self.stage/H.ARCHIVE_NAME).stat().st_mode),0o400)
        with self.opened(inode) as (stream,meta):
            self.assertEqual(stream.read(),self.archive)
            self.assertEqual(meta.st_ino,inode)
    def test_wrong_sha_holds_before_freeze(self):
        with self.assertRaisesRegex(RuntimeError,"FILE_SHA"):
            H.freeze_checked_stage(self.stage,self.source,self.run,
              archive_sha="0"*64,archive_bytes=len(self.archive),
              proof_sha=self.proofsha,**self.kw)
        self.assertEqual(stat.S_IMODE(self.stage.stat().st_mode),0o700)
    def test_source_run_and_path_replay_denied(self):
        with self.assertRaisesRegex(RuntimeError,"STAGE_NAME_SCOPE"):
            H.layout(self.stage,"1"*40,self.run,**self.kw)
        with self.assertRaisesRegex(RuntimeError,"SOURCE_ID"):
            H.stage_path("../../etc/passwd",self.run,parent=self.root)
        with self.assertRaisesRegex(RuntimeError,"RUN_ID"):
            H.stage_path(self.source,True,parent=self.root)
    def test_wrong_data_device_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"DIRECTORY_IDENTITY"):
            H.layout(self.stage,self.source,self.run,
                **{**self.kw,"device":self.kw["device"]+1})
    def test_mount_absence_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError,"DATA_MOUNT_NOT_MOUNTED|DIRECTORY_IDENTITY"):
            H.layout(self.stage,self.source,self.run,
                **{**self.kw,"require_mount":True})
    def test_source_owner_parent_mode_drift_rejected(self):
        self.root.chmod(0o770)
        with self.assertRaisesRegex(RuntimeError,"DIRECTORY_IDENTITY"):
            H.layout(self.stage,self.source,self.run,**self.kw)
    def test_symlink_parent_rejected(self):
        self.root.rename(self.root.with_name("renamed"))
        self.root.symlink_to(self.root.with_name("renamed"),target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError,"DIRECTORY_IDENTITY"):
            H.layout(self.stage,self.source,self.run,**self.kw)
    def test_unexpected_hidden_entry_fails_closed(self):
        (self.stage/".rsync-partial").mkdir(mode=0o700)
        (self.stage/".rsync-partial"/"runtime.tar.gz").write_bytes(b"unfinished")
        with self.assertRaisesRegex(RuntimeError,"UNEXPECTED_PARTIAL_CONTENTS"):
            self.freeze()
    def test_empty_rsync_partials_cleaned_before_durable_freeze(self):
        (self.stage/".rsync-partial").mkdir(mode=0o700)
        self.freeze()
        self.assertFalse((self.stage/".rsync-partial").exists())
    def test_added_hidden_entry_refuses_freeze(self):
        (self.stage/".unclassified").write_bytes(b"x")
        with self.assertRaisesRegex(RuntimeError,"UNEXPECTED_STAGE_ENTRIES"):
            self.freeze()
    def test_wrong_inode_even_with_same_sha_fails_closed(self):
        inode=self.freeze()
        src=self.stage/H.ARCHIVE_NAME
        old=self.stage/"old-archive"
        src.rename(old)
        src.write_bytes(self.archive)
        src.chmod(0o400)
        self.assertNotEqual(src.stat().st_ino,inode)
        with self.assertRaisesRegex(RuntimeError,"FILE_IDENTITY"):
            with self.opened(inode):pass
    def test_symlink_archive_rejected_nofollow(self):
        inode=self.freeze()
        src=self.stage/H.ARCHIVE_NAME
        src.rename(self.stage/"archive-preimage")
        src.symlink_to("archive-preimage")
        with self.assertRaises((RuntimeError,OSError)):
            with self.opened(inode):pass
    def test_hardlinked_archive_rejected(self):
        inode=self.freeze()
        os.link(self.stage/H.ARCHIVE_NAME,Path(self.tmp.name)/"extra-hardlink")
        with self.assertRaisesRegex(RuntimeError,"FILE_IDENTITY"):
            with self.opened(inode):pass
    def test_tampering_after_hashed_fd_is_rejected(self):
        inode=self.freeze()
        with self.assertRaisesRegex(RuntimeError,"ARCHIVE_MUTATED"):
            with self.opened(inode) as (fileobj,_):
                self.assertEqual(fileobj.read(),self.archive)
                src=self.stage/H.ARCHIVE_NAME
                src.chmod(0o600)
                src.write_bytes(self.archive+b"tampered")
    def test_bad_proof_cannot_promote(self):
        with self.assertRaisesRegex(RuntimeError,"FILE_SHA"):
            H.freeze_checked_stage(self.stage,self.source,self.run,
              archive_sha=self.archsha,archive_bytes=len(self.archive),
              proof_sha="a"*64,**self.kw)
    def test_cannot_reissue_frozen_handoff(self):
        inode=self.freeze()
        with self.assertRaisesRegex(RuntimeError,"DIRECTORY_IDENTITY|FILE_IDENTITY"):
            self.freeze()
        with self.opened(inode) as (f,_):
            self.assertEqual(f.read(),self.archive)

    def simulate_crash_in_promotion(self, *, failing_chown_call=None,
                                     failing_chmod_call=None):
        original_chown=H.os.fchown
        original_chmod=H.os.fchmod
        count_chown=[0]
        count_chmod=[0]
        def chown(fd,uid,gid):
            count_chown[0]+=1
            if count_chown[0]==failing_chown_call:
                raise KeyboardInterrupt("synthetic midway directory/file handoff")
            return original_chown(fd,uid,gid)
        def chmod(fd,mode):
            count_chmod[0]+=1
            if count_chmod[0]==failing_chmod_call:
                raise KeyboardInterrupt("synthetic midway directory/file mode")
            return original_chmod(fd,mode)
        with patch.object(H.os,"fchown",side_effect=chown), \
             patch.object(H.os,"fchmod",side_effect=chmod):
            with self.assertRaises(KeyboardInterrupt):
                self.freeze()
    def resume(self):
        return H.resume_checked_stage(self.stage,self.source,self.run,
          archive_sha=self.archsha,archive_bytes=len(self.archive),
          proof_sha=self.proofsha,**self.kw)
    def test_crash_after_directory_seal_recovers_exact_file_inodes(self):
        original_inode=(self.stage/H.ARCHIVE_NAME).stat().st_ino
        self.simulate_crash_in_promotion(failing_chown_call=2)
        self.assertEqual((self.stage/H.ARCHIVE_NAME).stat().st_ino,original_inode)
        recovered=self.resume()
        self.assertEqual(recovered,original_inode)
        with self.opened(recovered) as (f,_):
            self.assertEqual(f.read(),self.archive)
    def test_crash_after_first_file_seal_recovers_no_partial_override(self):
        original_inode=(self.stage/H.ARCHIVE_NAME).stat().st_ino
        self.simulate_crash_in_promotion(failing_chown_call=3)
        self.assertEqual(stat.S_IMODE((self.stage/H.ARCHIVE_NAME).stat().st_mode),0o400)
        self.assertEqual(stat.S_IMODE((self.stage/H.PROOF_NAME).stat().st_mode),0o600)
        recovered=self.resume()
        self.assertEqual(recovered,original_inode)
        self.assertEqual(stat.S_IMODE((self.stage/H.PROOF_NAME).stat().st_mode),0o400)
    def test_crash_during_directory_metadata_seal_can_resume(self):
        self.simulate_crash_in_promotion(failing_chmod_call=1)
        recovered=self.resume()
        with self.opened(recovered) as (f,_):
            self.assertEqual(f.read(),self.archive)
    def test_crash_between_archive_chown_and_chmod_can_resume(self):
        self.simulate_crash_in_promotion(failing_chmod_call=2)
        recovered=self.resume()
        self.assertEqual(stat.S_IMODE((self.stage/H.ARCHIVE_NAME).stat().st_mode),0o400)
        with self.opened(recovered) as (f,_):
            self.assertEqual(f.read(),self.archive)
    def test_unverified_partial_proof_cannot_resume_or_overwrite(self):
        self.simulate_crash_in_promotion(failing_chown_call=2)
        bad=self.stage/H.PROOF_NAME
        bad.write_bytes(self.proof+b"evil")
        with self.assertRaisesRegex(RuntimeError,"PROMOTION_FILE_SHA"):
            self.resume()
        bad.write_bytes(self.proof)
        self.assertEqual(self.resume(),(self.stage/H.ARCHIVE_NAME).stat().st_ino)
    def test_root_resume_cannot_reissue_as_sender_untrusted_file(self):
        self.freeze()
        with self.assertRaisesRegex(RuntimeError,"FILE_IDENTITY"):
            self.freeze()
        with self.opened(self.resume()) as (f,_):
            self.assertEqual(f.read(),self.archive)

if __name__=="__main__":
    unittest.main(verbosity=2)
