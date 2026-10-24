from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_financial_producer_source_census.py"
SPEC = importlib.util.spec_from_file_location("aoe2_financial_producer_source_census", SOURCE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FinancialProducerSourceCensusTests(unittest.TestCase):
    def test_actual_source_edges_are_reported_and_never_assert_financial_isolation(self):
        report = MODULE.inspect(SOURCE.parents[1])
        self.assertTrue(report["known_source_edges_intact"])
        self.assertEqual(report["classification"], "SOURCE_OBSERVATION_ONLY")
        self.assertFalse(report["all_financial_producers_isolated"])
        self.assertFalse(report["safe_to_deploy"])
        self.assertEqual(report["cross_repo_runtime_attestation"], "UNKNOWN")
        self.assertGreaterEqual(len(report["unverified_producer_owners"]), 5)
        observed = report["observations"]
        self.assertGreaterEqual(len(observed), 20)
        self.assertTrue(all(entry["status"] == "SOURCE_OBSERVED" for entry in observed))
        self.assertTrue(all(entry["line"] and len(entry["source_sha256"]) == 64 for entry in observed))
        bets = [entry for entry in observed if entry["path"] == "app/api/bets/route.ts"]
        self.assertEqual(len(bets), 3)
        self.assertTrue(any(entry["classification"] == "read_to_async_financial_producer"
                            and "timed market ensure" in entry["edge"] for entry in bets))
        self.assertTrue(any(entry["classification"] == "snapshot_opt_out_not_financial_fence"
                            for entry in bets))
        self.assertFalse(any(entry["classification"] == "explicit_read_mode_exception"
                             for entry in bets))
        self.assertTrue(any(entry["classification"] == "money_moving_possible"
                            for entry in observed))

    def test_source_drift_and_missing_files_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            grouped: dict[str, list[str]] = {}
            for item in MODULE.EVIDENCE:
                grouped.setdefault(item.path, []).append(item.needle)
            for path, needles in grouped.items():
                p = root / path
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("\n".join(needles) + "\n")
            baseline = MODULE.inspect(root)
            self.assertTrue(baseline["known_source_edges_intact"])
            victim = root / "app" / "api" / "live-games" / "route.ts"
            victim.write_text("export async function GET() { return null; }\n")
            changed = MODULE.inspect(root)
            self.assertFalse(changed["known_source_edges_intact"])
            self.assertTrue(any(x["status"] == "SOURCE_DRIFT" for x in changed["observations"]))
            self.assertFalse(changed["all_financial_producers_isolated"])
            self.assertFalse(changed["safe_to_deploy"])
            victim.unlink()
            missing = MODULE.inspect(root)
            self.assertTrue(any(x["status"] == "UNKNOWN_SOURCE" for x in missing["observations"]))
            self.assertFalse(missing["safe_to_deploy"])

    def test_bets_get_queue_disappearing_is_source_drift_not_a_false_exception(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            grouped: dict[str, list[str]] = {}
            for item in MODULE.EVIDENCE:
                grouped.setdefault(item.path, []).append(item.needle)
            for path, needles in grouped.items():
                p = root / path
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("\n".join(needles) + "\n")
            self.assertTrue(MODULE.inspect(root)["known_source_edges_intact"])
            p = root / "app/api/bets/route.ts"
            p.write_text(p.read_text().replace("queueBetMarketEnsure(prisma, 0);", ""))
            report = MODULE.inspect(root)
            self.assertFalse(report["known_source_edges_intact"])
            self.assertFalse(report["safe_to_deploy"])
            self.assertTrue(any(item["path"] == "app/api/bets/route.ts"
                                and "timed market ensure" in item["edge"]
                                and item["status"] == "SOURCE_DRIFT"
                                for item in report["observations"]))

    def test_symlink_is_not_used_for_provenance(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            parent = root / "app" / "page.tsx"
            parent.parent.mkdir(parents=True, exist_ok=True)
            trusted = root / "real.tsx"
            trusted.write_text("loadLobbySnapshot(\n")
            parent.symlink_to(trusted)
            result = MODULE.inspect(root)
            homepage = [x for x in result["observations"] if x["path"] == "app/page.tsx"]
            self.assertTrue(homepage)
            self.assertEqual(homepage[0]["status"], "UNKNOWN_SOURCE")
            self.assertFalse(result["all_financial_producers_isolated"])


if __name__ == "__main__":
    unittest.main()
