import { createHash } from "node:crypto";
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

const expected = {
  marketId: Number.parseInt(args.get("market-id") || "", 10),
  gameStatsId: Number.parseInt(args.get("game-stats-id") || "", 10),
  wagerId: Number.parseInt(args.get("wager-id") || "", 10),
  stakeWolo: Number.parseInt(args.get("stake-wolo") || "", 10),
  sessionKey: args.get("session-key") || "",
  mapName: args.get("map") || "",
  player: args.get("player") || "",
  stakeTxHash: (args.get("stake-tx") || "").toUpperCase(),
};
for (const [name, value] of Object.entries(expected)) {
  if (value === "" || (typeof value === "number" && (!Number.isSafeInteger(value) || value < 1))) {
    throw new Error(`Missing or invalid --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
}

const apply = args.get("apply") === "true";
const verify = args.get("verify") === "true";
if (apply && verify) throw new Error("Choose one of --apply or --verify.");
const confirmation = `VOID-UNPAID-INVALID-TEAMS-${expected.marketId}-${expected.stakeWolo}`;
if (apply && args.get("confirm") !== confirmation) {
  throw new Error(`Apply requires --confirm ${confirmation}`);
}

const databaseUrl = String(process.env.DATABASE_URL || "").replace(
  "postgresql+asyncpg://",
  "postgresql://"
);
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function lowerSet(values) {
  return [...new Set(values.map((value) => clean(value).toLowerCase()))].sort();
}
function sameSet(left, right) {
  return JSON.stringify(lowerSet(left)) === JSON.stringify(lowerSet(right));
}
function splitSide(value) {
  return clean(value).split(/\s*\/\s*|\s+\+\s+/).map(clean).filter(Boolean);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function playerEvidence(player) {
  return {
    name: clean(player.name),
    steamId: clean(player.steam_id || player.user_id) || null,
    teamId: player.team_id,
    playerNumber: player.number ?? null,
    winner: player.winner === true,
  };
}

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
async function load() {
  const [market, game, wagers, claims, bonuses, incident] = await Promise.all([
    db.query("select * from bet_markets where id=$1", [expected.marketId]),
    db.query("select id,map,winner,players,parse_iteration,is_final,parse_reason,created_at from game_stats where id=$1", [expected.gameStatsId]),
    db.query(
      `select wager.*,coalesce(users.in_game_name,users.steam_persona_name,users.uid) player
         from bet_wagers wager join users on users.id=wager.user_id
        where wager.market_id=$1 order by wager.id`,
      [expected.marketId]
    ),
    db.query("select * from pending_wolo_claims where source_market_id=$1 order by id", [expected.marketId]),
    db.query("select * from bet_market_founder_bonuses where market_id=$1 order by id", [expected.marketId]),
    db.query("select * from bet_market_integrity_incidents where incident_key=$1", [`market-${expected.marketId}-invalid-team-assignment`]),
  ]);
  if (market.rowCount !== 1 || game.rowCount !== 1) throw new Error("Exact market/game evidence missing.");
  return {
    market: market.rows[0],
    game: game.rows[0],
    wagers: wagers.rows,
    claims: claims.rows,
    bonuses: bonuses.rows,
    incident: incident.rows[0] || null,
  };
}

function inspect(evidence) {
  const players = Array.isArray(evidence.game.players) ? evidence.game.players : [];
  const grouped = new Map();
  for (const player of players) {
    if (player.team_id === null || player.team_id === undefined) continue;
    const team = grouped.get(String(player.team_id)) || [];
    team.push(player);
    grouped.set(String(player.team_id), team);
  }
  const teams = [...grouped.values()];
  const winners = teams.find((team) => team.every((player) => player.winner === true)) || [];
  const losers = teams.find((team) => team.every((player) => player.winner === false)) || [];
  const left = splitSide(evidence.market.left_label);
  const right = splitSide(evidence.market.right_label);
  const aligned =
    (sameSet(left, winners.map((player) => player.name)) && sameSet(right, losers.map((player) => player.name))) ||
    (sameSet(right, winners.map((player) => player.name)) && sameSet(left, losers.map((player) => player.name)));
  const wager = evidence.wagers[0] || null;
  const correctiveClaim = evidence.claims.find(
    (claim) => claim.claim_kind === "bet_corrective_refund"
  );
  const originalClaims = evidence.claims.filter(
    (claim) => claim.claim_kind !== "bet_corrective_refund"
  );
  const checks = {
    exactMarket: Number(evidence.market.id) === expected.marketId,
    exactGame: Number(evidence.market.linked_game_stats_id) === expected.gameStatsId && Number(evidence.game.id) === expected.gameStatsId,
    exactSession: evidence.market.linked_session_key === expected.sessionKey,
    exactMap: clean(evidence.game.map?.name) === expected.mapName,
    finalReplay: evidence.game.is_final === true,
    completeTeams: players.length === 8 && teams.length === 2 && teams.every((team) => team.length === 4),
    coherentWinnerFlags: winners.length === 4 && losers.length === 4,
    invalidDisplayedSides: !aligned,
    oneWager: evidence.wagers.length === 1,
    exactWager: Boolean(
      wager && Number(wager.id) === expected.wagerId && clean(wager.player) === expected.player &&
      Number(wager.amount_wolo) === expected.stakeWolo && wager.stake_tx_hash === expected.stakeTxHash
    ),
    payoutStateExact: verify
      ? Boolean(
          correctiveClaim && correctiveClaim.status === "claimed" &&
          Number(correctiveClaim.amount_wolo) === expected.stakeWolo && correctiveClaim.payout_tx_hash &&
          originalClaims.every((claim) => !claim.payout_tx_hash)
        )
      : Boolean(
          wager && !wager.payout_tx_hash && Number(wager.payout_wolo || 0) === 0 &&
          evidence.claims.every((claim) => !claim.payout_tx_hash)
        ),
    originalClaimsSafe: verify
      ? originalClaims.every((claim) => claim.status === "rescinded")
      : originalClaims.every((claim) => claim.status === "pending" || claim.status === "rescinded"),
    validLifecycle: verify
      ? evidence.market.status === "voided" && evidence.market.winner_side === null
      : ["settled", "under_review", "voided"].includes(evidence.market.status),
  };
  return { checks, winners, losers, wager };
}

try {
  const evidence = await load();
  const inspection = inspect(evidence);
  const report = {
    mode: apply ? "apply" : verify ? "verify" : "dry-run",
    checkedAt: new Date().toISOString(),
    expected,
    market: evidence.market,
    game: { ...evidence.game, players: evidence.game.players.map(playerEvidence) },
    wagers: evidence.wagers,
    claims: evidence.claims,
    bonuses: evidence.bonuses,
    existingIncident: evidence.incident,
    checks: inspection.checks,
    correction: { exactStakeReturnWolo: expected.stakeWolo, automaticClawbackWolo: 0 },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!Object.values(inspection.checks).every(Boolean)) {
    throw new Error("Exact repair preconditions failed; no changes were made.");
  }
  if (!apply) {
    if (!verify) console.log(`DRY RUN ONLY. Apply requires --apply --confirm ${confirmation}`);
  } else if (evidence.incident && evidence.market.status === "voided") {
    console.log("Incident already applied; idempotent no-op. Run --verify.");
  } else {
    const backupDir = path.join(process.cwd(), "runtime", "market-integrity-backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const body = `${JSON.stringify(report, null, 2)}\n`;
    const backupPath = path.join(backupDir, `market-${expected.marketId}-invalid-team-${Date.now()}.json`);
    fs.writeFileSync(backupPath, body, { mode: 0o600 });

    await db.query("begin");
    try {
      await db.query("select pg_advisory_xact_lock($1)", [expected.marketId]);
      const now = new Date();
      const incident = await db.query(
        `insert into bet_market_integrity_incidents(
           market_id,incident_key,incident_type,status,public_summary,evidence,
           original_left_label,original_right_label,verified_left_roster,verified_right_roster,
           original_payout_wolo,void_entitlement_wolo,underpayment_wolo,overpayment_wolo,
           betting_fee_reversed_wolo,operator_return_status,created_at,updated_at
         ) values($1,$2,'invalid_team_assignment','correcting',$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,
                  0,$9,$9,0,0,'not_applicable',$10,$10)
         on conflict(incident_key) do update set status='correcting',evidence=excluded.evidence,updated_at=excluded.updated_at
         returning id`,
        [
          expected.marketId,
          `market-${expected.marketId}-invalid-team-assignment`,
          "Market voided: displayed betting sides mixed players from both explicit replay teams. The exact unpaid stake is being returned.",
          JSON.stringify({
            source: "explicit_final_replay_and_unpaid_wager_ledger",
            linkedGameStatsId: expected.gameStatsId,
            verifiedWinners: inspection.winners.map(playerEvidence),
            verifiedLosers: inspection.losers.map(playerEvidence),
            stakeTxHash: expected.stakeTxHash,
            payoutExecuted: false,
          }),
          evidence.market.left_label,
          evidence.market.right_label,
          JSON.stringify(inspection.winners.map(playerEvidence)),
          JSON.stringify(inspection.losers.map(playerEvidence)),
          expected.stakeWolo,
          now,
        ]
      );
      const incidentId = Number(incident.rows[0].id);
      await db.query(
        `insert into bet_market_financial_adjustments(
           incident_id,wager_id,user_id,original_stake_wolo,amount_already_paid_wolo,
           void_entitlement_wolo,amount_still_owed_wolo,overpayment_wolo,
           adjustment_status,voluntary_return_status,created_at,updated_at
         ) values($1,$2,$3,$4,0,$4,$4,0,'corrective_refund_pending','not_applicable',$5,$5)
         on conflict(incident_id,wager_id) do update set
           amount_still_owed_wolo=excluded.amount_still_owed_wolo,
           adjustment_status=excluded.adjustment_status,updated_at=excluded.updated_at`,
        [incidentId, inspection.wager.id, inspection.wager.user_id, expected.stakeWolo, now]
      );
      await db.query(
        `update bet_markets set status='voided',featured=false,winner_side=null,close_at=null,
           voided_at=coalesce(voided_at,$2),resolution_reason='invalid_team_assignment',
           refund_status='correction_pending',settlement_status='correction_pending',
           settlement_failure_code=null,
           settlement_detail='Invalid team assignment voided; exact unpaid stake correction queued.',
           integrity_status='voided_invalid_team',integrity_reason='invalid_team_assignment',
           commissioner_review_state='voided_invalid_team',under_review_at=coalesce(under_review_at,$2)
         where id=$1`,
        [expected.marketId, now]
      );
      await db.query(
        `update bet_wagers set status='void',settled_at=coalesce(settled_at,$2)
          where id=$1`,
        [expected.wagerId, now]
      );
      await db.query(
        `update pending_wolo_claims set status='rescinded',rescinded_at=coalesce(rescinded_at,$2),
           error_state='Market voided for invalid team assignment; unexecuted claim rescinded.'
         where source_market_id=$1 and status='pending'`,
        [expected.marketId, now]
      );
      await db.query(
        `update bet_market_founder_bonuses set status='rescinded',rescinded_at=coalesce(rescinded_at,$2),
           failure_reason='Market voided for invalid team assignment.'
         where market_id=$1 and status<>'rescinded'`,
        [expected.marketId, now]
      );
      await db.query(
        `insert into user_activity_events(user_id,type,path,label,metadata,created_at)
         values($1,'market_voided_invalid_teams',$2,left($3::text,80),
           jsonb_build_object('marketId',$4::int,'incidentId',$5::int,'correctionWolo',$6::int),$7)`,
        [inspection.wager.user_id, `/bets/${expected.marketId}`, evidence.market.title, expected.marketId, incidentId, expected.stakeWolo, now]
      );
      await db.query(
        `insert into user_activity_events(user_id,type,path,label,metadata,created_at)
         values($1,'corrective_refund_queued',$2,left($3::text,80),
           jsonb_build_object('marketId',$4::int,'incidentId',$5::int,'wagerId',$6::int,'amountWolo',$7::int),$8)`,
        [inspection.wager.user_id, `/bets/${expected.marketId}`, evidence.market.title, expected.marketId, incidentId, expected.wagerId, expected.stakeWolo, now]
      );
      await db.query("commit");
      console.log(`Applied exact unpaid-market correction. Backup: ${backupPath}`);
      console.log(`Backup SHA256: ${sha256(body)}`);
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
} finally {
  await db.end();
}
