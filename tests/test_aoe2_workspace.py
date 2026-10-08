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

    def test_registered_persistent_workspace_is_preserved_after_merge(self):
        self.assertEqual(
            workspace.classify_registered_workspace(
                dirty=False,
                merged=True,
                preserve_when_merged=True,
            ),
            "AGENT_PRESERVED",
        )

    def test_registered_normal_workspace_remains_retireable_after_merge(self):
        self.assertEqual(
            workspace.classify_registered_workspace(
                dirty=False,
                merged=True,
                preserve_when_merged=False,
            ),
            "AGENT_RETIREABLE",
        )

    def test_registered_persistent_workspace_with_unique_commits_stays_active(self):
        self.assertEqual(
            workspace.classify_registered_workspace(
                dirty=False,
                merged=False,
                preserve_when_merged=True,
            ),
            "AGENT_ACTIVE_UNMERGED",
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

    def test_missing_registered_worktree_is_stale_metadata_not_chdir_failure(self):
        raw = (
            "worktree /canonical\n"
            "HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
            "branch refs/heads/main\n"
            "\n"
            "worktree /definitely/missing/aoe2war-worktree\n"
            "HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
            "branch refs/heads/fix/missing\n"
            "prunable gitdir file points to non-existent location\n"
        )
        spec = {
            "repo_id": "app-prodn",
            "path": Path("/canonical"),
            "branch": "main",
        }
        with (
            mock.patch.object(workspace, "git", side_effect=["a" * 40, raw]),
            mock.patch.object(Path, "resolve", lambda self: self),
            mock.patch.object(
                Path,
                "exists",
                lambda self: str(self) == "/canonical",
            ),
            mock.patch.object(workspace, "run") as run_mock,
        ):
            rows = workspace.worktree_rows(spec)

        stale = next(
            row for row in rows
            if row["path"].endswith("aoe2war-worktree")
        )
        self.assertEqual(
            stale["classification"],
            "STALE_GIT_WORKTREE_METADATA",
        )
        self.assertTrue(stale["stale_git_metadata"])
        run_mock.assert_called_once()

    def test_clean_prunes_stale_git_metadata_before_removal_candidates(self):
        before = {
            "cleanup_candidates": [],
            "stale_git_worktrees": [
                {
                    "repo_id": "app-prodn",
                    "classification": "STALE_GIT_WORKTREE_METADATA",
                }
            ],
            "stale_metadata": [],
        }
        after = {
            "cleanup_candidates": [],
            "stale_git_worktrees": [],
            "stale_metadata": [],
        }
        with (
            mock.patch.object(
                workspace,
                "snapshot",
                side_effect=[before, after],
            ),
            mock.patch.object(
                workspace,
                "repo_spec",
                return_value={
                    "repo_id": "app-prodn",
                    "path": Path("/repo"),
                    "branch": "main",
                },
            ),
            mock.patch.object(
                workspace,
                "run",
                return_value=(0, "Removing stale worktree"),
            ),
            mock.patch.object(
                workspace,
                "write_json_receipt",
                return_value="/receipt.json",
            ),
        ):
            result = workspace.clean(apply=True)

        self.assertEqual(
            len(result["pruned_stale_git_metadata"]),
            1,
        )
        self.assertEqual(result["failed"], [])


if __name__ == "__main__":
    unittest.main()
