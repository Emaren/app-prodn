-- WE1 Library source-only exact inverse; no legacy table, column or
-- sequence ACL modification and no CASCADE. Requires signed absent view/schema
-- preimage, no unrelated access and separate owner-authorized production permit.
BEGIN;
REVOKE SELECT ON aoe2war_library_activity_public.replay_uploads FROM aoe2war_web_prod;
REVOKE SELECT ON aoe2war_library_watcher_public.batch_receipts FROM aoe2war_web_prod;
REVOKE USAGE ON SCHEMA aoe2war_library_activity_public FROM aoe2war_web_prod;
REVOKE USAGE ON SCHEMA aoe2war_library_watcher_public FROM aoe2war_web_prod;
DROP VIEW aoe2war_library_activity_public.replay_uploads;
DROP VIEW aoe2war_library_watcher_public.batch_receipts;
DROP SCHEMA aoe2war_library_activity_public RESTRICT;
DROP SCHEMA aoe2war_library_watcher_public RESTRICT;
COMMIT;
