-- WE1/WE3 Library PUBLIC-PROJECTION source candidate, never direct base grants.
-- NOTE: file requires TWO independently verified original NONFINANCIAL owner
-- substitutions. Never infer live owner, entitlement, metadata privacy or
-- actual schema shape from this synthetic source.
-- WE3 must adapt Prisma reads to these NEW views; no production role is
-- authorized by this file. B/Steam root install and inverse are separate.
BEGIN;
DO $pre$
DECLARE
  owner_a oid := '__ACTIVITY_NONFINANCIAL_OWNER__'::regrole;
  owner_w oid := '__WATCHER_NONFINANCIAL_OWNER__'::regrole;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod')
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN
      ('aoe2war_library_activity_public','aoe2war_library_watcher_public'))
 THEN RAISE EXCEPTION 'LIBRARY_VIEW_PREIMAGE_HOLD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.user_activity_events'::regclass
    AND relkind='r' AND relowner=owner_a AND NOT relrowsecurity)
 OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.watcher_client_events'::regclass
    AND relkind='r' AND relowner=owner_w AND NOT relrowsecurity)
 THEN RAISE EXCEPTION 'LIBRARY_BASE_OWNER_OR_RLS_PREIMAGE_HOLD'; END IF;
END
$pre$;
CREATE SCHEMA aoe2war_library_activity_public AUTHORIZATION __ACTIVITY_NONFINANCIAL_OWNER__;
CREATE SCHEMA aoe2war_library_watcher_public AUTHORIZATION __WATCHER_NONFINANCIAL_OWNER__;
REVOKE ALL ON SCHEMA aoe2war_library_activity_public FROM PUBLIC;
REVOKE ALL ON SCHEMA aoe2war_library_watcher_public FROM PUBLIC;

-- NO general event JSON: allow only the metadata fields actually used by
-- public Activity summaries and explicit new-package replay provenance.
-- Historic arbitrary filenames remain PRIVATE / not exposed from this view.
CREATE VIEW aoe2war_library_activity_public.replay_uploads
WITH (security_barrier=true) AS
 SELECT e.id,e.user_id,e.type,e.label,e.created_at,
 jsonb_strip_nulls(jsonb_build_object(
   'packageUpload',CASE WHEN jsonb_typeof(e.metadata::jsonb->'packageUpload')='boolean'
                    THEN e.metadata::jsonb->'packageUpload' END,
   'viaWatcher',CASE WHEN jsonb_typeof(e.metadata::jsonb->'viaWatcher')='boolean'
                    THEN e.metadata::jsonb->'viaWatcher' END,
   'receivedCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'receivedCount')='number'
                    THEN e.metadata::jsonb->'receivedCount' END,
   'uploadedCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'uploadedCount')='number'
                    THEN e.metadata::jsonb->'uploadedCount' END,
   'parsedCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'parsedCount')='number'
                    THEN e.metadata::jsonb->'parsedCount' END,
   'resultReadyCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'resultReadyCount')='number'
                    THEN e.metadata::jsonb->'resultReadyCount' END,
   'duplicateCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'duplicateCount')='number'
                    THEN e.metadata::jsonb->'duplicateCount' END,
   'failedCount',CASE WHEN jsonb_typeof(e.metadata::jsonb->'failedCount')='number'
                    THEN e.metadata::jsonb->'failedCount' END,
   'gameIds',CASE WHEN jsonb_typeof(e.metadata::jsonb->'gameIds')='array'
                    THEN e.metadata::jsonb->'gameIds' END
 )) AS metadata
 FROM public.user_activity_events e WHERE e.type='replay_upload';
ALTER VIEW aoe2war_library_activity_public.replay_uploads
 OWNER TO __ACTIVITY_NONFINANCIAL_OWNER__;

CREATE VIEW aoe2war_library_watcher_public.batch_receipts
WITH (security_barrier=true) AS
 SELECT e.id,e.user_id,e.user_uid,e.event_type,e.created_at,
   e.watcher_id,e.session_id,e.replay_hash
 FROM public.watcher_client_events e
 WHERE e.event_type IN (
   'batch_upload_started','batch_upload_scanned',
   'batch_upload_file_started','batch_upload_file_stable',
   'batch_upload_file_skipped','batch_upload_file_succeeded',
   'batch_upload_file_failed','batch_upload_finished',
   'batch_upload_failed');
ALTER VIEW aoe2war_library_watcher_public.batch_receipts
 OWNER TO __WATCHER_NONFINANCIAL_OWNER__;
GRANT USAGE ON SCHEMA aoe2war_library_activity_public TO aoe2war_web_prod;
GRANT USAGE ON SCHEMA aoe2war_library_watcher_public TO aoe2war_web_prod;
GRANT SELECT ON aoe2war_library_activity_public.replay_uploads TO aoe2war_web_prod;
GRANT SELECT ON aoe2war_library_watcher_public.batch_receipts TO aoe2war_web_prod;
COMMIT;
