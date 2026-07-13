import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(key.slice(2), next && !next.startsWith("--") ? next : "true");
  if (next && !next.startsWith("--")) index += 1;
}

const required = [
  "market-id",
  "expected-session-key",
  "expected-wager-total",
  "expected-status",
  "expected-map",
  "expected-date",
  "expected-participants",
  "reason",
];
for (const key of required) {
  if (!args.get(key)) throw new Error(`Missing --${key}`);
}

const marketId = Number.parseInt(args.get("market-id"), 10);
const expectedWagerTotal = Number.parseInt(args.get("expected-wager-total"), 10);
const apply = args.get("apply") === "true";
const expectedConfirmation = `VOID-${marketId}-${expectedWagerTotal}`;
if (apply && args.get("confirm") !== expectedConfirmation) {
  throw new Error(`Apply requires --confirm ${expectedConfirmation}`);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const marketResult = await db.query(
    `select id, slug, title, event_label, status, featured, scheduled_match_id, linked_session_key,
            linked_game_stats_id, left_label, right_label, winner_side,
            resolution_reason, proof_deadline_at, voided_at, refund_status,
            created_at, updated_at, close_at, settled_at
       from bet_markets where id = $1`,
    [marketId]
  );
  if (marketResult.rowCount !== 1) throw new Error("Exact market ID not found.");
  const market = marketResult.rows[0];
  const [wagers, intents, bonuses, claims, replayRows, parseAttempts, settlements] = await Promise.all([
    db.query(
      `select w.id, w.user_id, w.side, w.amount_wolo, w.payout_wolo, w.status,
              w.execution_mode, (w.stake_tx_hash is not null) as has_stake_tx,
              (w.payout_tx_hash is not null) as has_payout_tx, w.created_at, w.updated_at,
              coalesce(u.in_game_name, u.steam_persona_name, u.uid) as player
         from bet_wagers w join users u on u.id = w.user_id
        where w.market_id = $1 order by w.id`,
      [marketId]
    ),
    db.query(
      `select id, user_id, side, amount_wolo, status,
              (stake_tx_hash is not null) as has_stake_tx, verified_at, recorded_at, created_at
         from bet_stake_intents where market_id = $1 order by id`,
      [marketId]
    ),
    db.query(
      `select id, bonus_type, total_amount_wolo, status, failure_reason,
              settled_at, rescinded_at, created_at
         from bet_market_founder_bonuses where market_id = $1 order by id`,
      [marketId]
    ),
    db.query(
      `select id, display_player_name, amount_wolo, claim_kind, claim_group_key,
              status, (payout_tx_hash is not null) as has_payout_tx, error_state,
              claimed_at, rescinded_at, created_at
         from pending_wolo_claims where source_market_id = $1 order by id`,
      [marketId]
    ),
    db.query(
      `select id, original_filename, replay_file, parse_iteration, is_final,
              disconnect_detected, winner, parse_source, parse_reason, created_at
         from game_stats
        where key_events->>'platform_match_id' = $1
           or lower(original_filename) = lower($1)
           or lower(replay_file) = lower($1)
        order by id`,
      [String(market.linked_session_key).replace(/^platform:/, "")]
    ),
    db.query(
      `select id, original_filename, status, detail, upload_mode, file_size_bytes,
              game_stats_id, created_at
         from replay_parse_attempts
        where game_stats_id = $1 order by id`,
      [market.linked_game_stats_id]
    ),
    market.scheduled_match_id
      ? db.query(
          `select id, scheduled_match_id, status, action, amount_wolo,
                  (tx_hash is not null) as has_tx, error_detail, created_at, executed_at
             from scheduled_match_settlements where scheduled_match_id = $1 order by id`,
          [market.scheduled_match_id]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const activeWagerTotal = wagers.rows
    .filter((row) => row.status === "active")
    .reduce((sum, row) => sum + Number(row.amount_wolo), 0);
  const participants = `${market.left_label} / ${market.right_label}`.toLowerCase();
  const expectedParticipants = args
    .get("expected-participants")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const checks = {
    sessionKey: market.linked_session_key === args.get("expected-session-key"),
    wagerTotal: activeWagerTotal === expectedWagerTotal,
    status: market.status === args.get("expected-status") || market.status === "voided",
    map: String(market.event_label).toLowerCase().includes(args.get("expected-map").toLowerCase()),
    date: new Date(market.created_at).toISOString().startsWith(args.get("expected-date")),
    participants: expectedParticipants.every((name) => participants.includes(name)),
    noTrustworthyFinal: !replayRows.rows.some((row) => row.is_final && row.winner && row.winner !== "Unknown"),
    escrowEvidence: wagers.rows.every((row) => row.execution_mode !== "onchain_escrow" || row.has_stake_tx),
  };

  const audit = {
    mode: apply ? "apply" : "dry-run",
    checkedAt: new Date().toISOString(),
    market,
    checks,
    activeWagerTotal,
    wagers: wagers.rows,
    stakeIntents: intents.rows,
    founderBonuses: bonuses.rows,
    pendingClaims: claims.rows,
    replayRows: replayRows.rows,
    parseAttempts: parseAttempts.rows,
    settlementJobs: settlements.rows,
  };
  console.log(JSON.stringify(audit, null, 2));

  if (!Object.values(checks).every(Boolean)) {
    throw new Error("Repair preconditions failed; no changes were made.");
  }
  if (!apply) {
    console.log(`DRY RUN ONLY. Apply requires --apply --confirm ${expectedConfirmation}`);
    process.exitCode = 0;
  } else if (market.status === "voided") {
    console.log("Market is already voided; idempotent no-op.");
  } else {
    const backupDir = path.join(process.cwd(), "runtime", "market-repair-backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `market-${marketId}-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(audit, null, 2), { mode: 0o600 });

    await db.query("begin");
    try {
      const now = new Date();
      await db.query(
        `update bet_markets
            set status = 'voided', featured = false, winner_side = null,
                close_at = null, settled_at = $2, voided_at = $2,
                resolution_reason = $3, refund_status = 'queued',
                settlement_status = 'pending',
                settlement_detail = 'Void refund queued through the normal idempotent settlement rail.'
          where id = $1 and status = $4`,
        [marketId, now, args.get("reason"), args.get("expected-status")]
      );
      await db.query(
        `update bet_market_founder_bonuses
            set status = 'rescinded', rescinded_at = $2,
                failure_reason = 'Market voided; no founder bonus is payable.'
          where market_id = $1 and rescinded_at is null
            and status in ('armed','pending','ready','partial')`,
        [marketId, now]
      );
      await db.query(
        `update pending_wolo_claims
            set status = 'rescinded', rescinded_at = $2,
                error_state = 'Market voided before bonus settlement.'
          where source_market_id = $1 and status = 'pending'
            and claim_kind in ('founders_bonus','founders_win','winner_bounty')`,
        [marketId, now]
      );
      await db.query(
        `insert into user_activity_events(user_id,type,path,label,metadata,created_at)
         select distinct user_id, 'bet_market_voided', '/bets', left($2::text, 80),
                jsonb_build_object('marketId',$1::int,'reason',$3::text,'refundStatus','queued'), $4::timestamp
           from bet_wagers where market_id = $1`,
        [marketId, market.title, args.get("reason"), now]
      );
      await db.query("commit");
      console.log(`Applied market void. Backup: ${backupPath}`);
      console.log("The normal bet reconciliation rail must now void active wagers and execute or queue exact-stake refunds.");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
} finally {
  await db.end();
}
