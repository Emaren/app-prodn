#!/usr/bin/env python3
"""R16: native issuer's 16MiB attached-volume signed-measurement ABI.
Synthetic source-only regression; never reads HEL1 live filesystem/DB.
"""
import importlib.util
from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

PATH=Path(__file__).resolve().parents[1]/"scripts/aoe2_solo_website_hel1_observer.py"
spec=importlib.util.spec_from_file_location("e_attached_observer",PATH)
observer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)

G=2**30
M=2**20

class AttachedVolumeAdmission(unittest.TestCase):
    def test_disk_is_attached_mount_not_root_filesystem(self):
        data=SimpleNamespace(f_blocks=10000,f_bfree=2000,f_bavail=1800,f_frsize=4096)
        with mock.patch.object(observer.os.path,"ismount",side_effect=lambda p:p==observer.VOL),mock.patch.object(observer.os,"statvfs",return_value=data) as statvfs:
            result=observer.disk()
        statvfs.assert_called_once_with("/mnt/HC_Volume_105319120")
        self.assertTrue(result["mounted"])
        self.assertEqual(result["free_bytes"],1800*4096)
        self.assertNotIn("/",statvfs.call_args.args)
    def _check_drift(self,delta):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d); attempt="a"*64
            path=state/(attempt+"-PRE_STAGE-observation.json")
            root_value=40*G
            report={"observation":{
                "observed_at":datetime.now(timezone.utc).isoformat(),
                "free_bytes":root_value,
                "effective_used_pct":80.0,"finish_used_pct":84.0,
                "source_sha":"b"*40,"build_id":"old-build","web_service":"active"}}
            path.write_text(json.dumps(report),encoding="utf-8")
            original_lstat=Path.lstat
            def fake_lstat(p):
                s=original_lstat(p)
                if str(p)==str(path):
                    return SimpleNamespace(st_mode=s.st_mode & ~0o077,st_uid=0,st_size=s.st_size)
                return s
            root_disk={"mounted":True,"free_bytes":root_value+delta,
                       "effective_used_pct":80.0,"finish_used_pct":84.0}
            with mock.patch.object(observer,"STATE",state),mock.patch.object(Path,"lstat",fake_lstat),mock.patch.object(observer,"disk",return_value=root_disk),mock.patch.object(observer,"source",return_value="b"*40),mock.patch.object(observer,"active_build",return_value="old-build"),mock.patch.object(observer,"service",return_value="active"):
                return observer.issued_root_snapshot({"attempt_id":attempt,"phase":"PRE_STAGE"})
    def test_issuer_16_mib_inclusive_drift_is_accepted(self):
        self.assertIsNotNone(self._check_drift(16*M))
    def test_issuer_16_mib_excess_drift_is_rejected(self):
        self.assertIsNone(self._check_drift(16*M+1))
    def test_historical_64_mib_observer_divergence_is_rejected(self):
        self.assertIsNone(self._check_drift(17*M))

if __name__=="__main__":
    unittest.main()
