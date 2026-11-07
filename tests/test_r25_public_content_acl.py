"""Public hero/session data reads must not inherit user secrets or custody grants."""
import ast
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = (ROOT / "config/nonfinancial-production-auth.sql").read_text()
CONTROLLER = (ROOT / "scripts/r25_c_start_root.py").read_text()
HERO = (ROOT / "lib/hero/service.ts").read_text()
COMMUNITY = (ROOT / "lib/communityStore.ts").read_text()
LOBBY = (ROOT / "lib/lobbySnapshot.ts").read_text()


def controller_constant(name):
    for node in ast.parse(CONTROLLER).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"Missing contract constant: {name}")


class PublicContentACL(unittest.TestCase):
    def test_exact_public_tables_match_root_witness(self):
        rows = controller_constant("PROD_READ_TABLES")
        self.assertEqual(len(rows), len(set(rows)))
        match = re.search(r"FOREACH v_table IN ARRAY ARRAY\[(.*?)\]\s*LOOP", SQL, re.S)
        self.assertIsNotNone(match)
        sql_tables = re.findall(r"'([a-z_]+)'", match[1])
        self.assertEqual(set(sql_tables), set(rows))
        self.assertEqual(len(sql_tables), len(rows))
        for expected in ("event_tiles", "hero_playlists", "hero_playlist_items",
                         "hero_playlist_publications", "hero_screens", "chat_rooms"):
            self.assertIn(expected, rows)
        for forbidden in ("users", "pending_wolo_claims", "bet_wagers", "trophy_payouts",
                          "financial_journal_entries", "wolo_wallets", "managed_media_assets",
                          "forum_threads", "trophies", "user_badges", "payment_invoices"):
            self.assertNotIn(forbidden, rows)

    def test_column_restrictions_match_controller_and_exclude_secret_payloads(self):
        selected = controller_constant("PROD_COLUMN_READS")
        for table in ("trophies", "forum_threads", "managed_media_assets"):
            pattern = r"GRANT SELECT\s*\(([^)]+)\)\s*ON public\." + table + r" TO aoe2war_web_prod"
            match = re.search(pattern, SQL, re.I | re.S)
            self.assertIsNotNone(match, table)
            actual = tuple(part.strip() for part in match[1].split(","))
            self.assertEqual(set(actual), set(selected[table]), table)
            self.assertEqual(len(actual), len(selected[table]))
        self.assertEqual(selected["trophies"], ("id", "display_name"))
        self.assertNotIn("body", selected["forum_threads"])
        for forbidden in ("original_name", "uploaded_by_uid", "key", "created_at"):
            self.assertNotIn(forbidden, selected["managed_media_assets"])
        for forbidden in ("email", "is_admin", "wallet_address", "token", "password"):
            self.assertNotIn(forbidden, selected["users"])

    def test_content_projections_only_fetch_authorized_fields(self):
        hydration = HERO.split("export async function hydrateHeroSnapshot(", 1)[1].split(
            "export async function loadPublishedHeroPlaylist(", 1)[0]
        media = hydration.split("prisma.managedMediaAsset.findMany(", 1)[1].split(
            ": Promise.resolve", 1
        )[0]
        forum = hydration.split("prisma.forumThread.findMany(", 1)[1].split(
            ": Promise.resolve", 1
        )[0]
        self.assertIn("select: {", forum)
        self.assertIn("select: {", media)
        for forbidden in ("body:", "seedKey:", "authorUserId:"):
            self.assertNotIn(forbidden, forum)
        for forbidden in ("uploadedByUid:", "originalName:", "key:"):
            self.assertNotIn(forbidden, media)
        self.assertIn("return prisma.chatRoom.findUnique({", COMMUNITY)
        messages = COMMUNITY.split("export async function getLobbyMessages(", 1)[1]
        self.assertIn("findRoomForPublicRead(prisma, roomSlug)", messages)
        self.assertNotIn("ensureLobbyRoom(prisma)", messages)

    def test_partial_lobby_degradation_does_not_fabricate_wolo_truth(self):
        start = LOBBY.index("async function loadLobbySnapshotFresh(")
        end = LOBBY.index("type LobbySnapshotCacheEntry", start)
        segment = LOBBY[start:end]
        self.assertIn('optionalRead("Wolo earners"', segment)
        self.assertIn('optionalRead("live ticker"', segment)
        self.assertIn('optionalRead("lobby messages"', segment)
        self.assertIn("const woloPromise = loadWoloDevSnapshot();", segment)
        self.assertIn("const woloMarketPromise = loadWoloMarketSnapshot();", segment)
        self.assertNotIn("optionalRead(\"Wolo chain\"", segment)
        self.assertIn("const [wolo, woloMarket] = await Promise.all(", segment)


if __name__ == "__main__":
    unittest.main()
