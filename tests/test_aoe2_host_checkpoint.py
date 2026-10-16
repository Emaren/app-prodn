"""Deterministic, fully offline Host OS encrypted-checkpoint evidence contracts."""

import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest

from scripts import aoe2_host_checkpoint as checkpoint


NOW = datetime(2026, 10, 16, 18, 0, tzinfo=timezone.utc)
SOURCE = "c9202cbbb374bbfbe043b4a35d5de0d412240e08"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fixture(folder: Path, *, finished: datetime = NOW - timedelta(hours=1)) -> None:
    # This is intentionally not a real CMS envelope. The verifier proves
    # SHA-256 integrity and reads an operator's stated decode result; it does
    # not decrypt or independently assert that a fake fixture was restored.
    archive = b"fictional ciphertext bytes, NOT a CMS decryption proof"
    folder.joinpath("database.cms").write_bytes(archive)
    folder.joinpath("database.cms.sha256").write_text(
        sha(archive) + "  database.cms\n", encoding="utf-8"
    )
    start = finished - timedelta(minutes=9)
    receipt = "\n".join(
        [
            checkpoint.HEADER,
            f"Capture started UTC: {start.isoformat().replace('+00:00', 'Z')}",
            f"Verification finished UTC: {finished.isoformat().replace('+00:00', 'Z')}",
            "Source: hel1 / aoe2hd_db",
            f"Operator Git HEAD: {SOURCE}",
            "Producer: PostgreSQL 16.15 pg_dump",
            "Reader: PostgreSQL 17.5 pg_restore",
            "Format: PostgreSQL custom archive / CMS AES-256",
            f"Ciphertext SHA-256: {sha(archive)}",
            "Capture: PASS",
            "Encryption: PASS",
            "Decryption: PASS",
            "Full archive decode: PASS",
            "Isolated database restoration: NOT PERFORMED",
            "Production database mutated: NO",
            "WoloChain mutated: NO",
            "",
        ]
    ).encode("utf-8")
    folder.joinpath("checkpoint.txt").write_bytes(receipt)
    folder.joinpath("checkpoint.txt.sha256").write_text(
        sha(receipt) + "  checkpoint.txt\n", encoding="utf-8"
    )


class HostCheckpointTests(unittest.TestCase):
    def test_fresh_is_hash_verified_but_not_a_restoration_proof(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            result = checkpoint.inspect_checkpoint(folder, now=NOW)
            self.assertEqual(result["status"], "FRESH")
            self.assertEqual(result["ciphertext_integrity"], "SHA256_VERIFIED")
            self.assertEqual(result["recorded_capture_and_decode"], "PASS_SELF_REPORTED")
            self.assertEqual(result["isolated_database_restore"], "NOT_PERFORMED")
            self.assertEqual(result["wolo_consensus_snapshot"], "NOT_VERIFIED_BY_THIS_COMMAND")
            self.assertFalse(result["mutates_production"])
            self.assertFalse(result["reads_private_keys"])
            self.assertNotIn(str(folder), str(result))

    def test_stale_capture_reports_stale_instead_of_green(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder, finished=NOW - timedelta(hours=25))
            self.assertEqual(
                checkpoint.inspect_checkpoint(folder, now=NOW)["status"], "STALE"
            )

    def test_ciphertext_tamper_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            folder.joinpath("database.cms").write_bytes(b"tampered")
            with self.assertRaisesRegex(checkpoint.CheckpointError, "SHA-256 mismatch"):
                checkpoint.inspect_checkpoint(folder, now=NOW)

    def test_manifest_cannot_select_another_file(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            folder.joinpath("database.cms.sha256").write_text(
                "0" * 64 + "  private-key.pem\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(checkpoint.CheckpointError, "unexpected file"):
                checkpoint.inspect_checkpoint(folder, now=NOW)

    def test_receipt_self_claim_of_isolated_restore_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            p = folder / "checkpoint.txt"
            data = p.read_bytes().replace(
                b"Isolated database restoration: NOT PERFORMED",
                b"Isolated database restoration: VERIFIED",
            )
            p.write_bytes(data)
            (folder / "checkpoint.txt.sha256").write_text(
                sha(data) + "  checkpoint.txt\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(checkpoint.CheckpointError, "restoration claim"):
                checkpoint.inspect_checkpoint(folder, now=NOW)

    def test_future_verification_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder, finished=NOW + timedelta(minutes=1))
            with self.assertRaisesRegex(checkpoint.CheckpointError, "future"):
                checkpoint.inspect_checkpoint(folder, now=NOW)

    def test_symlink_ciphertext_refused_even_with_matching_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            archive = folder / "database.cms"
            moved = folder / "source.cms"
            archive.rename(moved)
            archive.symlink_to(moved.name)
            with self.assertRaises(checkpoint.CheckpointError):
                checkpoint.inspect_checkpoint(folder, now=NOW)

    def test_duplicate_receipt_fields_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            fixture(folder)
            p = folder / "checkpoint.txt"
            data = p.read_bytes() + b"Capture: PASS\n"
            p.write_bytes(data)
            (folder / "checkpoint.txt.sha256").write_text(
                sha(data) + "  checkpoint.txt\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(checkpoint.CheckpointError, "duplicate"):
                checkpoint.inspect_checkpoint(folder, now=NOW)


if __name__ == "__main__":
    unittest.main()
