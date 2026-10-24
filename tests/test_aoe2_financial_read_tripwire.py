"""Negative, alias, missing-source and actual-boundary smoke coverage."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/aoe2_financial_read_tripwire.py"
SPEC = importlib.util.spec_from_file_location("aoe2_financial_read_tripwire", SCRIPT)
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


def fixture(root, wake):
    for name in (*mod.PUBLIC_READ_MODULES, *mod.FINANCIAL_SINK_MODULES):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("export async function GET() { return 1; }\n", encoding="utf-8")
    (root / "lib/betMarketEnsureQueue.ts").write_text("ensureBetMarkets(prisma);\n")
    (root / "lib/bets.ts").write_text("await settleResolvedMarketWagers(prisma);\n")
    (root / "app/api/bets/route.ts").write_text(wake)


class PublicReadTripwireTests(unittest.TestCase):
    def test_catches_queue_despite_explicit_ensure_markets_false(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            fixture(root, """import { queueBetMarketEnsure } from '@/lib/betMarketEnsureQueue';
export async function GET() {
 queueBetMarketEnsure(prisma, 0);
 return loadBetBoardSnapshot(prisma, uid, { ensureMarkets: false });
}""")
            r = mod.inspect(root)
            self.assertEqual(r["status"], "KNOWN_PUBLIC_READ_WAKEUPS_PRESENT")
            self.assertEqual(r["known_public_read_wakeup_count"], 1)
            self.assertEqual(r["public_reads"][0]["calls"][0]["callee"], "queueBetMarketEnsure")
            self.assertFalse(r["safe_to_deploy"])
            self.assertFalse(r["financial_release_authorized"])

    def test_alias_call_and_non_callable_comment_string_are_distinct(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            fixture(root, """import { queueBetMarketEnsure as wake } from '@/lib/betMarketEnsureQueue';
// queueBetMarketEnsure(prisma);
const note = 'queueBetMarketEnsure(prisma)';
export function GET() { wake(prisma); }""")
            calls = mod.inspect(root)["public_reads"][0]["calls"]
            self.assertEqual([(x["callee"], x["as"]) for x in calls], [("queueBetMarketEnsure", "wake")])

    def test_comment_string_template_lone_is_not_a_call(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            fixture(root, """// ensureBetMarkets(prisma)
/* queueBetMarketEnsure(prisma) */
const value = 'settleFounderBonuses(prisma)';
const text = `reconcilePendingCoreBetClaims(prisma)`;
export function GET() { return value; }""")
            r = mod.inspect(root)
            self.assertEqual(r["status"], "NO_KNOWN_DIRECT_PUBLIC_READ_WAKEUPS")
            self.assertFalse(r["all_financial_producers_isolated"])

    def test_missing_and_symlinked_source_remain_unknown(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            fixture(root, "export function GET() { return 1 }\n")
            p = root / "lib/warChest.ts"
            p.unlink()
            self.assertEqual(mod.inspect(root)["status"], "UNKNOWN_SOURCE")
            real = root / "real.ts"
            real.write_text("queueBetMarketEnsure(prisma);\n")
            p.symlink_to(real)
            report = mod.inspect(root)
            self.assertEqual(report["status"], "UNKNOWN_SOURCE")
            self.assertIn("lib/warChest.ts", report["unknown_source_paths"])

    def test_lobby_and_warchest_are_separate_observed_wakeups(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            fixture(root, "export function GET() { return null }\n")
            (root / "lib/lobbySnapshot.ts").write_text("async function load() { queueLobbyMaintenance(prisma); }\n")
            (root / "lib/warChest.ts").write_text("export function load() { queueBetMarketEnsure(prisma); }\n")
            result = mod.inspect(root)
            self.assertEqual(result["known_public_read_wakeup_count"], 2)
            self.assertEqual(result["known_public_read_wakeup_paths"], ["lib/lobbySnapshot.ts", "lib/warChest.ts"])

    def test_direct_callee_capture(self):
        s = "function queueLobbyMaintenance() {}\nqueueLobbyMaintenance(prisma);\n"
        self.assertEqual([(x["callee"],x["line"]) for x in mod._wakes(s)], [("queueLobbyMaintenance",2)])


if __name__ == "__main__":
    unittest.main()
