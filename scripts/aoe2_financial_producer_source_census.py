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

# These are source-linked *observations*, not a guessed dynamic call graph.
# All strings are anchored to currently reviewed app/main at e6bd62f7.
EVIDENCE = (
    Evidence("app/page.tsx", "loadLobbySnapshot(", "SSR / -> loadLobbySnapshot", "read_to_async_financial_producer"),
    Evidence("app/api/lobby/route.ts", "export async function GET(", "GET /api/lobby -> loadLobbySnapshot", "read_to_async_financial_producer"),
    Evidence("app/api/lobby/route.ts", "loadLobbySnapshot(", "GET /api/lobby -> loadLobbySnapshot", "read_to_async_financial_producer"),
    Evidence("lib/lobbySnapshot.ts", "queueLobbyMaintenance(prisma);", "loadLobbySnapshotFresh -> queueLobbyMaintenance", "read_to_async_financial_producer"),
    Evidence("lib/lobbySnapshot.ts", ".then(() => reconcileTournamentMatchProofs(prisma))", "lobby maintenance -> tournament proof reconciliation", "mutation_capable_async_work"),
    Evidence("lib/lobbySnapshot.ts", ".then(() => ensureBetMarkets(prisma))", "lobby maintenance -> ensureBetMarkets", "settlement_capable_async_work"),
    Evidence("app/api/live-games/route.ts", "export async function GET(", "GET /api/live-games route", "read_to_async_financial_producer"),
    Evidence("app/api/live-games/route.ts", "queueBetMarketEnsure(prisma, 0);", "GET /api/live-games -> timed market ensure", "read_to_async_financial_producer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsureTimer = setTimeout(() => {", "market ensure queue -> detached timer", "process_local_timer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsurePromise = ensureBetMarkets(prisma)", "timer -> ensureBetMarkets", "settlement_capable_async_work"),
    Evidence("lib/betMarketEnsureQueue.ts", 'process.env.AOE2WAR_PROD_DB_PREVIEW === "true"', "one queue preview flag only", "insufficient_global_fence"),
    Evidence("lib/bets.ts", "export async function ensureBetMarkets(prisma: PrismaClient)", "financial reconciliation entry", "settlement_capable_work"),
    Evidence("lib/bets.ts", "await settleResolvedMarketWagers(prisma);", "market ensure -> settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "await reconcilePendingCoreBetClaims(prisma);", "market ensure -> claim reconciliation", "money_moving_possible"),
    Evidence("lib/bets.ts", "await settleFounderBonuses(prisma);", "market ensure -> founder bonus settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "let betMarketEnsurePromise: Promise<void> | null = null;", "single-flight is process-local", "insufficient_global_fence"),
    Evidence("scripts/prewarm-production.mjs", '"/",', "prewarm -> /", "indirect_financial_wakeup"),
    Evidence("scripts/prewarm-production.mjs", '"/api/lobby",', "prewarm -> GET /api/lobby", "indirect_financial_wakeup"),
    Evidence("scripts/prewarm-production.mjs", '"/api/live-games",', "prewarm -> GET /api/live-games", "indirect_financial_wakeup"),
    Evidence("app/api/bets/route.ts", "export async function GET(", "GET /api/bets", "read_to_async_financial_producer"),
    Evidence("app/api/bets/route.ts", "queueBetMarketEnsure(prisma, 0);", "GET /api/bets -> timed market ensure BEFORE read-only snapshot", "read_to_async_financial_producer"),
    Evidence("app/api/bets/route.ts", "ensureMarkets: false,", "snapshot loader opts out; route queue still activates market ensure", "snapshot_opt_out_not_financial_fence"),
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
        observations.append({
            "edge": item.edge, "path": item.path,
            "classification": item.classification,
            "status": "SOURCE_OBSERVED" if matching else "SOURCE_DRIFT",
            "line": matching[0] if matching else None,
            "source_sha256": fingerprint,
        })
    complete_known = all(o["status"] == "SOURCE_OBSERVED" for o in observations)
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
