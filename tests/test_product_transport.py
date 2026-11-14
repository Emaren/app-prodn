import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location(
    "product_transport", Path(__file__).parents[1] / "scripts/aoe2_product_release_transport.py"
)
T = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(T)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name) / "cache"
        self.data = b"a" * 10000 + b"bounded-final-payload"
        self.digest = hashlib.sha256(self.data).hexdigest()

    def fetch(self, code=200, body=None, headers=None):
        return lambda artifact, offset: (
            code, headers or {},
            io.BytesIO(self.data if body is None else body), None
        )

    def test_complete_and_verified_cache_does_not_fetch_again(self):
        result = T.download(self.cache, 12, len(self.data), self.digest, self.fetch())
        self.assertEqual(result.read_bytes(), self.data)
        result2 = T.download(
            self.cache, 12, len(self.data), self.digest,
            lambda *a: self.fail("cache downloaded twice")
        )
        self.assertEqual(result, result2)

    def test_interrupted_prefix_then_range_resume(self):
        with self.assertRaisesRegex(RuntimeError, "INTERRUPTED"):
            T.download(self.cache, 12, len(self.data), self.digest,
                       self.fetch(body=self.data[:4000]), retries=0)
        seen = []
        def resumed(artifact, offset):
            seen.append(offset)
            return (
                206, {"content-range": f"bytes {offset}-{len(self.data)-1}/{len(self.data)}"},
                io.BytesIO(self.data[offset:]), None
            )
        result = T.download(self.cache, 12, len(self.data), self.digest, resumed)
        self.assertEqual(seen, [4000])
        self.assertEqual(result.read_bytes(), self.data)

    def test_ignored_range_restarts_instead_of_appending(self):
        T.private_dir(self.cache)
        partial = self.cache / (self.digest + ".part")
        partial.write_bytes(self.data[:10])
        partial.chmod(0o600)
        self.assertEqual(
            T.download(self.cache, 12, len(self.data), self.digest, self.fetch()).read_bytes(),
            self.data,
        )

    def test_wrong_range_preserves_prefix(self):
        T.private_dir(self.cache)
        partial = self.cache / (self.digest + ".part")
        partial.write_bytes(b"prefix")
        partial.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, "RANGE_IDENTITY"):
            T.download(self.cache, 12, len(self.data), self.digest,
                       self.fetch(206, b"x", {"content-range": "bytes 0-1/2"}), retries=0)
        self.assertEqual(partial.read_bytes(), b"prefix")

    def test_invalid_sha_never_promotes_cache(self):
        wrong = "f" * 64
        with self.assertRaisesRegex(RuntimeError, "SHA_MISMATCH"):
            T.download(self.cache, 12, len(self.data), wrong, self.fetch())
        self.assertFalse((self.cache / (wrong + ".zip")).exists())
        self.assertTrue((self.cache / (wrong + ".part")).exists())

    def test_cache_symlink_denied(self):
        T.private_dir(self.cache)
        (self.cache / (self.digest + ".zip")).symlink_to("/etc/hosts")
        with self.assertRaisesRegex(RuntimeError, "AUTHORITY"):
            T.download(self.cache, 12, len(self.data), self.digest, self.fetch())

    def test_existing_receipt_verified_without_overwrite(self):
        archive = Path(self.temp.name) / "proof.zip"
        with zipfile.ZipFile(archive, "w") as f:
            f.writestr("b-linux-independent-review-v2.json", b"proof")
        dest = Path(self.temp.name) / "b-linux-independent-review-v2.json"
        expected = hashlib.sha256(b"proof").hexdigest()
        T.member(archive, dest.name, dest, expected)
        T.member(archive, dest.name, dest, expected)
        with self.assertRaisesRegex(RuntimeError, "EXISTING_MEMBER_MISMATCH"):
            T.member(archive, dest.name, dest, "0" * 64)
        self.assertEqual(dest.read_bytes(), b"proof")

    def test_partial_extraction_explicit_hold(self):
        archive = Path(self.temp.name) / "proof.zip"
        with zipfile.ZipFile(archive, "w") as f:
            f.writestr("runtime.tar.gz", b"runtime")
        dest = Path(self.temp.name) / "runtime.tar.gz"
        dest.with_name(dest.name + ".part").write_bytes(b"partial")
        with self.assertRaisesRegex(RuntimeError, "PARTIAL_HOLD"):
            T.member(archive, dest.name, dest)

    def test_unsafe_zip_rejected_before_write(self):
        archive = Path(self.temp.name) / "proof.zip"
        with zipfile.ZipFile(archive, "w") as f:
            f.writestr("../outside", b"x")
            f.writestr("runtime.tar.gz", b"runtime")
        with self.assertRaisesRegex(RuntimeError, "ZIP_PATH"):
            T.member(archive, "runtime.tar.gz", Path(self.temp.name) / "runtime.tar.gz")


if __name__ == "__main__":
    unittest.main()
