"""Linux receipt emitter fixture: source-only, no actual artifact spoofing."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_linux_release_receipt_emit_v2.py"
sp=importlib.util.spec_from_file_location("b_emit",SRC)
m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
BYTES=b"minimal fixture only - not a runnable Next.js runtime"
class Emitter(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="b-linux-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.dir=Path(self.temp.name)
        (self.dir/"runtime.tar.gz").write_bytes(BYTES)
        self.meta={"schema":"aoe2war.runtime-artifact.v1",
                   "source_sha":"a"*40,"node_version":"v22.22.0",
                   "machine":"x86_64",
                   "readonly_backend_upstream":"http://127.0.0.1:3331",
                   "sha256":m.filehash(self.dir/"runtime.tar.gz"),
                   "bytes":len(BYTES),"build_id":"testfixture_N22",
                   "manifest_sha256":"f"*64}
        (self.dir/"artifact.json").write_text(json.dumps(self.meta))
        self.env={"GITHUB_ACTIONS":"true","CI":"true",
                  "RUNNER_OS":"Linux","RUNNER_ARCH":"X64",
                  "AOE2WAR_CI_INSTALL_PASSED":"true",
                  "AOE2WAR_CI_BUILD_PASSED":"true",
                  "AOE2WAR_ARTIFACT_SOURCE_SHA":"a"*40,
                  "GITHUB_RUN_ID":"1234567"}
    def emit(self,env=None,arc=None):
        with patch.object(m.platform,"system",return_value="Linux"),\
             patch.object(m.platform,"machine",return_value="x86_64"),\
             patch.object(m,"cmd",return_value="v22.22.0"):
            return m.generate(self.dir,evidence=self.env if env is None else env,
                              source_commit="a"*40,source_tree="b"*40,
                              lockfile_sha="c"*64,archive_sha=self.meta["sha256"],
                              archive_bytes=len(BYTES))
    def test_positive_synthetic_linux_provenance_is_not_install_permit(self):
        x=self.emit()
        self.assertFalse(x["release_install_authorized"])
        self.assertTrue(x["c_dev_uid650_receipt_not_inferred"])
    def test_direct_cli_on_mac_held(self):
        p=subprocess.run([sys.executable,"-B",str(SRC),"--ci-export-dir",str(self.dir)],capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
    def test_missing_ci_build_proof(self):
        env=dict(self.env,AOE2WAR_CI_BUILD_PASSED="false")
        with self.assertRaisesRegex(m.Hold,"NO_TRUSTED_CI"):self.emit(env)
    def test_m1_builder_not_release_artifact(self):
        env=dict(self.env,RUNNER_OS="macOS")
        with self.assertRaisesRegex(m.Hold,"NO_TRUSTED_CI"):self.emit(env)
    def test_wrong_node_binary(self):
        with patch.object(m.platform,"system",return_value="Linux"),\
             patch.object(m.platform,"machine",return_value="x86_64"),\
             patch.object(m,"cmd",return_value="v24.4.1"):
            with self.assertRaisesRegex(m.Hold,"NOT_PINNED_NODE22"):
                m.generate(self.dir,evidence=self.env,source_commit="a"*40,
                           source_tree="b"*40,lockfile_sha="c"*64,
                           archive_sha=self.meta["sha256"],archive_bytes=len(BYTES))
    def test_no_original_source_ref(self):
        env=dict(self.env,AOE2WAR_ARTIFACT_SOURCE_SHA="2"*40)
        with self.assertRaisesRegex(m.Hold,"SOURCE_NOT_PR"):self.emit(env)
    def test_tampered_archive_denied(self):
        (self.dir/"runtime.tar.gz").write_bytes(BYTES+b"m")
        with self.assertRaisesRegex(m.Hold,"ARCHIVE_STREAM_DRIFT"):self.emit()
    def test_tampered_exported_manifest_denied(self):
        self.meta["node_version"]="v24.4.1"
        (self.dir/"artifact.json").write_text(json.dumps(self.meta))
        with self.assertRaisesRegex(m.Hold,"EXPORTED_RUNTIME_META"):self.emit()
    def test_symlinked_archive_denied(self):
        p=self.dir/"runtime.tar.gz";p.unlink()
        q=self.dir/"alias.tar.gz";q.write_bytes(BYTES);p.symlink_to(q)
        with self.assertRaisesRegex(m.Hold,"EXPORTED_FILE_UNTRUSTED"):self.emit()
    def test_hardlinked_archive_denied(self):
        os.link(self.dir/"runtime.tar.gz",self.dir/"duplicate-link")
        with self.assertRaisesRegex(m.Hold,"EXPORTED_FILE_UNTRUSTED"):self.emit()
    def test_missing_run_id_denied(self):
        env=dict(self.env,GITHUB_RUN_ID="")
        with self.assertRaisesRegex(m.Hold,"RUN_ID_REQUIRED"):self.emit(env)
if __name__=="__main__":unittest.main()
