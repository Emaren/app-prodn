#!/usr/bin/env python3
"""Versioned R25 private-/run namespace recovery; no host mutation."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
f=ROOT/"scripts/r25_b_namespace_recovery_witness.py"
spec=importlib.util.spec_from_file_location("r25_b_ns_recovery",f)
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

class TestNamespaceRecovery(unittest.TestCase):
    def approved(self):
        cache="/var/cache/aoe2war-r25-b-next-cache"
        target=str(b.SOURCE/".next"/"cache")
        return {
          "TemporaryFileSystem":"/run:ro",
          "InaccessiblePaths":"/etc/aoe2hdbets /mnt/HC_Volume_105319120 /var/www/AoE2HDBets/app-prodn",
          "ReadWritePaths":cache+" "+target,
          "CacheDirectory":"aoe2war-r25-b-next-cache",
          "CacheDirectoryMode":"0700",
          "BindPaths":cache+":"+target+":rbind",
        }
    def test_exact_private_run_wall_admitted(self):
        self.assertTrue(b.validate_filesystem_wall(self.approved()))
    def test_private_run_failclosed_mutations(self):
        base=self.approved()
        bad=[
          {"TemporaryFileSystem":""},
          {"TemporaryFileSystem":"/run"},
          {"TemporaryFileSystem":"/run:rw"},
          {"TemporaryFileSystem":"/run:ro /tmp"},
          {"InaccessiblePaths":"/run /var/run "+base["InaccessiblePaths"]},
          {"InaccessiblePaths":"/etc/aoe2hdbets"},
          {"BindPaths":base["BindPaths"]+" /run/postgresql:/run/postgresql"},
          {"ReadWritePaths":base["ReadWritePaths"]+" /run"},
        ]
        for extra in bad:
            with self.subTest(extra=extra), self.assertRaises(RuntimeError):
                b.validate_filesystem_wall({**base,**extra})
    def test_actual_mountinfo_proves_ro_tmpfs(self):
        good="42 10 0:91 / /run ro,nosuid,nodev - tmpfs tmpfs ro,size=65536k"
        self.assertTrue(b.verify_private_run_mountinfo(good))
        for broken in [
          "42 10 0:91 / /run rw,nosuid - tmpfs tmpfs rw",
          "42 10 0:91 / /run ro - ext4 /dev/sda1 ro",
          "",
          good+"\n"+good,
          "42 10 0:91 / /run/postgresql ro - tmpfs tmpfs ro",
        ]:
            with self.subTest(broken=broken), self.assertRaises(RuntimeError):
                b.verify_private_run_mountinfo(broken)
    def test_overlay_only_new_candidate_service(self):
        overlay=(ROOT/"deploy/r25-b-3031.namespace-recovery.dropin.conf").read_text()
        self.assertIn("TemporaryFileSystem=/run:ro",overlay)
        self.assertIn("InaccessiblePaths=\n",overlay)
        self.assertIn("ExecStartPre=+/usr/bin/python3 -I -B /etc/aoe2war/r24-parallel-web/approved-runtime-namespace-v2.py",overlay)
        self.assertIn("--expected-guard-sha256 dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d",overlay)
        self.assertNotIn("ExecStart=",overlay)
        self.assertNotIn("User=",overlay)
        self.assertNotIn("EnvironmentFile=",overlay)
        self.assertNotIn("BindPaths=",overlay)
        self.assertNotIn("ReadWritePaths=",overlay)
        old=(ROOT/"scripts/r25_b_host_witness.py").read_bytes()
        self.assertEqual(len(old),22310,"historic approved source immutable")
if __name__=="__main__":
    unittest.main()
