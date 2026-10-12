from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import aoe2_speed_lcp_attribution as a


RELEASE = "9de03ab58e027559ecd7db5665f3ba5e6733ad42"
LCP_URL = "https://aoe2war.com/api/media-assets/avatar/known-featured?size=card"


def fixture() -> dict:
    def row(lcp_at: float, response_end: float):
        return {
            "metrics": {
                "finalLcp": {
                    "url": LCP_URL, "startTime": lcp_at,
                    "loadTime": response_end, "renderTime": lcp_at,
                },
                "readyMs": 950,
                "navigation": {"responseStart": 410},
                "lcpResourceTiming": {
                    "name": LCP_URL, "startTime": 440,
                    "responseEnd": response_end,
                },
                "lcpResourceMatchCount": 1,
                "lcpPreloadHint": {
                    "exactLcpHintCount": 1,
                    "highPriorityExactHintCount": 1,
                },
                "lcpImageLifecycle": {
                    "capped": False, "firstInsertedAtMs": 800,
                    "firstNativeLoadAtMs": response_end,
                },
            },
        }
    return {
        "schema": 1, "kind": "aoe2war-cold-process-lcp",
        "releaseSha": RELEASE, "buildVersion": "bounded-fixture",
        "viewport": "phone", "samples": 2,
        "productionMutated": False, "databaseMutated": False,
        "woloMutated": False, "rows": [row(1000, 650), row(1400, 1000)],
    }


class ColdLcpAttributionTests(unittest.TestCase):
    def test_exact_resource_attribution_preserves_distributions(self):
        result = a.analyze(fixture(), expected_release=RELEASE)
        self.assertEqual(result["exactResourceEvidence"], 2)
        self.assertEqual(result["exactPreloadHintSamples"], 2)
        self.assertEqual(result["highPriorityExactPreloadSamples"], 2)
        self.assertEqual(result["timings"]["response_to_lcp"]["p50_ms"], 375)
        self.assertEqual(result["timings"]["response_to_lcp"]["p95_ms"], 397.5)
        self.assertEqual(result["timings"]["request_start"]["p50_ms"], 440)
        self.assertFalse(result["mutationAllowed"])

    def test_missing_resource_does_not_fabricate_lcp_delay(self):
        payload = fixture()
        payload["rows"][0]["metrics"]["lcpResourceTiming"]["name"] = LCP_URL + "-wrong"
        payload["rows"][1]["metrics"]["lcpResourceTiming"] = None
        result = a.analyze(payload)
        self.assertEqual(result["exactResourceEvidence"], 0)
        self.assertEqual(result["timings"]["response_to_lcp"]["count"], 0)
        self.assertIsNone(result["timings"]["response_to_lcp"]["p50_ms"])
        self.assertEqual(result["timings"]["lcp"]["count"], 2)

    def test_missing_and_invalid_timing_cannot_be_treated_as_zero(self):
        payload = fixture()
        payload["rows"][0]["metrics"]["lcpResourceTiming"]["responseEnd"] = 0
        payload["rows"][1]["metrics"]["lcpResourceTiming"]["responseEnd"] = 1600
        self.assertEqual(a.analyze(payload)["exactResourceEvidence"], 0)

    def test_mutation_boundary_and_release_are_fail_closed(self):
        payload = fixture()
        payload["woloMutated"] = None
        with self.assertRaises(a.EvidenceError):
            a.analyze(payload)
        payload = fixture()
        with self.assertRaises(a.EvidenceError):
            a.analyze(payload, expected_release="a" * 40)
        payload["samples"] = 3
        with self.assertRaises(a.EvidenceError):
            a.analyze(payload)

    def test_duplicate_resource_timing_does_not_imply_duplicate_requests(self):
        payload = fixture()
        payload["rows"][0]["metrics"]["lcpResourceMatchCount"] = 2
        result = a.analyze(payload)
        self.assertEqual(result["duplicateExactResourceSamples"], 1)
        self.assertEqual(result["exactResourceEvidence"], 2)

    def test_read_receipt_disallows_symlink_or_malformed_json(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "receipt.json"
            path.write_text(json.dumps(fixture()))
            self.assertEqual(a.analyze(a.read_receipt(path))["samples"], 2)
            link = Path(td) / "link.json"
            link.symlink_to(path)
            with self.assertRaises(a.EvidenceError):
                a.read_receipt(link)
            path.write_text("{broken")
            with self.assertRaises(a.EvidenceError):
                a.read_receipt(path)


if __name__ == "__main__":
    unittest.main()
