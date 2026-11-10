"""Nonfinancial R25 source invariants: no live identities or financial activation."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def text(path):
    return (ROOT / path).read_text()


def hrefs(s):
    # Section begins at the menuEntries array and ends at visibleEntries.
    menu = s.split('const menuEntries =', 1)[1].split('const visibleEntries =', 1)[0]
    return re.findall(r'href:\s*["\x27]([^"\x27]+)["\x27]', menu)


class NonfinancialR25Release(unittest.TestCase):
    def test_full_kingdom_menu_not_four_link_regression(self):
        menu = text("components/HeaderMenu.tsx")
        ordered = hrefs(menu)
        self.assertGreaterEqual(len(ordered), 45)
        self.assertEqual(ordered[:7], [
            "/profile", "/wallet", "/wolo", "/staking", "/bets",
            "/kingdom-bettors", "/kingdom",
        ])
        self.assertIn("/kingdom-index", ordered)
        self.assertIn("/kingdom-brain", ordered)
        self.assertIn("/kingdom-progress", ordered)
        self.assertIn("/traffic", ordered)
        self.assertIn("/download", ordered)
        self.assertEqual(len(ordered), len(set(ordered)))
        self.assertLess(ordered.index("/clans"), ordered.index("/players"))
        self.assertLess(ordered.index("/players"), ordered.index("/traffic"))

    def test_menu_renders_full_secondary_and_role_filters_admin(self):
        menu = text("components/HeaderMenu.tsx")
        self.assertIn("!entry.adminOnly || isAdmin", menu)
        self.assertIn("primaryEntries.map", menu)
        self.assertIn("secondaryEntries.map", menu)
        self.assertIn('aria-label="Account menu"', menu)
        self.assertIn("overflow-y-auto", menu)
        self.assertIn("await logout()", menu)

    def test_original_canonical_traffic_is_single_primary_chart(self):
        page = text("app/traffic/page.tsx")
        self.assertIn("loadPublicTraffic()", page)
        self.assertIn("PremiumTimeSeriesChart", page)
        self.assertEqual(page.count("<PremiumTimeSeriesChart"), 1)
        self.assertIn("Total Traffic", page)
        self.assertIn("Potential Humans", page)
        self.assertIn("Confirmed Humans", page)
        for banned in ("<ProvisionalDailyTraffic", "<ProvisionalActivity",
                       "observedQualifyingIps", "observedGetEvents"):
            self.assertNotIn(banned, page)

    def test_daily_finality_not_faked_for_october_gap(self):
        src = text("lib/publicTraffic.ts")
        self.assertIn("isPublishedCompleteDay", src)
        self.assertIn("legacyFinalDay", src)
        self.assertIn("point.calculatedAt ?? payload.archive_calculated_at", src)
        self.assertIn("throw new Error(`Duplicate canonical Traffic", src)
        self.assertIn("suspectedHuman < confirmedHuman", src)
        page = text("app/traffic/page.tsx")
        self.assertIn("TRAFFIC ARCHIVE DELAYED", page)
        self.assertIn("RECENT DAYS UNVERIFIED", page)
        self.assertNotIn("new Date().toISOString().slice(0, 10), values:", page)

    def test_featured_warrior_is_seeded_per_dynamic_request(self):
        for route in ("app/page.tsx", "app/lobby/page.tsx"):
            src = text(route)
            self.assertIn('dynamic = "force-dynamic"', src)
            self.assertIn('randomInt(0, 0x1_0000_0000)', src)
        src = text("app/HomePageClient.tsx")
        self.assertIn("curatedFeaturedWarriorOpening(pool, true, openingSeed)", src)
        self.assertIn("createOpeningWarriorRandom(openingSeed)", src)
        self.assertIn("shuffleFeaturedWarriors", src)
        self.assertIn("decodeFeaturedWarriorImage", src)
        self.assertIn("FEATURED_WARRIOR_FIRST_ROTATE_MS", src)
        self.assertIn("document.hidden", src)

    def test_managed_avatar_urls_preserve_target_fallback_size_and_revision(self):
        src = text("lib/avatarAssets.ts")
        self.assertIn("export function managedAvatarUrl(", src)
        self.assertIn("/api/media-assets/avatar/", src)
        self.assertIn('fallback=', src)
        self.assertIn('size", "thumb"', src)
        self.assertIn('size", "card"', src)
        self.assertIn('const ZODIAC_UID_AVATAR_TARGET', src)
        self.assertIn('featuredAvatarCardUrlForUser', src)
        self.assertIn('"rev"', src)

    def test_appearance_api_protects_anonymous_and_preview_mutations(self):
        src = text("app/api/user/appearance/route.ts")
        self.assertEqual(src.count("const sessionUid = await getSessionUid(request)"), 2)
        self.assertEqual(src.count('status: 401'), 2)
        self.assertIn("isLiveProductionReadOnlyPreview()", src)
        self.assertIn("if (", src)
        self.assertIn("appearancePreferenceFingerprint", src)
        self.assertNotIn("prisma.$executeRawUnsafe", src)

    def test_watcher_version_does_not_fall_back_to_164(self):
        src = text("lib/watcherRelease.ts")
        self.assertIn('version: "1.6.5"', src)
        self.assertIn('previousVersion: "1.6.4"', src)
        self.assertIn("activation pending", src)
        self.assertIn('downloadPath:', src)

    def test_no_product_route_implicitly_promotes_unmounted_traders(self):
        # Session C owns separate PR #1281; this B baseline must not auto-admit.
        menu = text("components/HeaderMenu.tsx")
        self.assertNotIn('href: "/kingdom-traders"', menu)
        self.assertFalse((ROOT / "app/kingdom-traders/page.tsx").exists())

    def test_financial_apis_out_of_scope_for_this_release_candidate(self):
        # This test is a diff-boundary check; no finance source is present in
        # B's sparse candidate, no transition classifier grants money rights.
        src = text("scripts/release/r25_steam_c01_next_admission_v1.py")
        self.assertIn('"funded_operations_authorized": False', src)
        self.assertIn('"deployment_authorized": False', src)


if __name__ == "__main__":
    unittest.main()
