"""B canonical-main release scope: protected PRODUCT/financial deny-by-default.

The C PRODUCT guard itself is never widened. Test the exact B-specific
alternative step from the existing PRODUCT workflow with a disposable NUL
path-list fixture; no root, SSH, finance DB or production writes.
"""
from __future__ import annotations
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT=Path(__file__).resolve().parents[1]
WORKFLOW=ROOT/".github/workflows/product-boundary.yml"
SOURCE_GUARD=ROOT/"scripts/product_boundary_guard.py"

def shell_scope():
    s=WORKFLOW.read_text()
    begin=s.index("          git diff --name-only --diff-filter=ACMRTUXB -z")
    end=s.index("          python3 -B -m unittest -q tests.test_r25_b_product_mainline_scope",begin)
    block=textwrap.dedent(s[begin:end])
    assert "while IFS= read -r -d '' path; do" in block
    return block.split("\n",1)[1]

def execute(changes):
    with tempfile.TemporaryDirectory(prefix="b-product-guard-negative-") as temp:
        path=Path(temp)/"b-product-source-paths.nul"
        path.write_bytes(b"".join(x.encode("utf8")+b"\x00" for x in changes))
        env={**os.environ,"RUNNER_TEMP":temp}
        return subprocess.run(["bash","-c",shell_scope()],
                              capture_output=True,text=True,env=env,timeout=15)

class SourceBoundaryTests(unittest.TestCase):
    def test_original_c_guard_still_denies_B_branches(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location("c_strict_guard",SOURCE_GUARD)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertIsNone(module.BRANCH.fullmatch("session-b/v22-root-executor-and-c-artifact-contract-20261111"))
        self.assertIsNone(module.BRANCH.fullmatch("session-b/steam-v23-lease-expiry-race-repair-20261112"))
        self.assertIsNone(module.BRANCH.fullmatch("session-b/steam-v23-c03-observer-completion-retry-20261112"))
        self.assertIsNotNone(module.BRANCH.fullmatch("session-c/safe-product-review"))
        self.assertIn("UNREVIEWED_EXECUTABLE_SURFACE",SOURCE_GUARD.read_text())

    def test_separate_b_branch_requires_same_repo_and_canonical_main(self):
        s=WORKFLOW.read_text()
        self.assertIn("github.event.pull_request.head.repo.full_name != github.repository",s)
        self.assertIn('session-b/v22-root-executor-and-c-artifact-contract-20261111',s)
        self.assertIn('session-b/steam-v23-lease-expiry-race-repair-20261112',s)
        self.assertIn('HOLD:B_RELEASE_BRANCH_UNAUTHORIZED',s)
        self.assertIn('session-b/steam-v23-c03-observer-completion-retry-20261112',s)
        self.assertIn('HOLD:B_V23_C03_OBSERVER_SOURCE_SCOPE',s)
        self.assertIn('HOLD:B_V23_REPAIR_SOURCE_SCOPE',s)
        self.assertIn("github.event.pull_request.base.ref",s)
        self.assertIn('test "$actual_main" = "$BOUNDARY_BASE_SHA"',s)
        self.assertIn('git merge-base --is-ancestor "$BOUNDARY_BASE_SHA" HEAD',s)
        self.assertIn("python3 -I -B scripts/product_boundary_guard.py --check",s)

    def test_linux_builder_and_independent_verifier_require_current_main(self):
        build=(ROOT/".github/workflows/r25-b-source-pinned-linux-release-build-v2.yml").read_text()
        self.assertIn("Require canonical main as an exact ancestor before Linux build",build)
        self.assertIn("Recheck current canonical main at runtime export boundary",build)
        self.assertIn("Recheck current canonical main before independently accepting artifact",build)
        self.assertGreaterEqual(build.count("repos/$GITHUB_REPOSITORY/compare/"),3)
        self.assertIn("github.event.pull_request.base.ref",build)
        self.assertIn("github.event.pull_request.base.sha",build)
        self.assertIn('test "$relation" = ahead -o "$relation" = identical',build)

    def test_actual_B_source_scope_paths_are_bounded(self):
        approved=[
          ".github/workflows/product-boundary.yml",
          ".github/workflows/r25-b-source-pinned-linux-release-build-v2.yml",
          ".github/workflows/r25-b-v22-root-and-uid650-handoff-ci.yml",
          "app/api/auth/session/route.ts",
          "app/api/user/register/route.ts",
          "app/api/admin/delete_user/[uid]/route.ts",
          "lib/c03ProductionAuthServer.ts",
          "lib/adminSession.ts",
          "lib/playerNormalizedStats.ts",
          "scripts/release/r25_v22_three_source_transaction_REVIEW_ONLY.py",
          "scripts/release/r25_b_c03_nonfinancial_sidecar_SCHEMA_REVIEW_ONLY.sql",
          "components/players/PlayerProfilePage.tsx",
          "config/kingdom-index-routes.json",
          "docs/release/SESSION_B_MAINLINE_AND_APP_BACKLOG_RECONCILIATION_20261111.md",
          "tests/test_r25_b_c03_website_source_admission.py",
        ]
        r=execute(approved)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_forbidden_finance_c_product_and_unknown_source_refused(self):
        refused=[
          "prisma/migrations/evil.sql",
          "scripts/product_boundary_guard.py",
          "docs/security/hidden.md",
          "app/api/admin/wolo/holders/route.ts",
          "app/api/user/war-satchel/deposits/route.ts",
          ".github/workflows/unreviewed-finance.yml",
          "app/api/user/other/route.ts",
          "lib/financeShadow.ts",
          "secret.key",
          "FINANCIAL/private/change.txt",
          "scripts/release/native_finance.sh",
          "app/api/user/update_name/finance.sql",
          "components/unknown/FakeBalance.tsx",
        ]
        for path in refused:
            with self.subTest(path=path):
                r=execute([path])
                self.assertEqual(r.returncode,3,r.stdout+r.stderr)
                self.assertIn("HOLD:",r.stdout+r.stderr)

    def test_mixed_allowlisted_and_denied_paths_fail_whole_transaction(self):
        r=execute(["app/api/auth/session/route.ts","prisma/schema.prisma"])
        self.assertEqual(r.returncode,3,r.stdout+r.stderr)

    def test_null_byte_path_fixture_does_not_turn_into_whitespace_bypass(self):
        r=execute(["app/api/auth/session/route.ts","app/api/user/unknown /route.ts"])
        self.assertEqual(r.returncode,3,r.stdout+r.stderr)

if __name__=="__main__":unittest.main()
