"""A05 heap crash: exact nonfinancial unit repair and one-use fail-closed boundary."""
import importlib.util
from pathlib import Path
import hashlib
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
def source(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result
c=source("a05_new_c_memory","scripts/r25_c_start_root.py")
h=source("a05_recovery","scripts/r25_a05_heap_recovery.py")
STAGE=Path("/var/lib/aoe2war-web-prod-5869b4ab0870")

class A05HeapRecovery(unittest.TestCase):
    def test_new_unit_diff_is_exact_and_old_host_digest_is_pinned(self):
        new=c.production_unit_bytes(STAGE)
        self.assertEqual(hashlib.sha256(new).hexdigest(),
             "2deec75820dbebe26f0d8f4f3211ef7b112020508bd4828a59580587245496e1")
        old=new.replace(
            b"After=network.target postgresql.service\nStartLimitIntervalSec=300\nStartLimitBurst=3\n",
            b"After=network.target postgresql.service\n")
        old=old.replace(
            b"ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n",
            b"ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n")
        old=old.replace(b"Restart=on-failure\nRestartSec=8s\n",b"Restart=no\n")
        old=old.replace(b"MemoryHigh=2700M\nMemoryMax=3200M\n",b"MemoryMax=1500M\n")
        self.assertEqual(hashlib.sha256(old).hexdigest(),h.OLD_UNIT_SHA)
        self.assertEqual(h.OLD_CONTROLLER_SHA,
           "9dfa2e68999948c997238196d37737b93e7ca06eb3dbafd1ea29085cc73076f2")

    def test_staged_candidate_only_and_production_guard_unchanged(self):
        unit=c.production_unit_bytes(STAGE).decode()
        for expected in ("User=aoe2war-web-prod","--max-old-space-size=2048",
            "Restart=on-failure","RestartSec=8s","StartLimitBurst=3",
            "StartLimitIntervalSec=300","MemoryHigh=2700M","MemoryMax=3200M",
            "NODE_OPTIONS=--require=/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs",
            "AOE2WAR_PROD_DB_PREVIEW=false","WARGRAPH_RUNTIME_DISABLED=true",
            "PrivateDevices=yes","CapabilityBoundingSet=","TemporaryFileSystem=/run:ro"):
            self.assertIn(expected,unit)
        self.assertNotIn("Restart=always",unit)
        self.assertNotIn("127.0.0.1:8092",unit)
        self.assertNotIn("127.0.0.1:8093",unit)
        self.assertNotIn("ReadWritePaths=/mnt/HC_Volume_105319120",unit)

    def test_exact_line_admission_refuses_missing_or_duplicate(self):
        self.assertEqual(h.exact_line(b"x\n",b"x\n",b"y\n"),b"y\n")
        for value in (b"y\n",b"x\nx\n"):
            with self.assertRaisesRegex(h.Hold,"UNIT_PREIMAGE_NOT_UNIQUE"):
                h.exact_line(value,b"x\n",b"y\n")

    def test_one_use_original_rollback_and_separate_finance_are_immutable(self):
        s=(ROOT/"scripts/r25_a05_heap_recovery.py").read_text()
        self.assertIn('status":"CONSUMED_NO_REPLAY"',s)
        self.assertIn('status":"PASS_ISOLATED_3032_RECOVERED_NOT_PUBLIC"',s)
        self.assertIn('status":"CANDIDATE_ORIGINAL_FILES_RESTORED_NO_PUBLIC_CHANGE"',s)
        self.assertIn('"financial_authorized":False',s)
        self.assertIn('"public_cutover_authorized":False',s)
        self.assertIn('production_database_admission(database,password)',s)
        self.assertIn('production_witness({"profile_path":str(POLICY)})',s)
        self.assertIn('systemctl","set-property"',s)
        self.assertIn("sha(read(DROPIN,0o644))==DROPIN_SHA",s)
        self.assertIn("sha(read(NGINX,0o644))==PUBLIC_SHA",s)
        self.assertNotRegex(s,r"atomic\(NGINX")
        self.assertNotRegex(s,r"GRANT\s+ALL|ALTER\s+ROLE\s+aoe2hd_user")
        self.assertNotRegex(s,r"systemctl.*stop.*aoe2hdbets-web\.service")

    def test_prior_profile_memory_dropin_cannot_be_silently_ignored(self):
        self.assertEqual(h.DROPIN_SHA,
             "110c654076671e47a89365efcc1764c837db81fcd136599f880c5ec0d3a031ea")
        self.assertIn("50-MemoryMax.conf",str(h.DROPIN))
        self.assertEqual(h.OLD_POLICY_SHA,
             "1542c563b77c657fbcdda6b6c5bb20d2049f44ce9555fe26a41e90f1bc3b962d")

if __name__=="__main__":unittest.main()
