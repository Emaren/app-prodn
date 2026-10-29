"""Release regression: unrelated page mounts cannot initiate betting GETs.

Bets header hover/focus/pointer intent retains its deliberate warmup. The
/api/bets GET itself is potentially mutating and is never a release probe.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHELL = ROOT / "app" / "AppShell.tsx"
BETS_WARMUP = ROOT / "lib" / "betsNavigationWarmup.ts"

class WebsiteFinanceNoninterferenceTests(unittest.TestCase):
    def test_global_shell_does_not_speculatively_warm_bets(self) -> None:
        shell = SHELL.read_text(encoding="utf-8")
        self.assertNotIn("betsIdleWarmRef", shell)
        self.assertNotIn("warmBetsNavigation", shell)
        self.assertNotIn('router.prefetch("/bets")', shell)
        self.assertNotIn('setTimeout(warmBetsNavigation', shell)
        # Only the 3 intent-triggered header handlers warm the Bets board.
        self.assertEqual(shell.count("void warmBetsBoard(uid);"), 3)
        for trigger in ("onMouseEnter", "onFocus", "onPointerDown"):
            start = shell.index(trigger + "={() => {")
            guard = shell.index('if (href === "/bets")', start)
            action = shell.index("void warmBetsBoard(uid);", guard)
            self.assertLess(action - guard, 240)
        self.assertIn('"/api/bets"', BETS_WARMUP.read_text(encoding="utf-8"))

    def test_nonfinancial_routes_share_bets_idle_free_shell(self) -> None:
        # /, /players, /live-games, /kingdom-systems and /aoe2war-os
        # use AppShell; ensure absence of unconditional finance warmup.
        shell = SHELL.read_text(encoding="utf-8")
        self.assertIn("function AppShell", shell)
        self.assertNotIn('fetch("/api/bets"', shell)
        self.assertNotIn('router.prefetch("/bets")', shell)
        self.assertNotIn("betsRouteTimer", shell)

    def test_release_probes_are_identity_only(self) -> None:
        for path in (
            ROOT / "scripts" / "aoe2_release_auto.py",
            ROOT / "scripts" / "aoe2_release_rollback.py",
            ROOT / "scripts" / "aoe2_release_ship.py",
        ):
            source = path.read_text(encoding="utf-8")
            self.assertIn("/api/deployment-version", source)
            self.assertNotIn("http://127.0.0.1:3030/api/bets", source)
            self.assertNotIn("http://127.0.0.1:3030/api/lobby", source)

if __name__ == "__main__":
    unittest.main()
