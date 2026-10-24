import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/aoe2_replay_stage_radar.py"
SPEC = importlib.util.spec_from_file_location("aoe2_replay_stage_radar", SCRIPT)
radar = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = radar
SPEC.loader.exec_module(radar)


def source_fixture(root):
    for _, path, needles in radar.STAGES:
        p = root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.is_file():
            continue
        p.write_text("\n".join(needles) + "\n")
    (root / "lib/replayEngineRoom.ts").write_text(
        'const HD_REPLAY_PARSER_BASE_CONTRACT = { parserName: "aoe2war.mgz_hd", parserVersion: "1.8.51" } as const;\n'
        'export const HD_REPLAY_PARSER_CONTRACT = { ...HD_REPLAY_PARSER_BASE_CONTRACT, passVersion: "10" } as const;\n')


def stage(requested=True, attempted=True, succeeded=True):
    return {"requested": requested, "attempted": attempted, "succeeded": succeeded, "error": None}


def report():
    return {
        "receiptCount": 1, "acceptedCount": 1, "source": "private_do_not_log",
        "idempotencyKey": "a_secret_or_identity_never_emitted",
        "storage": {"archivedCount": 1},
        "parser": {"completedCount": 1, "pendingCount": 0},
        "result": {"trustedCount": 1, "readyCount": 1},
        "statistics": {"eligibleCount": 1},
        "financial": {"eligibleCount": 1, "tournament": stage(), "markets": stage()},
        "automatic": {"results": stage(), "identities": stage()},
        "warGraph": stage(False, False, None),
    }


class ReplayStageRadarTests(unittest.TestCase):
    def test_actual_known_source_contract_and_no_financial_certification(self):
        actual = radar.inspect_source(SCRIPT.parents[1])
        self.assertEqual(actual["status"], "KNOWN_SOURCE_CONTRACT_PRESENT")
        self.assertEqual(actual["parser_contract"]["pass_version"], "10")
        self.assertEqual(actual["parser_contract"]["parser_name"], "aoe2war.mgz_hd")

    def test_synthetic_source_drift_fails_explicitly(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source_fixture(root)
            self.assertEqual(radar.inspect_source(root)["status"], "KNOWN_SOURCE_CONTRACT_PRESENT")
            p = root / "lib/teamResolution.ts"
            p.write_text("export function normalizeReplayPlayers() {}\n")
            self.assertEqual(radar.inspect_source(root)["status"], "UNKNOWN_OR_DRIFTED_SOURCE_CONTRACT")

    def test_source_missing_and_symlink_not_trusted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source_fixture(root)
            target = root / "lib/watcherTelemetry.ts"
            target.unlink()
            real = root / "real.ts"
            real.write_text("export async function resolveWatcherTelemetryIdentity(")
            target.symlink_to(real)
            source = radar.inspect_source(root)
            self.assertEqual(source["status"], "UNKNOWN_OR_DRIFTED_SOURCE_CONTRACT")
            self.assertEqual([s["status"] for s in source["stages"] if s["stage"] == "watcher_identity"],
                             ["UNKNOWN_SOURCE"])

    def test_valid_receipt_retains_all_financial_holds_and_redacts(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "post_ingest.json"
            path.write_text(json.dumps(report()))
            output = radar.inspect_report(path)
            self.assertEqual(output["status"], "STRUCTURED_RECEIPT_PARSED")
            self.assertEqual(output["meaning"], "FINANCIAL_ELIGIBILITY_REPORTED_NOT_CUSTODY_PROOF")
            self.assertFalse(output["safe_to_deploy"])
            self.assertFalse(output["actual_bank_or_custody_certified"])
            self.assertNotIn("private_do_not_log", str(output))
            self.assertNotIn("a_secret_or_identity_never_emitted", str(output))

    def test_upload_not_parsed_does_not_advance_trusted_result(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "post_ingest.json"
            case = report()
            case["parser"]["completedCount"] = 0
            case["result"]["readyCount"] = 0
            case["financial"]["eligibleCount"] = 0
            case["financial"]["markets"] = stage(False, False, None)
            path.write_text(json.dumps(case))
            output = radar.inspect_report(path)
            self.assertEqual(output["meaning"], "UPLOAD_ACCEPTED_PARSE_NOT_COMPLETE")
            self.assertIn({"stage": "financial.markets", "state": "NOT_REQUESTED"},
                          output["stage_executions"])

    def test_failed_market_stage_is_not_reported_success(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "post_ingest.json"
            case = report()
            case["financial"]["markets"] = stage(True, True, False)
            path.write_text(json.dumps(case))
            output = radar.inspect_report(path)
            self.assertEqual(output["status"], "REPORTED_STAGE_FAILURE_OR_UNCERTAINTY")
            self.assertIn({"stage": "financial.markets", "state": "REPORTED_FAILURE"},
                          output["stage_executions"])

    def test_invalid_nesting_duplicate_json_keys_and_unknown_source(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = root / "report.json"
            path.write_text('{"receiptCount":0,"receiptCount":1}')
            self.assertEqual(radar.inspect_report(path)["status"], "INVALID_OR_UNAVAILABLE_RECEIPT")
            case = report()
            case["financial"]["markets"]["attempted"] = True
            case["financial"]["markets"]["requested"] = False
            path.write_text(json.dumps(case))
            self.assertEqual(radar.inspect_report(path)["status"], "INVALID_OR_UNAVAILABLE_RECEIPT")
            path.unlink()
            self.assertEqual(radar.inspect_report(path)["status"], "INVALID_OR_UNAVAILABLE_RECEIPT")

    def test_receipt_symlink_and_oversized_report_refused(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            real = root / "real.json"
            real.write_text(json.dumps(report()))
            link = root / "report.json"
            link.symlink_to(real)
            self.assertEqual(radar.inspect_report(link)["status"], "INVALID_OR_UNAVAILABLE_RECEIPT")
            real.write_text("x" * (radar.MAX_REPORT + 1))
            self.assertEqual(radar.inspect_report(real)["status"], "INVALID_OR_UNAVAILABLE_RECEIPT")


if __name__ == "__main__":
    unittest.main()
