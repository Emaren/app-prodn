from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_speed_build.py"
SPEC = importlib.util.spec_from_file_location("aoe2_speed_build", MODULE_PATH)
assert SPEC and SPEC.loader
speed_build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(speed_build)


class SpeedBuildTests(unittest.TestCase):
    def test_snapshot_counts_static_and_route_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            static = root / ".next" / "static" / "chunks"
            static.mkdir(parents=True)
            (static / "a.js").write_bytes(b"a" * 100)
            (static / "b.js").write_bytes(b"b" * 200)
            css = root / ".next" / "static" / "css"
            css.mkdir(parents=True)
            (css / "x.css").write_bytes(b"x" * 50)

            (root / ".next" / "app-build-manifest.json").write_text(
                json.dumps(
                    {
                        "pages": {
                            "/page": [
                                "static/chunks/a.js",
                                "static/chunks/b.js",
                                "static/css/x.css",
                            ]
                        }
                    }
                ),
                encoding="utf-8",
            )

            payload = speed_build.snapshot(root)

        self.assertEqual(payload["static"]["total_files"], 3)
        self.assertEqual(payload["static"]["total_bytes"], 350)
        self.assertEqual(payload["static"]["largest_js_bytes"], 200)
        self.assertEqual(payload["routes"]["manifest_route_count"], 1)
        self.assertEqual(payload["routes"]["largest_route_js_bytes"], 300)

    def test_normalize_manifest_path_handles_next_prefix(self):
        self.assertEqual(
            speed_build.normalize_manifest_path("/_next/static/chunks/a.js"),
            "static/chunks/a.js",
        )

    def test_human_bytes(self):
        self.assertEqual(speed_build.human_bytes(1024), "1.0 KiB")


if __name__ == "__main__":
    unittest.main()
