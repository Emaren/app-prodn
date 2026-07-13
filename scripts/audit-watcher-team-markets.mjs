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

function normalizeDatabaseUrl(value) {
  return String(value || "").replace("postgresql+asyncpg://", "postgresql://");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function key(value) {
  return clean(value).toLocaleLowerCase("en-US");
}

function sideNames(label) {
  return clean(label).split(/\s*\/\s*|\s+\+\s+/).map(clean).filter(Boolean);
}

function sameSet(left, right) {
  const normalize = (values) => [...new Set(values.map(key))].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function canonicalPlayers(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const name = clean(raw.name || raw.player || raw.player_name);
    if (!name) return [];
    const teamRaw = raw.team_id ?? raw.teamId ?? raw.team_number ?? raw.teamNumber ?? raw.team;
    const teamId = teamRaw === null || teamRaw === undefined || teamRaw === "" || Number(teamRaw) === -1
      ? null
      : String(teamRaw);
    return [{ name, teamId, winner: raw.winner === true, loser: raw.winner === false }];
  });
}

function explicitTeams(players) {
  if (![4, 6, 8].includes(players.length) || players.some((player) => player.teamId === null)) {
    return null;
  }
  const grouped = new Map();
  for (const player of players) {
    const team = grouped.get(player.teamId) || [];
    team.push(player);
    grouped.set(player.teamId, team);
  }
  if (grouped.size !== 2 || [...grouped.values()].some((team) => team.length !== players.length / 2)) {
    return null;
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => Number(left) - Number(right) || left.localeCompare(right))
    .map(([teamId, team]) => ({ teamId, players: team }));
}

function financialCorrectionResolved(status) {
  return ["resolved", "resolved_overpayment"].includes(clean(status));
}

