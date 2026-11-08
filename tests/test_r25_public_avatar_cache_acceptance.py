import unittest

from scripts.r25_public_avatar_cache_acceptance import (
    AvatarCacheReceipt,
    CACHE_EXPECTED,
    MAX_IMAGE_BYTES,
    PATH,
    verify,
    fetch,
)

SOURCE = "a" * 40
BUILD = "build-20261108-abc"
SHA = "f" * 64


def receipt(**kwargs):
    data = dict(
        status=200,
        content_type="image/webp",
        media_proxy="direct-public",
        fallback="1",
        cache_control=CACHE_EXPECTED,
        source=SOURCE,
        build=BUILD,
        length=59818,
        sha256=SHA,
    )
    data.update(kwargs)
    return AvatarCacheReceipt(**data)


class AvatarCacheAdmissionTests(unittest.TestCase):
    def test_explicit_60_second_fallback_is_a_separate_nonrelease_receipt(self):
        report = verify(receipt(), SOURCE, BUILD)
        self.assertEqual(report["status"], "PASS_FALLBACK_BOUNDED_CACHE")
        self.assertEqual(report["checked"], 1)
        self.assertFalse(report["financial_authorized"])
        self.assertFalse(report["accepts_as_full_site_release"])
        self.assertTrue(report["read_only"])

    def test_original_full_day_seven_day_stale_fallback_is_hard_hold(self):
        with self.assertRaisesRegex(ValueError, "HOLD_FALLBACK_STALE_OR_UNBOUNDED_CACHE"):
            verify(receipt(cache_control="public, max-age=86400, stale-while-revalidate=604800"), SOURCE, BUILD)

    def test_unknown_fallback_policy_cannot_claim_a_correct_assignment(self):
        for proof in [receipt(fallback=""), receipt(media_proxy="direct-managed")]:
            with self.subTest(proof=proof), self.assertRaisesRegex(ValueError, "HOLD_FALLBACK_NOT_EXPLICITLY_IDENTIFIED"):
                verify(proof, SOURCE, BUILD)

    def test_runtime_source_and_build_must_be_exact(self):
        for proof in [receipt(source="b" * 40), receipt(build="build-other")]:
            with self.subTest(proof=proof), self.assertRaisesRegex(ValueError, "HOLD_FALLBACK_WRONG_RUNTIME_IDENTITY"):
                verify(proof, SOURCE, BUILD)
        for expected in [("", BUILD), (SOURCE[:12], BUILD), (SOURCE, "bad build")]:
            with self.subTest(expected=expected), self.assertRaisesRegex(ValueError, "HOLD_UNPINNED_CANDIDATE_IDENTITY"):
                verify(receipt(), *expected)

    def test_wrong_status_mime_and_bounds_cannot_pass(self):
        scenarios = [
            (receipt(status=307), "HOLD_FALLBACK_HTTP_NOT_200"),
            (receipt(content_type="text/html"), "HOLD_FALLBACK_INVALID_IMAGE_TYPE"),
            (receipt(length=MAX_IMAGE_BYTES + 1), "HOLD_FALLBACK_BODY_INVALID"),
            (receipt(length=0), "HOLD_FALLBACK_BODY_INVALID"),
            (receipt(sha256="not-a-sha"), "HOLD_FALLBACK_BODY_INVALID"),
        ]
        for proof, hold in scenarios:
            with self.subTest(reason=hold), self.assertRaisesRegex(ValueError, hold):
                verify(proof, SOURCE, BUILD)

    def test_probe_is_fixed_to_noncustomer_unknown_public_avatar(self):
        self.assertEqual(PATH, "/api/media-assets/avatar/missing-public-r25-test-avatar?size=card")

    def test_legacy_financial_endpoints_and_external_hosts_are_denied(self):
        from scripts.r25_public_avatar_parity import safe_origin
        for origin in [
            "http://127.0.0.1:8092",
            "http://127.0.0.1:8094",
            "https://aoe2war.com",
            "http://localhost:3033",
            "http://127.0.0.1:3033/admin",
            "http://127.0.0.1:3033?token=x",
        ]:
            with self.subTest(origin=origin), self.assertRaisesRegex(ValueError, "HOLD_"):
                safe_origin(origin, "AVATAR_CANDIDATE_ORIGIN")

    def test_no_implicit_network_execution_during_module_import_or_verification(self):
        # fetch() is an explicit opt-in command and is never called by verify().
        self.assertTrue(callable(fetch))
        self.assertEqual(verify(receipt(), SOURCE, BUILD)["body_sha256"], SHA)


if __name__ == "__main__":
    unittest.main()
