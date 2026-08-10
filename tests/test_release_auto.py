import importlib.util
import pathlib
import unittest

SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "aoe2_release_auto.py"
)
SPEC = importlib.util.spec_from_file_location("aoe2_release_auto", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    return {
        "local": {
            "branch": "main",
            "dirty_count": 0,
            "head": "a" * 40,
        },
        "documentation": {
            "baseline_is_ancestor_of_local": True,
        },
        "production": {
            "reachable": True,
            "dirty_count": 0,
            "service": "active",
            "version_parity": True,
            "staged_build_id": None,
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
            "source_sha": "b" * 40,
        },
        "certification": {
            "status": "CERTIFIED",
            "release_sha": "b" * 40,
        },
    }


class AutoShipTests(unittest.TestCase):
    def test_preflight_accepts_clean_healthy_release(self):
        self.assertEqual(MODULE.preflight_errors(sample()), [])

    def test_preflight_blocks_dirty_worktree(self):
        data = sample()
        data["local"]["dirty_count"] = 2
        self.assertTrue(
            any("worktree" in item for item in MODULE.preflight_errors(data))
        )

    def test_preflight_blocks_existing_stage(self):
        data = sample()
        data["production"]["staged_build_id"] = "candidate"
        self.assertTrue(
            any("staged candidate" in item for item in MODULE.preflight_errors(data))
        )

    def test_preflight_blocks_noop_release(self):
        data = sample()
        data["production"]["source_sha"] = data["local"]["head"]
        self.assertTrue(
            any("nothing new" in item for item in MODULE.preflight_errors(data))
        )

    def test_documentation_only(self):
        self.assertTrue(
            MODULE.documentation_only(
                [
                    "docs/DOCUMENTATION_CONTROL_PLANE.md",
                    "docs/document-registry.json",
                ]
            )
        )
        self.assertFalse(MODULE.documentation_only(["app/page.tsx"]))
        self.assertFalse(MODULE.documentation_only([]))

    def test_porcelain_paths_handles_rename(self):
        self.assertEqual(
            MODULE.porcelain_paths(
                " M app/a.ts\nR  old.ts -> new.ts\n"
            ),
            {"app/a.ts", "new.ts"},
        )

    def test_final_errors_require_certification(self):
        data = sample()
        release = data["production"]["source_sha"]
        self.assertEqual(MODULE.final_errors(data, release), [])

        data["certification"]["status"] = "legacy-unmanifested"
        self.assertTrue(
            any(
                "certified provenance" in item
                for item in MODULE.final_errors(data, release)
            )
        )

    def test_final_errors_require_wolo_continuity(self):
        data = sample()
        release = data["production"]["source_sha"]
        data["production"]["wolo_8093_count"] = 0
        self.assertTrue(
            any("8093" in item for item in MODULE.final_errors(data, release))
        )


if __name__ == "__main__":
    unittest.main()
