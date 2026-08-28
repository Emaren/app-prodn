import type { PrismaClient } from "@/lib/generated/prisma";
import { isPublicBattleArchiveRow } from "@/lib/publicBattleArchiveEligibility";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import { EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } from "@/lib/replayAdjudications";

export const PUBLIC_BATTLE_ARCHIVE_PAGE_MAX = 500;

function boundedInteger(value: number, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

/**
 * Page the logical public battle corpus at the database grain.
 *
 * Platform ID is canonical when present; otherwise a final replay's immutable
 * content hash is the battle identity. The SQL eligibility predicates mirror
 * the public archive contract so offsets count visible logical battles rather
 * than raw parser rows. This replaces the former 5,000-row in-memory ceiling.
 */
export async function loadPublicBattleArchivePage(
  prisma: PrismaClient,
  options: { offset?: number; limit?: number } = {}
) {
  const offset = boundedInteger(
    options.offset ?? 0,
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const limit = boundedInteger(
    options.limit ?? 24,
    24,
    1,
    PUBLIC_BATTLE_ARCHIVE_PAGE_MAX
  );

  const candidateRows = await prisma.$queryRaw<
    Array<{
      id: number | null;
      battleIdentity: string | null;
      pageOrdinal: bigint | number | null;
      total: bigint | number;
    }>
  >`
    with source as (
      select
        gs.id,
        lower(btrim(gs.replay_hash)) as replay_hash,
        case
          when jsonb_typeof(gs.key_events::jsonb -> 'platform_match_id') = 'string'
            and nullif(btrim(gs.key_events::jsonb ->> 'platform_match_id'), '') is not null
            and lower(btrim(gs.key_events::jsonb ->> 'platform_match_id')) not in (
              'unknown',
              'unknown map',
              'unknown player',
              'unknown opponent',
              'unknown result',
              'unknown battlefield',
              'undetermined',
              'unresolved',
              'map unresolved',
              'roster unresolved',
              'winner unresolved',
              'opponent unresolved',
              'none',
              'null',
              'n/a',
              'na',
              'parsing',
              'players parsing',
              'game in progress',
              'tbd',
              'to be determined',
              '-',
              '--',
              'unavailable',
              'map unavailable',
              'size unavailable',
              'version unavailable',
              'match type unavailable',
              'parse reason unavailable',
              'duration unavailable',
              'civilization unavailable',
              'date unavailable',
              'map pending'
            )
            then lower(btrim(gs.key_events::jsonb ->> 'platform_match_id'))
          else null
        end as platform_match_id,
        coalesce(gs.played_on, gs.timestamp, gs.created_at) as activity_at,
        gs.parse_iteration,
        lower(btrim(coalesce(gs.original_filename, gs.replay_file, ''))) as archive_filename,
        lower(btrim(coalesce(gs.parse_reason, ''))) as normalized_parse_reason,
        player_metadata.named_player_count
      from game_stats gs
      cross join lateral (
        select count(*)::int as named_player_count
        from jsonb_array_elements(
          case
            when jsonb_typeof(gs.players::jsonb) = 'array' then gs.players::jsonb
            else '[]'::jsonb
          end
        ) as player
        where nullif(
          btrim(
            coalesce(
              player ->> 'name',
              player ->> 'player_name',
              player ->> 'playerName'
            )
          ),
          ''
        ) is not null
          and lower(
            btrim(
              coalesce(
                player ->> 'name',
                player ->> 'player_name',
                player ->> 'playerName'
              )
            )
          ) <> 'unknown'
      ) as player_metadata
      where gs.is_final = true
    ), eligible as (
      select
        source.*,
        case
          when platform_match_id is not null
            then 'platform:' || platform_match_id
          else 'hash:' || replay_hash
        end as battle_identity
      from source
      where archive_filename not like '%.aoe2mpgame'
        and (
          normalized_parse_reason <> 'watcher_final_unparsed'
          or named_player_count >= 2
        )
    ), battles as (
      select
        battle_identity,
        max(activity_at) as battle_activity_at,
        max(id) as battle_order_id
      from eligible
      group by battle_identity
    ), page as (
      select
        battle_identity,
        battle_activity_at,
        battle_order_id
      from battles
      order by battle_activity_at desc, battle_order_id desc
      limit ${limit}
      offset ${offset}
    ), ordered_page as (
      select
        page.*,
        row_number() over (
          order by battle_activity_at desc, battle_order_id desc
        ) as page_ordinal
      from page
    ), totals as (
      select count(*)::bigint as total
      from battles
    )
    select
      candidates.id,
      candidates.battle_identity as "battleIdentity",
      candidates.page_ordinal as "pageOrdinal",
      totals.total
    from totals
    left join lateral (
      select
        eligible.id,
        ordered_page.battle_identity,
        ordered_page.page_ordinal
      from ordered_page
      join eligible using (battle_identity)
      order by ordered_page.page_ordinal, eligible.id
    ) as candidates on true
  `;

  const ordinal = (value: bigint | number | null) => {
    if (typeof value === "bigint") return Number(value);
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.MAX_SAFE_INTEGER;
  };
  const orderedCandidateRows = [...candidateRows].sort((left, right) => {
    const ordinalDiff = ordinal(left.pageOrdinal) - ordinal(right.pageOrdinal);
    if (ordinalDiff !== 0) return ordinalDiff;
    return Number(left.id ?? Number.MAX_SAFE_INTEGER) -
      Number(right.id ?? Number.MAX_SAFE_INTEGER);
  });

  const candidateIds = orderedCandidateRows.flatMap((row) =>
    typeof row.id === "number" ? [row.id] : []
  );
  const logicalPageIdentities = Array.from(
    new Set(
      orderedCandidateRows.flatMap((row) =>
        typeof row.battleIdentity === "string" ? [row.battleIdentity] : []
      )
    )
  );
  const total = Number(candidateRows[0]?.total ?? 0);
  if (candidateIds.length === 0) {
    return { rows: [], total, offset, nextOffset: offset };
  }

  const rows = await prisma.gameStats.findMany({
    where: {
      id: {
        in: candidateIds,
      },
    },
    select: {
      id: true,
      replayHash: true,
      winner: true,
      map: true,
      players: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      parse_reason: true,
      parse_source: true,
      original_filename: true,
      replay_file: true,
      key_events: true,
      is_final: true,
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
    },
  });

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const candidatesByIdentity = new Map<string, typeof rows>();
  for (const candidate of orderedCandidateRows) {
    if (typeof candidate.id !== "number" || !candidate.battleIdentity) continue;
    const row = rowById.get(candidate.id);
    if (!row) continue;
    const identityRows = candidatesByIdentity.get(candidate.battleIdentity) ?? [];
    identityRows.push(row);
    candidatesByIdentity.set(candidate.battleIdentity, identityRows);
  }

  /*
   * Canonical row choice remains exactly the public replay contract, including
   * accepted durable/legacy adjudications and richer roster/result metadata.
   * SQL pages identities; JavaScript selects the best proof row only inside
   * each already-bounded identity group.
   */
  const publicRows = logicalPageIdentities.flatMap((identity) => {
    const identityRows = candidatesByIdentity.get(identity) ?? [];
    return cleanPublicGameRows(identityRows, {
      includeReview: true,
      includeLive: false,
    })
      .filter(isPublicBattleArchiveRow)
      .slice(0, 1);
  });

  return {
    rows: publicRows,
    total,
    offset,
    // Offset is the logical database coordinate. Advance by identities
    // consumed even if a concurrent delete makes their selected proof row
    // vanish before relation hydration completes.
    nextOffset: offset + logicalPageIdentities.length,
  };
}
