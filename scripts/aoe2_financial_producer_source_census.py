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

# These are source-linked observations, not an exhaustive dynamic call graph.
# Public-read queue removal is a scoped engineering step, not signer fencing.
EVIDENCE = (
    Evidence("app/page.tsx", "loadLobbySnapshot(", "SSR / -> lobby read projection", "public_read_surface"),
    Evidence("app/api/lobby/route.ts", "export async function GET(", "GET /api/lobby", "public_read_surface"),
    Evidence("app/api/lobby/route.ts", "loadLobbySnapshot(", "GET /api/lobby -> projection", "public_read_surface"),
    Evidence("lib/lobbySnapshot.ts", "async function loadLobbySnapshotFresh(", "lobby snapshot projection", "read_projection_candidate"),
    Evidence("app/api/live-games/route.ts", "export async function GET(", "GET /api/live-games", "public_read_surface"),
    Evidence("app/api/bets/route.ts", "export async function GET(", "GET /api/bets", "public_read_surface"),
    Evidence("app/api/bets/route.ts", "ensureMarkets: false,", "GET /api/bets opts out of ensure", "explicit_read_mode_exception"),
    Evidence("app/api/header-summary/route.ts", "export async function GET(", "GET /api/header-summary", "public_read_surface"),
    Evidence("lib/warChest.ts", "export async function loadWarChestSnapshot(", "war chest read projection", "public_read_surface"),
    Evidence("lib/warChest.ts", "ensureMarkets: false,", "war chest opts out of ensure", "explicit_read_mode_exception"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsureTimer = setTimeout(() => {", "market ensure queue still exists for authenticated producers", "process_local_timer"),
    Evidence("lib/betMarketEnsureQueue.ts", "backgroundEnsurePromise = ensureBetMarkets(prisma)", "queue -> settlement-capable ensure", "settlement_capable_async_work"),
    Evidence("lib/betMarketEnsureQueue.ts", 'process.env.AOE2WAR_PROD_DB_PREVIEW === "true"', "one preview flag only", "insufficient_global_fence"),
    Evidence("lib/bets.ts", "export async function ensureBetMarkets(prisma: PrismaClient)", "financial reconciliation entry", "settlement_capable_work"),
    Evidence("lib/bets.ts", "await settleResolvedMarketWagers(prisma);", "market ensure -> settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "await reconcilePendingCoreBetClaims(prisma);", "market ensure -> claim reconciliation", "money_moving_possible"),
    Evidence("lib/bets.ts", "await settleFounderBonuses(prisma);", "market ensure -> founder bonus settlement", "money_moving_possible"),
    Evidence("lib/bets.ts", "let betMarketEnsurePromise: Promise<void> | null = null;", "single-flight is process-local", "insufficient_global_fence"),
    Evidence("scripts/prewarm-production.mjs", '"/",', "prewarm -> public homepage", "public_read_surface"),
    Evidence("scripts/prewarm-production.mjs", '"/api/lobby",', "prewarm -> public lobby read", "public_read_surface"),
    Evidence("scripts/prewarm-production.mjs", '"/api/live-games",', "prewarm -> public live-game read", "public_read_surface"),
    Evidence("app/api/replay/post-ingest/route.ts", "internalApiKeyMatches(", "post-ingest route requires configured internal credential", "authenticated_writer_boundary"),
    Evidence("app/api/replay/post-ingest/route.ts", "queueBetMarketEnsure(prisma, 0);", "post-ingest may request financial reconciliation", "authenticated_writer_boundary"),
    Evidence("app/api/replay/upload/route.ts", "queueBetMarketEnsure(prisma, 0);", "authorized replay upload may request financial reconciliation", "event_driven_writer"),
)

# Public GET/render paths may not directly or through the immediately used
# projection module enqueue settlement, claims, founder payouts or proof writes.
# This catches a known source edge; it does NOT attest deep import closures.
FORBIDDEN_PUBLIC_READ_EDGES = {
    "lib/lobbySnapshot.ts": (
        "queueLobbyMaintenance(", "queueBetMarketEnsure(",
        "ensureBetMarkets(", "reconcileTournamentMatchProofs(",
    ),
    "app/api/live-games/route.ts": ("queueBetMarketEnsure(", "ensureBetMarkets("),
    "app/api/bets/route.ts": ("queueBetMarketEnsure(", "ensureBetMarkets("),
    "app/api/header-summary/route.ts": ("queueBetMarketEnsure(", "ensureBetMarkets("),
    "lib/warChest.ts": ("queueBetMarketEnsure(", "ensureBetMarkets("),
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
    public_read_violations = []
    for path, forbidden in FORBIDDEN_PUBLIC_READ_EDGES.items():
        actual = cache.get(path)
        if actual is None:
            # Load explicit read paths even when they had no positive evidence.
            candidate = root / path
            if not candidate.is_file() or candidate.is_symlink():
                public_read_violations.append({"path": path, "status": "UNKNOWN_SOURCE"})
                continue
            try:
                body = candidate.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                public_read_violations.append({"path": path, "status": "UNKNOWN_SOURCE"})
                continue
        else:
            body = "\\n".join(actual[0])
        for needle in forbidden:
            if needle in body:
                public_read_violations.append({
                    "path": path, "status": "FORBIDDEN_PUBLIC_READ_QUEUE",
                    "needle": needle,
                })
    public_reads_without_known_direct_queue = not public_read_violations
    complete_known = (
        all(o["status"] == "SOURCE_OBSERVED" for o in observations)
        and public_reads_without_known_direct_queue
    )
    return {
        "schema": "aoe2war.app.financial_producer_source_census.v1",
        "classification": "SOURCE_OBSERVATION_ONLY",
        "known_source_edges_intact": complete_known,
        "public_reads_without_known_direct_queue": public_reads_without_known_direct_queue,
        "public_read_violations": public_read_violations,
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
