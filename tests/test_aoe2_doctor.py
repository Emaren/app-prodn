from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_doctor.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_doctor", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DoctorTests(unittest.TestCase):
    def test_semver_core(self):
        self.assertEqual(MODULE.semver_core("v24.1.2"), "24.1.2")
        self.assertEqual(MODULE.semver_core("Python 3.13.5"), "3.13.5")
        self.assertIsNone(MODULE.semver_core("unknown"))

    def test_dependency_core_strips_range_prefix(self):
        self.assertEqual(MODULE.dependency_core("^7.4.0"), "7.4.0")
        self.assertEqual(MODULE.dependency_core("15.1.7"), "15.1.7")

    def test_version_prefix_matches(self):
        self.assertTrue(MODULE.version_prefix_matches("Python 3.13.5", "3.13"))
        self.assertFalse(MODULE.version_prefix_matches("Python 3.12.9", "3.13"))

    def test_version_at_least(self):
        self.assertTrue(MODULE.version_at_least("1.2.0", "1.2.0"))
        self.assertTrue(MODULE.version_at_least("v1.3.1", "1.2.0"))
        self.assertFalse(MODULE.version_at_least("1.1.9", "1.2.0"))
        self.assertFalse(MODULE.version_at_least("unknown", "1.2.0"))

    def test_parse_percent(self):
        self.assertEqual(MODULE.parse_percent("87%"), 87)
        self.assertEqual(MODULE.parse_percent("87"), 87)
        self.assertIsNone(MODULE.parse_percent(None))

    def test_map_missing_terms(self):
        self.assertEqual(
            MODULE.map_missing_terms("AoE2WAR Operator Bridge", ["AoE2WAR", "8092"]),
            ["8092"],
        )

    def test_score_deducts_findings(self):
        doctor = MODULE.Doctor()
        doctor.add("WARN", "Host", "x", "x", 2)
        doctor.add("INFO", "Host", "y", "y", 0)
        self.assertEqual(doctor.score(), 98)
        self.assertEqual(doctor.status(), "ATTENTION")

    def test_blocker_sets_unsafe(self):
        doctor = MODULE.Doctor()
        doctor.add("BLOCKER", "Production", "down", "down", 10)
        self.assertEqual(doctor.status(), "UNSAFE")
        self.assertEqual(doctor.category_status("Production"), "FAIL")


if __name__ == "__main__":
    unittest.main()
