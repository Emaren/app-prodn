import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import scripts.aoe2_speed_pulse as pulse


class SpeedPulseTests(unittest.TestCase):
    def test_material_regression_requires_percent_and_floor(self):
        previous = {
            "summary": {
                "ttfb_median_seconds": 0.4,
                "total_median_seconds": 0.6,
            }
        }
        current = {
            "ttfb_median_seconds": 0.7,
            "total_median_seconds": 1.0,
        }
        self.assertTrue(
            pulse.comparison(current, previous)["material_regression"]
        )

    def test_small_absolute_noise_is_not_material(self):
        previous = {
            "summary": {
                "ttfb_median_seconds": 0.1,
                "total_median_seconds": 0.2,
            }
        }
        current = {
            "ttfb_median_seconds": 0.14,
            "total_median_seconds": 0.26,
        }
        self.assertFalse(
            pulse.comparison(current, previous)["material_regression"]
        )

    def test_curl_sample_parses_real_tab_delimiters(self):
        completed = subprocess.CompletedProcess(
            args=["curl"],
            returncode=0,
            stdout="200\t0.123\t0.456",
            stderr="",
        )
        with mock.patch.object(
            pulse.subprocess,
            "run",
            return_value=completed,
        ):
            row = pulse.curl_sample(
                "https://aoe2war.com",
                "/",
                15,
            )
        self.assertTrue(row["ok"])
        self.assertEqual(row["http_code"], 200)
        self.assertAlmostEqual(row["ttfb_seconds"], 0.123)
        self.assertAlmostEqual(row["total_seconds"], 0.456)

    def test_receipt_is_strict_single_json_document(self):
        with tempfile.TemporaryDirectory() as tmp:
            receipt_dir = Path(tmp)
            healthy = {
                "route": "/",
                "url": "https://aoe2war.com/",
                "ok": True,
                "http_code": 200,
                "ttfb_seconds": 0.123,
                "total_seconds": 0.456,
            }
            with (
                mock.patch.object(pulse, "RECEIPT_DIR", receipt_dir),
                mock.patch.object(
                    pulse,
                    "release_identity",
                    return_value={
                        "release_sha": "a" * 40,
                        "build_version": "test",
                        "active_build_id": "test-build",
                        "release_state": "CERTIFIED",
                    },
                ),
                mock.patch.object(
                    pulse,
                    "curl_sample",
                    return_value=healthy,
                ),
            ):
                payload = pulse.pulse(
                    base_url="https://aoe2war.com",
                    routes=("/",),
                    rounds=1,
                    timeout=15,
                )

            raw = Path(payload["receipt_path"]).read_text(encoding="utf-8")
            parsed = json.loads(raw)
            self.assertEqual(parsed["status"], "PASS")
            self.assertEqual(parsed["summary"]["ok_count"], 1)


if __name__ == "__main__":
    unittest.main()
