import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "ledger", Path(__file__).parents[1] / "scripts/aoe2_product_release_ledger.py"
)
L = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(L)
SOURCE = "1" * 40


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "events.jsonl"

    def test_unknown_start_does_not_become_zero(self):
        L.append(self.path, SOURCE, "T7", "pass", at="2026-11-13T21:34:46Z", historical=True)
        result = L.summary(L.read(self.path), "build123456")
        self.assertIsNone(result["firstVerifiedProductionMs"])
        self.assertIsNone(result["finalAcceptedMs"])

    def test_historical_observation_and_unknown_final(self):
        L.append(self.path, SOURCE, "T0", "pass", {
            "startKind": "observed-engineering", "clockSource": "historical-receipt",
            "precisionMs": 1000,
        }, at="2026-11-13T20:42:19Z", historical=True)
        L.append(self.path, SOURCE, "T7", "pass", at="2026-11-13T21:34:46Z", historical=True)
        result = L.summary(L.read(self.path))
        self.assertEqual(result["firstVerifiedProductionMs"], 3147000)
        self.assertEqual(result["startKind"], "observed-engineering")
        self.assertIsNone(result["finalAcceptedMs"])

    def test_declared_past_clock_cannot_use_now_monotonic(self):
        item = L.append(self.path, SOURCE, "T0", "pass",
                        at="2026-11-13T20:42:19Z")
        self.assertIsNone(item["clock"]["monotonicNs"])
        self.assertIsNone(item["clock"]["runId"])

    def test_latest_hold_is_visible_but_first_pass_keeps_metric(self):
        L.append(self.path, SOURCE, "T0", "pass", at="2026-11-13T20:42:19Z")
        L.append(self.path, SOURCE, "T7", "pass", at="2026-11-13T21:34:46Z")
        L.append(self.path, SOURCE, "T7", "hold", {"reason": "PUBLIC_BUILD_MISMATCH"})
        result = L.summary(L.read(self.path))
        self.assertEqual(result["stages"][7]["state"], "hold")
        self.assertEqual(result["firstVerifiedProductionMs"], 3147000)

    def test_reversed_clock_is_unknown(self):
        L.append(self.path, SOURCE, "T0", "pass", at="2026-11-13T21:00:00Z")
        L.append(self.path, SOURCE, "T7", "pass", at="2026-11-13T20:59:59Z")
        self.assertIsNone(L.summary(L.read(self.path))["firstVerifiedProductionMs"])

    def test_changed_source_rejected(self):
        L.append(self.path, SOURCE, "T0", "pass")
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            L.append(self.path, "2" * 40, "T1", "pass")

    def test_summary_rejects_mixed_source_chain(self):
        one = L.append(self.path, SOURCE, "T0", "pass")
        other = dict(one)
        other["sourceSha"] = "2" * 40
        other["releaseId"] = "2" * 12
        other["seq"] = 2
        other["previousHash"] = one["eventHash"]
        body = {k:v for k,v in other.items() if k != "eventHash"}
        import hashlib
        other["eventHash"] = hashlib.sha256(L.canonical(body)).hexdigest()
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            L.summary([one, other])

    def test_tamper_and_partial_append_fail_closed(self):
        L.append(self.path, SOURCE, "T0", "pass")
        raw = self.path.read_bytes()
        self.path.write_bytes(raw[:-1])
        with self.assertRaisesRegex(RuntimeError, "PARTIAL"):
            L.read(self.path)
        self.path.write_bytes(raw.replace(b'"pass"', b'"fail"'))
        with self.assertRaisesRegex(RuntimeError, "DIGEST"):
            L.read(self.path)

    def test_no_private_evidence_or_raw_output(self):
        with self.assertRaisesRegex(RuntimeError, "UNSAFE_EVIDENCE"):
            L.append(self.path, SOURCE, "T1", "pass", {"cookies": "private"})
        with self.assertRaisesRegex(RuntimeError, "BOUNDED_CODE"):
            L.append(self.path, SOURCE, "T1", "hold",
                     {"reason": "https://signed.example/private?token=secret"})

    def test_prefix_and_hash_chain_preserved(self):
        first = L.append(self.path, SOURCE, "T0", "pass")
        prefix = self.path.read_bytes()
        second = L.append(self.path, SOURCE, "T1", "pass")
        self.assertTrue(self.path.read_bytes().startswith(prefix))
        self.assertEqual(second["previousHash"], first["eventHash"])
        self.assertEqual(len(L.read(self.path)), 2)


if __name__ == "__main__":
    unittest.main()
