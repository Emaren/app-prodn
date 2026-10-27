#!/usr/bin/env python3
"""Source-owned development artifact classification for existing Storage OS.

Only plans. Existing local-maintain and signed rollback-expiry remain the
*sole* deletion controllers. A class name or size never grants rm authority.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any

ARTIFACT_SCHEMA = "aoe2war.storage-artifacts.private.v1"
CLASSES: dict[str, dict[str, Any]] = {
    "next_build": {"basename": ".next", "recipe": "yarn install --frozen-lockfile && yarn build", "lockfiles": ["yarn.lock", "package-lock.json", "pnpm-lock.yaml"], "scope": "local-dev-build-only"},
    "node_modules": {"basename": "node_modules", "recipe": "use tracked lockfile + frozen package manager install", "lockfiles": ["yarn.lock", "package-lock.json", "pnpm-lock.yaml"], "scope": "local-dev-deps-only"},
    "go_build_cache": {"basename": "go-build", "recipe": "go build with tracked go.mod + go.sum", "lockfiles": ["go.mod", "go.sum"], "scope": "cache-only"},
    "python_bytecode": {"basename": "__pycache__", "recipe": "reimport original tracked Python source", "lockfiles": [], "scope": "local-source-cache-only"},
    "python_venv": {"basename": ".venv", "recipe": "recreate from locked Python project dependency contract", "lockfiles": ["uv.lock", "poetry.lock", "requirements.txt"], "scope": "local-dev-environment-only"},
    "rust_target": {"basename": "target", "recipe": "cargo build --locked with tracked Cargo.lock", "lockfiles": ["Cargo.lock"], "scope": "local-dev-build-only"},
    "docker_layers": {"basename": None, "recipe": "container builder prune only after separate image/ref/volume/service audit", "lockfiles": [], "scope": "daemon-managed-review-only"},
    "archived_dev_build": {"basename": None, "recipe": "rebuild from pinned tracked source + lockfile; prove other recovery generations", "lockfiles": ["yarn.lock", "package-lock.json", "pnpm-lock.yaml"], "scope": "older-unreferenced-dev-generation-only"},
}
PROTECTED_FRAGMENTS = (
    "/aoe2war-recovery/", "/.codex/", "/.git/", "/wolo",
    "/steam/", "/recording", "/videos/", "/mobileSync/", "/library/application support/",
    "/mnt/hc_volume_105319120/", "/var/lib/wolo-financial-restore/",
    "/.aoe2war-release/", "/deploy-receipts/", "/rollback", "/financial", "/keyring/",
)
MAX_BYTES = 5 * 1024 ** 3

class ArtifactHold(ValueError):
    pass

def digest(p: Any) -> str:
    return hashlib.sha256(json.dumps(p, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def reviewed_candidate(candidate: dict[str, Any], *, keep_generations: int = 3) -> dict[str, Any]:
    """Fail-close on any absent independent live/process/source attestation."""
    if type(keep_generations) is not int or not 1 <= keep_generations <= 3:
        raise ArtifactHold("invalid generation retention")
    if not isinstance(candidate, dict) or candidate.get("class") not in CLASSES:
        raise ArtifactHold("unknown artifact class")
    name = candidate["class"]
    spec = CLASSES[name]
    path = candidate.get("path")
    if not isinstance(path, str) or not path.startswith("/") or "/../" in path or len(path) > 4096:
        raise ArtifactHold("nonexact artifact path")
    reason = []
    low = path.lower()
    if any(x.lower() in low + "/" for x in PROTECTED_FRAGMENTS):
        reason.append("PROTECTED_EVIDENCE_OR_RUNTIME_TREE")
    if spec["basename"] and Path(path).name != spec["basename"]:
        reason.append("CLASS_PATH_MISMATCH")
    if name in ("docker_layers", "archived_dev_build"):
        reason.append("DAEMON_OR_ARCHIVE_SPECIALIZED_CONTROLLER_REQUIRED")
    size = candidate.get("allocated_bytes")
    if type(size) is not int or not 0 <= size <= MAX_BYTES:
        reason.append("MISSING_MEASURED_BOUNDED_SIZE")
    if candidate.get("coverage") != "complete" or candidate.get("source_authenticated") is not True:
        reason.append("UNAUTHENTICATED_OR_INCOMPLETE_CENSUS")
    for label, key in (("SYMLINK_OR_MOUNT", "symlink_or_mount"), ("DIRTY_OR_UNTRACKED", "dirty_or_untracked"),
                       ("LIVE_PROCESS_OR_FILE", "active_reference"), ("STAGED_OR_ROLLBACK_REF", "release_reference"),
                       ("UNVERIFIED_REBUILD", "rebuild_verified"), ("UNVERIFIED_RESTORE", "restore_verified"),
                       ("UNVERIFIED_WORKTREE", "worktree_proven"), ("TRACKED_TARGET", "git_tracked")):
        if key in ("rebuild_verified", "restore_verified", "worktree_proven"):
            if candidate.get(key) is not True:
                reason.append(label)
        elif key == "git_tracked":
            if candidate.get(key) is not False:
                reason.append(label)
        elif candidate.get(key) is not False:
            reason.append(label)
    if spec["lockfiles"] and candidate.get("tracked_dependency_lockfile") not in spec["lockfiles"]:
        reason.append("MISSING_TRACKED_DEPENDENCY_LOCKFILE")
    if candidate.get("generation_rank") is None or type(candidate.get("generation_rank")) is not int or candidate["generation_rank"] < 0:
        reason.append("UNVERIFIED_GENERATION_RANK")
    elif candidate["generation_rank"] < keep_generations:
        reason.append("RETAIN_NEWEST_GENERATIONS")
    if candidate.get("snapshot_restore_dependencies_cleared") is not True:
        reason.append("RESTORE_DEPENDENCIES_UNKNOWN")
    if candidate.get("owner_approved_scope") is not True:
        reason.append("HUMAN_APPROVAL_REQUIRED")
    # Absolutely no new mutator: candidates that pass review are still NOT
    # commands; local-maintain and explicit signed expiry own deletions.
    classification = "protected" if "PROTECTED_EVIDENCE_OR_RUNTIME_TREE" in reason else "generated_rebuildable_review"
    return {"path": path, "class": name, "retention_class": classification,
            "measured_bytes": size if type(size) is int and size >= 0 else None,
            "rebuild_recipe": spec["recipe"], "scope": spec["scope"],
            "evidence_sha256": digest(candidate),
            "reasons": sorted(set(reason)), "candidate_quality": "REVIEWABLE" if not reason else "HOLD",
            "proposed_reclaim_bytes": size if not reason and type(size) is int else 0,
            "actually_reclaimed_bytes": None,
            "deletion_authority": "NONE", "can_apply": False,
            "cleanup_controller": "existing local-maintain / existing guarded expiry ONLY"}

def review_inventory(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict) or raw.get("kind") != "aoe2war-storage-artifact-inventory" or not isinstance(raw.get("items"), list):
        raise ArtifactHold("artifact inventory missing")
    if len(raw["items"]) > 512:
        raise ArtifactHold("unbounded inventory")
    keep = raw.get("keep_generations", 3)
    items = [reviewed_candidate(item, keep_generations=keep) for item in raw["items"]]
    if len({x["path"] for x in items}) != len(items):
        raise ArtifactHold("duplicate exact-path candidates")
    result = {"schema": ARTIFACT_SCHEMA, "kind": "aoe2war-storage-artifact-plan",
              "items": items, "proposed_reclaim_bytes": sum(x["proposed_reclaim_bytes"] for x in items),
              "actually_reclaimed_bytes": None, "status": "REVIEW_ONLY_HOLD", "execute": False,
              "known_cleanup_controllers": ["storage local-maintain", "storage expiry"],
              "owner_generation_preference": keep}
    result["plan_sha256"] = digest(result)
    return result

def main() -> int:
    ap = argparse.ArgumentParser(description="Storage OS source-owned non-mutating artifact review")
    ap.add_argument("--inventory", type=Path, required=True)
    ap.add_argument("--apply", action="store_true", help="explicitly refuse: use existing governed controllers")
    a = ap.parse_args()
    if a.apply:
        print(json.dumps({"status": "HOLD", "reason": "NO_DUPLICATE_CLEANUP_EXECUTOR"}))
        return 2
    try:
        if a.inventory.is_symlink() or not a.inventory.is_file() or a.inventory.stat().st_size > 1024 * 1024:
            raise ArtifactHold("unsafe inventory file")
        raw = json.loads(a.inventory.read_text())
        print(json.dumps(review_inventory(raw), sort_keys=True, indent=2))
        return 0
    except (OSError, ValueError) as e:
        print(json.dumps({"status": "HOLD", "error": str(e)}))
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
