from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_code_health.py"
SPEC = importlib.util.spec_from_file_location("aoe2_code_health", MODULE_PATH)
assert SPEC and SPEC.loader
code_health = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(code_health)


class CodeHealthTests(unittest.TestCase):
    def test_analyze_file_counts_lines_markers_and_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_root = code_health.ROOT
            try:
                code_health.ROOT = Path(tmp)
                path = Path(tmp) / "sample.ts"
                path.write_text("const x = 1;\n// TODO split this\n", encoding="utf-8")
                row = code_health.analyze_file(path)
            finally:
                code_health.ROOT = old_root

        self.assertEqual(row["path"], "sample.ts")
        self.assertEqual(row["lines"], 2)
        self.assertEqual(row["todos"], 1)
        self.assertEqual(len(row["sha256"]), 64)


    def test_analyze_file_marks_client_boundary_and_imports(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_root = code_health.ROOT
            try:
                code_health.ROOT = Path(tmp)
                path = Path(tmp) / "client.tsx"
                path.write_text(
                    '"use client";\n\nimport x from "x";\nimport y from "y";\nexport default function A() { return null; }\n',
                    encoding="utf-8",
                )
                row = code_health.analyze_file(path)
            finally:
                code_health.ROOT = old_root

        self.assertTrue(row["client_boundary"])
        self.assertEqual(row["import_count"], 2)

    def test_duplicate_groups_counts_avoidable_bytes(self):
        rows = [
            {"path": "a.ts", "bytes": 1000, "sha256": "a" * 64},
            {"path": "b.ts", "bytes": 1000, "sha256": "a" * 64},
            {"path": "c.ts", "bytes": 1000, "sha256": "a" * 64},
            {"path": "d.ts", "bytes": 1000, "sha256": "b" * 64},
        ]
        groups = code_health.duplicate_groups(rows)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["copies"], 3)
        self.assertEqual(groups[0]["avoidable_bytes"], 2000)

    def test_human_bytes_is_operator_readable(self):
        self.assertEqual(code_health.human_bytes(1024), "1.0 KiB")
        self.assertEqual(code_health.human_bytes(1024 * 1024), "1.0 MiB")


if __name__ == "__main__":
    unittest.main()
