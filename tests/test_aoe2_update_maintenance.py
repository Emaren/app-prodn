from __future__ import annotations

import contextlib
from datetime import datetime, timedelta, timezone
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import aoe2_update as update


def incident():
    findings = [
        {"severity": "P1", "area": "Documentation", "key": "central-source-snapshot-stale", "detail": repo}
        for repo in ("app-prodn", "vpssentry", "wolochain")
    ]
    findings.append({"severity": "P1", "area": "Documentation", "key": "central-federation-drift", "detail": "taxonomy paths and reviewed_at differ"})
    findings.extend({"severity": "P1", "area": "Context Durability", "key": "archive-stale", "detail": project + ": source newer than camera"}
                    for project in ("AoE2HDBets", "aoe2-watcher", "WoloChain-wolo-1", "VPSSentry", "AoE2WAR-docs"))
    findings.append({"severity": "P1", "area": "WoloChain", "key": "vps-source-drift", "detail": "unpromoted verifier"})
    return {"p0": 0, "p1": 10, "findings": findings, "info": {}}



def renewed_review_incident():
    payload = incident()
    expired = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    for key in ("docs-check", "strict-build"):
        payload["findings"].append({
            "severity": "P0", "area": "Documentation", "key": key,
            "detail": (
                "ValueError: taxonomy contract failed: | - "
                "app-prodn:docs/BET_STAKE_TICKETS.md: documentation review expired on "
                + expired + " | make: *** [generate] Error 1"
            ),
        })
        payload["p0"] += 1
    return payload


def renewed_review_registry(*, reviewed_at=None):
    return {"documents": [{
        "path": "docs/BET_STAKE_TICKETS.md",
        "reviewed_at": reviewed_at or datetime.now(timezone.utc).date().isoformat(),
        "review_interval_days": 30,
    }]}



