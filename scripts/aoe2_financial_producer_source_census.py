#!/usr/bin/env python3
"""Read-only, bounded source census of known app-side financial producer ingress.

Not a runtime fence, complete cross-repository producer inventory, signer proof
or deployment permit. UNKNOWN external producers explicitly remain UNKNOWN.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Evidence:
    path: str
    needle: str
    edge: str
    classification: str
    expected_present: bool = True

# Bounded source observations, not a complete dynamic call graph. Absence
# checks prove removal of these direct scheduling edges only. Authenticated
# private producers and unknown external writers remain financially capable.
EVIDENCE = (
    Evidence("app/page.tsx", "loadLobbySnapshot(", "SSR / -> public lobby projection", "read_only_projection"),
    Evidence("app/api/lobby/route.ts", "export async function GET(", "GET /api/lobby", "read_only_projection"),
    Evidence("app/api/lobby/route.ts", "loadLobbySnapshot(", "GET /api/lobby -> lobby projection", "read_only_projection"),
    Evidence("lib/lobbySnapshot.ts", "async function loadLobbySnapshotFresh(", "public lobby projection", "read_only_projection"),
    Evidence("lib/lobbySnapshot.ts", "queueLobbyMaintenance", "removed lobby financial scheduling", "removed_public_financial_edge", False),
    Evidence("lib/lobbySnapshot.ts", "reconcileTournamentMatchProofs", "removed lobby tournament reconciler import/call", "removed_public_financial_edge", False),
    Evidence("lib/lobbySnapshot.ts", "ensureBetMarkets", "removed lobby financial ensure import/call", "removed_public_financial_edge", False),
    Evidence("app/api/live-games/route.ts", "loadPublicLiveGamesSnapshot(prisma)", "GET /api/live-games -> public projection", "read_only_projection"),
    Evidence("app/api/live-games/route.ts", "queueBetMarketEnsure", "removed live-games financial scheduling", "removed_public_financial_edge", False),
    Evidence("app/api/header-summary/route.ts", "loadLiveGamesSnapshot(prisma)", "GET header summary -> live projection", "read_only_projection"),
    Evidence("app/api/header-summary/route.ts", "queueBetMarketEnsure", "removed header polling financial scheduling", "removed_public_financial_edge", False),
    Evidence("app/api/bets/route.ts", "ensureMarkets: false,", "GET /api/bets explicitly reads projections", "explicit_read_mode_exception"),
    Evidence("app/api/bets/route.ts", "queueBetMarketEnsure", "removed bets GET financial scheduling", "removed_public_financial_edge", False),
    Evidence("lib/warChest.ts", "ensureMarkets: false,", "War Chest reads existing board projections", "explicit_read_mode_exception"),
    Evidence("lib/warChest.ts", "queueBetMarketEnsure", "removed War Chest financial scheduling", "removed_public_financial_edge", False),
    Evidence("app/api/replay/post-ingest/route.ts", "if (!authorized(request))", "private replay post-ingest authentication boundary", "private_producer_authentication_check"),
    Evidence("app/api/replay/post-ingest/route.ts", "queueBetMarketEnsure(prisma, 0);", "private post-ingest retains reconciliation fallback", "private_financial_producer"),
    Evidence("app/api/replay/upload/route.ts", "queueBetMarketEnsure(prisma, 0);", "private upload retains reconciliation fallback", "private_financial_producer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsureTimer = setTimeout(() => {", "private market queue -> process-local timer", "process_local_timer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsurePromise = ensureBetMarkets(prisma)", "private timer -> financial reconciliation", "settlement_capable_async_work"),
    Evidence("lib/betMarketEnsureQueue.ts", 'process.env.AOE2WAR_PROD_DB_PREVIEW === "true"', "one queue preview flag only", "insufficient_global_fence"),
    Evidence("lib/bets.ts", "export async function ensureBetMarkets(prisma: PrismaClient)", "financial reconciliation entry remains", "settlement_capable_work"),
    Evidence("lib/bets.ts", "await settleResolvedMarketWagers(prisma);", "private market ensure -> settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "await reconcilePendingCoreBetClaims(prisma);", "private market ensure -> claim reconciliation", "money_moving_possible"),
    Evidence("lib/bets.ts", "await settleFounderBonuses(prisma);", "private market ensure -> founder bonus settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "let betMarketEnsurePromise: Promise<void> | null = null;", "single-flight remains process-local", "insufficient_global_fence"),
    Evidence("scripts/prewarm-production.mjs", '"/",', "prewarm -> public lobby projection", "read_only_consumer"),
    Evidence("scripts/prewarm-production.mjs", '"/api/lobby",', "prewarm -> public lobby projection", "read_only_consumer"),
    Evidence("scripts/prewarm-production.mjs", '"/api/live-games",', "prewarm -> public live projection", "read_only_consumer"),
)

EXTERNAL_OWNERS_NOT_AUTHENTICATED = (
    "HD web/API/cron and process-level timers",
    "DE website/API and faucet/staking signers",
    "systemd root and user units, dependency restart/timer activation",
    "containers and manual/external signing or wallet operators",
    "in-flight, accepted, unknown chain transfers and settlement journals",
)


def inspect(root: Path) -> dict:
    cache: dict[str, tuple[list[str], str] | None] = {}
    observations = []
    for item in EVIDENCE:
        if item.path not in cache:
            p = root / item.path
            if not p.is_file() or p.is_symlink():
                cache[item.path] = None
            else:
                content = p.read_bytes()
                try:
                    lines = content.decode("utf-8").splitlines()
                except UnicodeDecodeError:
                    cache[item.path] = None
                else:
                    cache[item.path] = (lines, hashlib.sha256(content).hexdigest())
        actual = cache[item.path]
        if actual is None:
            observations.append({
                "edge": item.edge, "path": item.path,
                "classification": item.classification, "status": "UNKNOWN_SOURCE",
                "line": None, "source_sha256": None,
            })
            continue
        lines, fingerprint = actual
        matching = [n for n, text in enumerate(lines, 1) if item.needle in text]
        satisfied = bool(matching) == item.expected_present
        observations.append({
            "edge": item.edge, "path": item.path,
            "classification": item.classification,
            "expected_present": item.expected_present,
            "status": ("SOURCE_OBSERVED" if item.expected_present else "SOURCE_ABSENCE_OBSERVED") if satisfied else "SOURCE_DRIFT",
            "line": matching[0] if matching else None,
            "source_sha256": fingerprint,
        })
    complete_known = all(o["status"] in {"SOURCE_OBSERVED", "SOURCE_ABSENCE_OBSERVED"} for o in observations)
    return {
        "schema": "aoe2war.app.financial_producer_source_census.v1",
        "classification": "SOURCE_OBSERVATION_ONLY",
        "known_source_edges_intact": complete_known,
        "all_financial_producers_isolated": False,
        "safe_to_deploy": False,
        "cross_repo_runtime_attestation": "UNKNOWN",
        "unverified_producer_owners": list(EXTERNAL_OWNERS_NOT_AUTHENTICATED),
        "observations": observations,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if an existing known source edge drifts; does NOT certify isolation")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    report = inspect(args.root)
    print(json.dumps(report, indent=2, sort_keys=True))
    if args.check and not report["known_source_edges_intact"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
