import unittest
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

        blocks = workspace.parse_worktree_porcelain(
            raw
        )

        self.assertEqual(
            len(blocks),
            2,
        )
        self.assertIn(
            "worktree /one",
            blocks[0],
        )
        self.assertIn(
            "worktree /two",
            blocks[1],
        )

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


if __name__ == "__main__":
    unittest.main()
