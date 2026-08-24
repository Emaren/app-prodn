-- AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_INDEX_CANONICALIZATION
--
-- These three indexes were installed during the 2026-08-11 production
-- incident response before Prisma migration history was canonicalized.
--
-- The protected release controller MUST prove their exact live definitions
-- before production migration history may be recorded.
--
-- Production uses `prisma migrate resolve --applied` after exact proof and
-- durable backup, so this DDL is NOT executed there.
--
-- Clean/future databases may execute the migration normally.

-- AOE2WAR-PRODUCTION-INDEX: ix_gs_final_original_filename_recency sha256=e6607245ed32cec2f2676b95842a8866c3c9ff047c070f112b2985528851b6f3
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gs_final_original_filename_recency
ON public.game_stats USING btree (
  original_filename,
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE ((is_final = true) AND ((parse_reason)::text <> 'watcher_final_unparsed'::text));

-- AOE2WAR-PRODUCTION-INDEX: ix_gs_final_replay_file_recency sha256=6c745c19d6dc92a699c873013b8e5ecdda63de15102609861598cc37377bc426
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gs_final_replay_file_recency
ON public.game_stats USING btree (
  replay_file,
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE ((is_final = true) AND ((parse_reason)::text <> 'watcher_final_unparsed'::text));

-- AOE2WAR-PRODUCTION-INDEX: ix_gs_final_platform_match_recency sha256=4fa47a10e714afdd22ec406b92695b56edeadd280c79fd55bd62661ff1ddd3a1
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gs_final_platform_match_recency
ON public.game_stats USING btree (
  ((key_events #> '{platform_match_id}'::text[])),
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE ((is_final = true) AND ((parse_reason)::text <> 'watcher_final_unparsed'::text));
