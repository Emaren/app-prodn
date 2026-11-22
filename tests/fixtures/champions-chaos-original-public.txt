-- Exact original 9afd2f89f protected public view SELECT
WITH watcher_activity AS (
 SELECT COALESCE(w.user_uid,u.uid) AS user_uid,
        COUNT(*)::bigint AS event_count,
        COUNT(DISTINCT COALESCE(NULLIF(w.replay_hash,''),NULLIF(w.replay_file,'')))::bigint AS streamed_games,
        MAX(w.created_at) AS last_watcher_at
 FROM public.watcher_client_events w
 LEFT JOIN public.users u ON u.id=w.user_id
 WHERE COALESCE(w.user_uid,u.uid) IS NOT NULL
 GROUP BY COALESCE(w.user_uid,u.uid)
), watcher_keys AS (
 SELECT u.uid AS user_uid, TRUE AS has_watcher_key
 FROM public.api_keys k JOIN public.users u ON u.id=k.user_id
 WHERE k.kind='watcher' AND k.revoked_at IS NULL
 GROUP BY u.uid
)
SELECT u.uid AS "userUid",
       COALESCE(a.event_count,0)::bigint AS "eventCount",
       COALESCE(a.streamed_games,0)::bigint AS "streamedGames",
       a.last_watcher_at AS "lastWatcherAt",
       COALESCE(k.has_watcher_key,FALSE) AS "hasWatcherKey"
FROM public.users u
LEFT JOIN watcher_activity a ON a.user_uid=u.uid
LEFT JOIN watcher_keys k ON k.user_uid=u.uid
