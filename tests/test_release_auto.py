import importlib.util
import pathlib
import subprocess
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

DOCS_SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "docs_v2_check.py"
)
DOCS_SPEC = importlib.util.spec_from_file_location("docs_v2_check", DOCS_SCRIPT)
DOCS = importlib.util.module_from_spec(DOCS_SPEC)
assert DOCS_SPEC and DOCS_SPEC.loader
DOCS_SPEC.loader.exec_module(DOCS)


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


    def test_git_preserves_leading_porcelain_status_space(self):
        original = MODULE.run

        def fake_run(args, *, timeout=300):
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=" M docs/DOCUMENTATION_CONTROL_PLANE.md\n",
                stderr="",
            )

        MODULE.run = fake_run
        try:
            output = MODULE.git(
                "status",
                "--porcelain",
                "--untracked-files=all",
            )
        finally:
            MODULE.run = original

        self.assertTrue(output.startswith(" M "))
        self.assertEqual(
            MODULE.porcelain_paths(output),
            {"docs/DOCUMENTATION_CONTROL_PLANE.md"},
        )

    def test_docs_scanner_excludes_release_operational_state(self):
        operational = pathlib.PurePosixPath(
            ".aoe2war-release/patch-backups/example/docs/"
            "DOCUMENTATION_CONTROL_PLANE.md"
        )
        canonical = pathlib.PurePosixPath(
            "docs/DOCUMENTATION_CONTROL_PLANE.md"
        )

        self.assertTrue(DOCS.is_excluded(operational))
        self.assertFalse(DOCS.is_excluded(canonical))

if __name__ == "__main__":
    unittest.main()
