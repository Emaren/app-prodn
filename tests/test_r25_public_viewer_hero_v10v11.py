"""A05 signed-in Your Vault + publicly published page hero privacy contracts."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
V10=(ROOT/'config/nonfinancial-public-parser-viewer-v10.sql').read_text()
V11=(ROOT/'config/nonfinancial-public-page-heroes-v11.sql').read_text()
PARSER=(ROOT/'lib/parserObservatory.ts').read_text()
HERO=(ROOT/'lib/pageHeroes.ts').read_text()

class ViewerHeroPublicViews(unittest.TestCase):
 def test_vault_membership_exact_or_semantics_and_no_clear_uid(self):
  self.assertIn('FROM public.game_stats g',V10)
  self.assertIn('FROM public.replay_parse_attempts a',V10)
  self.assertIn('JOIN public.game_stats g ON g.id=a.game_stats_id',V10)
  self.assertIn('UNION',V10)
  self.assertIn('g.is_final IS TRUE AND a.user_uid IS NOT NULL',V10)
  self.assertIn('g.is_final IS TRUE AND g.user_uid IS NOT NULL',V10)
  self.assertIn("encode(sha256(convert_to(g.user_uid,'UTF8')),'hex')",V10)
  self.assertIn("encode(sha256(convert_to(a.user_uid,'UTF8')),'hex')",V10)
  self.assertNotIn('a.evidence',V10)
  self.assertNotIn('a.detail',V10)
  self.assertNotIn('a.id AS',V10)
  self.assertNotIn('a.replay_hash',V10)
  self.assertNotIn('g.user_uid AS',V10)
  self.assertNotIn('GRANT SELECT ON public.replay_parse_attempts',V10)
  self.assertIn("has_table_privilege('aoe2war_web_prod','public.replay_parse_attempts','SELECT')",V10)

 def test_vault_profile_scoped_before_original_private_orm(self):
  scoped=PARSER.split('export async function loadViewerParserVault(',1)[1].split('const rawRows = await getPrisma().gameStats.findMany',1)[0]
  self.assertIn('if (!uid) return null;',scoped)
  self.assertIn('if (isNonfinancialPublicReadProfile())',scoped)
  self.assertIn('createHash("sha256").update(uid, "utf8").digest("hex")',scoped)
  self.assertIn('FROM aoe2war_public_v10.viewer_final_replay_memberships',scoped)
  self.assertIn('WHERE "viewerUidSha256" = ${uidSha256}',scoped)
  self.assertIn('loadCorpusRows()',scoped)
  self.assertIn('ownedGameIds.has(row.id)',scoped)
  self.assertIn('applyReplayAdjudicationsToGameStatsRows(rawRows)',scoped)
  self.assertNotIn('catch (',scoped)
  self.assertNotIn('return []',scoped)

 def test_hero_public_only_active_visible_no_raw_config_or_private_media(self):
  for key in ('public.hero_playlists','public.hero_playlist_items','public.hero_screens','public.managed_media_assets'):
   self.assertIn(key,V11)
  for term in ("i.enabled IS TRUE","i.starts_at IS NULL OR i.starts_at<=now()",
               "i.ends_at IS NULL OR i.ends_at>now()","s.status<>'archived'",
               "a.active IS TRUE AND a.kind='hero' AND a.target IS NULL"):
   self.assertIn(term,V11)
  for raw in ("a.uploaded_by_uid","a.original_name","a.storage_key",
              "s.config AS","s.config,","s.aria_label","p.name AS","p.published_by_uid"):
   self.assertNotIn(raw,V11)
  self.assertIn("'views',s.config->'views'",V11)
  self.assertIn("FROM public.hero_playlists p",V11)
  self.assertIn("WHERE p.key LIKE 'page-hero-%'",V11)

 def test_hero_runtime_legacy_and_confined_branches(self):
  self.assertIn('isNonfinancialPublicReadProfile()',HERO)
  self.assertIn('? await readPublishedPageHeroChain(prisma, surfaceInput)',HERO)
  self.assertIn(': await readPageHeroChain(prisma, surfaceInput, false)',HERO)
  self.assertIn('FROM aoe2war_public_v11.published_hero_playlists',HERO)
  self.assertIn('if (rows.length === 0) return defaultChain(surface)',HERO)
  self.assertIn('PUBLIC_HERO_V11_MALFORMED_PLAYLIST',HERO)
  self.assertIn('normalizeViews(item.views)',HERO)
  self.assertNotIn('upsert(',HERO.split('async function readPublishedPageHeroChain(',1)[1].split('export async function loadPageHeroChain(',1)[0])

 def test_postgres_owned_barrier_and_no_raw_table_access(self):
  for source,schema,view in ((V10,'v10','viewer_final_replay_memberships'),
                             (V11,'v11','published_hero_playlists')):
   self.assertEqual(source.count('BEGIN;'),1)
   self.assertEqual(source.count('COMMIT;'),1)
   self.assertIn("current_user <> 'postgres'",source)
   self.assertIn('WITH (security_barrier=true)',source)
   self.assertIn(f"GRANT SELECT ON aoe2war_public_{schema}.{view} TO aoe2war_web_prod",source.replace('\n ',' '))
   self.assertIn(f"has_schema_privilege('aoe2war_web_prod','aoe2war_public_{schema}','CREATE')",source)
   self.assertNotIn('GRANT SELECT ON ALL TABLES',source)
   self.assertNotIn('GRANT INSERT',source)
   self.assertNotIn('GRANT UPDATE',source)
   self.assertNotIn('SECURITY DEFINER',source)

if __name__=='__main__':unittest.main()
