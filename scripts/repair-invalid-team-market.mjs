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

const EXPECTED = {
  marketId: 345524,
  gameStatsId: 15503,
  sessionKey: "platform:641a5fb8-54d8-ab4a-a851-abf73c900e3c",
  slug: "watcher-live-platform-641a5fb8-54d8-ab4a-a851-abf73c900e3c",
  mapName: "Forest Nothing Feitoria",
  createdDate: "2026-07-13",
  jimWagerId: 437,
  emarenWagerId: 438,
  jimStakeTx: "2478588ECE7FAC4215FA9915542B0A19F44BB604C97651DDD58410AE7295750C",
  emarenStakeTx: "5A198F7296BF86951BFE83F62432AB197E44060A97E5B436AB886D5173576908",
  mistakenPayoutTx: "AB5C11BB29E9DC757B32ED99B3B3A8ABB4203EABBDFAD2413C95061EC78E6EF0",
  stakeWolo: 50_000,
  mistakenPayoutWolo: 98_000,
  totalVoidEntitlementWolo: 100_000,
  underpaymentWolo: 50_000,
  overpaymentWolo: 48_000,
  feeReversedWolo: 2_000,
  winners: ["Jim", "Scavanger_Ab", "Tekki", "Rick"],
  losers: ["JakeTheSnake", "MTR", "jlann85", "YELLOWJACKET"],
};

const marketId = Number.parseInt(args.get("market-id") || String(EXPECTED.marketId), 10);
if (marketId !== EXPECTED.marketId) {
  throw new Error(`This evidence package is locked to market ${EXPECTED.marketId}.`);
}
const apply = args.get("apply") === "true";
const verify = args.get("verify") === "true";
if (apply && verify) throw new Error("Choose exactly one of --apply or --verify.");
const confirmation = `VOID-INVALID-TEAMS-${marketId}-${EXPECTED.underpaymentWolo}-${EXPECTED.overpaymentWolo}`;
if (apply && args.get("confirm") !== confirmation) {
  throw new Error(`Apply requires --confirm ${confirmation}`);
}

function normalizeDatabaseUrl(value) {
  return String(value || "").replace("postgresql+asyncpg://", "postgresql://");
}

function names(value) {
  return Array.isArray(value)
    ? value.map((player) => String(player?.name || "").trim()).filter(Boolean)
    : [];
}

function normalizedSet(values) {
  return [...new Set(values.map((value) => value.toLocaleLowerCase("en-US")))].sort();
}

function sameNames(left, right) {
  return JSON.stringify(normalizedSet(left)) === JSON.stringify(normalizedSet(right));
}

