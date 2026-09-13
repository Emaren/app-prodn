from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import unittest
from datetime import timezone
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_audit.py"
SPEC = importlib.util.spec_from_file_location("aoe2_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class AuditCommandTests(unittest.TestCase):
    def test_audit_exit_zero_when_clean(self):
        audit = MODULE.Audit()
        self.assertEqual(audit.exit_code(), 0)
        self.assertEqual(audit.estate_status(), "HEALTHY")

    def test_audit_exit_one_for_p1(self):
        audit = MODULE.Audit()
        audit.add("P1", "Documentation", "stale", "test")
        self.assertEqual(audit.exit_code(), 1)
        self.assertEqual(audit.estate_status(), "ATTENTION_REQUIRED")

    def test_audit_exit_two_for_p0(self):
        audit = MODULE.Audit()
        audit.add("P0", "Production", "down", "test")
        self.assertEqual(audit.exit_code(), 2)
        self.assertEqual(audit.estate_status(), "UNSAFE")

    def test_p0_wins_over_p1(self):
        audit = MODULE.Audit()
        audit.add("P1", "Git", "dirty", "test")
        audit.add("P0", "Production", "down", "test")
        self.assertEqual(audit.exit_code(), 2)
        self.assertEqual(audit.count("P0"), 1)
        self.assertEqual(audit.count("P1"), 1)

    def test_area_status(self):
        audit = MODULE.Audit()
        self.assertEqual(audit.area_status("Git"), "PASS")
        audit.add("P1", "Git", "dirty", "test")
        self.assertEqual(audit.area_status("Git"), "WARN")
        audit.add("P0", "Git", "broken", "test")
        self.assertEqual(audit.area_status("Git"), "FAIL")

    def test_manifest_entry_accepts_portable_basename(self):
        digest = "a" * 64
        self.assertEqual(
            MODULE.manifest_entry(f"{digest}  archive.tgz\n"),
            (digest, "archive.tgz"),
        )

    def test_manifest_entry_accepts_binary_marker(self):
        digest = "b" * 64
        self.assertEqual(
            MODULE.manifest_entry(f"{digest} *archive.tgz\n"),
            (digest, "archive.tgz"),
        )

    def test_manifest_entry_rejects_bad_digest(self):
        self.assertIsNone(MODULE.manifest_entry("xyz  archive.tgz"))

    def test_archive_timestamp(self):
        value = MODULE.archive_timestamp(
            "AoE2HDBets-context-Tonys_Laptop-20260810-163416.tgz"
        )
        self.assertIsNotNone(value)
        assert value is not None
        self.assertEqual(value.tzinfo, timezone.utc)
        self.assertEqual((value.hour, value.minute, value.second), (16, 34, 16))

    def test_archive_timestamp_rejects_unknown_name(self):
        self.assertIsNone(MODULE.archive_timestamp("context-latest.tgz"))

    def test_payload_is_json_serializable(self):
        audit = MODULE.Audit()
        audit.add("P1", "Git", "dirty", "one")
        encoded = json.dumps(audit.payload())
        self.assertIn('"p1": 1', encoded)

    def test_sha256(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "x"
            path.write_bytes(b"abc")
            self.assertEqual(
                MODULE.sha256(path),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )

    def test_merge_audit_preserves_order_and_rejects_info_collisions(self):
        target = MODULE.Audit()
        target.add("P1", "Git", "first", "one")
        target.info["one"] = 1
        source = MODULE.Audit()
        source.add("P1", "Documentation", "second", "two")
        source.info["two"] = 2
        MODULE.merge_audit(target, source)
        self.assertEqual([item.key for item in target.findings], ["first", "second"])
        self.assertEqual(target.info, {"one": 1, "two": 2})

        duplicate = MODULE.Audit()
        duplicate.info["one"] = 3
        with self.assertRaisesRegex(RuntimeError, "namespace collision"):
            MODULE.merge_audit(target, duplicate)

    def test_collect_audit_overlaps_independent_domains_and_merges_serial_order(self):
        source_started = threading.Event()
        docs_started = threading.Event()
        snapshots = {"app-prodn": {"head": "a" * 40}}

        def source_check(audit):
            source_started.set()
            self.assertTrue(docs_started.wait(1.0))
            audit.add("P1", "Git", "source", "source")
            return snapshots

        def checker(key, area):
            def run(audit, *args):
                if key == "docs":
                    docs_started.set()
                    self.assertTrue(source_started.wait(1.0))
                if key == "central":
                    self.assertEqual(args[0], snapshots)
                audit.add("P1", area, key, key)
            return run

        with (
            patch.object(MODULE, "check_source_repositories", side_effect=source_check),
            patch.object(MODULE, "check_source_documentation", side_effect=checker("docs", "Documentation")),
            patch.object(MODULE, "check_central_state", side_effect=checker("central", "Documentation")),
            patch.object(MODULE, "check_taxonomy", side_effect=checker("taxonomy", "Documentation")),
            patch.object(MODULE, "check_central_quality_gates", side_effect=checker("quality", "Documentation")),
            patch.object(MODULE, "check_maps", side_effect=checker("maps", "Estate Maps")),
            patch.object(MODULE, "check_context_archives", side_effect=checker("context", "Context Durability")),
            patch.object(MODULE, "check_production", side_effect=checker("production", "Production")),
            patch.object(MODULE, "check_wolo_vps_split", side_effect=checker("wolo", "WoloChain")),
        ):
            audit = MODULE.collect_audit()

        self.assertEqual(
            [item.key for item in audit.findings],
            ["source", "docs", "central", "taxonomy", "quality", "maps", "context", "production", "wolo"],
        )


    def test_legacy_archive_validation_contract_is_fail_closed(self):
        source = SCRIPT.read_text()
        self.assertIn("except TypeError:", source)
        self.assertIn("member.issym() or member.islnk()", source)
        self.assertIn("member.isdev() or member.isfifo()", source)
        self.assertIn("archive member escapes checkout", source)


if __name__ == "__main__":
    unittest.main()
