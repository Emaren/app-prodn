#!/usr/bin/env python3
"""WE1 independent adversarial source-only Scan OS v0.1 tests.

No network, real scanners, receivers, host modification, deletions, or timers.
"""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "scan_os.py"
spec = importlib.util.spec_from_file_location("we1_scan_os_exact", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class VerifiedGuards(unittest.TestCase):
    def setUp(self):
        self.c = m.load_catalog()

    def reject(self, change):
        d = copy.deepcopy(self.c)
        change(d)
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "adversarial.json"
            target.write_text(json.dumps(d))
            with self.assertRaises(m.CatalogError):
                m.load_catalog(target)

    def test_code_ast_has_no_execution_paths(self):
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        forbidden_imports = ("os", "subprocess", "socket", "requests", "urllib", "shutil",
                             "threading", "asyncio", "paramiko", "fabric")
        imports = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]
        imports += [alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names]
        self.assertFalse(any(module == f or module.startswith(f + ".")
                         for module in imports for f in forbidden_imports))
        self.assertFalse(any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                             and node.func.id in ("eval", "exec", "compile")
                             for node in ast.walk(tree)))

    def test_invalid_bool_budget_rejected(self):
        self.reject(lambda d: d["scans"][0].update(budget_seconds=True))

    def test_negative_budget_rejected(self):
        self.reject(lambda d: d["scans"][0].update(budget_seconds=-1))

    def test_unknown_group_shape_rejected(self):
        self.reject(lambda d: d["scans"][0].update(group="not-valid-group"))

    def test_unknown_scope_rejected(self):
        self.reject(lambda d: d["scans"][0].update(scope="FINANCIAL"))

    def test_escape_source_rejected(self):
        self.reject(lambda d: d["scans"][4].update(source_path="scripts/../private/a.py"))

    def test_duplicate_lesson_code_rejected(self):
        self.reject(lambda d: d["lessons"].append(copy.deepcopy(d["lessons"][0])))

    def test_group_different_owner_rejected(self):
        self.reject(lambda d: d["scans"][1].update(owner="WE4"))

    def test_group_different_mode_rejected(self):
        self.reject(lambda d: d["scans"][1].update(mode="SOURCE_CANDIDATE"))

    def test_group_different_admission_rejected(self):
        self.reject(lambda d: d["scans"][1].update(current_admission="SIGNATURE_VERIFIED"))

    def test_path_embedded_newline_rejected(self):
        self.reject(lambda d: d["scans"][4].update(source_path="scripts/other\nscanner.py"))

    def test_path_with_backslash_rejected(self):
        self.reject(lambda d: d["scans"][4].update(source_path=r"scripts\..\private/thing.py"))

    def test_path_double_separator_rejected(self):
        self.reject(lambda d: d["scans"][4].update(source_path="scripts//anything.py"))

    def test_path_dot_component_rejected(self):
        self.reject(lambda d: d["scans"][4].update(source_path="scripts/./anything.py"))

    def test_arbitrary_owner_rejected(self):
        self.reject(lambda d: d["scans"][4].update(owner="ROOT_ALL_ACCESS"))

    def test_arbitrary_mode_rejected(self):
        self.reject(lambda d: d["scans"][4].update(mode="DELETE_ALL"))

    def test_arbitrary_admission_rejected(self):
        self.reject(lambda d: d["scans"][4].update(current_admission="CERTIFIED_DELETE"))

    def test_impossible_goal_scope_pair_rejected(self):
        with self.assertRaises(m.CatalogError):
            m.plan(self.c, goal="health", scope="HEL1_ROOT")

    def test_external_unvalidated_plan_data_refused(self):
        d = copy.deepcopy(self.c)
        d["scans"][0]["source_path"] = "../../private/unsafe"
        with self.assertRaises(m.CatalogError):
            m.plan(d, goal="all")

    def test_identical_producer_split_into_two_groups_rejected(self):
        # Same WE3 source contract and budget must not masquerade as two scans.
        self.reject(lambda d: d["scans"][6].update(
            source_path=d["scans"][5]["source_path"]))

    def test_duplicate_json_object_field_refused(self):
        # Python's default json.loads silently keeps the last repeated key.
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "duplicate-fields.json"
            text = json.dumps(self.c)
            target.write_text(text.replace(
                '"authority": "SOURCE_ONLY_READ_ONLY_NO_EXECUTION"',
                '"authority": "UNREVIEWED_OVERRIDE", "authority": "SOURCE_ONLY_READ_ONLY_NO_EXECUTION"',
                1))
            with self.assertRaises(m.CatalogError):
                m.load_catalog(target)

    def test_catalog_symlink_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = root / "original.json"
            original.write_text(json.dumps(self.c))
            link = root / "alias.json"
            link.symlink_to(original)
            with self.assertRaises(m.CatalogError):
                m.load_catalog(link)


if __name__ == "__main__":
    unittest.main(verbosity=2)
