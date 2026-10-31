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

# Candidate-specific SOURCE observations only. A successful source census
# is not full dependency-graph, runtime financial, physical restore or deployment
# authorization. Original frozen b46a51f remains an unsafe separate SHA.
EVIDENCE = (
    Evidence("app/page.tsx", "loadLobbySnapshot(", "SSR / -> lobby read projection", "public_read"),
    Evidence("app/api/lobby/route.ts", "loadLobbySnapshot(", "GET/HEAD /api/lobby -> read projection", "public_read"),
    Evidence("lib/lobbySnapshot.ts", "const woloPromise = loadWoloDevSnapshot();", "lobby snapshot performs concurrent observed projections", "public_read"),
    Evidence("app/api/live-games/route.ts", "loadPublicLiveGamesSnapshot(prisma)", "GET/HEAD /api/live-games -> persisted live snapshot", "public_read"),
    Evidence("app/api/header-summary/route.ts", "loadLiveGamesSnapshot(prisma)", "GET/HEAD header summary -> persisted live snapshot", "public_read"),
    Evidence("app/api/bets/route.ts", "ensureMarkets: false,", "GET/HEAD /api/bets -> no ensure", "public_read"),
    Evidence("lib/warChest.ts", "ensureMarkets: false,", "SSR War Chest -> no bet-market ensure", "public_read"),
    Evidence("app/api/replay/post-ingest/route.ts", "if (!authorized(request))", "authenticated producer rejects before database work", "authenticated_producer"),
    Evidence("app/api/replay/post-ingest/route.ts", "queueBetMarketEnsure(prisma, 0);", "authorized replay producer -> maintenance queue", "authenticated_producer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsurePromise = ensureBetMarkets(prisma)", "authorized producer -> settlement-capable queue", "financial_writer"),
    Evidence("scripts/reconcile-replay-post-ingest.mts", "await ensureBetMarkets(prisma);", "explicit confirmed replay-reconciliation apply producer", "financial_writer"),
    Evidence("lib/bets.ts", "await settleResolvedMarketWagers(prisma);", "market ensure -> settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "await reconcilePendingCoreBetClaims(prisma);", "market ensure -> claims", "money_moving_possible"),
    Evidence("lib/bets.ts", "await settleFounderBonuses(prisma);", "market ensure -> founder bonuses", "money_moving_possible"),
    Evidence("scripts/prewarm-production.mjs", '"/",', "prewarm -> SSR / public projection", "public_read"),
    Evidence("scripts/prewarm-production.mjs", '"/api/lobby",', "prewarm -> GET /api/lobby projection", "public_read"),
    Evidence("scripts/prewarm-production.mjs", '"/api/live-games",', "prewarm -> GET /api/live-games projection", "public_read"),
)

# Explicitly refuse source-go if any of the known public read surfaces regain
# one of the old financial-maintenance ingress calls. This is not a substitute
# for B's complete source graph and real signed 25+ unit/non-systemd evidence.
FORBIDDEN_READ_DISPATCH = (
    "queueBetMarketEnsure(",
    "queueLobbyMaintenance(",
    "ensureBetMarkets(",
    "reconcileTournamentMatchProofs(",
)
PUBLIC_READ_FILES = (
    "app/api/lobby/route.ts",
    "app/api/bets/route.ts",
    "app/api/live-games/route.ts",
    "app/api/header-summary/route.ts",
    "lib/lobbySnapshot.ts",
    "lib/warChest.ts",
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
    forbidden = []
    for name in PUBLIC_READ_FILES:
        actual = cache.get(name)
        if actual is None:
            p = root / name
            if p.is_file() and not p.is_symlink():
                data = p.read_bytes()
                try:
                    actual = (data.decode("utf-8").splitlines(),
                              hashlib.sha256(data).hexdigest())
                except UnicodeDecodeError:
                    actual = None
        if actual is None:
            forbidden.append({"path": name, "reason": "UNKNOWN_SOURCE"})
            continue
        lines, _ = actual
        for needle in FORBIDDEN_READ_DISPATCH:
            for line_no, line in enumerate(lines, 1):
                # A source comment is not executable code; source closure
                # must still be validated independently by B's AST graph.
                if needle in line and not line.lstrip().startswith("//"):
                    forbidden.append({"path": name, "line": line_no,
                                      "reason": "FINANCIAL_READ_DISPATCH", "needle": needle})
    complete_known = (
        all(o["status"] == "SOURCE_OBSERVED" for o in observations)
        and not forbidden
    )
    return {
        "schema": "aoe2war.app.financial_producer_source_census.v1",
        "classification": "SOURCE_OBSERVATION_ONLY",
        "known_source_edges_intact": complete_known,
        "known_public_read_financial_dispatches": forbidden,
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
