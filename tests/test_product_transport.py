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


class ParallelRangeTransportTests(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache=Path(self.temp.name)/"cache"
        self.data=b"a"*T.PARALLEL_RANGE_BYTES+b"b"*T.PARALLEL_RANGE_BYTES+b"final"*13
        self.digest=hashlib.sha256(self.data).hexdigest()
        self.threshold=patch.object(T,"PARALLEL_MIN_BYTES",1)
        self.threshold.start()
        self.addCleanup(self.threshold.stop)

    def fetch(self,artifact,start,end,cancel):
        return (206,{"content-range":f"bytes {start}-{end}/{len(self.data)}",
                     "content-length":str(end-start+1)},
                io.BytesIO(self.data[start:end+1]),None)

    def acquire(self,fetch=None,digest=None,retries=0):
        return T.download(self.cache,12,len(self.data),digest or self.digest,
                          retries=retries,range_fetch=fetch or self.fetch)

    def payload(self):
        return self.cache/(self.digest+".ranges-v1")/"payload.part"

    def test_exact_ranges_assemble_the_approved_zip_and_cache_reuse_is_network_free(self):
        from unittest.mock import patch
        calls=[]
        def fetch(*args):
            calls.append(args[1:3])
            return self.fetch(*args)
        result=self.acquire(fetch)
        self.assertEqual(result.read_bytes(),self.data)
        self.assertEqual(sorted(calls),[
            (0,T.PARALLEL_RANGE_BYTES-1),
            (T.PARALLEL_RANGE_BYTES,2*T.PARALLEL_RANGE_BYTES-1),
            (2*T.PARALLEL_RANGE_BYTES,len(self.data)-1),
        ])
        with patch.object(T,"parallel_download",side_effect=AssertionError("cache fetched twice")):
            self.assertEqual(self.acquire(),result)

    def test_interruption_preserves_contiguous_prefix_and_resumes_only_completed_ranges(self):
        from unittest.mock import patch
        T.private_dir(self.cache)
        contiguous=self.cache/(self.digest+".part")
        contiguous.write_bytes(b"existing-contiguous-prefix")
        contiguous.chmod(0o600)
        def interrupted(artifact,start,end,cancel):
            if start:
                return 503,{},io.BytesIO(b""),None
            return self.fetch(artifact,start,end,cancel)
        with patch.object(T,"PARALLEL_RANGE_WORKERS",1):
            with self.assertRaisesRegex(RuntimeError,"RANGE_HTTP_STATUS_503"):
                self.acquire(interrupted)
        self.assertEqual(contiguous.read_bytes(),b"existing-contiguous-prefix")
        # Apparent preallocation is the entire artifact; it is NOT progress.
        self.assertEqual(self.payload().stat().st_size,len(self.data))
        calls=[];progress=[]
        def resumed(*args):
            calls.append(args[1])
            return self.fetch(*args)
        with patch.object(T,"emit",side_effect=lambda *args,**kw:progress.append((args,kw))):
            result=self.acquire(resumed)
        self.assertNotIn(0,calls)
        resuming=[args for args,kw in progress if args[0]=="range-resuming"]
        self.assertEqual(resuming[0][1],T.PARALLEL_RANGE_BYTES)
        self.assertEqual(resuming[0][5],T.PARALLEL_RANGE_BYTES)
        self.assertEqual(result.read_bytes(),self.data)
        self.assertEqual(contiguous.read_bytes(),b"existing-contiguous-prefix")

    def test_corrupt_completed_range_holds_before_another_request(self):
        from unittest.mock import patch
        def interrupted(artifact,start,end,cancel):
            if start:
                return 503,{},io.BytesIO(b""),None
            return self.fetch(artifact,start,end,cancel)
        with patch.object(T,"PARALLEL_RANGE_WORKERS",1):
            with self.assertRaises(RuntimeError):
                self.acquire(interrupted)
        with self.payload().open("r+b") as target:
            target.write(b"X")
        with self.assertRaisesRegex(RuntimeError,"RANGE_CHUNK_DIGEST"):
            self.acquire(lambda *args:self.fail("corrupt receipt-backed range was trusted"))

    def test_wrong_status_total_length_and_body_are_never_promoted(self):
        variants=("status","total","length","truncated","oversize")
        for variant in variants:
            with self.subTest(variant=variant),tempfile.TemporaryDirectory() as tmp:
                self.cache=Path(tmp)/"cache"
                def bad(artifact,start,end,cancel):
                    code,headers,stream,process=self.fetch(artifact,start,end,cancel)
                    body=stream.read()
                    if variant=="status":code=200
                    if variant=="total":headers["content-range"]=f"bytes {start}-{end}/{len(self.data)+1}"
                    if variant=="length":headers["content-length"]=str(end-start+2)
                    if variant=="truncated":body=body[:-1]
                    if variant=="oversize":body+=b"X"
                    return code,headers,io.BytesIO(body),None
                with self.assertRaises(RuntimeError):
                    self.acquire(bad)
                self.assertFalse((self.cache/(self.digest+".zip")).exists())

    def test_wrong_whole_zip_sha_preserves_ranges_and_never_promotes(self):
        with self.assertRaisesRegex(RuntimeError,"SHA_MISMATCH_RANGES_PRESERVED"):
            self.acquire(digest="f"*64)
        self.assertFalse((self.cache/("f"*64+".zip")).exists())
        self.assertTrue((self.cache/("f"*64+".ranges-v1")/"payload.part").exists())

    def test_retry_reports_real_counter_and_completed_bytes(self):
        from unittest.mock import patch
        calls={};progress=[]
        def transient(artifact,start,end,cancel):
            calls[start]=calls.get(start,0)+1
            if start==0 and calls[start]==1:
                return 503,{},io.BytesIO(b""),None
            return self.fetch(artifact,start,end,cancel)
        with patch.object(T,"emit",side_effect=lambda *args,**kw:progress.append((args,kw))):
            self.acquire(transient,retries=1)
        self.assertEqual(calls[0],2)
        verified=[args for args,kw in progress if args[0]=="verified"]
        self.assertEqual(verified[-1][1],len(self.data))
        self.assertEqual(verified[-1][6],1)

    def test_payload_hardlink_is_rejected_before_range_writes(self):
        from unittest.mock import patch
        def interrupted(artifact,start,end,cancel):
            return 503,{},io.BytesIO(b""),None
        with self.assertRaises(RuntimeError):
            self.acquire(interrupted)
        import os
        os.link(self.payload(),Path(self.temp.name)/"unexpected-hardlink")
        with self.assertRaisesRegex(RuntimeError,"CACHE_FILE_AUTHORITY"):
            self.acquire(lambda *args:self.fail("hardlinked payload was opened for writing"))

    def test_injected_sequential_fetch_remains_the_existing_path(self):
        from unittest.mock import patch
        def sequential(artifact,offset):
            return 200,{},io.BytesIO(self.data),None
        with patch.object(T,"parallel_download",side_effect=AssertionError("sequential injection changed")):
            result=T.download(self.cache,12,len(self.data),self.digest,fetch=sequential)
        self.assertEqual(result.read_bytes(),self.data)

    def test_real_worker_budget_is_bounded_at_ten(self):
        import threading
        import time
        self.data=b"x"*(11*T.PARALLEL_RANGE_BYTES+17)
        self.digest=hashlib.sha256(self.data).hexdigest()
        lock=threading.Lock()
        active=peak=0
        def concurrent_fetch(*args):
            nonlocal active,peak
            with lock:
                active+=1
                peak=max(peak,active)
            time.sleep(.03)
            result=self.fetch(*args)
            with lock:
                active-=1
            return result
        self.acquire(concurrent_fetch)
        self.assertGreater(peak,1)
        self.assertLessEqual(peak,10)
