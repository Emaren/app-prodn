"""Session B source-only crash/inverse fixtures. NEVER touch HEL1 or production."""
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

SRC = Path(__file__).resolve().parents[1] / "scripts/release/r25_v22_three_source_transaction_REVIEW_ONLY.py"
spec = importlib.util.spec_from_file_location("b_v22_transaction_review", SRC)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class V22ThreeSourceTxn(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory(prefix="b-v22-replay-")
        self.addCleanup(self.td.cleanup)
        self.root = Path(self.td.name)
        self.state = self.root / "root-private"
        self.state.mkdir(mode=0o700)
        self.targets = {}
        self.candidates = {}
        self.orig_pins = m.PINNED
        self.old = {}
        self.new = {}
        pins = {}
        for name in m.ORDER:
            self.old[name] = ("old/" + name).encode()
            self.new[name] = ("new/" + name).encode()
            dest = self.root / (name + ".installed")
            review = self.root / (name + ".candidate")
            dest.write_bytes(self.old[name])
            dest.chmod(0o500)
            review.write_bytes(self.new[name])
            review.chmod(0o400)
            self.targets[name] = dest
            self.candidates[name] = review
            pins[name] = (m.sha(self.old[name]), m.sha(self.new[name]))
        m.PINNED = pins
        self.addCleanup(lambda: setattr(m, "PINNED", self.orig_pins))

    def tx(self):
        return m.Transaction(self.targets, self.candidates, self.state,
                             trusted_uid=os.getuid())

    def assert_old(self):
        for key in m.ORDER:
            self.assertEqual(self.targets[key].read_bytes(), self.old[key])

    def assert_new(self):
        for key in m.ORDER:
            self.assertEqual(self.targets[key].read_bytes(), self.new[key])

    def test_static_production_pins_have_exact_three_intended_sources(self):
        self.assertEqual(set(m.PRODUCTION_TARGETS), {"v22","controller","guard"})
        self.assertEqual(self.orig_pins["v22"][1],
                         "cd6ec295573329e26227109707b2a33104453f76ca57b5ee4d027906fd3d54df")
        self.assertEqual(self.orig_pins["controller"][0],
                         "dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8")

    def test_direct_execution_refuses(self):
        cp = subprocess.run([sys.executable, "-B", str(SRC)],
                            capture_output=True, text=True, timeout=5)
        self.assertEqual(cp.returncode, 3)
        self.assertIn("HOLD:REVIEW_ONLY", cp.stdout)

    def test_full_apply_with_explicit_incomplete_state(self):
        txn = self.tx()
        txn.prepare()
        txn.apply()
        self.assert_new()
        self.assertTrue((self.state / "APPLIED_UNVERIFIED.json").exists())
        self.assertFalse((self.state / "COMPLETED.json").exists())
        for key in m.ORDER:
            self.assertEqual((self.state / (key + ".inverse")).read_bytes(), self.old[key])

    def test_inverse_before_first_swap(self):
        txn = self.tx()
        txn.prepare()
        txn.inverse()
        self.assert_old()

    def test_inverse_after_successful_but_unverified_apply(self):
        txn = self.tx()
        txn.prepare()
        txn.apply()
        txn.inverse()
        self.assert_old()

    def test_crash_after_each_atomic_swap_can_be_inversed(self):
        for crashed in m.ORDER:
            with self.subTest(crashed=crashed):
                # Reset only this disposable fixture; never reenter unittest.setUp.
                for file in self.state.iterdir():
                    file.unlink()
                for key in m.ORDER:
                    dest=self.targets[key]
                    dest.chmod(0o700)
                    dest.write_bytes(self.old[key])
                    dest.chmod(0o500)
                    stage=dest.with_name(dest.name + ".b-v22-new-stage")
                    if stage.exists(): stage.unlink()
                txn = self.tx()
                txn.prepare()
                def fail(name):
                    if name == crashed:
                        raise RuntimeError("INJECTED_POWER_LOSS_AFTER_" + crashed)
                with self.assertRaisesRegex(RuntimeError, "INJECTED_POWER_LOSS"):
                    txn.apply(after_swap=fail)
                txn.inverse()
                self.assert_old()

    def test_replay_refuses_existing_state(self):
        txn = self.tx()
        txn.prepare()
        with self.assertRaisesRegex(m.Hold, "STATE_ALREADY_CONSUMED"):
            txn.prepare()

    def test_apply_before_prepare_refuses(self):
        with self.assertRaisesRegex(m.Hold, "NOT_PREPARED"):
            self.tx().apply()

    def test_preparation_denies_bad_old_sha_without_journal(self):
        self.targets["guard"].chmod(0o700)
        self.targets["guard"].write_bytes(b"unknown old")
        self.targets["guard"].chmod(0o500)
        with self.assertRaisesRegex(m.Hold, "OLD_SOURCE_SHA_guard"):
            self.tx().prepare()
        self.assertEqual(list(self.state.iterdir()), [])

    def test_preparation_denies_bad_new_sha_without_journal(self):
        self.candidates["v22"].chmod(0o600)
        self.candidates["v22"].write_bytes(b"unknown new")
        self.candidates["v22"].chmod(0o400)
        with self.assertRaisesRegex(m.Hold, "NEW_SOURCE_SHA_v22"):
            self.tx().prepare()
        self.assertEqual(list(self.state.iterdir()), [])

    def test_source_candidate_symlink_refused(self):
        self.candidates["controller"].unlink()
        self.candidates["controller"].symlink_to(self.candidates["v22"])
        with self.assertRaisesRegex(m.Hold, "FILE_PROVENANCE"):
            self.tx().prepare()

    def test_root_state_wrong_mode_refused(self):
        self.state.chmod(0o777)
        with self.assertRaisesRegex(m.Hold, "ROOT_STATE_PARENT_NOT_TRUSTED"):
            self.tx()

    def test_source_candidate_hardlink_refused(self):
        duplicate = self.root / "duplicate"
        os.link(self.candidates["v22"], duplicate)
        with self.assertRaisesRegex(m.Hold, "FILE_PROVENANCE"):
            self.tx().prepare()

    def test_manifest_tampering_blocks_apply(self):
        txn = self.tx()
        txn.prepare()
        (self.state / "manifest.json").chmod(0o600)
        (self.state / "manifest.json").write_bytes(b"tampered")
        (self.state / "manifest.json").chmod(0o400)
        with self.assertRaisesRegex(m.Hold, "MANIFEST_TAMPER"):
            txn.apply()
        self.assert_old()

    def test_inverse_tampering_blocks_restore(self):
        txn = self.tx()
        txn.prepare()
        (self.state / "v22.inverse").chmod(0o600)
        (self.state / "v22.inverse").write_bytes(b"tampered")
        (self.state / "v22.inverse").chmod(0o400)
        with self.assertRaisesRegex(m.Hold, "INVERSE_TAMPER"):
            txn.apply()
        self.assert_old()

    def test_unknown_competing_writer_blocks_inverse(self):
        txn = self.tx()
        txn.prepare()
        txn.apply()
        self.targets["guard"].chmod(0o700)
        self.targets["guard"].write_bytes(b"third-party-change")
        self.targets["guard"].chmod(0o500)
        with self.assertRaisesRegex(m.Hold, "UNKNOWN_TARGET_COMPETING_WRITER_guard"):
            txn.inverse()

    def test_inverse_crash_before_atomic_restore_resumes_exact_stage(self):
        txn=self.tx()
        txn.prepare()
        txn.apply()
        original=m.os.replace
        def crash_before_inverse(src,dest):
            if str(src).endswith(".b-v22-inverse-stage"):
                raise RuntimeError("INJECTED_CRASH_BEFORE_INVERSE_RENAME")
            return original(src,dest)
        with patch.object(m.os,"replace",side_effect=crash_before_inverse):
            with self.assertRaisesRegex(RuntimeError,"INJECTED_CRASH"):
                txn.inverse()
        self.assertTrue(self.targets["guard"].with_name(
            self.targets["guard"].name+".b-v22-inverse-stage").exists())
        txn.inverse()
        self.assert_old()
        # Idempotent recovery recheck, not an additional source install.
        txn.inverse()
        self.assert_old()

    def test_inverse_crash_after_one_restoration_then_resume(self):
        txn=self.tx()
        txn.prepare()
        txn.apply()
        original=m.os.replace
        counter=[0]
        def crash_on_second_restore(src,dest):
            if str(src).endswith(".b-v22-inverse-stage"):
                counter[0]+=1
                if counter[0]==2:
                    raise RuntimeError("INJECTED_SECOND_INVERSE_CRASH")
            return original(src,dest)
        with patch.object(m.os,"replace",side_effect=crash_on_second_restore):
            with self.assertRaisesRegex(RuntimeError,"INJECTED_SECOND"):
                txn.inverse()
        txn.inverse()
        self.assert_old()

    def test_unknown_preexisting_inverse_stage_refuses_overwrite(self):
        txn=self.tx()
        txn.prepare()
        txn.apply()
        stage=self.targets["guard"].with_name(
            self.targets["guard"].name+".b-v22-inverse-stage")
        stage.write_bytes(b"malicious")
        with self.assertRaisesRegex(m.Hold,"INVERSE_STAGE_COMPETING_WRITER"):
            txn.inverse()
        self.assert_new()

    def test_inverse_unprepared_refuses(self):
        txn=self.tx()
        with self.assertRaisesRegex(m.Hold,"INVERSE_WITHOUT_PREPARED_ROOT_RECEIPT"):
            txn.inverse()

    def test_completion_is_impossible_without_separate_host_executor(self):
        txn = self.tx()
        txn.prepare()
        txn.apply()
        with self.assertRaisesRegex(m.Hold, "EXTERNAL_HOST_ATTESTATION_NOT_IMPLEMENTED"):
            txn.complete_after_external_proof()
        self.assertFalse((self.state / "COMPLETED.json").exists())
        txn.inverse()
        self.assert_old()

    def test_inverse_never_forces_unknown_symlink_target(self):
        txn = self.tx()
        txn.prepare()
        txn.apply()
        self.targets["controller"].unlink()
        self.targets["controller"].symlink_to(self.candidates["controller"])
        with self.assertRaisesRegex(m.Hold, "FILE_PROVENANCE"):
            txn.inverse()

if __name__ == "__main__":
    unittest.main()
