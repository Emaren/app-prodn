"""Isolated independent-B Linux artifact byte/manifest verification negatives."""
from __future__ import annotations
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_linux_independent_artifact_verify_v2.py"
spec=importlib.util.spec_from_file_location("b_review_v2",SRC)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

SOURCE="a"*40
TREE="b"*40
LOCK="c"*64
RUN_ID=123456
BODY=b"candidate asset; fixture; never deploy"
BUILD_ID="test-build-ABCD"

class Fixture(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix="b-indep-fixture-")
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        self.extra=""
        self.body=BODY
        self.meta={
          "id":789,"name":f"b-linux-source-pinned-release-{RUN_ID}",
          "size_in_bytes":1024,
          "digest":"sha256:"+"e"*64,
          "expired":False,
          "workflow_run":{"id":RUN_ID,"head_sha":SOURCE},
        }
        self.render()
    def tar_add(self,tf,name,content,mode=0o644):
        info=tarfile.TarInfo(name)
        info.uid=0;info.gid=0;info.mode=mode
        info.size=len(content)
        tf.addfile(info,io.BytesIO(content))
    def render(self):
        row={
          "path":"public/fixture.txt","mode":0o644,
          "type":"file","size":len(self.body),"sha256":m.sha(self.body)
        }
        rows=[row]
        manifest={
          "schema":m.RUNTIME_SCHEMA,"source_sha":SOURCE,
          "build_id":BUILD_ID,"build_version":"fixtureversion11",
          "node_version":"v22.22.0","machine":"x86_64",
          "readonly_backend_upstream":"http://127.0.0.1:3331",
          "files":len(rows),"tree_sha256":m.sha(m.canonical(rows)),"rows":rows,
        }
        raw=m.canonical(manifest)+b"\n"
        archive=self.root/"runtime.tar.gz"
        with tarfile.open(archive,"w:gz") as tf:
            self.tar_add(tf,"public/fixture.txt",self.body)
            if self.extra:
                self.tar_add(tf,self.extra,b"tampered")
            self.tar_add(tf,".aoe2war-runtime-manifest.json",raw,mode=0o444)
            self.tar_add(tf,".aoe2war-source-sha",(SOURCE+"\n").encode(),mode=0o444)
        sha=m.digest(archive)
        archive_data={
          "schema":m.RUNTIME_SCHEMA,"source_sha":SOURCE,"build_id":BUILD_ID,
          "build_version":"fixtureversion11","files":1,
          "node_version":"v22.22.0","machine":"x86_64",
          "readonly_backend_upstream":"http://127.0.0.1:3331",
          "tree_sha256":manifest["tree_sha256"],"manifest_sha256":m.sha(raw),
          "sha256":sha,"bytes":archive.stat().st_size
        }
        b={
          "schema":m.SOURCE_SCHEMA,"repo":"Emaren/app-prodn",
          "source_commit":SOURCE,"source_tree":TREE,"lockfile_sha256":LOCK,
          "run_id":RUN_ID,"builder":"github-actions-ubuntu-24.04",
          "os":"linux","arch":"x86_64","node":"v22.22.0",
          "locked_dependency_install":"yarn-frozen-lockfile",
          "lockfile_name":"yarn.lock","production_build":True,
          "runtime_archive":{"name":"runtime.tar.gz","sha256":sha,"bytes":archive.stat().st_size},
          "runtime_manifest_sha256":m.sha(raw),"build_id":BUILD_ID,
          "target_3032":True,"release_install_authorized":False,
          "financial_write_capability":False,
          "finance_db_credentials_present":False,"private_keys_embedded":False,
          "c_dev_uid650_receipt_not_inferred":True,
        }
        (self.root/"artifact.json").write_text(json.dumps(archive_data))
        (self.root/"b-linux-release-receipt-v2.json").write_text(json.dumps(b))
    def check(self,**overrides):
        args={"head_sha":SOURCE,"git_tree":TREE,"lockfile_sha":LOCK,"run_id":RUN_ID,
              "artifact_api":{"artifacts":[self.meta]},
              "os_name":"Linux","arch":"X64"}
        args.update(overrides)
        return m.verify(self.root,**args)
    def test_positive_checks_every_member_without_release_authority(self):
        result=self.check()
        self.assertEqual(result["runtime_entries_verified"],1)
        self.assertFalse(result["public_3032_activation_authorized"])
        self.assertEqual(result["github_artifact_id"],789)
    def test_source_mismatch(self):
        self.meta["workflow_run"]["head_sha"]="f"*40
        with self.assertRaisesRegex(m.Hold,"SOURCE_TREE_LOCK_RUN"):
            self.check(head_sha="f"*40)
    def test_wrong_lockfile_sha(self):
        with self.assertRaisesRegex(m.Hold,"SOURCE_TREE_LOCK_RUN"):
            self.check(lockfile_sha="0"*64)
    def test_forged_github_artifact_head(self):
        self.meta["workflow_run"]["head_sha"]="e"*40
        with self.assertRaisesRegex(m.Hold,"GITHUB_API_ZIP"):
            self.check()
    def test_github_artifact_replay(self):
        self.meta["workflow_run"]["id"]=RUN_ID+1
        with self.assertRaisesRegex(m.Hold,"GITHUB_API_ZIP"):
            self.check()
    def test_non_linux_reviewer_denied(self):
        with self.assertRaisesRegex(m.Hold,"REVIEWER_NOT_NATIVE"):
            self.check(os_name="macOS")
    def test_archive_byte_drift(self):
        with (self.root/"runtime.tar.gz").open("ab") as f:f.write(b"x")
        with self.assertRaisesRegex(m.Hold,"STREAMED_INNER"):
            self.check()
    def test_archive_member_drift_against_original_manifest(self):
        self.extra="public/extra.txt"
        self.render()
        with self.assertRaisesRegex(m.Hold,"INNER_RUNTIME_CONTENT"):
            self.check()
    def test_archive_traversal_rejected_even_with_claimed_archive_hash(self):
        self.extra="../financial/escape"
        self.render()
        with self.assertRaisesRegex(m.Hold,"ARCHIVE_PATH_ESCAPE"):
            self.check()
    def test_missing_source_tail_denied(self):
        path=self.root/"runtime.tar.gz"
        source_meta=json.loads((self.root/"artifact.json").read_text())
        b=json.loads((self.root/"b-linux-release-receipt-v2.json").read_text())
        with tarfile.open(path,"w:gz") as tf:
            self.tar_add(tf,"public/fixture.txt",self.body)
            self.tar_add(tf,".aoe2war-runtime-manifest.json",b"{}")
        source_meta["sha256"]=b["runtime_archive"]["sha256"]=m.digest(path)
        source_meta["bytes"]=b["runtime_archive"]["bytes"]=path.stat().st_size
        (self.root/"artifact.json").write_text(json.dumps(source_meta))
        (self.root/"b-linux-release-receipt-v2.json").write_text(json.dumps(b))
        with self.assertRaisesRegex(m.Hold,"INNER_SOURCE_SHA"):
            self.check()
    def test_symlinked_download_file_denied(self):
        real=self.root/"backed-up"
        (self.root/"artifact.json").rename(real)
        (self.root/"artifact.json").symlink_to(real)
        with self.assertRaisesRegex(m.Hold,"DOWNLOADED_FILE_NOT_REGULAR"):
            self.check()
    def test_review_module_direct_cli_refuses_on_mac(self):
        p=subprocess.run([sys.executable,"-B",str(SRC),
            "--artifact-dir",str(self.root),
            "--github-api-artifacts-json",str(self.root/"artifact.json"),
            "--output",str(self.root/"review.json")],
            capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
        self.assertFalse((self.root/"review.json").exists())
if __name__=="__main__":unittest.main()
