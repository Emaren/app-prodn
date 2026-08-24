import unittest
from pathlib import Path

import scripts.aoe2_facts as facts


class FactsTests(unittest.TestCase):
    def test_missing_operator_repo_is_nonfatal(self):
        self.assertIsNone(
            facts.git_value(
                Path(
                    "/definitely/not/a/real/"
                    "aoe2war/repository"
                ),
                "rev-parse",
                "HEAD",
            )
        )

    def test_machine_contract_has_development_facts(self):
        payload = facts.collect()

        self.assertEqual(
            payload["development"][
                "shadow_database"
            ],
            "aoe2hdbets_shadow",
        )

        self.assertFalse(
            payload["development"][
                "production_database_mutation"
            ]
        )

        self.assertEqual(
            payload["production"][
                "managed_media_root"
            ],
            "/mnt/HC_Volume_105319120/"
            "aoe2-managed-assets",
        )


if __name__ == "__main__":
    unittest.main()
