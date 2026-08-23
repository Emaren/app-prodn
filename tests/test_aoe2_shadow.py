import unittest

import scripts.aoe2_shadow as shadow


class ShadowTests(unittest.TestCase):
    def test_fk_closure_follows_referenced_parents(self):
        roots = {
            "direct_messages",
        }

        pairs = [
            (
                "direct_messages",
                "direct_conversations",
            ),
            (
                "direct_messages",
                "chat_messages",
            ),
            (
                "direct_conversations",
                "users",
            ),
            (
                "unrelated_child",
                "unrelated_parent",
            ),
        ]

        self.assertEqual(
            shadow.compute_fk_closure(
                roots,
                pairs,
            ),
            {
                "direct_messages",
                "direct_conversations",
                "chat_messages",
                "users",
            },
        )

    def test_fk_closure_handles_cycles(self):
        roots = {
            "direct_messages",
        }

        pairs = [
            (
                "direct_messages",
                "direct_messages",
            ),
            (
                "direct_messages",
                "direct_conversations",
            ),
            (
                "direct_conversations",
                "direct_messages",
            ),
        ]

        self.assertEqual(
            shadow.compute_fk_closure(
                roots,
                pairs,
            ),
            {
                "direct_messages",
                "direct_conversations",
            },
        )


    def test_remote_database_prefix_preserves_bash_expansion(self):
        prefix = shadow.remote_db_prefix()

        self.assertIn(
            'DATABASE_URL="${DATABASE_URL/'
            'postgresql+asyncpg:/postgresql:}"',
            prefix,
        )

        self.assertIn(
            "aoe2hdbets-web.service",
            prefix,
        )

        self.assertNotIn(
            "__AOE2WAR_SERVICE__",
            prefix,
        )



    def test_pg17_compatibility_lines_are_filtered(self):
        self.assertTrue(
            shadow.is_pg_dump_compatibility_line(
                b"\\restrict abc123\n"
            )
        )

        self.assertTrue(
            shadow.is_pg_dump_compatibility_line(
                b"\\unrestrict abc123\n"
            )
        )

        self.assertTrue(
            shadow.is_pg_dump_compatibility_line(
                b"SET transaction_timeout = 0;\n"
            )
        )

        self.assertFalse(
            shadow.is_pg_dump_compatibility_line(
                b"COPY public.direct_messages "
                b"(id) FROM stdin;\n"
            )
        )



if __name__ == "__main__":
    unittest.main()
