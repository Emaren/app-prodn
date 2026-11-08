import unittest

from scripts.r25_public_avatar_parity import (
    MediaProof, check_targets, safe_origin, verify,
)

def proof(hash: str, *, proxy: str = "direct-managed", size: int = 100) -> MediaProof:
    return MediaProof(hash, proxy, "image/webp", size)

A = "a" * 64
B = "b" * 64
C = "c" * 64
TARGETS = ["user-u-" + x * 32 + "-featured" for x in "abc"]


class AvatarParityTests(unittest.TestCase):
    def test_exact_managed_distinct_portraits_pass(self):
        a = [proof(A), proof(B), proof(C)]
        outcome = verify(a, list(a))
        self.assertEqual(outcome["status"], "PASS_PUBLIC_AVATAR_PARITY")
        self.assertEqual(outcome["checked"], 3)
        self.assertEqual(outcome["distinct_managed_portraits"], 3)
        self.assertFalse(outcome["accepts_as_full_site_release"])
        self.assertFalse(outcome["financial_authorized"])

    def test_catches_same_generic_silhouette_for_every_player(self):
        with self.assertRaisesRegex(ValueError, "HOLD_CANDIDATE_RETURNED_FALLBACK"):
            verify([proof(A), proof(B), proof(C)],
                   [proof(A, proxy="direct-public")] * 3)

    def test_catches_wrong_player_with_real_different_managed_image(self):
        with self.assertRaisesRegex(ValueError, "HOLD_IMAGE_CONTENT_OR_IDENTITY_MISMATCH"):
            verify([proof(A), proof(B), proof(C)], [proof(C), proof(B), proof(A)])

    def test_catches_three_same_images_even_if_managed(self):
        with self.assertRaisesRegex(ValueError, "HOLD_LEGACY_NOT_THREE_DISTINCT_PORTRAITS"):
            verify([proof(A)] * 3, [proof(A)] * 3)

    def test_no_inadequate_sample(self):
        with self.assertRaisesRegex(ValueError, "HOLD_AVATAR_INSUFFICIENT_PARITY"):
            verify([proof(A)] * 2, [proof(A)] * 2)

    def test_targets_validate_public_user_handles(self):
        self.assertEqual(check_targets(TARGETS), TARGETS)
        with self.assertRaisesRegex(ValueError, "HOLD_DUPLICATE_AVATAR_HANDLE"):
            check_targets([TARGETS[0]] * 3)
        with self.assertRaisesRegex(ValueError, "HOLD_UNREVIEWED_AVATAR_HANDLE"):
            check_targets(TARGETS[:2] + ["../internal"])

    def test_only_loopback_nonfinancial_http(self):
        self.assertEqual(safe_origin("http://127.0.0.1:3032", "CANDIDATE_ORIGIN"),
                         "http://127.0.0.1:3032")
        for url in ["https://aoe2war.com", "http://127.0.0.2:3030",
                    "http://127.0.0.1:8092", "http://127.0.0.1:8094",
                    "http://127.0.0.1:3030/private", "http://127.0.0.1:3030?q=x"]:
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "HOLD_"):
                safe_origin(url, "BAD_ORIGIN")


if __name__ == "__main__":
    unittest.main()
