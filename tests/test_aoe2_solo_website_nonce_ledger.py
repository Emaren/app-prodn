"""Solo website nonce replay and global lock regression (temporary files only)."""
from datetime import datetime, timedelta, timezone
import importlib.util, pathlib, tempfile, unittest
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts"/"aoe2_solo_website_nonce_ledger.py"
SPEC=importlib.util.spec_from_file_location("solo_ledger",SCRIPT)
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class NonceLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        parent=pathlib.Path(self.temp.name)
        state=parent/"state"
        state.mkdir(mode=0o700)
        lock=parent/"release.lock"
        lock.touch(mode=0o600)
        self.j=M.Journal(state,lock,test_mode=True)
        self.now=datetime(2026,10,30,9,0,tzinfo=timezone.utc)
        self.sha="b46a51f1592c9f296839924ae55e722618b10d35"

    def test_fresh_stage_and_atomic_one_use(self):
        j=self.j
        stage=j.issue("PRE_STAGE",self.sha,now=self.now)
        with j.exclusive():
            consumed=j.consume_under_existing_lock(
                stage,"a"*64,"b"*64,now=self.now+timedelta(seconds=30))
            self.assertEqual(len(consumed),64)
            with self.assertRaises(M.Hold):
                j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
            j.mark_staged_under_existing_lock(stage,"c"*64)
        activation=j.issue("PRE_ACTIVATE",self.sha,attempt=stage["attempt_id"],
                           lease=stage["lease_id"],stage_sha="c"*64,now=self.now)
        self.assertNotEqual(stage["nonce"],activation["nonce"])
        with j.exclusive():
            j.consume_under_existing_lock(activation,"d"*64,"e"*64,now=self.now)
        with self.assertRaises(M.Hold):
            j.issue("PRE_ACTIVATE",self.sha,attempt=stage["attempt_id"],
                    lease=stage["lease_id"],stage_sha="c"*64,now=self.now)

    def test_consumed_stage_without_durable_completion_blocks_all_reissue(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
        with self.assertRaises(M.Hold):
            self.j.issue("PRE_STAGE",self.sha,now=self.now+timedelta(seconds=1))

    def test_consumed_activation_without_native_completion_blocks_reissue(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
            self.j.mark_staged_under_existing_lock(stage,"c"*64)
        activation=self.j.issue("PRE_ACTIVATE",self.sha,
            attempt=stage["attempt_id"],lease=stage["lease_id"],
            stage_sha="c"*64,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(activation,"d"*64,"e"*64,
                now=self.now)
        with self.assertRaises(M.Hold):
            self.j.issue("PRE_STAGE",self.sha,now=self.now+timedelta(seconds=1))

    def test_genuine_root_reconciled_rollback_releases_only_same_attempt(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
            self.j.mark_staged_under_existing_lock(stage,"c"*64)
        activate=self.j.issue("PRE_ACTIVATE",self.sha,
            attempt=stage["attempt_id"],lease=stage["lease_id"],
            stage_sha="c"*64,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(activate,"d"*64,"e"*64,now=self.now)
        with self.assertRaises(M.Hold):
            self.j.issue("PRE_STAGE",self.sha,now=self.now+timedelta(seconds=1))
        # Test fixture cannot claim native financial proof; this tests ONLY
        # the exact root journal outcome selection, not production admission.
        marker=self.j.state/(stage["attempt_id"]+"-PRE_ACTIVATE-rollback-reconciled.json")
        marker.write_text('{"status":"WEB_AND_FINANCE_ROLLBACK_NATIVE_VERIFIED"}')
        marker.chmod(0o600)
        newer=self.j.issue("PRE_STAGE",self.sha,now=self.now+timedelta(seconds=1))
        self.assertNotEqual(newer["attempt_id"],stage["attempt_id"])

    def test_foreign_attempt_rollback_marker_does_not_clear_unknown(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
            self.j.mark_staged_under_existing_lock(stage,"c"*64)
        activation=self.j.issue("PRE_ACTIVATE",self.sha,
            attempt=stage["attempt_id"],lease=stage["lease_id"],stage_sha="c"*64,
            now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(activation,"d"*64,"e"*64,now=self.now)
        foreign=self.j.state/("f"*64+"-PRE_ACTIVATE-rollback-reconciled.json")
        foreign.write_text("{}")
        foreign.chmod(0o600)
        with self.assertRaises(M.Hold):
            self.j.issue("PRE_STAGE",self.sha,now=self.now+timedelta(seconds=1))

    def test_cannot_consume_without_held_lock(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.assertRaises(M.Hold):
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)

    def test_activation_before_protected_stage_refused(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.assertRaises((M.Hold,FileNotFoundError)):
            self.j.issue("PRE_ACTIVATE",self.sha,attempt=stage["attempt_id"],
                         lease=stage["lease_id"],stage_sha="c"*64,now=self.now)

    def test_expired_nonce_refused(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            with self.assertRaises(M.Hold):
                self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,
                           now=self.now+timedelta(minutes=11))

    def test_wrong_lease_refused(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            self.j.consume_under_existing_lock(stage,"a"*64,"b"*64,now=self.now)
            self.j.mark_staged_under_existing_lock(stage,"c"*64)
        with self.assertRaises(M.Hold):
            self.j.issue("PRE_ACTIVATE",self.sha,attempt=stage["attempt_id"],
                         lease="f"*64,stage_sha="c"*64,now=self.now)

    def test_stage_complete_requires_actual_consumption(self):
        stage=self.j.issue("PRE_STAGE",self.sha,now=self.now)
        with self.j.exclusive():
            with self.assertRaises((M.Hold,FileNotFoundError)):
                self.j.mark_staged_under_existing_lock(stage,"c"*64)

if __name__=="__main__":unittest.main()