function classify(row) {
  const players = canonicalPlayers(row.players);
  const displayedLeft = sideNames(row.left_label);
  const displayedRight = sideNames(row.right_label);
  const moneyWolo = Number(row.stake_wolo || 0);
  const paidWolo = Number(row.paid_wolo || 0);
  const base = {
    marketId: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    status: row.status,
    title: row.title,
    sessionKey: row.linked_session_key || "",
    gameStatsId: row.game_stats_id ? Number(row.game_stats_id) : null,
    playerCount: players.length,
    displayedLeft: displayedLeft.join(" / "),
    displayedRight: displayedRight.join(" / "),
    verifiedTeamA: "",
    verifiedTeamB: "",
    stakeWolo: moneyWolo,
    paidWolo,
    integrityStatus: row.integrity_status || "legacy_unverified",
    propositionHashPresent: Boolean(row.proposition_hash),
    incidentStatus: row.incident_status || "",
    category: "insufficient_evidence",
    reason: "final_replay_evidence_missing",
  };
  if (!row.game_stats_id || players.length < 2) return base;

  if (players.length === 2) {
    const aligned = displayedLeft.length === 1 && displayedRight.length === 1 &&
      sameSet([...displayedLeft, ...displayedRight], players.map((player) => player.name));
    const correctionResolved = financialCorrectionResolved(row.incident_status);
    return {
      ...base,
      verifiedTeamA: players[0].name,
      verifiedTeamB: players[1].name,
      category: aligned
        ? "safe"
        : moneyWolo > 0 && !correctionResolved
          ? "financial_correction_required"
          : "invalid_team_assignment",
      reason: aligned
        ? "one_vs_one_roster_matches_display"
        : correctionResolved
          ? "one_vs_one_display_mismatch_correction_resolved"
          : "one_vs_one_display_mismatch",
    };
  }

  const teams = explicitTeams(players);
  if (!teams) {
    return {
      ...base,
      category: "insufficient_evidence",
      reason: "two_complete_equal_explicit_teams_not_available",
    };
  }
  const teamA = teams[0].players.map((player) => player.name);
  const teamB = teams[1].players.map((player) => player.name);
  const direct = sameSet(displayedLeft, teamA) && sameSet(displayedRight, teamB);
  const reversed = sameSet(displayedLeft, teamB) && sameSet(displayedRight, teamA);
  const aligned = direct || reversed;
  const currentContract = row.integrity_status === "verified" && Boolean(row.proposition_hash);
  let category;
  let reason;
  if (!aligned) {
    const correctionResolved = financialCorrectionResolved(row.incident_status);
    category = (moneyWolo > 0 || paidWolo > 0) && !correctionResolved
      ? "financial_correction_required"
      : "invalid_team_assignment";
    reason = correctionResolved
      ? "displayed_sides_do_not_match_explicit_replay_teams_correction_resolved"
      : "displayed_sides_do_not_match_explicit_replay_teams";
  } else if (!currentContract) {
    category = "needs_review";
    reason = "legacy_market_aligned_but_has_no_frozen_proposition";
  } else {
    category = "safe";
    reason = "frozen_proposition_matches_explicit_replay_teams";
  }
  return {
    ...base,
    verifiedTeamA: teamA.join(" / "),
    verifiedTeamB: teamB.join(" / "),
    category,
    reason,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
try {
  await db.query("begin read only");
  const result = await db.query(`
    select
      market.id, market.created_at, market.status, market.title, market.left_label,
      market.right_label, market.linked_session_key, market.linked_game_stats_id,
      market.integrity_status, market.proposition_hash,
      game.id as game_stats_id, game.players,
      coalesce(financial.stake_wolo,0)::bigint as stake_wolo,
      coalesce(financial.paid_wolo,0)::bigint as paid_wolo,
      incident.status as incident_status
    from bet_markets market
    left join lateral (
      select candidate.id, candidate.players
      from game_stats candidate
      where candidate.id = market.linked_game_stats_id
         or (
           market.linked_session_key like 'platform:%'
           and candidate.key_events->>'platform_match_id' = replace(market.linked_session_key,'platform:','')
         )
      order by
        case when candidate.id = market.linked_game_stats_id then 0 else 1 end,
        candidate.is_final desc,
        candidate.parse_iteration desc,
        candidate.id desc
      limit 1
    ) game on true
    left join lateral (
      select sum(wager.amount_wolo) as stake_wolo,
             sum(case when wager.payout_tx_hash is not null then coalesce(wager.payout_wolo,0) else 0 end) as paid_wolo
      from bet_wagers wager where wager.market_id = market.id
    ) financial on true
    left join lateral (
      select item.status
      from bet_market_integrity_incidents item
      where item.market_id = market.id
        and item.incident_type = 'invalid_team_assignment'
      order by item.created_at desc, item.id desc
      limit 1
    ) incident on true
    where market.slug like 'watcher-live-%'
    order by market.id asc
  `);
  await db.query("commit");

  const rows = result.rows.map(classify);
  const counts = Object.fromEntries(
    [...new Set(rows.map((row) => row.category))]
      .sort()
      .map((category) => [category, rows.filter((row) => row.category === category).length])
  );
  const generatedAt = new Date().toISOString();
  const audit = {
    generatedAt,
    scope: "All watcher-created betting markets; replay order is never treated as team membership.",
    counts,
    rows,
  };
  const outDir = path.resolve(
    args.get("out-dir") || path.join("runtime", "team-market-audits", generatedAt.replaceAll(/[:.]/g, "-"))
  );
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

  const columns = rows.length ? Object.keys(rows[0]) : ["marketId", "category", "reason"];
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
  const markdown = [
    "# Watcher Team-Market Integrity Audit",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Player order was not used as team evidence. Team-market alignment requires two complete, equal teams from explicit replay team IDs.",
    "",
    "## Summary",
    "",
    ...Object.entries(counts).map(([category, count]) => `- ${category}: ${count}`),
    "",
    "## Flagged markets",
    "",
    "| Market | Category | Stake | Paid | Reason | Incident |",
    "|---:|---|---:|---:|---|---|",
    ...rows
      .filter((row) => row.category !== "safe")
      .map((row) => `| ${row.marketId} | ${row.category} | ${row.stakeWolo} | ${row.paidWolo} | ${row.reason} | ${row.incidentStatus || "—"} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "watcher-team-market-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(outDir, "watcher-team-market-audit.csv"), csv, { mode: 0o600 });
  fs.writeFileSync(path.join(outDir, "watcher-team-market-audit.md"), markdown, { mode: 0o600 });
  console.log(JSON.stringify({ generatedAt, outDir, counts, rowCount: rows.length }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
