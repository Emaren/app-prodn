#!/usr/bin/env python3
"""Exact Renaissance website SOURCE-DIGEST REVIEW. No stage, key or deployment.

SHA-256 is computed from Git object *bytes* for all 128 frozen #922 paths,
rather than accepting Git SHA-1 blobs as a signed manifest. Any risk, source,
tree, mode or file mismatch is HOLD. Output is UNSIGNED REVIEW ONLY.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import aoe2_renaissance_v4_scope as scope
import aoe2_release_gate as gate

KIND = "aoe2war.renaissance.website-v4-release-manifest-review"
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
MAX_BLOB = 8 * 1024 * 1024
RISK_PATHS = {
    "FINANCIAL": [
        "app/wolomania/WolomaniaPageClient.tsx",
        "components/bets/BetsDisplayRail.tsx",
        "components/wolo/WoloHeroTile.tsx"],
    "WATCHER": [
        "scripts/kingdom_index_watcher_physical_intake.mjs",
        "tests/kingdom-index-watcher-companion-truth.test.mts",
        "tests/kingdom-index-watcher-draft-score.test.mts",
        "tests/kingdom-index-watcher-physical-intake.test.mts"],
    "REPLAY_TRUTH": ["components/replay-engine/HdReplayEngine.tsx"],
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def original_blob(repo, oid):
    scope.require(type(oid) is str and HEX40.fullmatch(oid) is not None,
                  "invalid Git blob identity")
    size_text = scope.text_git(repo, "cat-file", "-s", oid)
    scope.require(size_text.isdecimal(), "invalid Git blob size")
    size = int(size_text)
    scope.require(0 <= size <= MAX_BLOB, "oversized Git blob in review")
    scope.require(scope.text_git(repo, "cat-file", "-t", oid) == "blob",
                  "review object is not a blob")
    raw = scope.git(repo, "cat-file", "blob", oid)
    scope.require(len(raw) == size, "Git blob changed while reading")
    return raw


def generate(repo, inventory):
    checked = scope.verify_scope(repo, inventory)
    scope.require(checked["status"] == "SOURCE_INVENTORY_MATCH_REVIEW_ONLY"
                  and checked["paths"] == 128, "frozen 128-path proof missing")
    scope.require(scope.text_git(repo, "rev-parse", "HEAD") == scope.FROZEN_TARGET,
                  "candidate HEAD changed")
    rows = []
    protected = {name: [] for name in RISK_PATHS}
    for entry in inventory["files"]:
        path = entry["path"]
        risk = gate.path_risk(path)  # preserve conservative original classifier
        if risk in protected:
            protected[risk].append(path)
        raw = original_blob(repo, entry["blob_sha1"])
        rows.append({
            "path": path, "status": entry["status"], "mode": entry["mode"],
            "git_blob_sha1": entry["blob_sha1"],
            "content_sha256": sha256(raw), "bytes": len(raw),
            "original_gate_risk_class": risk,
        })
    scope.require(protected == RISK_PATHS,
                  "protected FINANCIAL/WATCHER/REPLAY classification drift")
    scope.require(len(rows) == 128 and
                  [r["path"] for r in rows] == sorted(r["path"] for r in rows),
                  "wrong release path set or order")
    scope.require(not any(r["path"].startswith("prisma/migrations/") or
                          r["path"] in ("prisma/schema.prisma",
                                        "prisma/schema.postgres.prisma")
                          for r in rows), "Prisma migration/schema requires separate gate")
    scope.require(scope.text_git(repo, "rev-parse", "HEAD") == scope.FROZEN_TARGET,
                  "candidate HEAD changed after hashing")
    return {
        "schema": 1, "kind": KIND,
        "status": "EXACT_SOURCE_SHA256_REVIEW_ONLY",
        "baseline_source_sha": scope.FROZEN_BASE,
        "candidate_source_sha": scope.FROZEN_TARGET,
        "baseline_tree_git_sha1": inventory["baseline_tree_sha1"],
        "candidate_tree_git_sha1": inventory["candidate_tree_sha1"],
        "source_inventory_sha256": sha256(canonical(inventory)),
        "source_content_aggregate_sha256": sha256(canonical(rows)),
        "count": len(rows), "added": 63, "modified": 65, "files": rows,
        "original_protected_high_risk_paths": protected,
        "high_risk_review_status": "OWNER_AND_INDEPENDENT_REVIEW_REQUIRED",
        "zero_migrations_verified": True,
        "ci_claims": {
            "candidate_pr": 922, "app_run": 40236315430,
            "intelligence_run": 40236315470,
            "chrome_88_run": 40236315501,
            "independently_accepted": False,
        },
        "controller_implementation_sha": None, "gate_receipt_sha256": None,
        "enrolled_owner_v4_key": None, "previous_live_build_id": None,
        "observed_financial_runtime_sha256": None,
        "staged_artifact_sha256": None, "staged_next_build_id": None,
        "stage_receipt_sha256": None,
        "owner_pre_stage_signature_verified": False,
        "owner_pre_activate_signature_verified": False,
        "website_stage_authorized": False,
        "website_activation_authorized": False,
        "financial_release_authorized": False,
        "signed_release_manifest": False,
    }


def verify(repo, inventory, claimed):
    scope.require(type(claimed) is dict, "manifest review must be an object")
    regenerated = generate(repo, inventory)
    scope.require(canonical(claimed) == canonical(regenerated),
                  "source digest manifest mutated, retagged or stale")
    return {
        "status": "SOURCE_REVIEW_SHA256_MATCH_NOT_AUTHORIZED",
        "sha256": sha256(canonical(regenerated)),
        "paths": 128, "stage_authorized": False, "activate_authorized": False,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--candidate-repo", required=True, type=Path)
    ap.add_argument("--verify-review-json", type=Path)
    args = ap.parse_args()
    try:
        inventory = scope.read_inventory(scope.INVENTORY)
        if args.verify_review_json:
            path = args.verify_review_json
            scope.require(path.is_file() and not path.is_symlink() and
                          path.stat().st_size < 150_000,
                          "unsafe or oversized review manifest file")
            with path.open(encoding="utf-8") as handle:
                claimed = json.load(handle, object_pairs_hook=scope.no_duplicates)
            result = verify(args.candidate_repo, inventory, claimed)
        else:
            result = generate(args.candidate_repo, inventory)
        print(canonical(result).decode("ascii"))
        print("REVIEW ONLY: no signed owner v4 approval or stage", file=sys.stderr)
        return 0
    except (scope.Hold, ValueError, OSError, UnicodeError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc),
                          "stage_authorized": False,
                          "financial_release_authorized": False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
