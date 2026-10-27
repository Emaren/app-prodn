"""Regression contract: nonfinancial OS pages never prewarm finance-capable GETs.

Source guard is intentionally limited to the AppShell side effect. It does not
claim /api/bets is intrinsically read-only or grant release activation.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHELL = ROOT / "app" / "AppShell.tsx"
BETS_WARMUP = ROOT / "lib" / "betsNavigationWarmup.ts"


class StorageAtlasFinanceWarmupFenceTests(unittest.TestCase):
    def test_os_route_exits_before_automatic_bets_warmup(self) -> None:
        shell = SHELL.read_text(encoding="utf-8")
        effect = shell.split("if (pathname === \"/bets\" || pathname?.startsWith(\"/aoe2war-os\")", 1)
        self.assertEqual(len(effect), 2, "Missing explicit AoE2WAR OS early exit")
        self.assertTrue(effect[1].lstrip().startswith("|| betsIdleWarmRef.current) {\n      return;"))
        warmup = shell.index('router.prefetch("/bets");', shell.index('const warmBetsNavigation ='))
        guard = shell.index('pathname?.startsWith("/aoe2war-os")')
        self.assertLess(guard, warmup)
        self.assertTrue('/api/bets' in BETS_WARMUP.read_text(encoding="utf-8"))

    def test_release_probes_are_identity_only(self) -> None:
        for path in (
            ROOT / "scripts" / "aoe2_release_auto.py",
            ROOT / "scripts" / "aoe2_release_rollback.py",
            ROOT / "scripts" / "aoe2_release_ship.py",
        ):
            src = path.read_text(encoding="utf-8")
            self.assertIn("/api/deployment-version", src)
            self.assertNotIn("http://127.0.0.1:3030/api/bets", src)
            self.assertNotIn("http://127.0.0.1:3030/api/lobby", src)


if __name__ == "__main__":
    unittest.main()
