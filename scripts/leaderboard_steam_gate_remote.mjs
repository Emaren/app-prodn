// Second-stage read-only funnel: which Watcher evidence gate excludes rated players?
// Evidence diagnostic only. NEVER promotes raw JSON into Steam rating authority.
import { getPrisma } from "@/lib/prisma";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { latestHistoricalSteamLaneRating } from "@/lib/leaderboardRating";
import { isLeaderboardExcludedSystemUid } from "@/lib/internalSystemAccounts";

const prisma=getPrisma();
const stages=["no_numeric_rating_in_stored_game_stats",
 "nonqualifying_parse_source_only",
 "invalid_clock_uploader_or_hash",
 "missing_live_monitor_provenance",
 "signature_or_legacy_cohort_unqualified",
 "client_server_hash_proof_unqualified",
 "checkpoint_role_or_finality_unqualified",
 "rating_field_source_or_duplicate_identity",
 "passes_all_watcher_game_stats_gates"];
const positive=x=>typeof x==="number"&&Number.isFinite(x)&&x>0;
const total=o=>Object.values(o).reduce((s,v)=>s+v,0);
try {
 const proof=await prisma.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS transaction_mode, current_setting('default_transaction_read_only') AS default_mode");
 if(proof.length!==1||proof[0].transaction_mode!=="on"||proof[0].default_mode!=="on")throw Error("read-only proof required");
 const rows=await prisma.$queryRawUnsafe(String.raw`
 WITH raw AS (
 SELECT g.id,g.parse_source,g.parse_reason,g.is_final,g.played_on,g.created_at,
        g.user_uid,g.replay_hash,g.key_events::jsonb AS events,p.value AS player,
        COUNT(*) OVER(PARTITION BY g.id,p.value->>'steam_id') AS id_count
 FROM game_stats g
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(g.players::jsonb)='array'
      THEN g.players::jsonb ELSE '[]'::jsonb END) p(value)
 WHERE p.value->>'steam_id' ~ '^[0-9]{17}$'
 ), flags AS (
 SELECT player->>'steam_id' AS steam_id,
 CASE WHEN jsonb_typeof(player->'steam_rm_rating')='number'
           AND player->>'steam_rm_rating' ~ '^[0-9]{1,5}$'
      THEN (player->>'steam_rm_rating')::integer BETWEEN 1 AND 5000
      ELSE false END AS rm,
 CASE WHEN jsonb_typeof(player->'steam_dm_rating')='number'
           AND player->>'steam_dm_rating' ~ '^[0-9]{1,5}$'
      THEN (player->>'steam_dm_rating')::integer BETWEEN 1 AND 5000
      ELSE false END AS dm,
 (parse_source IN ('watcher_live','watcher_final') AND COALESCE(parse_reason,'') NOT IN
   ('manual_backfill','manual_override','engine_room_structural_projection')) AS source_ok,
 (played_on IS NOT NULL AND played_on <= NOW()+INTERVAL '5 minutes'
   AND user_uid IS NOT NULL AND BTRIM(user_uid)<>'' AND user_uid<>'system'
   AND LOWER(replay_hash) ~ '^[a-f0-9]{64}$') AS clock_id_ok,
 (events #>> '{watcher_upload,ingestion_provenance}'='live_monitor') AS live_ok,
 (events #> '{watcher_upload,provenance_signature_verified}'='true'::jsonb OR
  (created_at<TIMESTAMP '2026-10-09 00:00:00'
   AND played_on<TIMESTAMP '2026-10-09 00:00:00'
   AND events #> '{watcher_upload,provenance_signature_verified}'='false'::jsonb)) AS signed_ok,
 (events #> '{watcher_upload,client_sha256_verified}'='true'::jsonb
  AND LOWER(events #>> '{watcher_upload,server_sha256}')=LOWER(replay_hash)
  AND LOWER(events #>> '{watcher_upload,client_sha256}')=LOWER(replay_hash)) AS hash_ok,
 (events #> '{watcher_upload,checkpoint_final_rejected}'='false'::jsonb AND
  ((parse_source='watcher_live' AND NOT is_final
    AND events #>> '{watcher_upload,file_role}'='live_checkpoint')
  OR (parse_source='watcher_final' AND is_final
    AND events #>> '{watcher_upload,file_role}' IN ('final_recording','legacy_recording')))) AS role_ok,
 (id_count=1 AND COALESCE(player #>> '{steam_rating_sources,steam_rm_rating}','unmarked')
      IN ('hd_header','unmarked')) AS rm_origin_ok,
 (id_count=1 AND COALESCE(player #>> '{steam_rating_sources,steam_dm_rating}','unmarked')
      IN ('hd_header','unmarked','summary_rate_snapshot')) AS dm_origin_ok
 FROM raw
 ), staged AS (
 SELECT steam_id,
 CASE WHEN rm THEN CASE
   WHEN NOT COALESCE(source_ok,false) THEN 1
   WHEN NOT COALESCE(clock_id_ok,false) THEN 2
   WHEN NOT COALESCE(live_ok,false) THEN 3
   WHEN NOT COALESCE(signed_ok,false) THEN 4
   WHEN NOT COALESCE(hash_ok,false) THEN 5
   WHEN NOT COALESCE(role_ok,false) THEN 6
   WHEN NOT COALESCE(rm_origin_ok,false) THEN 7
   ELSE 8 END END AS rm_stage,
 CASE WHEN dm THEN CASE
   WHEN NOT COALESCE(source_ok,false) THEN 1
   WHEN NOT COALESCE(clock_id_ok,false) THEN 2
   WHEN NOT COALESCE(live_ok,false) THEN 3
   WHEN NOT COALESCE(signed_ok,false) THEN 4
   WHEN NOT COALESCE(hash_ok,false) THEN 5
   WHEN NOT COALESCE(role_ok,false) THEN 6
   WHEN NOT COALESCE(dm_origin_ok,false) THEN 7
   ELSE 8 END END AS dm_stage
 FROM flags
 )
 SELECT steam_id AS "steamId", COALESCE(MAX(rm_stage),0)::integer AS "rmStage",
 COALESCE(MAX(dm_stage),0)::integer AS "dmStage"
 FROM staged GROUP BY steam_id
 `);
 const evidence=new Map(rows.map(r=>[r.steamId,r]));
 const directory=await loadPublicPlayerDirectory(prisma,null,
   {includePresence:false,includeCurrentWatcherState:true});
 const eligible=directory.allEntries.filter(e=>
   !isLeaderboardExcludedSystemUid(e.uid)&&(e.totalMatches>0||e.claimed));
 const histogram={
  rm:Object.fromEntries(stages.map(k=>[k,0])),
  dm:Object.fromEntries(stages.map(k=>[k,0])),
 };
 const counts={publicIdentityRows:eligible.length,rmRated:0,dmRated:0,
  rmMissing:0,dmMissing:0,neitherRated:0,
  noExactSteamIdentity:0,exactSteamIdsInMissingSet:0};
 for(const e of eligible){
   const rm=positive(e.steamRmRating)||positive(latestHistoricalSteamLaneRating(e.replayEvidence,"rm"));
   const dm=positive(e.steamDmRating)||positive(latestHistoricalSteamLaneRating(e.replayEvidence,"dm"));
   if(rm)counts.rmRated++;else counts.rmMissing++;
   if(dm)counts.dmRated++;else counts.dmMissing++;
   if(!rm&&!dm)counts.neitherRated++;
   const exact=/^\d{17}$/.test(e.steamId??"");
   if(!exact)counts.noExactSteamIdentity++;
   else if(!rm||!dm)counts.exactSteamIdsInMissingSet++;
   if(!exact)continue;
   const row=evidence.get(e.steamId);
   if(!rm)histogram.rm[stages[row?.rmStage??0]]++;
   if(!dm)histogram.dm[stages[row?.dmStage??0]]++;
 }
 if(counts.rmRated+counts.rmMissing!==counts.publicIdentityRows ||
    counts.dmRated+counts.dmMissing!==counts.publicIdentityRows ||
    total(histogram.rm)+counts.noExactSteamIdentity!==counts.rmMissing ||
    total(histogram.dm)+counts.noExactSteamIdentity!==counts.dmMissing)
   throw Error("stage cohort conservation failed");
 process.stdout.write(JSON.stringify({
  kind:"aoe2war-steam-rating-gate-funnel",schemaVersion:1,
  observedAt:new Date().toISOString(),
  productionSource:process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE??null,
  databaseReadOnly:proof,
  explanation:"Highest stage reached by any one numeric observation on an exact Steam ID; no rating authority is granted.",
  counts,histogram,
  mutations:{production:0,parserRows:0,identityRows:0,currentRatingRows:0,wolo:0}
 }));
} finally {await prisma.$disconnect();}
