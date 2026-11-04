"""Regression: stable live F plans, read-only C retry, no phantom rollback."""
import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]

def load(stem,filename):
    spec=importlib.util.spec_from_file_location(stem,ROOT/"scripts"/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

g=load("a05_g_retry","aoe2_r25_f_g_parallel_observer.py")
m=load("a05_mac_rollback","aoe2_r24_f_parallel_nginx_mac.py")


class TransientCReadOnlyWitness(unittest.TestCase):
    def setUp(self):
        self.policy={
            "schema":"aoe2war.app.approved-production-profile.v1",
            "profile":"nonfinancial-production-v1",
            "uid":990,"gid":984,"unit":g.PRODUCTION_UNIT,"port":3032,
            "source_sha":"a"*40,"build_id":"buildabcdefg",
            "stage":"/var/lib/aoe2war-web-prod-"+"a"*12,
            "controller_sha256":g.digest(b"controller"),
            "manifest_sha256":"b"*64,"protected_snapshot_sha256":"c"*64,
            "build_version":"20261104171049-8504ea08e5",
        }
        self.witness=dict(self.policy,schema="aoe2war.app.production-witness.v1",
                          status="NATIVE_PRODUCTION_PROFILE_PASS",
                          admission_sha256="d"*64,financial_authorized=False,
                          read_only_observation=True)
        def source(path,maximum=131072):
            if path==g.PRODUCTION_POLICY:return g.canon(self.policy)
            if path==g.PRODUCTION_CONTROLLER:return b"controller"
            raise AssertionError("Unexpected root file")
        self.root_patch=mock.patch.object(g,"production_root_file",side_effect=source)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def test_retry_one_transient_nonzero_readonly_command_only(self):
        with mock.patch.object(g,"run",side_effect=[
              g.Hold("READ_ONLY_COMMAND_FAILED:python3"),g.canon(self.witness)]) as run, \
             mock.patch.object(g.time,"sleep") as sleep:
            policy,sha,witness=g.production_profile()
        self.assertEqual(policy,self.policy)
        self.assertEqual(witness["status"],"NATIVE_PRODUCTION_PROFILE_PASS")
        self.assertEqual(run.call_count,2)
        sleep.assert_called_once_with(2)

    def test_permanent_failed_c_witness_fails_closed_after_single_retry(self):
        with mock.patch.object(g,"run",side_effect=g.Hold("READ_ONLY_COMMAND_FAILED:python3")) as run, \
             mock.patch.object(g.time,"sleep"):
            with self.assertRaisesRegex(g.Hold,"READ_ONLY_COMMAND_FAILED:python3"):
                g.production_profile()
        self.assertEqual(run.call_count,2)

    def test_incorrect_returned_witness_does_not_trigger_retry(self):
        bad=dict(self.witness,status="HOLD")
        with mock.patch.object(g,"run",return_value=g.canon(bad)) as run:
            with self.assertRaisesRegex(g.Hold,"PRODUCTION_C_NATIVE_READ_ONLY_WITNESS_REQUIRED"):
                g.production_profile()
        run.assert_called_once()


class PretransactionNoPhantomRollback(unittest.TestCase):
    def test_unchanged_original_nginx_is_a_readonly_exact_digest_check(self):
        expected="e"*64
        result=subprocess.CompletedProcess(args=[],returncode=0,
                    stdout=(expected+"  /etc/nginx/sites-available/aoe2war.com\n").encode(),
                    stderr=b"")
        with mock.patch.object(m.subprocess,"run",return_value=result) as run:
            self.assertTrue(m.production_original_nginx_unchanged(expected))
        run.assert_called_once()
        self.assertEqual(run.call_args.kwargs["check"],False)

    def test_changed_or_unreachable_nginx_never_claims_original_unchanged(self):
        expected="e"*64
        for rc,stdout in ((0,b"f"*64+b"  file\n"),(255,b"")):
            with self.subTest(returncode=rc),mock.patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],rc,stdout,b"")):
                self.assertFalse(m.production_original_nginx_unchanged(expected))


if __name__=="__main__":
    unittest.main()
