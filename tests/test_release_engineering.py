import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def state_data(*, local="a", github="a", prod="a", dirty=0, prod_dirty=0,
               reachable=True, staged=None, service="active", active="build",
               parity=True, docs_valid=True, w8092=1, w8093=1):
    return {
        "local": {"dirty_count": dirty, "head": local},
        "github": {"main_sha": github},
        "documentation": {"baseline_is_ancestor_of_local": docs_valid},
        "production": {
            "reachable": reachable,
            "source_sha": prod,
            "dirty_count": prod_dirty,
            "staged_build_id": staged,
            "service": service,
            "active_build_id": active,
            "version_parity": parity,
            "wolo_8092_count": w8092,
            "wolo_8093_count": w8093,
        },
    }


class ReleaseEngineeringTests(unittest.TestCase):
    def test_run_preserves_leading_stdout_space(self):
        rc, out, _ = MODULE.run(
            ["python3", "-c", "import sys; sys.stdout.write(\" M file\\n\")"]
        )
        self.assertEqual(rc, 0)
        self.assertEqual(out, " M file")

    def test_parse_kv(self):
        self.assertEqual(MODULE.parse_kv("head\tabc\nservice\tactive\n"), {"head": "abc", "service": "active"})

    def test_version_value(self):
        self.assertEqual(MODULE.version_value('{"buildVersion":"20260809-test"}'), "20260809-test")

    def test_dirty_paths_handles_rename(self):
        self.assertEqual(MODULE.dirty_paths([" M app/a.ts", "R  old.ts -> new.ts"]), ["app/a.ts", "new.ts"])

    def test_derive_state_dirty_wins(self):
        self.assertEqual(MODULE.derive_state(state_data(dirty=1))[0], "DIRTY")

    def test_derive_state_docs_invalid(self):
        self.assertEqual(MODULE.derive_state(state_data(docs_valid=False))[0], "DOCS_INVALID")

    def test_derive_state_diverged(self):
        self.assertEqual(MODULE.derive_state(state_data(local="b", github="a"))[0], "DIVERGED")

    def test_derive_state_production_dirty(self):
        self.assertEqual(MODULE.derive_state(state_data(prod_dirty=2))[0], "PRODUCTION_DIRTY")

    def test_derive_state_published(self):
        self.assertEqual(MODULE.derive_state(state_data(prod="old"))[0], "PUBLISHED")

    def test_derive_state_staged(self):
        self.assertEqual(MODULE.derive_state(state_data(staged="candidate"))[0], "STAGED")

    def test_derive_state_runtime_unhealthy(self):
        self.assertEqual(MODULE.derive_state(state_data(service="failed"))[0], "RUNTIME_UNHEALTHY")

    def test_derive_state_runtime_unverified(self):
        self.assertEqual(MODULE.derive_state(state_data(parity=False))[0], "RUNTIME_UNVERIFIED")

    def test_derive_state_protected_service_alert(self):
        self.assertEqual(MODULE.derive_state(state_data(w8092=0))[0], "PROTECTED_SERVICE_ALERT")

    def test_derive_state_active_source_parity(self):
        self.assertEqual(MODULE.derive_state(state_data())[0], "ACTIVE_SOURCE_PARITY")


if __name__ == "__main__":
    unittest.main()
