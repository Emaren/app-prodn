import tempfile
import unittest
from pathlib import Path

import scripts.aoe2_dev as dev


class DevTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(
            dev.slugify(
                " Direct Chat 2 "
            ),
            "direct-chat-2",
        )

    def test_local_database_urls_only(self):
        self.assertTrue(
            dev.database_url_is_local(
                "postgresql://u:p@127.0.0.1:5432/db"
            )
        )

        self.assertTrue(
            dev.database_url_is_local(
                "postgresql://u:p@localhost/db"
            )
        )

        self.assertFalse(
            dev.database_url_is_local(
                "postgresql://u:p@example.com/db"
            )
        )

    def test_dependency_fingerprint_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)

            (root / "package.json").write_text(
                '{"dependencies":{"a":"1"}}'
            )
            (root / "yarn.lock").write_text(
                "first\n"
            )

            first = (
                dev.dependency_fingerprint(root)
            )

            (root / "yarn.lock").write_text(
                "second\n"
            )

            second = (
                dev.dependency_fingerprint(root)
            )

            self.assertNotEqual(
                first,
                second,
            )


if __name__ == "__main__":
    unittest.main()
