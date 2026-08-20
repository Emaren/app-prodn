import unittest
import scripts.aoe2_recovery as recovery


class RecoveryTests(unittest.TestCase):
    def test_current_contract_shape_is_evaluable(self):
        payload = recovery.evaluate()
        self.assertIn(
            payload["status"],
            {"VERIFIED", "NOT_VERIFIED"},
        )
        self.assertIn("blockers", payload)
        self.assertIn("operator_free_gib", payload)


if __name__ == "__main__":
    unittest.main()
