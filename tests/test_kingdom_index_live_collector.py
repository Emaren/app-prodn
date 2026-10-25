"""Contract tests for the read-only GitHub artifact -> private live candidate feed."""
import hashlib
import io
import json
import os
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from scripts import kingdom_index_live_collector as feed

SHA = "a" * 40
BUILD = "ExampleBuild-123"


def fixture():
    routes = []
    files = {}
    hashes = {}
    for index in range(88):
        href = "/route-" + str(index)
        measured = index < 2
        routes.append({
            "route": href,
            "status": "PASS" if measured else "UNMEASURED",
            "certified": False, "score": None
        })
        if measured:
            raw = json.dumps({
                "route": href, "status": "PASS", "source_sha": SHA,
                "build_id": BUILD, "certified": False, "quality_score": None,
                "views": [
                    {"accessibilityScan": {
                        "status": "MEASURED",
                        "seriousOrCritical": 1 if index == 0 else 0
                    }},
                    {"accessibilityScan": {
                        "status": "MEASURED", "seriousOrCritical": 0
                    }}
                ]
            }).encode()
            files["route-" + str(index) + ".json"] = raw
            hashes[href] = hashlib.sha256(raw).hexdigest()
    coverage = {
        "schema": "aoe2war.renaissance.public88.candidate-coverage.v1",
        "candidate_only": True, "certified": False, "score": None,
        "production_release_authority": "NOT_PROVIDED",
        "source_sha": SHA, "build_id": BUILD,
        "routes": routes, "routes_observed": 2,
        "statuses": {"PASS": 2, "FAIL": 0, "UNKNOWN": 0, "UNMEASURED": 86},
        "route_digest_sha256": hashes
    }
    files["coverage.json"] = json.dumps(coverage).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zipped:
        for name, data in files.items():
            zipped.writestr(name, data)
    return out.getvalue(), coverage


def run_info():
    return {
        "id": 100001, "status": "completed", "conclusion": "success",
        "head_sha": SHA, "updated_at": datetime.now(timezone.utc).isoformat()
    }


class LiveCollectorTest(unittest.TestCase):
    def test_original_route_digests_and_source_verify(self):
        archive, _ = fixture()
        coverage, digest, axe = feed.extract_coverage(archive)
        self.assertEqual(axe, {"scannedRoutes": 2, "affectedRoutes": 1})
        self.assertEqual(digest, hashlib.sha256(json.dumps(coverage).encode()).hexdigest())
        normalized = feed.normalize(coverage, run_info(),
                                    hashlib.sha256(archive).hexdigest(), digest, axe)
        self.assertEqual(normalized["counts"]["PASS"], 2)
        self.assertEqual(normalized["counts"]["UNMEASURED"], 86)
        self.assertIsNone(normalized["score"])
        self.assertFalse(normalized["certified"])

    def test_wrong_source_or_attempted_certification_refused(self):
        archive, coverage = fixture()
        coverage["score"] = 100
        with self.assertRaises(ValueError):
            feed.normalize(coverage, run_info(), "b" * 64, "c" * 64, None)
        coverage["score"] = None
        run = run_info()
        run["head_sha"] = "f" * 40
        with self.assertRaises(ValueError):
            feed.normalize(coverage, run, "b" * 64, "c" * 64, None)

    def test_sha_mutation_inside_zip_refused(self):
        archive, coverage = fixture()
        data = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(archive)) as source:
            with zipfile.ZipFile(data, "w") as output:
                for name in source.namelist():
                    raw = source.read(name)
                    if name == "route-0.json":
                        raw = raw.replace(b'"PASS"', b'"FAIL"')
                    output.writestr(name, raw)
        with self.assertRaisesRegex(ValueError, "SHA or source"):
            feed.extract_coverage(data.getvalue())

    def test_atomically_update_private_file_and_refuse_rollbacks(self):
        archive, _ = fixture()
        coverage, digest, axe = feed.extract_coverage(archive)
        normalized = feed.normalize(coverage, run_info(),
                                    hashlib.sha256(archive).hexdigest(), digest, axe)
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder, 0o700)
            target = str(Path(folder) / "progress.json")
            self.assertEqual(feed.write_atomic(target, normalized), "UPDATED")
            self.assertEqual(feed.write_atomic(target, normalized), "UNCHANGED")
            self.assertEqual(os.stat(target).st_mode & 0o077, 0)
            older = dict(normalized, runId=9)
            with self.assertRaisesRegex(ValueError, "older"):
                feed.write_atomic(target, older)

    def test_world_readable_feed_dir_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder, 0o755)
            with self.assertRaisesRegex(ValueError, "0700"):
                feed.safe_output(str(Path(folder) / "progress.json"))


if __name__ == "__main__":
    unittest.main()
