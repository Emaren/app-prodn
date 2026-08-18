INSERT INTO "marketplace_shops" (
  "kind", "owner_user_id", "slug", "name", "offer", "proprietor_label",
  "street_key", "slot", "display_enabled", "status", "charter_amount_wolo",
  "charter_state", "hero_image_url", "href"
)
VALUES
  ('kingdom', NULL, 'chat-effects', 'Chat Effects',
   'Dramatic chat flourishes—flames, frost, sparks, and other effects. Effects start at 10 WOLO.',
   'Kingdom artificers', 'third-street', 1, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/chat-effects'),
  ('kingdom', NULL, 'clan-insignias', 'Clan Insignias',
   'Commission clan crests, war standards, insignias, and visual identity for your house.',
   'Royal heralds', 'third-street', 2, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/clan-insignias'),
  ('kingdom', NULL, 'tournament-tent', 'Tournament Tent',
   'Join the current field, inspect brackets, and gather around the next tournament.',
   'Tournament marshal', 'third-street', 3, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/tournament-tent'),
  ('kingdom', NULL, 'bank-tent', 'The Bank Tent',
   'Stake WOLO, inspect yield, and put idle coin to work inside the kingdom.',
   'Kingdom treasury', 'fourth-street', 1, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/bank-tent'),
  ('kingdom', NULL, 'kingdom-forge-tent', 'Kingdom Forge Tent',
   'Back features, direct Build Fuel, and help finance the next pieces of the kingdom.',
   'The Forge', 'fourth-street', 2, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/kingdom-forge-tent'),
  ('kingdom', NULL, 'bounty-hall', 'The Bounty Hall',
   'Post, hunt, and collect bounties across the kingdom.',
   'Bounty keeper', 'fourth-street', 3, TRUE, 'active', 100, 'kingdom_founding', NULL,
   '/market/kingdom/bounty-hall')
ON CONFLICT DO NOTHING;
