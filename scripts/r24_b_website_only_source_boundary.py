#!/usr/bin/env python3
"""R24 B: immutable #1061 source-bound HTTP/startup finance isolation contract.

This runs ONLY read-only git show/ls-tree/rev-parse against the exact website
commit. It does not examine host security, sign anything, connect to finance,
read credentials, deploy, or authorize a cutover. Host claims remain HOLD.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

WEBSITE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
BLOBS = {
    "instrumentation.node.ts": "03eb33584874e3b4145fd27771dc2a2db465f2f1",
    "lib/wargraph/runtime.ts": "be1f77aafd4f0d552fadb1f114d046a01de9bd5a",
    "lib/prisma.ts": "7e3f90c957f95be3e813ce748363e075e7d69731",
    "lib/betMarketEnsureQueue.ts": "9ac95ce13f945b972c23a35f7f12d7e38e45ac55",
    "next.config.js": "6354d2b7967224c243c806e0d43922c97d5c5038",
    "middleware.ts": "16b1397362b9178862e0bdcb45fe6cc6600bad1e",
    "package.json": "bb69cecff78fae57e81ee2c41674674828ce9257",
    "app/page.tsx": "654a0eb9794d3005c1005544e4de39910004624c",
    "app/api/lobby/route.ts": "da8a75770bcf89fc5c7fcaf11d45a9e85fa9e403",
    "app/api/live-games/route.ts": "edd10792d4fe11f2315dd3b0e1e3c8a6b86c1b23",
    "app/api/bets/stake-intents/route.ts": "95862cebdc83b02e1c0d0f2e2df0c9801cde6d90",
    "app/api/bets/wager/route.ts": "ab39e5d8636318db2f515b2da6d9942fbe927afe",
    "app/api/staking/unstake/route.ts": "883a2fefbbaeccc4a8312c08a5dfbf0024d6ad7e",
    "app/api/challenges/reconcile/route.ts": "a0bed14447d46049b6702f6096c4904ffdd15390",
    "scripts/prewarm-production.mjs": "e697a6cda360a18a94aea47624ac5b11a0f26938",
}
MAX_GIT_BYTES = 2_000_000
VERBS = ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
PATTERN = re.compile(
    r"\bexport\s+(?:async\s+)?function\s+("
    + "|".join(VERBS)
    + r")\s*\(|\bexport\s+const\s+("
    + "|".join(VERBS)
    + r")\s*="
)


def git(repo: Path, *args: str) -> bytes:
    cmd = ["/usr/bin/git", "-C", str(repo), *args]
    try:
        proc = subprocess.run(
            cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, check=False, timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("PINNED_SOURCE_GIT_UNAVAILABLE") from exc
    if proc.returncode != 0 or len(proc.stdout) > MAX_GIT_BYTES:
        raise ValueError("PINNED_SOURCE_GIT_INCOMPLETE")
    return proc.stdout


def source_blobs(repo: Path) -> dict[str, bytes]:
    try:
        sha = git(repo, "rev-parse", WEBSITE + "^{commit}").decode("ascii").strip()
        if sha != WEBSITE:
            raise ValueError("CANDIDATE_COMMIT_DRIFT")
        found = {}
        for path, expected in sorted(BLOBS.items()):
            actual = git(repo, "rev-parse", WEBSITE + ":" + path).decode("ascii").strip()
            if actual != expected:
                raise ValueError("CRITICAL_BLOB_DRIFT:" + path)
            found[path] = git(repo, "show", WEBSITE + ":" + path)
        return found
    except (UnicodeError, OSError) as exc:
        raise ValueError("CRITICAL_BLOB_UNREADABLE") from exc


def route_paths(tree: bytes) -> list[str]:
    """Reject weird Git entries rather than interpreting untrusted source paths."""
    if not tree or not tree.endswith(b"\x00"):
        raise ValueError("ROUTE_TREE_TRUNCATED")
    paths = []
    seen = set()
    for entry in tree[:-1].split(b"\x00"):
        try:
            meta, raw_path = entry.split(b"\t", 1)
            mode, kind, blob = meta.decode("ascii").split(" ")
            path = raw_path.decode("utf8", "strict")
        except (ValueError, UnicodeError) as exc:
            raise ValueError("ROUTE_TREE_INVALID_ENTRY") from exc
        if mode not in ("100644", "100755") or kind != "blob":
            raise ValueError("ROUTE_TREE_NONREGULAR_FILE")
        if path.startswith("app/api/") and path.endswith(("/route.ts", "/route.js")):
            if (path in seen or any(part in ("", ".", "..") for part in path.split("/"))
                or not re.fullmatch(r"app/api/[A-Za-z0-9_@./\-\[\]]+/route\.(ts|js)", path)):
                raise ValueError("ROUTE_TREE_DUPLICATE_OR_UNSAFE_PATH")
            seen.add(path)
            paths.append(path)
    if not paths or len(paths) > 500:
        raise ValueError("ROUTE_COUNT_OUT_OF_BOUNDS")
    return sorted(paths)


def classify_methods(raw: bytes) -> list[str]:
    try:
        source = raw.decode("utf8", "strict")
    except UnicodeError as exc:
        raise ValueError("ROUTE_UNREADABLE_UTF8") from exc
    # Conservative: unexpected export shapes remain UNKNOWN.
    matches = set()
    for a, b in PATTERN.findall(source):
        matches.add(a or b)
    return sorted(matches)


def source_conditions(files: dict[str, bytes]) -> dict[str, bool]:
    def has(p: str, *needles: bytes) -> bool:
        return all(x in files[p] for x in needles)

    return {
        "production_instrumentation_starts_wargraph": has(
            "instrumentation.node.ts", b'process.env.NODE_ENV === "production"',
            b"startWarGraphRuntime();"
        ),
        "wargraph_launch_explicit_disable_supported": has(
            "lib/wargraph/runtime.ts",
            b"process.env.WARGRAPH_RUNTIME_DISABLED",
            b'"true"', b"if (", b"return;", b"runWarGraphSettlementWorker"
        ),
        "wargraph_has_financial_tick": has(
            "lib/wargraph/runtime.ts", b"runWarGraphSettlementWorker",
            b"runWarGraphMaintenanceJobs", b"ensureWarGraphFoundation"
        ),
        "db_preview_transaction_read_only_flag_supported": has(
            "lib/prisma.ts", b"AOE2WAR_PROD_DB_PREVIEW",
            b"default_transaction_read_only=on",
            b"process.env.DATABASE_URL"
        ),
        "request_get_bet_ensure_queue_preview_guard_supported": has(
            "lib/betMarketEnsureQueue.ts",
            b"AOE2WAR_PROD_DB_PREVIEW", b"ensureBetMarkets(prisma)"
        ),
        "prod_start_is_standard_next_not_dev_server": has(
            "package.json", b'next start --hostname 127.0.0.1 --port 3030'
        ),
        "backend_rewrites_present": has(
            "next.config.js", b"async rewrites()", b"UPSTREAM_API"
        ),
        "security_middleware_only_game_stats": has(
            "middleware.ts", b'matcher: ["/game-stats/:id"]'
        ),
        "finance_bet_wager_post_present": has(
            "app/api/bets/wager/route.ts", b"export async function POST"
        ),
        "finance_wager_intent_transaction_present": has(
            "app/api/bets/stake-intents/route.ts",
            b"export async function POST", b"prisma.$transaction"
        ),
        "finance_staking_unstake_path_present": has(
            "app/api/staking/unstake/route.ts", b"export async function POST",
            b"executeWoloStakingUnstake"
        ),
        "challenge_reconciliation_post_present": has(
            "app/api/challenges/reconcile/route.ts",
            b"export async function POST", b"reconcileChallengeLifecycle"
        ),
        "prewarm_hits_lobby_live_page": has(
            "scripts/prewarm-production.mjs", b'"/api/lobby"',
            b'"/api/live-games"', b'"/"'
        ),
    }


def report(repo: Path) -> dict:
    files = source_blobs(repo)
    routes = route_paths(git(repo, "ls-tree", "-r", "-z", WEBSITE, "--", "app/api"))
    method_counts = {v: 0 for v in VERBS}
    unclassified = []
    examples = []
    for path in routes:
        methods = classify_methods(git(repo, "show", WEBSITE + ":" + path))
        if not methods:
            unclassified.append(path)
        for verb in methods:
            method_counts[verb] += 1
        if any(verb in methods for verb in ("POST", "PUT", "PATCH", "DELETE")):
            if len(examples) < 35:
                examples.append({"path": path, "methods": methods})
    conditions = source_conditions(files)
    if not all(conditions.values()):
        raise ValueError("EXACT_SOURCE_SEMANTIC_ASSUMPTION_DRIFT")
    return {
        "schema": "aoe2war.r24.b.web-only-source-isolation-review.v1",
        "website_sha": WEBSITE,
        "critical_git_blob_pins": dict(sorted(BLOBS.items())),
        "source_conditions": conditions,
        "api_route_files": len(routes),
        "route_export_method_counts": method_counts,
        "route_files_unclassified": unclassified,
        "mutation_route_examples": examples,
        "http_inventory_is_exhaustive": False,
        "reason": "Routes alone omit server actions, middleware/framework, SSR/HEAD side effects and backend rewrites.",
        "minimum_runtime_boundary": [
            "WARGRAPH_RUNTIME_DISABLED=true from actual web process before instrumented startup",
            "AOE2WAR_PROD_DB_PREVIEW=true from actual web process (defense in depth, not DB authorization)",
            "dedicated PostgreSQL LOGIN with server-enforced SELECT-only privileges and no table/sequence/schema/functions mutability, separately verified on physical HEL1",
            "ingress AND loopback deny POST/PUT/PATCH/DELETE, disallow Next server actions, reject unexpected GET/HEAD side effects and mutable upstream rewrites",
            "no Wolo key, settlement credential, custody signing material, or protected port 8092/8093 write-capable network privilege in new web process",
            "keep the EXISTING old web service MainPID/runtime/WarGraph producer running AFTER public cutover; switch only reverse-proxy route to a separate isolated #1061 process+port and preserve old service as rollback target unless real independent evidence proves original worker disabled",
            "web service process/UID/cgroup and actual full environment independently authenticated; existing financial service/timer/PID/socket/ledger identities remain unchanged",
            "existing active website remains serving until verified candidate build+rollback; no migrations or shared mutable Next build artifact swap before consent",
            "web-only consent explicitly acknowledges disabled betting/staking/admin mutations and any GET degradation under read-only DB",
        ],
        "root_host_actual_env_verified": False,
        "database_role_privileges_verified": False,
        "http_ingress_and_loopback_write_denial_verified": False,
        "backend_and_chain_egress_policy_verified": False,
        "nonfinancial_get_head_side_effects_fully_verified": False,
        "original_old_website_wargraph_runtime_may_be_financial_producer": True,
        "parallel_original_service_preservation_verified": False,
        "rollback_and_financial_pid_continuity_verified": False,
        "release_authorized": False,
        "financial_operations_authorized": False,
        "result": "SOURCE_BOUNDARY_MAPPED__PHYSICAL_ISOLATION_HOLD",
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    a = p.parse_args()
    try:
        value = report(a.repo)
    except ValueError as exc:
        print(json.dumps({
            "schema": "aoe2war.r24.b.web-only-source-isolation-review.v1",
            "status": "HOLD", "detail": str(exc)[:200],
            "release_authorized": False,
            "financial_operations_authorized": False,
        }, sort_keys=True))
        return 2
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
