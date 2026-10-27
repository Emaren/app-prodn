"""Source-only navigation/privacy contracts for the held Storage Atlas candidate.

No network calls, host disk scans, financial writes or deployment side effects.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHELL = ROOT / "app/AppShell.tsx"
SYSTEMS = ROOT / "app/kingdom-systems/page.tsx"
ATLAS = ROOT / "components/aoe2war-os/StorageAtlasView.tsx"


class StorageAtlasShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shell = SHELL.read_text(encoding="utf-8")
        cls.systems = SYSTEMS.read_text(encoding="utf-8")
        cls.atlas = ATLAS.read_text(encoding="utf-8")

    def test_storage_atlas_is_a_real_os_child_route(self):
        self.assertIn('destination: "/aoe2war-os?view=storage-atlas"', (ROOT / "next.config.js").read_text(encoding="utf-8"))
        self.assertIn('title: "Storage Atlas · AoE2WAR OS"', (ROOT / "app/aoe2war-os/page.tsx").read_text(encoding="utf-8"))
        self.assertIn('href="/aoe2war-os"', self.atlas)

    def test_castle_menu_has_one_systems_gateway_not_subroutes(self):
        menu = self.shell.split("const KINGDOM_LINKS = [", 1)[1].split("] as const;", 1)[0]
        self.assertIn('href: "/kingdom-systems"', menu)
        for route in ("/kingdom-sensors", "/kingdom-tests", "/kingdom-recovery",
                      "/aoe2war-os/storage-atlas"):
            self.assertNotIn('href: "' + route + '"', menu)

    def test_systems_gateway_contains_all_instruments(self):
        for route in ("/kingdom-sensors", "/kingdom-tests",
                      "/kingdom-recovery", "/aoe2war-os/storage-atlas",
                      "/aoe2war-os"):
            self.assertIn('href: "' + route + '"', self.systems)

    def test_atlas_historic_receipts_are_not_fake_live_telemetry(self):
        self.assertIn("Not a live scan", self.atlas)
        self.assertIn("HISTORICAL", self.atlas.upper())
        self.assertIn("Census coverage: PARTIAL", self.atlas)
        self.assertIn('state: "HOLD"', self.atlas)
        self.assertIn('state: "OBSERVED_OK"', self.atlas)
        self.assertIn('state: "PRESSURE"', self.atlas)
        self.assertNotIn("fetch(", self.atlas)
        self.assertNotIn("fs.read", self.atlas)

    def test_atlas_cannot_operate_on_storage(self):
        for dangerous in (
            "rm -rf", "shutil.rmtree", "unlink(", "deleteFile(", 
            "systemctl", "sudo ", "execFile(", "execSync(",
            "wallet_private", "private.pem",
        ):
            self.assertNotIn(dangerous, self.atlas)

    def test_public_projection_does_not_publish_host_paths(self):
        for sensitive in (
            "/Users/", "/home/", "/var/www/", "/mnt/HC_Volume",
            "105319120", "tonyblum", "wolo-financial-restore",
        ):
            self.assertNotIn(sensitive, self.atlas)

    def test_storage_atlas_page_title_ordered_before_parent_fallback(self):
        index = self.shell.index('prefix: "/aoe2war-os/storage-atlas"')
        parent = self.shell.index('prefix: "/aoe2war-os"')
        self.assertLess(index, parent)

    def test_atlas_inspection_disables_shared_speculative_bet_and_leaderboard_warmup(self):
        # Without this guard, navigating to Atlas automatically triggers
        # AppShell warmBetsBoard(uid) -> GET /api/bets ->
        # queueBetMarketEnsure(prisma, 0), even though Atlas is read-only.
        self.assertIn('pathname === "/aoe2war-os/storage-atlas"', self.shell)
        self.assertIn('new URLSearchParams(window.location.search).get("view") === "storage-atlas"', self.shell)
        for branch in ('"/leaderboard"', '"/bets"'):
            self.assertIn("isStorageAtlasInspectionPath(pathname) || pathname === " + branch, self.shell)
        gate = self.shell.index('isStorageAtlasInspectionPath(pathname) || pathname === "/bets"')
        prefetch = self.shell.index('router.prefetch("/bets");', gate)
        warm = self.shell.index('void warmBetsBoard(uid);', prefetch)
        self.assertLess(gate, prefetch)
        self.assertLess(gate, warm)
        # User-initiated navigation remains available elsewhere.
        self.assertIn('{ href: "/bets", label: "Bets" }', self.shell)

    def test_os_route_is_an_explicit_existing_template_alias(self):
        page = (ROOT / "app/aoe2war-os/page.tsx").read_text(encoding="utf-8")
        config = (ROOT / "next.config.js").read_text(encoding="utf-8")
        self.assertIn('if (view === "storage-atlas") return <StorageAtlasView />', page)
        self.assertIn('source: "/aoe2war-os/storage-atlas"', config)
        self.assertFalse((ROOT / "app/aoe2war-os/storage-atlas/page.tsx").exists())


if __name__ == "__main__":
    unittest.main()