function playerEvidence(player) {
  return {
    name: String(player.name || ""),
    steamId: String(player.steam_id || player.user_id || "") || null,
    teamId: player.team_id,
    playerNumber: player.number ?? null,
    winner: player.winner === true,
    civilization: player.civilization_name || player.civilization || null,
    colorId: player.color_id ?? null,
  };
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();

async function loadEvidence() {
  const [marketResult, wagerResult, claimResult, bonusResult, gameResult, incidentResult] = await Promise.all([
    db.query(
      `select id, slug, title, event_label, status, featured, linked_session_key,
              linked_game_stats_id, left_label, right_label, winner_side,
              resolution_reason, refund_status, settlement_status, settlement_run_id,
              settlement_failure_code, settlement_detail, created_at, settled_at,
              integrity_status, integrity_reason
         from bet_markets where id = $1`,
      [marketId]
    ),
    db.query(
      `select w.id, w.user_id, coalesce(u.in_game_name,u.steam_persona_name,u.uid) as player,
              w.side, w.amount_wolo, w.payout_wolo, w.status, w.execution_mode,
              w.stake_tx_hash, w.payout_tx_hash, w.created_at, w.settled_at
         from bet_wagers w join users u on u.id = w.user_id
        where w.market_id = $1 order by w.id`,
      [marketId]
    ),
    db.query(
      `select id, display_player_name, amount_wolo, claim_kind, claim_group_key,
              status, payout_tx_hash, source_founder_bonus_id, claimed_at, rescinded_at
         from pending_wolo_claims where source_market_id = $1 order by id`,
      [marketId]
    ),
    db.query(
      `select id, bonus_type, total_amount_wolo, status, settled_at, rescinded_at
         from bet_market_founder_bonuses where market_id = $1 order by id`,
      [marketId]
    ),
    db.query(
      `select id, map, winner, players, parse_iteration, is_final, parse_source,
              parse_reason, key_events, created_at, played_on
         from game_stats where id = $1`,
      [EXPECTED.gameStatsId]
    ),
    db.query(
      `select incident.id, incident.incident_key, incident.status, incident.public_summary,
              incident.original_payout_wolo, incident.void_entitlement_wolo,
              incident.underpayment_wolo, incident.overpayment_wolo,
              incident.betting_fee_reversed_wolo, incident.operator_return_status,
              incident.resolved_at,
              coalesce(json_agg(adjustment order by adjustment.id)
                filter (where adjustment.id is not null), '[]') as adjustments
         from bet_market_integrity_incidents incident
         left join bet_market_financial_adjustments adjustment on adjustment.incident_id = incident.id
        where incident.incident_key = $1
        group by incident.id`,
      [`market-${marketId}-invalid-team-assignment`]
    ),
  ]);
  if (marketResult.rowCount !== 1) throw new Error("Exact market not found.");
  if (gameResult.rowCount !== 1) throw new Error("Exact linked final game_stats row not found.");
  return {
    market: marketResult.rows[0],
    wagers: wagerResult.rows,
    claims: claimResult.rows,
    bonuses: bonusResult.rows,
    game: gameResult.rows[0],
    incident: incidentResult.rows[0] || null,
  };
}

function inspectEvidence(evidence) {
  const { market, wagers, claims, bonuses, game, incident } = evidence;
  const jim = wagers.find((wager) => Number(wager.id) === EXPECTED.jimWagerId);
  const emaren = wagers.find((wager) => Number(wager.id) === EXPECTED.emarenWagerId);
  const parsedPlayers = Array.isArray(game.players) ? game.players : [];
  const teams = new Map();
  for (const player of parsedPlayers) {
    const key = player?.team_id;
    if (key === null || key === undefined || key === "") continue;
    const bucket = teams.get(String(key)) || [];
    bucket.push(player);
    teams.set(String(key), bucket);
  }
  const winnerTeam = [...teams.values()].find((team) => team.every((player) => player.winner === true)) || [];
  const loserTeam = [...teams.values()].find((team) => team.every((player) => player.winner === false)) || [];
  const claimedPayout = claims.find((claim) => claim.claim_kind === "bet_payout");
  const pendingFounderClaims = claims.filter(
    (claim) => claim.claim_kind === "founders_bonus" && claim.status === "pending"
  );
  const checks = {
    exactMarket: Number(market.id) === EXPECTED.marketId,
    exactSlug: market.slug === EXPECTED.slug,
    exactSession: market.linked_session_key === EXPECTED.sessionKey,
    exactFinalGame: Number(market.linked_game_stats_id) === EXPECTED.gameStatsId,
    exactMap: String(game.map?.name || "") === EXPECTED.mapName,
    exactDate: new Date(market.created_at).toISOString().startsWith(EXPECTED.createdDate),
    exactRoster: parsedPlayers.length === 8,
    exactlyTwoReplayTeams: teams.size === 2 && [...teams.values()].every((team) => team.length === 4),
    exactReplayWinners: sameNames(names(winnerTeam), EXPECTED.winners),
    exactReplayLosers: sameNames(names(loserTeam), EXPECTED.losers),
    coherentWinnerFlags: winnerTeam.length === 4 && loserTeam.length === 4,
    winnerStringOnWinnerTeam: names(winnerTeam).includes(game.winner),
    exactWagerCount: wagers.length === 2,
    jimStake: Boolean(
      jim && jim.player === "Jim" && jim.side === "left" && asNumber(jim.amount_wolo) === EXPECTED.stakeWolo
    ),
    emarenStake: Boolean(
      emaren && emaren.player === "Emaren" && emaren.side === "right" && asNumber(emaren.amount_wolo) === EXPECTED.stakeWolo
    ),
    exactJimStakeTx: jim?.stake_tx_hash === EXPECTED.jimStakeTx,
    exactEmarenStakeTx: emaren?.stake_tx_hash === EXPECTED.emarenStakeTx,
    exactMistakenPayout: Boolean(
      emaren &&
      asNumber(emaren.payout_wolo) === EXPECTED.mistakenPayoutWolo &&
      emaren.payout_tx_hash === EXPECTED.mistakenPayoutTx
    ),
    claimedPayoutPreserved: Boolean(
      claimedPayout &&
      claimedPayout.status === "claimed" &&
      asNumber(claimedPayout.amount_wolo) === EXPECTED.mistakenPayoutWolo &&
      claimedPayout.payout_tx_hash === EXPECTED.mistakenPayoutTx
    ),
    founderBonusShape: bonuses.length === 1 && asNumber(bonuses[0].total_amount_wolo) === 1_000,
    founderClaimsShape: verify
      ? claims.filter((claim) => claim.claim_kind === "founders_bonus").every((claim) => claim.status === "rescinded")
      : pendingFounderClaims.length === 2 && pendingFounderClaims.every((claim) => asNumber(claim.amount_wolo) === 500),
    incidentCorrectionShape: verify
      ? Boolean(
          incident &&
          asNumber(incident.underpayment_wolo) === EXPECTED.underpaymentWolo &&
          asNumber(incident.overpayment_wolo) === EXPECTED.overpaymentWolo &&
          incident.adjustments.some(
            (adjustment) =>
              Number(adjustment.wager_id) === EXPECTED.jimWagerId &&
              adjustment.adjustment_status === "corrective_refund_paid" &&
              asNumber(adjustment.amount_still_owed_wolo) === 0 &&
              Boolean(adjustment.corrective_tx_hash)
          ) &&
          incident.adjustments.some(
            (adjustment) =>
              Number(adjustment.wager_id) === EXPECTED.emarenWagerId &&
              adjustment.adjustment_status === "overpayment_recorded" &&
              asNumber(adjustment.overpayment_wolo) === EXPECTED.overpaymentWolo
          )
        )
      : true,
    validLifecycle: verify
      ? market.status === "voided" && market.winner_side === null
      : ["settled", "voided"].includes(market.status),
  };
  return { checks, teams, winnerTeam, loserTeam, jim, emaren, claimedPayout, incident };
}

try {
  const before = await loadEvidence();
  const inspection = inspectEvidence(before);
  const report = {
    mode: apply ? "apply" : verify ? "verify" : "dry-run",
    checkedAt: new Date().toISOString(),
    expected: EXPECTED,
    market: before.market,
    game: {
      ...before.game,
      players: before.game.players.map(playerEvidence),
    },
    wagers: before.wagers,
    claims: before.claims,
    bonuses: before.bonuses,
    existingIncident: before.incident,
    checks: inspection.checks,
    financialCorrection: {
      jimExactStakeReturnWolo: EXPECTED.underpaymentWolo,
      emarenAlreadyPaidWolo: EXPECTED.mistakenPayoutWolo,
      emarenVoidEntitlementWolo: EXPECTED.stakeWolo,
      emarenOverpaymentRecordedWolo: EXPECTED.overpaymentWolo,
      automaticClawbackWolo: 0,
      bettingFeeReversedWolo: EXPECTED.feeReversedWolo,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!Object.values(inspection.checks).every(Boolean)) {
    throw new Error("Exact repair preconditions failed; no changes were made.");
  }

  if (!apply) {
    if (!verify) console.log(`DRY RUN ONLY. Apply requires --apply --confirm ${confirmation}`);
  } else if (before.incident && before.market.status === "voided") {
    console.log("Incident and void already exist; idempotent no-op. Run with --verify.");
  } else {
    const backupDir = path.join(process.cwd(), "runtime", "market-integrity-backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupBody = `${JSON.stringify(report, null, 2)}\n`;
    const backupPath = path.join(
      backupDir,
      `market-${marketId}-invalid-team-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(backupPath, backupBody, { mode: 0o600 });

    await db.query("begin");
    try {
      await db.query("select pg_advisory_xact_lock($1)", [marketId]);
      const locked = await db.query(
        `select status, linked_game_stats_id from bet_markets where id = $1 for update`,
        [marketId]
      );
      if (locked.rowCount !== 1 || !["settled", "voided"].includes(locked.rows[0].status)) {
        throw new Error("Market state changed after dry-run; rolling back.");
      }
      const now = new Date();
      const evidence = {
        source: "market_345524_production_incident",
        detectedFrom: ["final replay team_id", "winner flags", "wager ledger", "chain tx hashes", "Jim ground-truth report"],
        linkedGameStatsId: EXPECTED.gameStatsId,
        replayParseIteration: before.game.parse_iteration,
        replayParseReason: before.game.parse_reason,
        replayWinner: before.game.winner,
        verifiedWinners: inspection.winnerTeam.map(playerEvidence),
        verifiedLosers: inspection.loserTeam.map(playerEvidence),
        preservedTransactions: {
          jimStakeTx: EXPECTED.jimStakeTx,
          emarenStakeTx: EXPECTED.emarenStakeTx,
          mistakenPayoutTx: EXPECTED.mistakenPayoutTx,
        },
        automaticClawback: false,
        correctionPolicy: "Return each original stake exactly once; preserve and disclose the prior overpayment.",
      };
      const incidentResult = await db.query(
        `insert into bet_market_integrity_incidents(
           market_id, incident_key, incident_type, status, public_summary, evidence,
           original_left_label, original_right_label, verified_left_roster, verified_right_roster,
           original_payout_wolo, void_entitlement_wolo, underpayment_wolo, overpayment_wolo,
           betting_fee_reversed_wolo, operator_return_status, created_at, updated_at
         ) values ($1,$2,'invalid_team_assignment','correcting',$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,
                   $9,$10,$11,$12,$13,'not_requested',$14,$14)
         on conflict (incident_key) do update set
           status = excluded.status,
           public_summary = excluded.public_summary,
           evidence = excluded.evidence,
           verified_left_roster = excluded.verified_left_roster,
           verified_right_roster = excluded.verified_right_roster,
           updated_at = excluded.updated_at
         returning id`,
        [
          marketId,
          `market-${marketId}-invalid-team-assignment`,
          "Market voided: the displayed betting sides did not match the replay's explicit teams. Exact unpaid stakes are being returned.",
          JSON.stringify(evidence),
          before.market.left_label,
          before.market.right_label,
          JSON.stringify(inspection.winnerTeam.map(playerEvidence)),
          JSON.stringify(inspection.loserTeam.map(playerEvidence)),
          EXPECTED.mistakenPayoutWolo,
          EXPECTED.totalVoidEntitlementWolo,
          EXPECTED.underpaymentWolo,
          EXPECTED.overpaymentWolo,
          EXPECTED.feeReversedWolo,
          now,
        ]
      );
      const incidentId = Number(incidentResult.rows[0].id);

      for (const adjustment of [
        {
          wager: inspection.jim,
          paid: 0,
          owed: EXPECTED.underpaymentWolo,
          overpayment: 0,
          status: "corrective_refund_pending",
          returnStatus: null,
        },
        {
          wager: inspection.emaren,
          paid: EXPECTED.mistakenPayoutWolo,
          owed: 0,
          overpayment: EXPECTED.overpaymentWolo,
          status: "overpayment_recorded",
          returnStatus: "not_requested",
        },
      ]) {
        await db.query(
          `insert into bet_market_financial_adjustments(
             incident_id,wager_id,user_id,original_stake_wolo,amount_already_paid_wolo,
             void_entitlement_wolo,amount_still_owed_wolo,overpayment_wolo,
             adjustment_status,voluntary_return_status,created_at,updated_at
           ) values ($1,$2,$3,$4,$5,$4,$6,$7,$8,$9,$10,$10)
           on conflict (incident_id,wager_id) do update set
             original_stake_wolo=excluded.original_stake_wolo,
             amount_already_paid_wolo=excluded.amount_already_paid_wolo,
             void_entitlement_wolo=excluded.void_entitlement_wolo,
             amount_still_owed_wolo=excluded.amount_still_owed_wolo,
             overpayment_wolo=excluded.overpayment_wolo,
             adjustment_status=excluded.adjustment_status,
             voluntary_return_status=excluded.voluntary_return_status,
             updated_at=excluded.updated_at`,
          [
            incidentId,
            adjustment.wager.id,
            adjustment.wager.user_id,
            EXPECTED.stakeWolo,
            adjustment.paid,
            adjustment.owed,
            adjustment.overpayment,
            adjustment.status,
            adjustment.returnStatus,
            now,
          ]
        );
      }

      await db.query(
        `update bet_markets set
           status='voided', featured=false, winner_side=null, close_at=null,
           voided_at=coalesce(voided_at,$2), resolution_reason='invalid_team_assignment',
           refund_status='correction_pending', settlement_status='correction_pending',
           settlement_failure_code=null,
           settlement_detail='Invalid team assignment voided. Exact unpaid stake correction queued; prior payout preserved in incident ledger.',
           integrity_status='voided_invalid_team', integrity_reason='invalid_team_assignment',
           commissioner_review_state='voided_invalid_team', under_review_at=coalesce(under_review_at,$2)
         where id=$1`,
        [marketId, now]
      );
      await db.query(
        `update bet_wagers set status='void', settled_at=coalesce(settled_at,$2)
          where market_id=$1`,
        [marketId, now]
      );
      await db.query(
        `update bet_market_founder_bonuses set
           status='rescinded', rescinded_at=coalesce(rescinded_at,$2),
           failure_reason='Market voided for invalid team assignment; no founder bonus is payable.'
         where market_id=$1 and status <> 'rescinded'`,
        [marketId, now]
      );
      await db.query(
        `update pending_wolo_claims set
           status='rescinded', rescinded_at=coalesce(rescinded_at,$2),
           error_state='Market voided for invalid team assignment; founder bonus rescinded.'
         where source_market_id=$1 and status='pending' and claim_kind='founders_bonus'`,
        [marketId, now]
      );
      await db.query(
        `insert into player_identity_aliases(
           observed_name,observed_normalized_name,canonical_stable_player_key,
           canonical_display_name,steam_id,status,evidence,created_at,updated_at
         ) values
           ('Savanger_Ab','savanger_ab','steam:76561198124349731','Savanger_Ab','76561198124349731','pending',$1::jsonb,$2,$2),
           ('Scavenger_Ab','scavenger_ab','steam:76561198124349731','Savanger_Ab','76561198124349731','pending',$1::jsonb,$2,$2),
           ('Jlann','jlann','steam:76561198105942599','jlann85','76561198105942599','pending',$1::jsonb,$2,$2)
         on conflict (observed_normalized_name,canonical_stable_player_key) do nothing`,
        [JSON.stringify({ source: `market-${marketId}`, note: "Identity-review evidence only; never used to assign replay teams." }), now]
      );
      await db.query(
        `insert into user_activity_events(user_id,type,path,label,metadata,created_at)
         select distinct user_id,'market_voided_invalid_teams',$2,left($3::text,80),
           jsonb_build_object(
             'marketId',$1::int,'incidentId',$4::int,'reason','invalid_team_assignment',
             'automaticClawback',false,'correctionStatus','pending'
           ),$5
         from bet_wagers where market_id=$1`,
        [marketId, `/bets/${marketId}`, before.market.title, incidentId, now]
      );
      await db.query(
        `insert into user_activity_events(user_id,type,path,label,metadata,created_at)
         values
           ($1,'corrective_refund_queued',$3,left($4::text,80),jsonb_build_object('marketId',$2::int,'incidentId',$5::int,'wagerId',$6::int,'amountWolo',$7::int),$8::timestamp),
           ($9,'market_overpayment_detected',$3,left($4::text,80),jsonb_build_object('marketId',$2::int,'incidentId',$5::int,'wagerId',$10::int,'overpaymentWolo',$11::int,'automaticClawback',false),$8::timestamp)`,
        [
          inspection.jim.user_id,
          marketId,
          `/bets/${marketId}`,
          before.market.title,
          incidentId,
          EXPECTED.jimWagerId,
          EXPECTED.underpaymentWolo,
          now,
          inspection.emaren.user_id,
          EXPECTED.emarenWagerId,
          EXPECTED.overpaymentWolo,
        ]
      );
      await db.query("commit");
      console.log(`Applied exact incident repair. Backup: ${backupPath}`);
      console.log(`Backup SHA256: ${sha256(backupBody)}`);
      console.log("The app correction rail will now return only Jim's missing 50,000 WOLO and preserve the 98,000 WOLO payout record.");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
} finally {
  await db.end();
}
