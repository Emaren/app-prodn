"""Read-only inspection triage regressions: preserve missing points and source authority."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

FILE = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_inspections.py"
SPEC = importlib.util.spec_from_file_location("aoe2_inspections", FILE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

IDS = ["speed", "documentation", "organization", "tests", "release", "security", "data"]


def snapshot():
    cats = []
    for category_id in IDS:
        cats.append({
            "id": category_id,
            "title": category_id,
            "score": 100,
            "checks": [{
                "id": "truth",
                "label": "Authoritative proof",
                "weight": 100,
                "earned": 100,
                "detail": "PASS",
                "evidenceAt": "2026-10-12T01:00:00Z",
            }],
        })
    return {
        "schema": 1,
        "generatedAt": "2026-10-12T02:00:00Z",
        "releaseSha": "25e67900" * 5,
        "buildVersion": "candidate-certified",
        "overallScore": 100,
        "categories": cats,
        "notes": [],
    }


class GeneralInspectionsTriageTests(unittest.TestCase):
    def test_does_not_infer_green_from_doctor_if_release_scores_low(self):
        data = snapshot()
        data["overallScore"] = 78
        release = next(c for c in data["categories"] if c["id"] == "release")
        release["score"] = 54
        release["checks"][0]["earned"] = 54
        release["checks"][0]["detail"] = "Bridge/runtime parity pending"
        report = MODULE.summarize(data)
        self.assertEqual(report["overallScore"], 78)
        self.assertEqual(report["categories"][0]["id"], "release")
        self.assertEqual(report["categories"][0]["lost"], 46)
        self.assertEqual(report["categories"][0]["checks"][0]["lost"], 46)
        self.assertEqual(report["categories"][0]["checks"][0]["detail"], "Bridge/runtime parity pending")

    def test_distinguishes_partial_points_and_preserves_evidence_time(self):
        data = snapshot()
        speed = data["categories"][0]
        speed["score"] = 63
        speed["checks"] = [
            {"id": "lcp50", "label": "LCP p50", "weight": 12, "earned": 9,
             "detail": "1048 ms", "evidenceAt": "2026-10-12T01:45:22Z"},
            {"id": "lcp95", "label": "LCP p95", "weight": 15, "earned": 0,
             "detail": "1443 ms", "evidenceAt": "2026-10-12T01:45:22Z"},
        ]
        report = MODULE.summarize(data)
        got = report["categories"][0]
        self.assertEqual(got["id"], "speed")
        self.assertEqual(got["checks"][0]["id"], "lcp95")
        self.assertEqual(got["checks"][1]["lost"], 3)
        self.assertEqual(got["checks"][0]["evidenceAt"], "2026-10-12T01:45:22Z")

    def test_rejects_empty_or_malformed_source_without_faking_evidence(self):
        with self.assertRaises(MODULE.InspectionError):
            MODULE.summarize({"schema": 1, "overallScore": 100, "categories": []})
        with self.assertRaises(MODULE.InspectionError):
            MODULE.summarize({"schema": 1, "overallScore": 100, "categories": [{"id": "speed"}]})
        data = snapshot()
        data["categories"][0]["checks"][0]["earned"] = 101
        with self.assertRaises(MODULE.InspectionError):
            MODULE.summarize(data)

    def test_remote_authority_is_pinned_to_public_endpoint(self):
        with self.assertRaises(MODULE.InspectionError):
            MODULE.fetch_public("https://evil.example/metadata")

    def test_upstream_403_is_explained_without_fabricating_scores(self):
        rejected = HTTPError(MODULE.DEFAULT_URL, 403, "Forbidden", {}, None)
        with patch.object(MODULE.urllib.request, "urlopen", side_effect=rejected):
            with self.assertRaises(MODULE.InspectionError) as error:
                MODULE.fetch_public()
        self.assertIn("HTTP 403", str(error.exception))
        self.assertIn("--file", str(error.exception))
        self.assertIn("No score JSON was received", str(error.exception))


if __name__ == "__main__":
    unittest.main()
