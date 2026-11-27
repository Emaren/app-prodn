import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "retention", Path(__file__).parents[1] / "scripts/aoe2_product_retention.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class ProductRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve()
        self.stage, self.volume = self.base / "home", self.base / "volume"
        self.stage.mkdir()
        self.volume.mkdir(mode=0o700)
        self.folder = self.stage / ".aoe2war-b-fixture"
        self.folder.mkdir(mode=0o700)
        self.file = self.folder / "runtime.tar.gz"
        self.file.write_bytes(b"A" * 1000001)
        self.file.chmod(0o600)
        self.source, self.archive_sha = "c" * 40, m.hashfile(self.file)
        self.proof = self.folder / "b-linux-independent-review-v2.json"
        self.proof.write_bytes(m.raw({
            "status": "PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER",
            "financial_authorized": False, "source_commit": self.source,
            "build_id": "fixturebuild", "runtime_archive_sha256": self.archive_sha,
            "runtime_archive_bytes": 1000001}))
        self.proof.chmod(0o600)
        self.row = {
            "path": str(self.file), "source": self.source, "build": "fixturebuild",
            "archive_sha256": self.archive_sha, "archive_bytes": 1000001,
            "proof_sha256": m.hashfile(self.proof),
            "references": [{
                "path": "/root/aoe2war-product-release-manifests/historical.json",
                "sha256": "d" * 64}]}
        now = m.utc()
        self.p = {
            "schema": m.PINS_SCHEMA, "observed_at": now.isoformat(),
            "expires_at": (now + dt.timedelta(minutes=5)).isoformat(),
            "active": {"source": "a" * 40, "build": "activebuild",
                       "runtime": "/var/lib/aoe2war-web-prod-" + "a" * 12},
            "previous": {"source": "b" * 40, "build": "previousbuild",
                         "runtime": "/var/lib/aoe2war-web-prod-" + "b" * 12},
            "hot2": {"source": "e" * 40, "build": "hot2build",
                     "runtime": "/var/lib/aoe2war-web-prod-" + "e" * 12},
            "controller_sha256": m.CONTROLLER_SHA, "manifest_sha256": "2" * 64,
            "purpose": m.RETIRE_PURPOSE, "retirement_authorized": True,
            "independent_restoration_verified": True,
            "journal_sha256": "3" * 64, "open_files_verified": True,
            "candidates": [self.row]}
        self.identity = {"stage_device": 1, "volume_device": 2, "volume_inode": 3}
        self.patchers = [
            patch.object(m, "OWNER", os.getuid()),
            patch.object(m, "ROOT_UID", os.getuid()),
            patch.object(m, "STAGE", self.stage),
            patch.object(m, "VOLUME", self.volume),
            patch.object(m, "live_identity", return_value=None),
            patch.object(m, "storage_identity", return_value=self.identity),
            patch.object(m, "free", return_value=32 * m.GIB),
            patch.object(m, "rename_no_replace", side_effect=self.fixture_rename)]
        for p in self.patchers:
            p.start()

    def fixture_rename(self, source, dest):
        if dest.exists() or dest.is_symlink():
            raise FileExistsError(str(dest))
        os.rename(source, dest)

    def tearDown(self):
        for p in reversed(self.patchers):
            p.stop()
        self.temp.cleanup()

    def q(self):
        return m.plan(self.p, "f" * 64, self.volume, 0, 0)

    def apply(self, q=None):
        q = self.q() if q is None else q
        return m.apply(q, m.digest(m.raw(q)), self.p, "f" * 64)

    def pins_file(self, p):
        path = self.folder / "pins.json"
        path.write_bytes(m.raw(p))
        path.chmod(0o600)
        return path

    def test_dbceb_owner_copy_boolean_cannot_bypass_missing_issuer(self):
        q = self.q()
        q["items"][0]["classification"]["source"] = (
            m.DBCEB_PROTECTED_T8_PREDECESSOR_SOURCE)
        self.p.update({"purpose": m.COPY_ONLY_PURPOSE, "copy_authorized": True,
                       "retirement_authorized": False,
                       "independent_restoration_verified": True})
        with self.assertRaisesRegex(ValueError,
                                    "DBCEB_OWNER_COPY_VERIFIER"):
            m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertTrue(self.file.exists())
        self.assertEqual(list(self.volume.rglob("copy-only-*.json")), [])

    def test_dbceb_forged_retirement_and_restore_booleans_always_hold(self):
        q = self.q()
        q["items"][0]["classification"]["source"] = (
            m.DBCEB_PROTECTED_T8_PREDECESSOR_SOURCE)
        self.p.update({"purpose": m.RETIRE_PURPOSE,
                       "retirement_authorized": True,
                       "independent_restoration_verified": True})
        with self.assertRaisesRegex(ValueError,
                                    "DBCEB_SIGNED_RETIRE_AND_RESTORE"):
            m.apply(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertTrue(self.file.exists())
        self.assertEqual(list(self.folder.glob("*.retiring-*")), [])

    def test_copy_only_data_receipt_and_idempotence_preserves_root(self):
        q = self.q()
        self.p["purpose"] = m.COPY_ONLY_PURPOSE
        self.p["copy_authorized"] = True
        self.p["retirement_authorized"] = False
        snap = m.regular(self.file, m.OWNER)
        report = m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertFalse(report["retirement_authorized"])
        self.assertFalse(report["independent_restoration_verified"])
        self.assertEqual(m.regular(self.file, m.OWNER), snap)
        saved = json.loads(Path(report["receipt"]).read_bytes())
        self.assertEqual(saved["schema"], m.COPY_ONLY_SCHEMA)
        self.assertFalse(saved["source_retired"])
        self.assertEqual(m.hashfile(saved["item"]["retained"]), self.archive_sha)
        second = m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertEqual(second["receipt_sha256"], report["receipt_sha256"])
        self.assertTrue(self.file.exists())

    def test_copy_only_rejects_missing_or_retire_class(self):
        q = self.q()
        for invalid in (
            {},
            {"purpose": m.COPY_ONLY_PURPOSE, "copy_authorized": False},
            {"purpose": m.COPY_ONLY_PURPOSE, "copy_authorized": True,
             "retirement_authorized": True},
        ):
            original = dict(self.p)
            self.p.update(invalid)
            with self.assertRaisesRegex(ValueError, "COPY_ONLY_OWNER_CLASS"):
                m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
            self.p.clear();self.p.update(original)
        self.assertTrue(self.file.exists())

    def test_copy_only_cannot_be_used_as_retire_authority(self):
        q = self.q()
        self.p.update({"purpose": m.COPY_ONLY_PURPOSE,
                       "copy_authorized": True,
                       "retirement_authorized": False,
                       "independent_restoration_verified": False})
        report = m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
        with self.assertRaisesRegex(ValueError, "SEPARATE_EXACT_RETIRE"):
            m.apply(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertTrue(self.file.exists())
        self.assertTrue(Path(report["receipt"]).exists())

    def test_copy_only_rejects_incorrect_tar_before_copy(self):
        q = self.q()
        self.p.update({"purpose": m.COPY_ONLY_PURPOSE,
                       "copy_authorized": True,
                       "retirement_authorized": False})
        self.file.write_bytes(b"B" * 1000001)
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SHA"):
            m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)
        self.assertTrue(self.file.exists())

    def test_copy_only_rejects_hot2_source(self):
        with self.assertRaisesRegex(ValueError, "PINNED_SOURCE"):
            m.candidate(dict(self.row, source=self.p["hot2"]["source"]), self.p)

    def test_copy_only_requires_exact_one_object(self):
        q = self.q()
        self.p.update({"purpose": m.COPY_ONLY_PURPOSE,
                       "copy_authorized": True,
                       "retirement_authorized": False})
        q["items"].append(q["items"][0])
        with self.assertRaisesRegex(ValueError, "COPY_ONLY_EXACT_ONE_ITEM"):
            m.copy_only(q, m.digest(m.raw(q)), self.p, "f" * 64)

    def test_retain_restore_and_idempotent_resume(self):
        q = self.q()
        result = self.apply(q)
        self.assertFalse(self.file.exists())
        self.assertTrue(self.proof.exists())
        receipt = Path(result["receipt"])
        saved = json.loads(receipt.read_bytes())
        self.assertEqual(saved["items"][0]["classification"]["references"],
                         self.row["references"])
        self.apply(q)
        m.restore(receipt, m.hashfile(receipt))
        self.assertEqual(m.hashfile(self.file), self.archive_sha)
        self.assertTrue(Path(saved["items"][0]["retained"]).exists())

    def test_pinned_sources_hold(self):
        for key in ("active", "previous", "hot2"):
            with self.assertRaisesRegex(ValueError, "PINNED_SOURCE"):
                m.candidate(dict(self.row, source=self.p[key]["source"]), self.p)

    def test_hardlink_hold(self):
        os.link(self.file, self.folder / "other")
        with self.assertRaisesRegex(ValueError, "HARDLINK"):
            m.candidate(self.row, self.p)

    def test_symlink_hold(self):
        original = self.folder / "original"
        self.file.rename(original)
        self.file.symlink_to(original)
        with self.assertRaisesRegex(ValueError, "SYMLINK"):
            m.candidate(self.row, self.p)

    def test_wrong_sha_and_proof_hold(self):
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SHA"):
            m.candidate(dict(self.row, archive_sha256="0" * 64), self.p)
        self.proof.write_bytes(b"{}")
        with self.assertRaisesRegex(ValueError, "JSON_SHA"):
            m.candidate(self.row, self.p)

    def test_expired_or_unattested_pins_hold(self):
        for changes, reason in (
            ({"expires_at": (m.utc() - dt.timedelta(seconds=1)).isoformat()},
             "PINS_EXPIRED"),
            ({"open_files_verified": False}, "OPEN_FILE"),
            ({"controller_sha256": "0" * 64}, "CONTROLLER_SHA")):
            path = self.pins_file(dict(self.p, **changes))
            with self.assertRaisesRegex(ValueError, reason):
                m.load_pins(path, m.hashfile(path))

    def test_drift_preserves_original(self):
        q = self.q()
        self.file.write_bytes(b"B" * 1000001)
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SHA"):
            self.apply(q)
        self.assertTrue(self.file.exists())

    def test_partial_copy_collision_preserves_original(self):
        q = self.q()
        objects = self.volume / "objects"
        objects.mkdir(mode=0o700)
        (objects / (self.source + "-" + self.archive_sha + ".tar.gz.partial")).write_bytes(b"partial")
        with self.assertRaises(FileExistsError):
            self.apply(q)
        self.assertTrue(self.file.exists())

    def test_copy_publication_never_overwrites(self):
        target = self.volume / "existing"
        target.write_bytes(b"preserve")
        with self.assertRaisesRegex(ValueError, "COPY_COLLISION"):
            m.copy_verified(self.file, target, self.archive_sha)
        self.assertEqual(target.read_bytes(), b"preserve")

    def test_restore_collision_preserves_retained(self):
        result = self.apply()
        self.file.write_bytes(b"wrong")
        self.file.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "RESTORE_COLLISION"):
            m.restore(result["receipt"], result["receipt_sha256"])

    def test_restore_rejects_forged_nonproduct_parent(self):
        result = self.apply()
        receipt = Path(result["receipt"])
        r = json.loads(receipt.read_bytes())
        fake = self.stage / ".wolochain" / "runtime.tar.gz"
        r["items"][0]["original"] = str(fake)
        r["items"][0]["classification"]["path"] = str(fake)
        receipt.write_bytes(m.raw(r))
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SCOPE"):
            m.restore(receipt, m.hashfile(receipt))

    def test_duplicate_or_wrong_plan_schema_hold(self):
        for change in ({"schema": "wrong"},):
            q = dict(self.q(), **change)
            with self.assertRaisesRegex(ValueError, "PLAN_IDENTITY"):
                self.apply(q)
        q = self.q()
        q["items"] *= 2
        with self.assertRaisesRegex(ValueError, "DUPLICATE"):
            self.apply(q)

    def test_storage_drift_hold(self):
        q = self.q()
        q["storage_identity"] = dict(self.identity, volume_device=999)
        with self.assertRaisesRegex(ValueError, "STORAGE_IDENTITY"):
            self.apply(q)

    def test_insufficient_capacity_hold_without_unlink(self):
        q = self.q()
        with patch.object(m, "free", return_value=m.GIB):
            with self.assertRaisesRegex(ValueError, "PROJECTED_RELEASE_CAPACITY"):
                self.apply(q)
        self.assertTrue(self.file.exists())

    def test_plan_digest_tamper_hold(self):
        q = self.q()
        with self.assertRaisesRegex(ValueError, "PLAN_IDENTITY"):
            m.apply(q, "0" * 64, self.p, "f" * 64)

    def test_crash_after_retire_resumes_from_sealed_receipt(self):
        q = self.q()
        with patch.object(Path, "unlink", autospec=True) as unlink:
            def fail_retirement(path, *args, **kwargs):
                if ".retiring-" in path.name:
                    raise RuntimeError("fixture interruption")
                return os.unlink(path)
            unlink.side_effect = fail_retirement
            with self.assertRaisesRegex(RuntimeError, "fixture interruption"):
                self.apply(q)
        self.assertFalse(self.file.exists())
        self.assertEqual(len(list(self.folder.glob("runtime.tar.gz.retiring-*"))), 1)
        self.apply(q)
        self.assertEqual(list(self.folder.glob("runtime.tar.gz.retiring-*")), [])


if __name__ == "__main__":
    unittest.main()
