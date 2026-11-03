"""CI runtime packaging proves exact tested bytes and rejects escaping inputs."""
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("c_runtime_export",ROOT/"scripts/aoe2_r25_c_parallel_stage.py")
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class RuntimeExport(unittest.TestCase):
    def fixture(self,directory):
        root=pathlib.Path(directory)/"source";root.mkdir()
        for name in ("node_modules/demo","node_modules/.bin",".next/static/testBuildId12",".next/cache","lib/generated/prisma"):
            (root/name).mkdir(parents=True,exist_ok=True)
        for name,data in {"package.json":b"{}\n","yarn.lock":b"# test fixture\n",
                          "next.config.js":b"module.exports={};\n","node_modules/demo/index.js":b"module.exports=1;\n",
                          ".next/BUILD_ID":b"testBuildId12\n",".aoe2war-build-version":b"test-version-123\n",
                          ".next/static/testBuildId12/_buildManifest.js":b"testManifest",
                          ".next/cache/not-runtime":b"must not be exported",
                          "lib/generated/prisma/client.js":b"generated runtime\n"}.items():
            (root/name).write_bytes(data)
        (root/"node_modules/.bin/demo").symlink_to("../demo/index.js")
        def git(*args):
            return subprocess.check_output(["git","-C",str(root),*args],stderr=subprocess.DEVNULL)
        git("init","-q");git("config","user.name","CI fixture");git("config","user.email","fixture@example.invalid")
        git("add","package.json","yarn.lock","next.config.js");git("commit","-qm","fixture")
        return root,git("rev-parse","HEAD").decode().strip()

    def test_exports_real_archive_manifest_and_generated_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            root,source=self.fixture(temp);out=pathlib.Path(temp)/"artifact"
            env={"CI":"true","GITHUB_ACTIONS":"true","AOE2WAR_ARTIFACT_SOURCE_SHA":source,
                 "AOE2_BACKEND_UPSTREAM":"http://127.0.0.1:3331"}
            original=os.getcwd()
            try:
                os.chdir(root)
                with mock.patch.dict(os.environ,env):c.export_ci_runtime(out)
            finally:os.chdir(original)
            metadata=json.loads((out/"artifact.json").read_bytes())
            self.assertEqual(metadata["source_sha"],source)
            archive=out/"runtime.tar.gz"
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),metadata["sha256"])
            with tarfile.open(archive,"r:gz") as tf:
                names=tf.getnames()
                self.assertIn("lib/generated/prisma/client.js",names)
                self.assertNotIn(".next/cache/not-runtime",names)
                self.assertNotIn(".git/config",names)
                self.assertEqual(tf.getmember("node_modules/.bin/demo").linkname,"../demo/index.js")
                raw=tf.extractfile(".aoe2war-runtime-manifest.json").read()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),metadata["manifest_sha256"])
                manifest=json.loads(raw)
                for row in manifest["rows"]:
                    if row["type"]=="file":
                        data=tf.extractfile(row["path"]).read()
                        self.assertEqual(len(data),row["size"])
                        self.assertEqual(hashlib.sha256(data).hexdigest(),row["sha256"])

    def test_escaping_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root,_=self.fixture(temp)
            (root/"node_modules/demo/escape").symlink_to("/etc/passwd")
            with self.assertRaisesRegex(c.Hold,"CI_ABSOLUTE_RUNTIME_SYMLINK"):
                c.ci_runtime_entries(root)

    def test_private_environment_file_cannot_enter_runtime(self):
        with tempfile.TemporaryDirectory() as temp:
            root,_=self.fixture(temp)
            (root/"node_modules/demo/.env").write_text("SECRET=fixture-only\n")
            with self.assertRaisesRegex(c.Hold,"CI_PRIVATE_ENVIRONMENT_FILE_FORBIDDEN"):
                c.ci_runtime_entries(root)

    def test_source_head_mismatch_blocks_export_before_archive_creation(self):
        with tempfile.TemporaryDirectory() as temp:
            root,_=self.fixture(temp);out=pathlib.Path(temp)/"artifact"
            original=os.getcwd()
            try:
                os.chdir(root)
                with mock.patch.dict(os.environ,{"CI":"true","GITHUB_ACTIONS":"true","AOE2WAR_ARTIFACT_SOURCE_SHA":"0"*40}):
                    with self.assertRaisesRegex(c.Hold,"CI_ARTIFACT_MUST_TEST_EXACT_SOURCE_HEAD"):
                        c.export_ci_runtime(out)
            finally:os.chdir(original)
            self.assertFalse(out.exists())

if __name__=="__main__":unittest.main()
