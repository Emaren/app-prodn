import gzip
import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_prisma_engine_seed.py"
SPEC = importlib.util.spec_from_file_location("aoe2_prisma_engine_seed", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PrismaEngineSeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        manifest = (
            self.root
            / "node_modules"
            / "@prisma"
            / "engines-version"
            / "package.json"
        )
        manifest.parent.mkdir(parents=True)
        self.commit = "a" * 40
        manifest.write_text(
            json.dumps({"prisma": {"enginesVersion": self.commit}}),
            encoding="utf-8",
        )
        self.seed_dir = self.root / ".prisma-engine-seed"
        self.engine = self.seed_dir / f"schema-engine-{MODULE.TARGET}"
        self.metadata = self.seed_dir / "metadata.json"

    def patch_paths(self):
        return mock.patch.multiple(
            MODULE,
            ROOT=self.root,
            VERSION_MANIFEST=(
                self.root
                / "node_modules"
                / "@prisma"
                / "engines-version"
                / "package.json"
            ),
            SEED_DIR=self.seed_dir,
            ENGINE_PATH=self.engine,
            METADATA_PATH=self.metadata,
        )

    def test_seed_verifies_published_checksums_and_engine_version(self):
        raw = b"candidate-schema-engine"
        compressed = gzip.compress(raw)
        raw_sha = hashlib.sha256(raw).hexdigest()
        compressed_sha = hashlib.sha256(compressed).hexdigest()

        def fetch(url, timeout=60):
            if url.endswith(".gz.sha256"):
                return f"{compressed_sha}  schema-engine.gz\n".encode()
            if url.endswith(".sha256"):
                return f"{raw_sha}  schema-engine\n".encode()
            if url.endswith(".gz"):
                return compressed
            raise AssertionError(url)

        completed = type(
            "Completed",
            (),
            {
                "returncode": 0,
                "stdout": f"schema-engine-cli {self.commit}\n",
            },
        )()

        with self.patch_paths(), mock.patch.object(
            MODULE,
            "fetch_bytes",
            side_effect=fetch,
        ), mock.patch.object(
            MODULE.subprocess,
            "run",
            return_value=completed,
        ):
            payload = MODULE.seed()

        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["engine_commit"], self.commit)
        self.assertEqual(payload["engine_sha256"], raw_sha)
        self.assertEqual(self.engine.read_bytes(), raw)
        self.assertEqual(self.engine.stat().st_mode & 0o777, 0o755)
        persisted = json.loads(self.metadata.read_text(encoding="utf-8"))
        self.assertEqual(persisted["engine_sha256"], raw_sha)

    def test_seed_rejects_checksum_mismatch_before_writing(self):
        raw = b"candidate-schema-engine"
        compressed = gzip.compress(raw)

        def fetch(url, timeout=60):
            if url.endswith(".gz.sha256"):
                return (("0" * 64) + "  schema-engine.gz\n").encode()
            if url.endswith(".sha256"):
                return (
                    hashlib.sha256(raw).hexdigest()
                    + "  schema-engine\n"
                ).encode()
            return compressed

        with self.patch_paths(), mock.patch.object(
            MODULE,
            "fetch_bytes",
            side_effect=fetch,
        ):
            with self.assertRaisesRegex(RuntimeError, "compressed.*checksum"):
                MODULE.seed()

        self.assertFalse(self.seed_dir.exists())

    def test_candidate_commit_must_be_exact_sha(self):
        manifest = (
            self.root
            / "node_modules"
            / "@prisma"
            / "engines-version"
            / "package.json"
        )
        manifest.write_text(
            json.dumps({"prisma": {"enginesVersion": "not-a-sha"}}),
            encoding="utf-8",
        )
        with self.patch_paths():
            with self.assertRaisesRegex(RuntimeError, "enginesVersion"):
                MODULE.candidate_engine_commit()

    def test_checksum_parser_rejects_non_sha(self):
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            MODULE.parse_checksum(b"nope\n", "raw")


if __name__ == "__main__":
    unittest.main()
