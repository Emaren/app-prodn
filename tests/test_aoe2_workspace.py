import unittest
from pathlib import Path
from unittest import mock

import scripts.aoe2_workspace as workspace


class WorkspaceTests(unittest.TestCase):
    def test_porcelain_parser_keeps_all_worktrees(self):
        raw = (
            "worktree /one\n"
            "HEAD a\n"
            "branch refs/heads/main\n"
            "\n"
            "worktree /two\n"
            "HEAD b\n"
            "detached\n"
        )

        blocks = workspace.parse_worktree_porcelain(raw)

        self.assertEqual(len(blocks), 2)
        self.assertIn("worktree /one", blocks[0])
        self.assertIn("worktree /two", blocks[1])

    def test_clean_merged_is_cleanup_candidate(self):
        self.assertEqual(
            workspace.classify(
                main=False,
                dirty=False,
                merged=True,
                detached=False,
            ),
            "CLEANUP_CANDIDATE",
        )

    def test_dirty_is_never_cleanup_candidate(self):
        self.assertEqual(
            workspace.classify(
                main=False,
                dirty=True,
                merged=True,
                detached=False,
            ),
            "PRESERVE_DIRTY_REVIEW",
        )

    def test_unmerged_is_active(self):
        self.assertEqual(
            workspace.classify(
                main=False,
                dirty=False,
                merged=False,
                detached=False,
            ),
            "ACTIVE_UNMERGED",
        )

    def test_workspace_id_is_stable_and_path_safe(self):
        self.assertEqual(
            workspace.workspace_id(
                "api-prodn",
                "codex/hd-parser-closure-v1",
            ),
            "api-prodn--codex-hd-parser-closure-v1",
        )

    def test_retirement_normalizes_registered_worktree_path_aliases(self):
        meta = {
            "workspace_id": "api-prodn--codex-test",
            "repo_id": "api-prodn",
            "path": "/tmp/api-prodn-codex-test",
        }
        row = {
            "path": "/tmp/alias/../api-prodn-codex-test",
            "branch": "codex/test",
            "head": "a" * 40,
            "dirty": False,
            "merged_into_canonical": False,
        }
        with (
            mock.patch.object(workspace, "find_workspace", return_value=meta),
            mock.patch.object(
                workspace,
                "repo_spec",
                return_value={
                    "repo_id": "api-prodn",
                    "path": Path("/tmp/api-prodn"),
                    "branch": "main",
                },
            ),
            mock.patch.object(workspace, "worktree_rows", return_value=[row]),
            mock.patch.object(
                workspace,
                "upstream_state",
                return_value={
                    "upstream": "origin/codex/test",
                    "upstream_head": "a" * 40,
                    "fully_pushed": True,
                },
            ),
        ):
            plan = workspace.retirement_plan(
                "api-prodn--codex-test"
            )

        self.assertTrue(plan["safe"])
        self.assertEqual(plan["status"], "READY")

    def test_retirement_blocks_dirty_agent_workspace(self):
        meta = {
            "workspace_id": "api-prodn--codex-test",
            "repo_id": "api-prodn",
            "path": "/tmp/api-prodn-codex-test",
        }
        row = {
            "path": "/tmp/api-prodn-codex-test",
            "branch": "codex/test",
            "head": "a" * 40,
            "dirty": True,
            "merged_into_canonical": False,
        }
        with (
            mock.patch.object(workspace, "find_workspace", return_value=meta),
            mock.patch.object(
                workspace,
                "repo_spec",
                return_value={
                    "repo_id": "api-prodn",
                    "path": Path("/tmp/api-prodn"),
                    "branch": "main",
                },
            ),
            mock.patch.object(workspace, "worktree_rows", return_value=[row]),
            mock.patch.object(
                workspace,
                "upstream_state",
                return_value={
                    "upstream": "origin/codex/test",
                    "fully_pushed": True,
                },
            ),
        ):
            plan = workspace.retirement_plan(
                "api-prodn--codex-test"
            )

        self.assertFalse(plan["safe"])
        self.assertEqual(plan["status"], "BLOCKED")
        self.assertEqual(plan["reason"], "dirty worktree")

    def test_retirement_allows_clean_fully_pushed_workspace(self):
        meta = {
            "workspace_id": "api-prodn--codex-test",
            "repo_id": "api-prodn",
            "path": "/tmp/api-prodn-codex-test",
        }
        row = {
            "path": "/tmp/api-prodn-codex-test",
            "branch": "codex/test",
            "head": "a" * 40,
            "dirty": False,
            "merged_into_canonical": False,
        }
        with (
            mock.patch.object(workspace, "find_workspace", return_value=meta),
            mock.patch.object(
                workspace,
                "repo_spec",
                return_value={
                    "repo_id": "api-prodn",
                    "path": Path("/tmp/api-prodn"),
                    "branch": "main",
                },
            ),
            mock.patch.object(workspace, "worktree_rows", return_value=[row]),
            mock.patch.object(
                workspace,
                "upstream_state",
                return_value={
                    "upstream": "origin/codex/test",
                    "upstream_head": "a" * 40,
                    "fully_pushed": True,
                },
            ),
        ):
            plan = workspace.retirement_plan(
                "api-prodn--codex-test"
            )

        self.assertTrue(plan["safe"])
        self.assertEqual(plan["status"], "READY")
        self.assertIn("fully pushed", plan["reason"])

    def test_retirement_blocks_clean_unpushed_unique_commits(self):
        meta = {
            "workspace_id": "api-prodn--codex-test",
            "repo_id": "api-prodn",
            "path": "/tmp/api-prodn-codex-test",
        }
        row = {
            "path": "/tmp/api-prodn-codex-test",
            "branch": "codex/test",
            "head": "a" * 40,
            "dirty": False,
            "merged_into_canonical": False,
        }
        with (
            mock.patch.object(workspace, "find_workspace", return_value=meta),
            mock.patch.object(
                workspace,
                "repo_spec",
                return_value={
                    "repo_id": "api-prodn",
                    "path": Path("/tmp/api-prodn"),
                    "branch": "main",
                },
            ),
            mock.patch.object(workspace, "worktree_rows", return_value=[row]),
            mock.patch.object(
                workspace,
                "upstream_state",
                return_value={
                    "upstream": None,
                    "fully_pushed": False,
                },
            ),
        ):
            plan = workspace.retirement_plan(
                "api-prodn--codex-test"
            )

        self.assertFalse(plan["safe"])
        self.assertIn("not proven pushed", plan["reason"])


if __name__ == "__main__":
    unittest.main()
