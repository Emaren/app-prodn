"""Exact HEL1 host preimage: v22 source present, controller and guard ABSENT.
Source-only filesystem fixtures, no production operation or root access.
"""
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"scripts/release/r25_v22_three_source_transaction_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_hel1_absent_review",SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class HEL1ActualPreimage(unittest.TestCase):
    def setUp(self):
        self.td=tempfile.TemporaryDirectory(prefix="b-hel1-absent-preimage-")
        self.addCleanup(self.td.cleanup)
        self.work=Path(self.td.name)
        self.state=self.work/"root_state"
        self.state.mkdir(mode=0o700)
        self.original=m.PINNED
        self.targets={}
        self.candidates={}
        self.old={}
        self.new={}
        pins={}
        for key in m.ORDER:
            self.old[key]=("old-"+key).encode()
            self.new[key]=("new-"+key).encode()
            target=self.work/(key+".installed")
            candidate=self.work/(key+".candidate")
            if key=="v22":
                target.write_bytes(self.old[key])
                target.chmod(0o644)
            candidate.write_bytes(self.new[key])
            candidate.chmod(0o400)
            self.targets[key]=target
            self.candidates[key]=candidate
            pins[key]=(m.sha(self.old[key]),m.sha(self.new[key]))
        m.PINNED=pins
        self.addCleanup(lambda:setattr(m,"PINNED",self.original))

    def tx(self):
        return m.Transaction(self.targets,self.candidates,self.state,
                             trusted_uid=os.getuid(),absent_old=m.OBSERVED_ABSENT_OLD)

    def old_state(self):
        self.assertEqual(self.targets["v22"].read_bytes(),self.old["v22"])
        for k in m.OBSERVED_ABSENT_OLD:
            self.assertFalse(self.targets[k].exists() or self.targets[k].is_symlink())

    def new_state(self):
        for k in m.ORDER:
            self.assertEqual(self.targets[k].read_bytes(),self.new[k])
            self.assertEqual(stat.S_IMODE(self.targets[k].stat().st_mode),0o644)

    def clear(self):
        for e in self.state.iterdir():e.unlink()
        for k in m.ORDER:
            target=self.targets[k]
            for suffix in (".b-v22-new-stage",".b-v22-inverse-stage"):
                stage=target.with_name(target.name+suffix)
                if stage.exists() or stage.is_symlink():stage.unlink()
            if target.exists() or target.is_symlink():target.unlink()
            if k=="v22":
                target.write_bytes(self.old[k]);target.chmod(0o644)

    def test_true_host_preimage_not_historical_git_blobs(self):
        self.old_state()
        self.assertEqual(m.OBSERVED_ABSENT_OLD,frozenset(("controller","guard")))
        self.assertEqual(m.OBSERVED_OLD_PREIMAGE["controller"],None)
        self.assertEqual(m.OBSERVED_OLD_PREIMAGE["guard"],None)
        txn=self.tx();txn.prepare()
        self.assertTrue((self.state/"controller.absent").exists())
        self.assertTrue((self.state/"guard.absent").exists())
        self.assertFalse((self.state/"controller.inverse").exists())
        self.assertFalse((self.state/"guard.inverse").exists())
        self.assertEqual((self.state/"v22.inverse").read_bytes(),self.old["v22"])
        txn.apply()
        self.new_state()
        txn.inverse()
        self.old_state()

    def test_all_three_swap_boundary_crashes_restore_actual_absence(self):
        for key in m.ORDER:
            with self.subTest(key=key):
                self.clear()
                txn=self.tx();txn.prepare()
                def crash(name):
                    if name==key:raise RuntimeError("INJECTED_BOOT_CRASH_AFTER_"+key)
                with self.assertRaisesRegex(RuntimeError,"INJECTED_BOOT_CRASH"):
                    txn.apply(after_swap=crash)
                txn.inverse()
                self.old_state()
                txn.inverse()
                self.old_state()

    def test_inverse_crash_before_and_after_absent_unlink_replays(self):
        txn=self.tx();txn.prepare();txn.apply()
        real=m.Path.unlink
        state=[0]
        def fail_first_absent_unlink(path,*args,**kw):
            if str(path)==str(self.targets["guard"]) and state[0]==0:
                state[0]+=1
                raise RuntimeError("POWER_LOSS_BEFORE_UNLINK")
            return real(path,*args,**kw)
        with patch.object(m.Path,"unlink",fail_first_absent_unlink):
            with self.assertRaisesRegex(RuntimeError,"POWER_LOSS_BEFORE_UNLINK"):
                txn.inverse()
        self.new_state()
        txn.inverse()
        self.old_state()

    def test_post_unlink_interruption_recovers_when_absent_is_already_restored(self):
        txn=self.tx();txn.prepare();txn.apply()
        real=m.fsync_dir
        state=[0]
        def fail_once(parent):
            if state[0]==0 and not self.targets["guard"].exists():
                state[0]+=1
                raise RuntimeError("POWER_LOSS_AFTER_ABSENCE_RESTORED")
            return real(parent)
        with patch.object(m,"fsync_dir",side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError,"POWER_LOSS_AFTER_ABSENCE"):
                txn.inverse()
        self.assertFalse(self.targets["guard"].exists())
        txn.inverse();self.old_state()

    def test_competing_file_at_originally_absent_path_denies_prepare(self):
        self.targets["controller"].write_bytes(self.old["controller"])
        with self.assertRaisesRegex(m.Hold,"EXPECTED_OLD_ABSENT"):
            self.tx().prepare()
        self.assertEqual(list(self.state.iterdir()),[])

    def test_broken_symlink_at_absent_path_denies_prepare(self):
        self.targets["guard"].symlink_to(self.work/"nonexistent")
        with self.assertRaisesRegex(m.Hold,"EXPECTED_OLD_ABSENT"):
            self.tx().prepare()

    def test_unknown_new_file_prevents_absence_restore(self):
        txn=self.tx();txn.prepare();txn.apply()
        self.targets["guard"].write_bytes(b"adversarial-third-party-writer")
        with self.assertRaisesRegex(m.Hold,"UNKNOWN_TARGET_COMPETING_WRITER_guard"):
            txn.inverse()
        self.assertTrue(self.targets["guard"].exists())

    def test_absent_marker_tamper_denies_apply_and_inverse(self):
        txn=self.tx();txn.prepare()
        file=self.state/"guard.absent"
        file.chmod(0o600);file.write_bytes(b"forged absent-marker");file.chmod(0o400)
        with self.assertRaisesRegex(m.Hold,"ABSENT_INVERSE_TAMPER_guard"):
            txn.apply()
        self.old_state()

    def test_absent_origin_missing_stage_refuses(self):
        txn=self.tx();txn.prepare()
        stage=self.targets["guard"].with_name("guard.installed.b-v22-new-stage")
        stage.unlink()
        with self.assertRaises((m.Hold,FileNotFoundError)):
            txn.apply()

    def test_review_only_cli_remains_fail_closed(self):
        out=subprocess.run([sys.executable,"-B",str(SOURCE)],
                           capture_output=True,text=True,timeout=5)
        self.assertEqual(out.returncode,3)
        self.assertIn("HOLD:REVIEW_ONLY_NO_PRODUCTION_INSTALL_ENTRYPOINT",out.stdout)

    def test_any_unknown_absence_scope_denied(self):
        with self.assertRaisesRegex(m.Hold,"UNREVIEWED_ABSENT_PREIMAGE_SCOPE"):
            m.Transaction(self.targets,self.candidates,self.state,
                          trusted_uid=os.getuid(),absent_old=frozenset(["unknown"]))

    def test_absent_parent_group_writable_denied(self):
        self.work.chmod(0o770)
        with self.assertRaisesRegex(m.Hold,"ABSENT_PARENT_NOT_ROOT_TRUSTED"):
            self.tx().prepare()

if __name__=="__main__":unittest.main()
