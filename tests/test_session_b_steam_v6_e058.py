"""Nonfinancial Steam-only egress v6: exact current public release and negative authority tests."""

import hashlib
import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch

SOURCE = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts/release/r25_steam_refresh_live_e058_v6.py"
)
spec = importlib.util.spec_from_file_location("steam_v6_e058", SOURCE)
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def receipt():
    return {
        "schema": "aoe2war.session-b.inplace-r25.v1",
        "status": "PASS_NEW_R25_INPLACE_PUBLIC_NONFINANCIAL",
        "source_sha": m.GIT_SHA,
        "build_version": m.RELEASE,
        "build_id": m.BUILD_ID,
        "old_3032_pid": m.OLD_LIVE_PID,
        "new_pid": 2856449,
        "protected_pids": {
            "aoe2hdbets-web.service": int(m.PRIOR_PID),
            "wolochaind-mainnet.service": 1009,
        },
        "safe_web_rollback_saved": str(m.OLD_ROLLBACK_STAGE),
        "avatar_parity": "PASS_THREE_MANAGED_PORTRAITS",
        "guest_admin_guard": "PASS",
        "fallback_cache": "PASS_BOUNDED",
        "nginx_modified": False,
        "financial_gates_closed": False,
        "steam_signedin_browser_verified": False,
        "c03_legacy_finance_writers_unchanged": True,
    }


class ReleaseBindingTests(unittest.TestCase):
    def run_with_receipt(self, proof, *, old_source=None, wrong_receipt_hash=False):
        data = (json.dumps(proof, sort_keys=True) + "\n").encode()
        expected_sha = hashlib.sha256(data).hexdigest()
        if wrong_receipt_hash:
            expected_sha = "0" * 64

        def rawfile(path, mode=None):
            if path == m.RECEIPT:
                self.assertEqual(mode, 0o600)
                return data
            if path == m.OLD_ROLLBACK_STAGE / ".aoe2war-source-sha":
                return ((m.OLD_PUBLIC_SOURCE if old_source is None else old_source) + "\n").encode()
            raise AssertionError(f"Unexpected file {path}")

        with patch.object(m, "rawfile", side_effect=rawfile), patch.object(
            m, "RECEIPT_SHA", expected_sha
        ):
            return m.bound_public_commit()

    def test_exact_reviewed_public_release_passes(self):
        proof, digest = self.run_with_receipt(receipt())
        self.assertEqual(proof["new_pid"], 2856449)
        self.assertRegex(digest, r"^[a-f0-9]{64}$")

    def test_wrong_receipt_sha_holds(self):
        with self.assertRaisesRegex(RuntimeError, "REVIEWED_NONFINANCIAL_PUBLIC_PROMOTION_NOT_BOUND"):
            self.run_with_receipt(receipt(), wrong_receipt_hash=True)

    def test_source_or_build_drift_holds(self):
        for change in (
            {"source_sha": "a" * 40},
            {"build_id": "tampered"},
            {"build_version": "tampered"},
            {"new_pid": m.OLD_LIVE_PID},
            {"old_3032_pid": 1},
        ):
            with self.subTest(change=change):
                p = receipt()
                p.update(change)
                with self.assertRaisesRegex(RuntimeError, "REVIEWED_NONFINANCIAL_PUBLIC_PROMOTION_NOT_BOUND"):
                    self.run_with_receipt(p)

    def test_finance_and_validator_risks_hold(self):
        for change in (
            {"financial_gates_closed": True},
            {"c03_legacy_finance_writers_unchanged": False},
            {"protected_pids": {"aoe2hdbets-web.service": 1, "wolochaind-mainnet.service": 1009}},
            {"protected_pids": {"aoe2hdbets-web.service": int(m.PRIOR_PID), "wolochaind-mainnet.service": 2}},
            {"nginx_modified": True},
        ):
            with self.subTest(change=change):
                p = receipt()
                p.update(change)
                with self.assertRaisesRegex(RuntimeError, "REVIEWED_NONFINANCIAL_PUBLIC_PROMOTION_NOT_BOUND"):
                    self.run_with_receipt(p)

    def test_missing_guest_and_avatar_acceptance_holds(self):
        for change in (
            {"guest_admin_guard": "HOLD"},
            {"avatar_parity": "HOLD"},
            {"fallback_cache": "HOLD"},
            {"steam_signedin_browser_verified": True},
        ):
            with self.subTest(change=change):
                p = receipt()
                p.update(change)
                with self.assertRaisesRegex(RuntimeError, "REVIEWED_NONFINANCIAL_PUBLIC_PROMOTION_NOT_BOUND"):
                    self.run_with_receipt(p)

    def test_rollback_source_drift_holds(self):
        with self.assertRaisesRegex(RuntimeError, "OLD_R25_ROLLBACK_SOURCE_CHANGED"):
            self.run_with_receipt(receipt(), old_source="f" * 40)

    def test_exact_source_contract_is_steam_only_and_new_version(self):
        self.assertEqual(m.GIT_SHA, "e0586a7b7c355c3b29037d78c71fe26d528d2475")
        self.assertEqual(m.RELEASE, "20261108044653-2983e18532")
        self.assertEqual(m.WEB_UNIT_SHA, "13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5")
        self.assertIn("web-prod-v6", str(m.POLICY))
        self.assertNotEqual(m.ORIG_POLICY, m.POLICY)
        self.assertEqual(m.PRIOR_PID, "2625090")
        self.assertNotEqual(m.SOURCE_STAGE, m.OLD_ROLLBACK_STAGE)

    def test_expired_nft_entry_never_counts_as_success(self):
        class Hold(Exception):
            pass

        class Stub:
            def __init__(self):
                self.calls = 0
            def production_live_steam_entries(self):
                self.calls += 1
                raise Hold("STEAM_SET_UNBOUNDED_OR_EXPIRED")

        Stub.Hold = Hold
        stub = Stub()
        sleeps = []
        with self.assertRaises(Hold):
            m.observe_strict_steam_set_with_bounded_retry(stub, pause=sleeps.append)
        self.assertEqual(stub.calls, 4)
        self.assertEqual(sleeps, [0.35] * 3)

    def test_other_nft_errors_stop_without_retry(self):
        class Hold(Exception):
            pass
        class Stub:
            def __init__(self):
                self.calls = 0
            def production_live_steam_entries(self):
                self.calls += 1
                raise Hold("NFT_WIDE_RULE_CHANGED")
        Stub.Hold = Hold
        stub = Stub()
        with self.assertRaisesRegex(Hold, "NFT_WIDE_RULE_CHANGED"):
            m.observe_strict_steam_set_with_bounded_retry(stub, pause=lambda _: self.fail("sleep"))
        self.assertEqual(stub.calls, 1)


if __name__ == "__main__":
    unittest.main()