class MaintenanceTests(unittest.TestCase):
    def plan(self, payload=None, maintenance=True, checker=(0, "PASS"), hold_error=None,
             recovery=None, source_error=None):
        audit = mock.Mock()
        audit.payload.return_value = payload or incident()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(update.aoe2_audit, "collect_audit", return_value=audit))
            stack.enter_context(mock.patch.object(update, "source_checker", return_value=checker))
            stack.enter_context(mock.patch.object(update, "estate_map_refresh_plan", return_value={"status": "deferred", "reason": "runtime behind"}))
            stack.enter_context(mock.patch.object(update, "stale_central_wolo_vps_drift_remediable", return_value=False))
            stack.enter_context(mock.patch.object(update, "central_federation_recovery_preview", return_value=recovery))
            stack.enter_context(mock.patch.object(update.aoe2_update_context, "source_snapshot", return_value={"app-prodn": {"head": "a" * 40}}, side_effect=source_error))
            stack.enter_context(mock.patch.object(update.aoe2_update_hold, "collect_wolo_hold", return_value={"proof": "exact"}, side_effect=hold_error))
            return update.collect_plan(release_data={}, maintenance_only=maintenance)

    def test_october_15_nine_maintenance_findings_preserve_financial_p1(self):
        plan = self.plan()
        self.assertFalse(plan["blocked"])
        self.assertEqual(plan["audit"]["p1"], 10)
        self.assertEqual(plan["external_hold"], {"proof": "exact"})
        self.assertEqual(len(plan["context_projects"]), 5)
        self.assertTrue(plan["central_sync"])
        self.assertEqual(plan["estate_maps"]["status"], "deferred")
        self.assertEqual(plan["auto_remediable_p1"], [])
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            update.print_plan(plan)
        self.assertIn("OPEN_P1", stream.getvalue())
        self.assertIn("--maintenance-only --apply", stream.getvalue())
        self.assertNotIn("HEALTHY", stream.getvalue())

    def test_default_update_keeps_real_financial_drift_blocking(self):
        self.assertTrue(self.plan(maintenance=False)["blocked"])

    def test_no_unknown_p0_or_p1_is_waived(self):
        for severity, area, key in (("P1", "WoloChain", "financial-authority"),
                                    ("P1", "Financial", "archive-stale"),
                                    ("P0", "Documentation", "strict-build"),
                                    ("P1", "Context Durability", "archive-retention-drift")):
            with self.subTest(key=key):
                payload = incident()
                payload["findings"].append({"severity": severity, "area": area, "key": key, "detail": "new blocker"})
                payload[severity.lower()] += 1
                self.assertTrue(self.plan(payload)["blocked"])

    def test_renewed_canonical_reviews_admit_staged_central_p0_repair(self):
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=renewed_review_registry()):
            plan = self.plan(renewed_review_incident())
        self.assertFalse(plan["blocked"])
        self.assertEqual(len(plan["auto_remediable_p0"]), 2)
        self.assertEqual(plan["unknown_p0"], [])
        self.assertTrue(plan["central_sync"])
        self.assertEqual(plan["external_hold"], {"proof": "exact"})
        self.assertTrue(plan["maintenance_only"])

    def test_checker_summary_truncation_admits_only_renewed_exact_source_reviews(self):
        # Actual 2026-10-19 Finisher JSON omitted the ValueError header:
        # aoe2_audit.checker_summary keeps just the last three lines.
        expired = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        detail = ("- api-prodn:docs/replay-intelligence/engine-witness-pilot.md: "
                  "documentation review expired on " + expired + " | - "
                  "api-prodn:docs/replay-intelligence/exact-cohort-materializer.md: "
                  "documentation review expired on " + expired +
                  " | make: *** [generate] Error 1")
        registry = {"documents": [
            {"path": "docs/replay-intelligence/engine-witness-pilot.md",
             "reviewed_at": datetime.now(timezone.utc).date().isoformat(),
             "review_interval_days": 30},
            {"path": "docs/replay-intelligence/exact-cohort-materializer.md",
             "reviewed_at": datetime.now(timezone.utc).date().isoformat(),
             "review_interval_days": 30},
        ]}
        payload = renewed_review_incident()
        for finding in payload["findings"]:
            if finding["severity"] == "P0":
                finding["detail"] = detail
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
            plan = self.plan(payload)
        self.assertFalse(plan["blocked"])
        self.assertEqual(len(plan["auto_remediable_p0"]), 2)
        self.assertEqual(plan["unknown_p0"], [])
        self.assertIsNotNone(plan["external_hold"])
        # Only the dedicated independent docs lane can accept the same case.
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
            standard = self.plan(payload, maintenance=False)
        self.assertTrue(standard["blocked"])
        self.assertEqual(len(standard["unknown_p1"]), 1)

        for malformed in (
            detail.replace(" | - api-prodn:", " | - unrelated failure | - api-prodn:"),
            detail.replace("api-prodn:", "alien-prodn:", 1),
            detail.replace("Error 1", "Error 2"),
            detail.replace("documentation review expired", "signature failed", 1),
            "some build error | " + detail,
        ):
            with self.subTest(detail=malformed):
                candidate = copy.deepcopy(payload)
                for finding in candidate["findings"]:
                    if finding["severity"] == "P0":
                        finding["detail"] = malformed
                with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
                    rejected = self.plan(candidate)
                self.assertTrue(rejected["blocked"])
                self.assertEqual(len(rejected["unknown_p0"]), 2)

    def test_renewed_vpssentry_context_map_and_app_doc_admit_exact_central_recovery(self):
        # Real Oct 20 incident spans canonical VPSSentry context/ and app docs/.
        expired = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        renewed = datetime.now(timezone.utc).date().isoformat()
        paths = ("context/SYSTEM_MAP.md", "docs/KINGDOM_KNOWLEDGE_ROUTER.md")
        detail = (
            "- vpssentry:context/SYSTEM_MAP.md: documentation review expired on "
            + expired
            + " | - app-prodn:docs/KINGDOM_KNOWLEDGE_ROUTER.md: documentation review expired on "
            + expired
            + " | make: *** [generate] Error 1"
        )
        payload = renewed_review_incident()
        for item in payload["findings"]:
            if item["severity"] == "P0":
                item["detail"] = detail

        registry = {"documents": [
            {"path": path, "reviewed_at": renewed, "review_interval_days": 14}
            for path in paths
        ]}
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
            plan = self.plan(payload)
        self.assertFalse(plan["blocked"])
        self.assertEqual(len(plan["auto_remediable_p0"]), 2)
        self.assertEqual(plan["unknown_p0"], [])
        self.assertEqual(plan["external_hold"], {"proof": "exact"})

        # An unrenewed source is *never* admitted merely because it uses the
        # newly recognized VPSSentry path shape.
        stale = {"documents": [
            {"path": path, "reviewed_at": expired, "review_interval_days": 14}
            for path in paths
        ]}
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=stale):
            held = self.plan(payload)
        self.assertTrue(held["blocked"])
        self.assertEqual(len(held["unknown_p0"]), 2)

    def test_central_review_context_exception_is_exactly_scoped(self):
        expired = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        registry = {"documents": [
            {"path": path, "reviewed_at": datetime.now(timezone.utc).date().isoformat(),
             "review_interval_days": 14}
            for path in ("context/SYSTEM_MAP.md", "context/SERVER_STORAGE_MAP.md",
                         "context/UNKNOWN.md")
        ]}
        good = (
            "- vpssentry:context/SERVER_STORAGE_MAP.md: documentation review expired on "
            + expired + " | make: *** [generate] Error 1"
        )
        cases = (
            (good, True),
            (good.replace("vpssentry:", "app-prodn:"), False),
            (good.replace("SERVER_STORAGE_MAP.md", "UNKNOWN.md"), False),
            (good.replace("context/", "context/../"), False),
            (good.replace("documentation review expired", "signature invalid"), False),
        )
        for detail, expected in cases:
            with self.subTest(detail=detail):
                payload = renewed_review_incident()
                for item in payload["findings"]:
                    if item["severity"] == "P0":
                        item["detail"] = detail
                with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
                    plan = self.plan(payload)
                self.assertEqual(plan["blocked"], not expected)
                self.assertEqual(len(plan["auto_remediable_p0"]), 2 if expected else 0)

    def test_checker_summary_truncation_never_admits_stale_canonical_review(self):
        expired = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        payload = renewed_review_incident()
        for finding in payload["findings"]:
            if finding["severity"] == "P0":
                finding["detail"] = (
                    "- api-prodn:docs/replay-intelligence/engine-witness-pilot.md: "
                    "documentation review expired on " + expired +
                    " | make: *** [generate] Error 1"
                )
        with mock.patch.object(update.aoe2_audit, "load_json", return_value={
            "documents": [{"path": "docs/replay-intelligence/engine-witness-pilot.md",
                           "reviewed_at": expired, "review_interval_days": 30}]
        }):
            plan = self.plan(payload)
        self.assertTrue(plan["blocked"])
        self.assertEqual(len(plan["unknown_p0"]), 2)

    def test_central_p0_recovery_rejects_unrelated_or_concatenated_errors(self):
        for detail in (
            "Build failure: taxonomy contract failed",
            "ValueError: taxonomy contract failed: | - "
            "app-prodn:docs/BET_STAKE_TICKETS.md: documentation review expired on "
            "2026-10-15 | - unrelated error | make: *** [generate] Error 1",
        ):
            with self.subTest(detail=detail):
                payload = renewed_review_incident()
                payload["findings"][-1]["detail"] = detail
                with mock.patch.object(update.aoe2_audit, "load_json", return_value=renewed_review_registry()):
                    plan = self.plan(payload)
                self.assertTrue(plan["blocked"])
                self.assertEqual(len(plan["unknown_p0"]), 1)

    def test_central_p0_recovery_rejects_unrenewed_or_missing_source_reviews(self):
        old = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
        for registry in (
            renewed_review_registry(reviewed_at=old),
            {"documents": []},
            {"documents": [{"path": "docs/BET_STAKE_TICKETS.md",
                            "reviewed_at": "garbage", "review_interval_days": 30}]},
        ):
            with self.subTest(registry=registry):
                with mock.patch.object(update.aoe2_audit, "load_json", return_value=registry):
                    plan = self.plan(renewed_review_incident())
                self.assertTrue(plan["blocked"])
                self.assertEqual(len(plan["unknown_p0"]), 2)

    def test_central_p0_recovery_requires_federation_drift(self):
        payload = renewed_review_incident()
        payload["findings"] = [
            item for item in payload["findings"]
            if item.get("key") not in {"central-source-snapshot-stale", "central-federation-drift"}
        ]
        payload["p1"] = sum(item["severity"] == "P1" for item in payload["findings"])
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=renewed_review_registry()):
            plan = self.plan(payload)
        self.assertTrue(plan["blocked"])
        self.assertEqual(len(plan["unknown_p0"]), 2)

    def test_renewed_review_does_not_allow_extra_unknown_p0(self):
        payload = renewed_review_incident()
        payload["findings"].append({
            "severity": "P0", "area": "Documentation",
            "key": "taxonomy-schema-invalid", "detail": "unrelated catalog corruption",
        })
        payload["p0"] += 1
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=renewed_review_registry()):
            plan = self.plan(payload)
        self.assertTrue(plan["blocked"])
        self.assertEqual(len(plan["auto_remediable_p0"]), 2)
        self.assertEqual(len(plan["unknown_p0"]), 1)

    def test_unavailable_runtime_evidence_blocks(self):
        plan = self.plan(hold_error=update.aoe2_update_hold.HoldError("binary evidence unavailable"))
        self.assertTrue(plan["blocked"])
        self.assertIsNone(plan["external_hold"])

    def test_source_baseline_refresh_is_outside_scoped_lane(self):
        plan = self.plan(checker=(1, "implementation changed after the recorded baseline"))
        self.assertTrue(plan["blocked"])
        self.assertIn("source documentation refresh requires review", " ".join(plan["maintenance_errors"]))

    def test_only_exact_proven_interrupted_publication_can_recover_git_parity(self):
        recovery = {"before": "a" * 40, "candidate": "b" * 40, "branch": "main"}
        payload = incident()
        payload["findings"].append({"severity": "P1", "area": "Git", "key": "remote-parity",
                                    "detail": f"AoE2WAR-docs: local={recovery['before']} origin/main={recovery['candidate']}"})
        payload["p1"] += 1
        self.assertFalse(self.plan(payload, recovery=recovery)["blocked"])
        self.assertTrue(self.plan(payload)["blocked"])
        payload["findings"][-1]["detail"] = "api-prodn: remote advanced"
        self.assertTrue(self.plan(payload, recovery=recovery)["blocked"])

    def test_dirty_or_remote_divergent_source_blocks_preview(self):
        self.assertTrue(self.plan(source_error=update.aoe2_update_context.ContextError("dirty worktree"))["blocked"])

    def test_finish_deferral_flags_cannot_enter_scoped_apply(self):
        with self.assertRaisesRegex(update.UpdateError, "Finish"):
            update.apply_update({"maintenance_only": True}, defer_final_audit=True)

    def test_cli_rejects_finish_options_with_independent_lane(self):
        with mock.patch.object(sys, "argv", ["update", "--maintenance-only", "--apply", "--force-control-refresh"]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                update.main()
        self.assertEqual(error.exception.code, 2)

    def run_apply(self, final=None, hold_change=False, context_error=False, headroom_error=False, payload=None):
        plan = self.plan(payload)
        final = final or {"p0": 0, "p1": 1, "findings": [incident()["findings"][-1]], "info": {}}
        audit = mock.Mock()
        audit.payload.return_value = final
        sources = {"app-prodn": {"head": "a" * 40}, "AoE2WAR-docs": {"head": "b" * 40}}
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(update, "RECEIPT_DIR", Path(directory)))
            stack.enter_context(mock.patch.object(update, "central_federation_recovery_preview", return_value=None))
            stack.enter_context(mock.patch.object(update.aoe2_update_context, "source_snapshot", return_value=sources))
            stack.enter_context(mock.patch.object(update.aoe2_update_context, "verify_source_snapshot"))
            stack.enter_context(mock.patch.object(update.aoe2_update_context, "verify_context_sources", return_value={}))
            retain = stack.enter_context(mock.patch.object(update.aoe2_update_context, "preserve_previous_context", return_value={}))
            stack.enter_context(mock.patch.object(update, "context_capture_headroom", side_effect=update.UpdateError("headroom unavailable") if headroom_error else None))
            central = stack.enter_context(mock.patch.object(update, "central_sync", return_value={"status": "synchronized"}))
            capture = stack.enter_context(mock.patch.object(update, "capture_context", return_value={}, side_effect=update.UpdateError("capture failed") if context_error else None))
            stack.enter_context(mock.patch.object(update.aoe2_audit, "collect_audit", return_value=audit))
            stack.enter_context(mock.patch.object(update.aoe2_update_hold, "collect_wolo_hold", return_value={"proof": "exact"}))
            stack.enter_context(mock.patch.object(update.aoe2_update_hold, "verify_wolo_hold", side_effect=update.aoe2_update_hold.HoldError("changed binary") if hold_change else None))
            output = io.StringIO()
            error = None
            with contextlib.redirect_stdout(output):
                try:
                    result = update.apply_update(plan)
                except update.UpdateError as exc:
                    error = exc
                    result = None
            receipts = [json.loads(path.read_text()) for path in sorted(Path(directory).glob("*.json"))]
            for path in Path(directory).glob("*.json"):
                self.assertEqual(path.with_suffix(".json.sha256").read_text(), f"{update.sha256(path)}  {path.name}\n")
            return result, error, output.getvalue(), receipts, central, capture, retain

    def test_success_never_certifies_estate_or_release(self):
        result, error, output, receipts, central, capture, _ = self.run_apply()
        self.assertEqual(result, 0)
        self.assertIsNone(error)
        final = receipts[-1]
        self.assertEqual(final["status"], "DOCS_FEDERATED_WITH_EXTERNAL_WOLO_HOLD")
        self.assertEqual(final["context_status"], "CONTEXT_CURRENT")
        self.assertFalse(final["release_certified"])
        self.assertIn("P0=0 P1=1", output)
        self.assertNotIn("HEALTHY", output)
        self.assertEqual(capture.call_args.kwargs["preserve_context_history"], True)
        self.assertEqual(capture.call_args.kwargs["source_bound"], True)
        self.assertIn("before_publish", central.call_args.kwargs)

    def test_staged_central_p0_repair_cannot_claim_success_while_p0_survives(self):
        final = renewed_review_incident()
        # The old central review remains unresolved after a mocked publication.
        with mock.patch.object(update.aoe2_audit, "load_json", return_value=renewed_review_registry()):
            _, error, output, receipts, central, _, retain = self.run_apply(
                final=final, payload=renewed_review_incident()
            )
        self.assertIn("final audit must retain exactly", str(error))
        self.assertNotIn("CONTEXT_CURRENT", output)
        self.assertTrue(any(row["status"] == "FAILED" for row in receipts))
        central.assert_called_once()
        retain.assert_called_once()

    def test_changed_hold_stops_before_publication(self):
        _, error, _, receipts, central, capture, _ = self.run_apply(hold_change=True)
        self.assertIn("changed binary", str(error))
        central.assert_not_called()
        capture.assert_not_called()
        self.assertTrue(any(row["status"] == "FAILED" for row in receipts))

    def test_capture_failure_never_reports_context_current_or_retains_old_cameras(self):
        _, error, output, receipts, _, _, retain = self.run_apply(context_error=True)
        self.assertIn("capture failed", str(error))
        self.assertNotIn("CONTEXT_CURRENT", output)
        self.assertTrue(any(row["status"] == "FAILED" for row in receipts))
        retain.assert_not_called()

    def test_headroom_failure_stops_before_docs_publication_or_capture(self):
        _, error, output, _, central, capture, retain = self.run_apply(headroom_error=True)
        self.assertIn("headroom unavailable", str(error))
        central.assert_not_called()
        capture.assert_not_called()
        retain.assert_not_called()
        self.assertNotIn("CONTEXT_CURRENT", output)

    def test_final_audit_cannot_hide_new_or_disappeared_financial_finding(self):
        for final in ({"p0": 0, "p1": 0, "findings": []}, incident()):
            with self.subTest(final=final["p1"]):
                _, error, output, _, _, _, _ = self.run_apply(final=copy.deepcopy(final))
                self.assertIsNotNone(error)
                self.assertNotIn("CONTEXT_CURRENT", output)

    def test_receipts_never_overwrite_prior_evidence(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(update, "RECEIPT_DIR", Path(directory)):
            paths = [update.write_receipt({"status": "FAILED", "attempt": index}) for index in range(3)]
            self.assertEqual(len(set(paths)), 3)
            self.assertEqual([json.loads(path.read_text())["attempt"] for path in paths], [0, 1, 2])

    def test_interrupted_generator_children_cannot_mutate_sealed_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "late-write"
            child = "import time,pathlib;time.sleep(0.4);pathlib.Path(" + repr(str(marker)) + ").write_text('changed')"
            parent = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c'," + repr(child) + "]);time.sleep(5)"
            progress = mock.Mock()
            progress.wait.side_effect = KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):
                update.run_with_heartbeat([sys.executable, "-c", parent], cwd=Path(directory),
                                          progress=progress, label="generation", timeout=5,
                                          heartbeat_seconds=0.1)
            time.sleep(0.5)
            self.assertFalse(marker.exists())

    def test_noninteractive_timeout_stops_generator_children(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "late-write"
            child = "import time,pathlib;time.sleep(0.4);pathlib.Path(" + repr(str(marker)) + ").write_text('changed')"
            parent = "import subprocess,sys,time;subprocess.Popen([sys.executable,'-c'," + repr(child) + "]);time.sleep(5)"
            code, _ = update.run([sys.executable, "-c", parent], cwd=Path(directory), timeout=0.1)
            self.assertNotEqual(code, 0)
            time.sleep(0.5)
            self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
