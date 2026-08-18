INSERT INTO "marketplace_shops" (
  "kind", "owner_user_id", "slug", "name", "offer", "proprietor_label",
  "street_key", "slot", "display_enabled", "status", "charter_amount_wolo",
  "charter_state", "hero_image_url", "href"
)
VALUES
  ('kingdom', NULL, 'oracle-tent', 'The Oracle',
   'Choose the shape of the next battlefield and ask the Oracle what your coming matches may reveal.',
   'Oracle AI', 'fifth-street', 1, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/oracle-tent'),
  ('kingdom', NULL, 'radio-wolo', 'Radio WOLO',
   'Request music, pitch a radio spot, and help shape the sound of the kingdom.',
   'Kingdom broadcasters', 'fifth-street', 2, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/radio-wolo'),
  ('kingdom', NULL, 'statistics-tent', 'The Statistics Tent',
   'Order deeper match statistics, packaged analysis, and player-performance reports.',
   'Royal statisticians', 'fifth-street', 3, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/statistics-tent'),
  ('kingdom', NULL, 'ai-tent', 'The AI Tent',
   'A strange machine-lit tent for future AI services, tools, counsel, and experiments.',
   'The machines', 'sixth-street', 1, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/ai-tent'),
  ('kingdom', NULL, 'champions-belt-forge', 'Champion''s Belt Forge',
   'Commission championship belts, title hardware, and ceremonial pieces for proven champions.',
   'Master belt smith', 'sixth-street', 2, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/champions-belt-forge'),
  ('kingdom', NULL, 'wager-house', 'The Wager House',
   'Walk straight from the Marketplace into the kingdom''s betting floor.',
   'The house', 'sixth-street', 3, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/wager-house')
ON CONFLICT DO NOTHING;
