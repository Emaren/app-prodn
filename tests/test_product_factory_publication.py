import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "product_publication", Path(__file__).parents[1] / "scripts/aoe2_product_release.py")
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class FactoryPublicationTests(unittest.TestCase):
    def setUp(self):
        self.approval = {"sourceSha": "1" * 40, "buildId": "candidateBuild123"}
        self.expected = {
            "schema": "aoe2war.product.deployment-invocation.v1",
            "sourceSha": self.approval["sourceSha"],
            "buildId": self.approval["buildId"],
            "rootSealSha256": "b" * 64,
            "invocationId": "12345678-1234-4234-8234-123456789abc",
            "kind": "warm", "coverage": "full",
            "firstVerifiedLiveMs": 1234.5, "durableAcceptanceMs": 6789.5,
        }
        self.raw = (json.dumps(self.expected, sort_keys=True) + "\n").encode()
        self.status = {
            "generatedAt": R.ledger.utcnow(),
            "liveRelease": {"id": self.approval["sourceSha"],
                            "buildId": self.approval["buildId"]},
            "deploymentInvocation": {
                **self.expected, "receiptSha256": hashlib.sha256(self.raw).hexdigest()},
        }
        self.calls = []

    def ssh(self, command, root=False, timeout=None):
        self.calls.append(command)
        self.assertTrue(root)
        self.assertEqual(timeout, 20)
        if command.startswith("set -e; test ! -L "):
            return "0:1:755:regular file\n" + "a" * 64 + "  " + R.FACTORY_PUBLISHER + "\n"
        self.assertEqual(command, "python3 -I -B " + R.FACTORY_PUBLISHER)
        return "PASS_FACTORY_STATUS_PUBLICATION\n"

    def response(self, request, timeout):
        self.assertEqual(timeout, 20)
        self.assertEqual(request.get_header("User-agent"), R.PUBLIC_OBSERVER_UA)
        self.assertIn("no-cache", request.get_header("Cache-control"))
        outer = self
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def geturl(self): return request.full_url
            def read(self, limit):
                outer.assertEqual(limit, 2 * 1024 * 1024 + 1)
                return json.dumps(outer.status).encode()
        return Response()

    def refresh(self, expected="default"):
        expected = self.raw if expected == "default" else expected
        with patch.object(R, "FACTORY_PUBLISHER_SHA", "a" * 64), \
             patch.object(R, "ssh", side_effect=self.ssh), \
             patch.object(R.urllib.request, "urlopen", side_effect=self.response):
            return R.refresh_factory_publication(self.approval, expected)

    def assert_publication_hold(self, expected="default"):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError,
                    "PUBLICATION_RETRY_WITHOUT_REDEPLOY"):
                self.refresh(expected)
        report = json.loads(output.getvalue().splitlines()[-1])
        self.assertTrue(report["sourceAlreadyAccepted"])
        self.assertEqual(report["nextPermittedAction"],
                         "RETRY_ACCEPTED_SOURCE_PUBLICATION_WITHOUT_REDEPLOY")
        self.assertFalse(any("release_controller" in command for command in self.calls))
        return report

    def test_v3_publisher_source_hash_is_pinned_for_reconciliation(self):
        source=(Path(__file__).parents[1] /
                "docs/release/artifacts/aoe2war_factory_public_status_v2.py")
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),
                         R.FACTORY_PUBLISHER_SHA)

    def test_pinned_existing_publisher_and_independent_https_match(self):
        result = self.refresh()
        self.assertEqual(result["state"], "pass")
        self.assertEqual(result["invocationReceiptSha256"],
                         hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(len(self.calls), 2)
        self.assertNotIn("systemctl", " ".join(self.calls))
        self.assertNotIn("cron", " ".join(self.calls))

    def test_wrong_active_source_holds(self):
        self.status["liveRelease"]["id"] = "f" * 40
        self.assertIn("PUBLICATION_LIVE_SOURCE_BUILD",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_stale_publication_holds(self):
        self.status["generatedAt"] = "2020-01-01T00:00:00.000Z"
        self.assertIn("PUBLICATION_FRESHNESS",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_future_clock_over_bound_holds(self):
        self.status["generatedAt"] = "2099-01-01T00:00:00.000Z"
        self.assertIn("PUBLICATION_FRESHNESS",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_wrong_root_seal_holds(self):
        self.status["deploymentInvocation"]["rootSealSha256"] = "0" * 64
        self.assertIn("INVOCATION_SOURCE_SEAL_OR_RECEIPT",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_wrong_raw_ninth_receipt_hash_holds(self):
        self.status["deploymentInvocation"]["receiptSha256"] = "0" * 64
        self.assertIn("INVOCATION_SOURCE_SEAL_OR_RECEIPT",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_wrong_displayed_duration_holds(self):
        self.status["deploymentInvocation"]["durableAcceptanceMs"] += 100
        self.assertIn("INVOCATION_SOURCE_SEAL_OR_RECEIPT",
                      self.assert_publication_hold()["underlyingPredicate"])

    def test_legacy_missing_clock_remains_unknown(self):
        self.status.pop("deploymentInvocation")
        result = self.refresh(expected=None)
        self.assertIsNone(result["invocationReceiptSha256"])

    def test_legacy_cannot_acquire_historical_full_metrics(self):
        self.assertIn("LEGACY_CLOCK_MUST_REMAIN_UNKNOWN",
                      self.assert_publication_hold(expected=None)["underlyingPredicate"])

    def test_placeholder_pin_never_executes_publisher(self):
        with patch.object(R, "FACTORY_PUBLISHER_SHA", "f" * 64), \
             patch.object(R, "ssh") as ssh, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "PUBLICATION_RETRY_WITHOUT_REDEPLOY"):
                R.refresh_factory_publication(self.approval, self.raw)
        ssh.assert_not_called()

    def test_wrong_publisher_owner_holds_before_execution(self):
        def wrong(command, **kwargs):
            return "1000:1:755:regular file\n" + "a" * 64 + "  " + R.FACTORY_PUBLISHER
        with patch.object(R, "FACTORY_PUBLISHER_SHA", "a" * 64), \
             patch.object(R, "ssh", side_effect=wrong) as ssh, \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "PUBLICATION_RETRY_WITHOUT_REDEPLOY"):
                R.refresh_factory_publication(self.approval, self.raw)
        self.assertEqual(ssh.call_count, 1)

    def test_root_timeout_preserves_bounded_predicate_and_diagnostic(self):
        with patch.object(R, "FACTORY_PUBLISHER_SHA", "a" * 64), \
             patch.object(R, "ssh", side_effect=RuntimeError(
                 "HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH DIAGNOSTIC=command-failure-123.json")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(RuntimeError, "PUBLICATION_RETRY_WITHOUT_REDEPLOY"):
                R.refresh_factory_publication(self.approval, self.raw)
        report = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(report["underlyingPredicate"],
                         "HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH")
        self.assertEqual(report["diagnostic"], "command-failure-123.json")

    def test_oversize_public_json_is_bounded_hold(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def geturl(self): return "https://aoe2war.com/factory/status.json?publication_probe=1"
            def read(self, limit): return b"x" * limit
        with patch.object(R, "FACTORY_PUBLISHER_SHA", "a" * 64), \
             patch.object(R, "ssh", side_effect=self.ssh), \
             patch.object(R.urllib.request, "urlopen", return_value=Response()), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "PUBLICATION_RETRY_WITHOUT_REDEPLOY"):
                R.refresh_factory_publication(self.approval, self.raw)


if __name__ == "__main__":
    unittest.main()
