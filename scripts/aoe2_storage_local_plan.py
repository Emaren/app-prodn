#!/usr/bin/env python3
"""Read-only local Storage OS plan: federate existing policy, census, watchdog.

Does not grant cleanup, release, transfer or snapshot authority. No new
controller; only the existing Storage OS deletion modes can mutate caches.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MAX_OUTPUT = 3_000_000
GENERATED_THRESHOLD = 256 * 1024 * 1024
GENERATED_NAMES = frozenset(('.next', '.turbo', 'dist', 'build', 'node_modules', '.direnv', '.yarn-cache'))
GENERATED_PROTECTED = frozenset(('.codex', 'app-prodn-e5-seal', 'api-prodn', 'wolo', 'financial', 'replay', 'recovery', 'mobilesync', 'crossover', 'docker', '.aoe2war-release'))


def observe(argv: list[str], *, cwd: Path, timeout: int = 240,
            accept_hold: bool = False) -> dict[str, Any]:
    try:
        result = subprocess.run(
            argv, cwd=cwd, text=True, capture_output=True, timeout=timeout,
            check=False, env={**os.environ, "GIT_OPTIONAL_LOCKS": "0",
                              "GIT_TERMINAL_PROMPT": "0"})
    except (OSError, subprocess.TimeoutExpired):
        return {"status": "UNKNOWN", "reason": "PROBE_UNAVAILABLE"}
    if result.returncode not in ((0, 2) if accept_hold else (0,)):
        return {"status": "UNKNOWN", "reason": "PROBE_FAILED",
                "exit_code": result.returncode}
    if len(result.stdout.encode("utf-8")) > MAX_OUTPUT:
        return {"status": "UNKNOWN", "reason": "PROBE_OVERSIZED"}
    try:
        payload = json.loads(result.stdout)
    except ValueError:
        return {"status": "UNKNOWN", "reason": "PROBE_INVALID_JSON"}
    return payload if isinstance(payload, dict) else {
        "status": "UNKNOWN", "reason": "PROBE_NOT_OBJECT"}


def cache_rows(source: dict[str, Any], name: str) -> list[dict[str, Any]] | None:
    if source.get("status") != "PREVIEW" or source.get("apply") is not False:
        return None
    if name == "original":
        before = source.get("before")
        rows = before.get("regenerable") if isinstance(before, dict) else None
    elif name == "extended":
        rows = source.get("extra_candidates") if source.get("extended") is True else None
    else:
        rows = source.get("electron_candidates") if source.get("electron_only") is True else None
    if not isinstance(rows, list):
        return None
    clean = []
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get("name"), str):
            return None
        b = r.get("allocated_bytes")
        if isinstance(b, bool) or not isinstance(b, int) or b < 0:
            return None
        clean.append({"name": r["name"], "path": r.get("path"),
                      "allocated_bytes": b, "exists": r.get("exists") is True,
                      "blocked": bool(r.get("blocked_reason")) or r.get("symlink") is True})
    return clean


def generated_protection_role(path: str) -> tuple[str, bool]:
    """Read-only policy from exact path structure; not source/consumer attestation.

    Avoid mistaking a Codex worktree for canonical app-prodn merely because
    both end in node_modules, and hold website-linked signed Watcher output.
    """
    parts = tuple(p.lower() for p in Path(path).parts)
    artifact = parts[-1]
    if "app-prodn-e5-seal" in parts:
        return "PROTECTED_E5_SEAL", True
    if ".codex" in parts:
        return "PROTECTED_CODEX_WORKTREE", True
    if any(
        parent in (".worktrees", ".aoe2war-workspaces")
        and any(p.startswith("codex-") for p in parts[i + 1:-1])
        for i, parent in enumerate(parts[:-1])
    ):
        return "PROTECTED_CODEX_WORKTREE", True
    if (artifact == "node_modules" and len(parts) >= 4
            and parts[-4:] == ("projects", "aoe2hdbets",
                               "app-prodn", "node_modules")):
        return "PROTECTED_CANONICAL_ACTIVE_DEPENDENCIES", True
    if artifact == "dist" and len(parts) >= 2 and parts[-2] == "aoe2-watcher":
        return "PROTECTED_WATCHER_SIGNED_WEBSITE_DISTRIBUTION", True
    if set(parts) & GENERATED_PROTECTED:
        return "PROTECTED_POLICY_ANCESTRY", True
    return "HISTORICAL_GENERATED_UNQUALIFIED", False


def generated_rank(census: dict[str, Any]) -> dict[str, Any]:
    """Only rank exact source-observed names. Never infer unique APFS relief."""
    valid = (census.get("status") == "READ_ONLY"
             and census.get("mutation_allowed") is False
             and census.get("coverage") == "NAMED_PATHS_ONLY_NOT_WHOLE_DISK"
             and isinstance(census.get("measured"), list))
    observations = census["measured"] if valid else []
    ranked = []
    unknown = []
    seen = set()
    duplicate_paths = set()
    for r in observations:
        if not isinstance(r, dict):
            continue
        name, path = r.get("name"), r.get("path")
        if not (isinstance(name, str) and isinstance(path, str)
                and name.startswith(("worktree_generated:", "project_generated:"))
                and r.get("classification") == "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED"
                and r.get("mutation_allowed") is False
                and path.startswith("/") and ".." not in Path(path).parts
                and Path(path).name in GENERATED_NAMES):
            continue
        if path in seen:
            duplicate_paths.add(path)
            unknown.append({"path": path, "reason": "DUPLICATE_PATH_HOLD"})
            continue
        seen.add(path)
        size = r.get("allocated_bytes")
        if not (r.get("complete") is True and r.get("measurement_reason") == "MEASURED"
                and r.get("symlink") is False and type(size) is int and size >= 0):
            unknown.append({"path": path, "reason": str(r.get("measurement_reason", "UNKNOWN"))})
            continue
        if size < GENERATED_THRESHOLD:
            continue
        role, protected = generated_protection_role(path)
        basename = Path(path).name
        proof = r.get("metadata_fingerprint_sha256")
        reasons = [
            "SOURCE_HEAD_AND_DIRTY_STATE_NOT_ATTESTED", "REBUILD_NOT_PROVEN",
            "LIVE_CONSUMERS_NOT_PROVEN", "HARDLINK_TREE_NOT_PROVEN",
            "MOUNT_AND_OWNER_NOT_RECHECKED", "OWNER_APPROVAL_MISSING",
            "APFS_UNIQUE_GAIN_UNKNOWN",
        ]
        if protected:
            reasons.extend(("PROTECTED_ANCESTRY_HOLD", role))
        if basename == ".next":
            reasons.append("BUILD_ID_NOT_PINNED")
        if not (isinstance(proof, str) and len(proof) == 64):
            reasons.append("CENSUS_FINGERPRINT_MISSING")
        ranked.append({
            "path": path, "name": name, "artifact_class": basename,
            "allocated_bytes": size, "metadata_fingerprint_sha256": proof,
            "exact_candidate_sha256": hashlib.sha256(
                (path + "|" + str(size) + "|" + str(proof)).encode()).hexdigest(),
            "source_head": None, "source_state": "UNKNOWN",
            "build_id": None, "owner_verified": False,
            "regeneration_proof": "UNKNOWN",
            "consumer_proof": "UNKNOWN", "hardlink_proof": "UNKNOWN",
            "mount_proof": "UNKNOWN", "protected_ancestry": protected,
            "protection_role": role,
            "hold_reasons": sorted(reasons), "overlaps_generated": [],
            "unique_recoverable_bytes": None, "mutation_authority": "NONE",
        })
    paths = [r["path"] for r in ranked]
    for r in ranked:
        if r["path"] in duplicate_paths:
            r["hold_reasons"].append("DUPLICATE_PATH_HOLD")
        path = r["path"].rstrip("/")
        r["overlaps_generated"] = sorted(
            p for p in paths if p != r["path"] and
            (p.startswith(path + "/") or path.startswith(p.rstrip("/") + "/")))
        if r["overlaps_generated"]:
            r["hold_reasons"].append("PARENT_CHILD_GENERATED_OVERLAP")
    ranked.sort(key=lambda r: (-r["allocated_bytes"], r["path"]))
    gross_nonoverlap = sum(
        r["allocated_bytes"] for r in ranked
        if not r["overlaps_generated"] and not r["protected_ancestry"]
        and r["path"] not in duplicate_paths
    )
    complete = (valid and type(census.get("observed_path_count")) is int
                and census["observed_path_count"] == len(observations)
                and census.get("displayed_path_count") == len(observations)
                and not any(x in census.get("incomplete_reasons", []) for x in
                            ("DISPLAY_ROW_LIMIT", "PROJECT_DIRECTORY_LIMIT_120",
                             "WORKTREE_LIMIT_60")))
    return {
        "status": "READ_ONLY_HOLD",
        "threshold_bytes": GENERATED_THRESHOLD,
        "ranked_generated": ranked, "ranked_count": len(ranked),
        "unknown_generated": sorted(unknown, key=lambda r: (r["path"], r["reason"])),
        "named_enumeration_complete": complete,
        "nominal_nonoverlap_unprotected_allocated_bytes": gross_nonoverlap,
        "nominal_size_not_unique_apfs_gain": True,
        "certified_unique_reclaimable_bytes": 0,
        "predicted_unique_reclaimable_bytes": None,
        "target_additional_bytes": 20 * 1024**3,
        "shortfall_bytes": None, "verdict": "EVIDENCE_INSUFFICIENT",
        "owner_authorized": False, "apply_permitted": False,
        "next_readonly_command": "aoe2war storage local-plan --json",
    }


def plan(base: dict[str, Any], extended: dict[str, Any], electron: dict[str, Any],
         census: dict[str, Any], watchdog: dict[str, Any]) -> dict[str, Any]:
    """Pure policy; unknown or overlapping rows never become reclaimable."""
    commands = {
        "original": "aoe2war storage local-maintain --apply",
        "extended": "aoe2war storage local-maintain --apply --extended",
        "electron": "aoe2war storage local-maintain --apply --electron-only",
    }
    buckets = {}
    for key, source in (("original", base), ("extended", extended), ("electron", electron)):
        rows = cache_rows(source, key)
        safe = rows is not None and not any(r["blocked"] for r in rows)
        buckets[key] = {
            "status": "OBSERVED" if safe else "UNKNOWN_OR_UNSAFE",
            "rows": rows or [],
            "allocated_bytes": sum(row["allocated_bytes"] for row in rows) if safe else None,
            "owner_authorized_apply_command": commands[key],
            "auto_apply": False,
        }
    census_good = (
        census.get("status") == "READ_ONLY" and
        census.get("mutation_allowed") is False and
        census.get("coverage") == "NAMED_PATHS_ONLY_NOT_WHOLE_DISK" and
        isinstance(census.get("measured"), list))
    measured = census["measured"] if census_good else []
    review = [r for r in measured if isinstance(r, dict) and
              str(r.get("classification", "")).startswith("REVIEW")]
    review.sort(key=lambda r: int(r.get("allocated_bytes") or 0), reverse=True)
    coverage = {
        "scope": "NAMED_ONLY_NOT_WHOLE_DISK",
        "observed_path_count": census.get("observed_path_count") if census_good else None,
        "displayed_path_count": census.get("displayed_path_count") if census_good else None,
        "named_census_complete": census.get("named_census_complete") is True if census_good else False,
        "incomplete_reasons": census.get("incomplete_reasons") if census_good else ["CENSUS_UNAVAILABLE"],
        "overlapping_parent_child_rows": True,
        "unclassified_whole_home": True,
        "measurement_gap_count": census.get("measurement_gap_count") if census_good else None,
        "measurement_gaps": census.get("measurement_gaps", []) if census_good else [],
        "apfs_accounting": census.get("apfs_accounting") if census_good else None,
        "scope_bounds": census.get("scope_bounds") if census_good else None,
    }
    actions = [{"lane": key, "allocated_bytes": row["allocated_bytes"],
                "requires_owner_authorization": commands[key]}
               for key, row in buckets.items()
               if row["status"] == "OBSERVED" and row["allocated_bytes"] > 0]
    actions.sort(key=lambda row: row["allocated_bytes"], reverse=True)
    # Level 1 is an evidence register, NOT automatic eligibility. Preserve the
    # canonical local-maintain allowlist and require independent consumer,
    # ancestry, regeneration, owner approval and same-APFS accounting proofs.
    level1 = []
    for lane, bucket in buckets.items():
        if bucket["status"] != "OBSERVED":
            continue
        for item in bucket["rows"]:
            path = item.get("path")
            if (not isinstance(path, str) or not path.startswith("/")
                    or item["blocked"] or not item["exists"]
                    or item["allocated_bytes"] <= 0):
                continue
            level1.append({
                "name": item["name"], "path": path,
                "candidate_fingerprint_sha256": hashlib.sha256(
                    (lane + "|" + path + "|" + str(item["allocated_bytes"])).encode()
                ).hexdigest(),
                "allocated_bytes": item["allocated_bytes"], "producer": lane + "_cache",
                "source_allowlisted": True, "consumer_status": "UNKNOWN",
                "protected_ancestry_status": "NOT_INDEPENDENTLY_ATTESTED",
                "regeneration_proof": "RECIPE_ONLY_NO_NATIVE_REBUILD",
                "risk_classification": "HOLD_UNVERIFIED_LIVE_CONSUMER",
                "expected_unique_apfs_gain_bytes": None,
                "owner_approved": False, "mutation_authority": "NONE",
                "next_readonly_action": (
                    "aoe2war storage local-maintain --json" if lane == "original"
                    else "aoe2war storage local-maintain --extended --json"
                    if lane == "extended"
                    else "aoe2war storage local-maintain --electron-only --json"),
            })
    # Duplicate paths or parent-child overlaps are never independent bytes.
    for candidate in level1:
        target = candidate["path"].rstrip("/")
        if any(other is not candidate and (
                target == other["path"].rstrip("/") or
                target.startswith(other["path"].rstrip("/") + "/") or
                other["path"].rstrip("/").startswith(target + "/"))
                for other in level1):
            candidate["risk_classification"] = "HOLD_OVERLAPPING_PATHS"
    # The legacy large-bucket summary is limited to REVIEW*, but the full
    # register must also include project worktrees and REBUILDABLE_REVIEW*
    # generated paths; otherwise many observed rows silently disappear.
    review_classes = ("REVIEW", "REBUILDABLE_REVIEW", "PROJECT_REVIEW")
    level2_source = [
        r for r in measured if isinstance(r, dict)
        and str(r.get("classification", "")).startswith(review_classes)
    ]
    level2 = [{
        "name": r.get("name"), "path": r.get("path"),
        "classification": r.get("classification"),
        "allocated_bytes": r.get("allocated_bytes") if r.get("complete") is True else None,
        "measurement_reason": r.get("measurement_reason", "LEGACY_UNKNOWN"),
        "metadata_fingerprint_sha256": r.get("metadata_fingerprint_sha256"),
        "next_readonly_action": r.get("next_readonly_action", "REVIEW_GENERATED_SOURCE"),
        "protected_ancestry_status": "NOT_INDEPENDENTLY_ATTESTED",
        "consumer_status": "UNKNOWN",
        "risk_classification": (
            "LEVEL_2_HOLD_SYMLINK_REFERENCE_NO_TRAVERSAL"
            if str(r.get("measurement_reason", "")).startswith("SYMLINK")
            else "LEVEL_2_OWNER_REVIEW_NO_DELETE_PROOF"),
        "expected_unique_apfs_gain_bytes": None,
        "mutation_authority": "NONE",
    } for r in level2_source]
    capacity = watchdog.get("capacity")
    hb = watchdog.get("heartbeat")
    hb_summary = {
        "overall": watchdog.get("overall", "UNKNOWN"),
        "heartbeat": hb.get("status") if isinstance(hb, dict) else "UNKNOWN",
        "capacity": capacity.get("status") if isinstance(capacity, dict) else "UNKNOWN",
        "source": "VPSSENTRY_READ_ONLY_RECEIPT_WATCHDOG",
        "not_a_new_remote_measurement": True,
    }
    return {
        "schema": "aoe2war.mac-local-storage-plan.v1",
        "kind": "aoe2war-storage-local-plan",
        "authority": "READ_ONLY_DECISION_SUPPORT",
        "status": "REVIEW_REQUIRED" if (actions or not coverage["named_census_complete"] or
                  any(row["status"] != "OBSERVED" for row in buckets.values()) or
                  hb_summary["overall"] != "PASS") else
                  "NAMED_CACHES_EMPTY_OTHER_CLASSES_STILL_UNCLASSIFIED",
        "cache_lanes": buckets,
        "known_cache_allocated_bytes": sum(row["allocated_bytes"] for row in buckets.values()
                                           if row["status"] == "OBSERVED"),
        "cache_allocation_not_guaranteed_APFS_gain": True,
        "priority_cache_actions": actions,
        "gigabyte_generated_ranked_plan": generated_rank(census),
        "bounded_l1_policy_scope_ledger": bounded_generated_scope_ledger(census),
        "level_1_candidate_register": sorted(level1, key=lambda r: (r["path"], r["name"])),
        "level_2_owner_review_register": sorted(level2, key=lambda r: (str(r["path"]), r["name"])),
        "level_2_register_coverage": {
            "included_rows": len(level2),
            "source_rows_displayed": len(measured),
            "source_rows_observed": coverage["observed_path_count"],
            "complete_named_display": (
                coverage["observed_path_count"] == coverage["displayed_path_count"]
                if isinstance(coverage["observed_path_count"], int) else False),
            "protected_rows_not_owner_reviewed": True,
            "gross_allocations_must_not_be_summed": True,
        },
        "level_1_certified_reclaimable_bytes": 0,
        "level_1_unique_apfs_gain_estimate_bytes": None,
        "level_1_closure": {
            "status": "HOLD_NOT_CERTIFIED",
            "native_independent_observation_cycles": 0,
            "unresolved_eligible_candidates": None,
            "protected_mutation_verified": None,
            "physical_recovery_verified_bytes": None,
            "seal_authority": "CENTRAL_COMMAND_ONLY",
        },
        "review_only_large_buckets": [{
            "name": r.get("name"), "classification": r.get("classification"),
            "allocated_bytes": r.get("allocated_bytes"), "measured": r.get("complete") is True,
            "contains_known_protected_descendant": r.get("name") == "generic_cache",
            "next_readonly_inspection": (
                "aoe2war storage local-pressure --focus generic_cache"
                if r.get("name") == "generic_cache" else None
            ),
            "mutation_authority": "NONE",
        } for r in review[:15]],
        "coverage": coverage,
        "heartbeat": hb_summary,
        "next_census_command": "aoe2war storage local-pressure --limit 1024",
        "auto_delete_permitted": False,
        "financial_or_release_authority": False,
        "protected_data_never_selected": True,
    }



def bounded_generated_scope_ledger(census: dict[str, Any]) -> dict[str, Any]:
    """Pure logical-slot accounting; never a physical-byte or cleanup certificate.

    One slot is a declared root plus one fixed generated basename. Project
    outputs omitted by the producer are UNKNOWN (not proven absent); declared
    worktrees explicitly emit ABSENT rows. Cross-namespace duplicate paths
    get one classification and one separately disclosed overlap slot.
    """
    ledger = {
        "schema": "aoe2war.mac-l1-bounded-scope-ledger.v1",
        "grain": "DECLARED_ROOT_X_FIXED_GENERATED_BASENAME_LOGICAL_SLOT",
        "generated_basenames": sorted(GENERATED_NAMES),
        "source": "EXISTING_BOUNDED_MAC_NAMED_CENSUS_ONLY",
        "status": "HOLD", "denominator_slots": None,
        "measured_slots": None, "known_absent_slots": None,
        "ambiguous_slots": None, "unknown_slots": None,
        "omitted_slots": None, "protected_out_of_scope_slots": None,
        "overlap_slots_not_double_counted": None,
        "project_roots": None, "declared_worktree_roots": None,
        "undisplayed_named_rows": None, "validation_holds": [],
        "known_unique_path_count": None, "apfs_unique_recoverable_bytes": None,
        "physical_root_overlap_may_remain_unknown": True,
        "nested_and_other_home_roots_not_in_denominator": True,
        "policy_scope_complete": False, "mutation_authority": "NONE",
    }
    if not (isinstance(census, dict)
            and census.get("status") == "READ_ONLY"
            and census.get("mutation_allowed") is False
            and census.get("coverage") == "NAMED_PATHS_ONLY_NOT_WHOLE_DISK"
            and isinstance(census.get("measured"), list)
            and isinstance(census.get("scope_bounds"), dict)):
        ledger["validation_holds"].append("CENSUS_OR_SCOPE_BOUNDS_UNTRUSTED")
        return ledger
    bounds = census["scope_bounds"]
    counts = {}
    for label, prefix in (("project", "direct_project_roots"),
                          ("worktree", "canonical_git_worktrees")):
        triple = [bounds.get(prefix + suffix) for suffix in
                  ("_total", "_observed", "_omitted")]
        if (any(type(v) is not int or v < 0 for v in triple)
                or triple[0] != triple[1] + triple[2]
                or triple[1] > (120 if label == "project" else 60)):
            ledger["validation_holds"].append(label.upper() + "_BOUND_INCOHERENT")
            return ledger
        counts[label] = tuple(triple)
    observed = census.get("observed_path_count")
    displayed = census.get("displayed_path_count")
    rows = census["measured"]
    if (type(observed) is not int or type(displayed) is not int
            or observed < 0 or displayed != len(rows)
            or displayed > observed or displayed > 1024):
        ledger["validation_holds"].append("DISPLAY_COUNT_INCOHERENT")
        return ledger
    ledger["undisplayed_named_rows"] = observed - displayed
    ledger["project_roots"] = dict(zip(("total", "observed", "omitted"),
                                        counts["project"]))
    ledger["declared_worktree_roots"] = dict(zip(("total", "observed", "omitted"),
                                                  counts["worktree"]))
    roots: dict[str, set[str]] = {"project": set(), "worktree": set()}
    slots: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        path, name = row.get("path"), row.get("name")
        if not (isinstance(path, str) and path.startswith("/")
                and ".." not in Path(path).parts and isinstance(name, str)):
            continue
        if name.startswith("project:") and name != "project:":
            roots["project"].add(path.rstrip("/"))
        if (name.startswith(("project_generated:", "worktree_generated:"))
                and row.get("classification") ==
                "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED"
                and Path(path).name in GENERATED_NAMES):
            kind = "project" if name.startswith("project_generated:") else "worktree"
            root = str(Path(path).parent)
            # Only a declared project row establishes a scanned project root.
            # A worktree's seven named entries establish its observed root.
            if kind == "worktree":
                roots[kind].add(root)
            slots.setdefault((kind, root, Path(path).name), []).append(row)
    if any(len(roots[kind]) > counts[kind][1] for kind in roots):
        ledger["validation_holds"].append("ROOT_IDENTITY_COUNT_EXCEEDS_BOUND")
        return ledger
    names = sorted(GENERATED_NAMES)
    categories = {key: 0 for key in ("measured", "known_absent", "ambiguous",
                                      "unknown", "omitted", "protected", "overlap")}
    # Namespace slots are accounted separately, then exact physical paths
    # repeated across two namespaces are deliberately collapsed into OVERLAP.
    classified_paths: set[str] = set()
    for kind in ("project", "worktree"):
        for root in sorted(roots[kind]):
            for basename in names:
                path = str(Path(root) / basename)
                if path in classified_paths:
                    categories["overlap"] += 1
                    continue
                classified_paths.add(path)
                _, protected = generated_protection_role(path)
                if protected:
                    categories["protected"] += 1
                    continue
                observations = slots.get((kind, root, basename), [])
                if len(observations) != 1:
                    categories["ambiguous" if len(observations) > 1 else "unknown"] += 1
                    continue
                row = observations[0]
                reason, size = row.get("measurement_reason"), row.get("allocated_bytes")
                valid = (row.get("mutation_allowed") is False
                         and row.get("symlink") is False
                         and row.get("complete") is True
                         and type(size) is int and size >= 0)
                if valid and reason == "MEASURED":
                    categories["measured"] += 1
                elif valid and reason == "ABSENT" and size == 0:
                    categories["known_absent"] += 1
                else:
                    categories["ambiguous"] += 1
        unseen = counts[kind][1] - len(roots[kind])
        categories["unknown"] += unseen * len(names)
        categories["omitted"] += counts[kind][2] * len(names)
    denominator = sum(v[0] for v in counts.values()) * len(names)
    if sum(categories.values()) != denominator:
        ledger["validation_holds"].append("SCOPE_CONSERVATION_FAILED")
        return ledger
    ledger.update(
        denominator_slots=denominator,
        measured_slots=categories["measured"],
        known_absent_slots=categories["known_absent"],
        ambiguous_slots=categories["ambiguous"],
        unknown_slots=categories["unknown"],
        omitted_slots=categories["omitted"],
        protected_out_of_scope_slots=categories["protected"],
        overlap_slots_not_double_counted=categories["overlap"],
        known_unique_path_count=len(classified_paths),
        status="COUNTED_BOUNDED_SCOPE_HOLD")
    if ledger["undisplayed_named_rows"]:
        ledger["validation_holds"].append("DISPLAY_TRUNCATED_UNKNOWN_CLASSIFICATIONS")
    if categories["unknown"] or categories["omitted"] or categories["ambiguous"]:
        ledger["validation_holds"].append("UNPROVEN_GENERATED_SLOT_COVERAGE")
    if categories["overlap"]:
        ledger["validation_holds"].append("CROSS_NAMESPACE_ALIAS_LOGICAL_OVERLAP")
    # No native second-cycle, immutable provenance, APFS physical uniqueness,
    # private HOME_BUCKETS and other-project proof can be minted by this ledger.
    return ledger


def l1_exhaustion_receipt(plan_result: dict[str, Any],
                          capacity: dict[str, Any]) -> dict[str, Any]:
    """Pure fail-closed evidence decision. Never issue a native/signed YES."""
    ranked = plan_result.get("gigabyte_generated_ranked_plan", {})
    items = ranked.get("ranked_generated", [])
    unknown = ranked.get("unknown_generated", [])
    coverage = plan_result.get("coverage", {})
    candidates = []
    for row in items if isinstance(items, list) else []:
        if not isinstance(row, dict) or row.get("protected_ancestry") is True:
            continue
        candidates.append({
            "path": row.get("path"), "gross_allocated_bytes": row.get("allocated_bytes"),
            "reason": "NO_REBUILD_CONSUMER_MOUNT_HARDLINK_OR_UNIQUE_APFS_PROOF",
            "unique_apfs_gain_bytes": None, "mutation_authority": "NONE"})
    for row in plan_result.get("level_1_candidate_register", []):
        if isinstance(row, dict) and row.get("allocated_bytes", 0) > 0:
            candidates.append({
                "path": row.get("path"), "gross_allocated_bytes": row.get("allocated_bytes"),
                "reason": "CACHE_CONSUMER_REBUILD_OWNER_PROOFS_MISSING",
                "unique_apfs_gain_bytes": None, "mutation_authority": "NONE"})
    ledger = plan_result.get("bounded_l1_policy_scope_ledger")
    reasons = []
    if (not isinstance(ledger, dict) or ledger.get("status") != "COUNTED_BOUNDED_SCOPE_HOLD"
            or ledger.get("validation_holds") or ledger.get("unknown_slots")
            or ledger.get("omitted_slots") or ledger.get("ambiguous_slots")):
        reasons.append("BOUNDED_POLICY_DENOMINATOR_INCOMPLETE_OR_UNKNOWN")
    if not isinstance(capacity, dict) or capacity.get("status") != "OBSERVED_SHALLOW":
        reasons.append("PHYSICAL_CAPACITY_ACCOUNTING_HOLD")
    # Even complete shallow du does not prove APFS clones, snapshots, other
    # volumes or metadata accounting. Never equate a du residual to free bytes.
    if not isinstance(capacity, dict) or not capacity.get("full_container_coverage_certified"):
        reasons.append("WHOLE_APFS_SHARED_AND_CLONE_EXTENTS_UNPROVEN")
    if (not isinstance(coverage, dict)
            or coverage.get("observed_path_count") != coverage.get("displayed_path_count")
            or coverage.get("incomplete_reasons")):
        reasons.append("NAMED_POLICY_SCOPE_INCOMPLETE_OR_UNKNOWN")
    if not ranked.get("named_enumeration_complete"):
        reasons.append("GENERATED_SCOPE_NOT_PROVEN_COMPLETE")
    if candidates:
        reasons.append("EXACT_L1_CANDIDATES_NOT_PROOF_QUALIFIED")
    if unknown:
        # An ABSENT generated target is not an unknown allocation. Keep the
        # separate reason counts instead of treating 284 rows as junk.
        by_reason = {}
        for row in unknown:
            reason = row.get("reason", "UNKNOWN") if isinstance(row, dict) else "UNKNOWN"
            by_reason[reason] = by_reason.get(reason, 0) + 1
    else:
        by_reason = {}
    if any(k not in ("ABSENT", "SYMLINK_TARGET", "SYMLINK_ANCESTOR")
           for k in by_reason):
        reasons.append("UNRESOLVED_GENERATED_OBSERVATIONS")
    reasons.extend((
        "NATIVE_INDEPENDENT_TWO_CYCLES_NOT_PROVEN",
        "EXPLICIT_OWNER_AND_CENTRAL_SEAL_ABSENT",
        "APFS_PHYSICAL_BEFORE_AFTER_TRANSACTION_PROOF_ABSENT",
    ))
    return {
        "schema": "aoe2war.mac-l1-exhaustion-decision.v1",
        "decision": "L1_POLICY_EXHAUSTED_NO",
        "proof_scope": (
            "HOME_BUCKETS_PLUS_BOUNDED_AOE2HDBETS_DIRECT_PROJECT_GENERATED_"
            "PLUS_CANONICAL_DECLARED_WORKTREES_PLUS_EXISTING_CACHE_ALLOWLIST"),
        "whole_500gb_container_l1_inventory_certified": False,
        "policy_scope_complete": False,
        "bounded_policy_scope_ledger": ledger,
        "blockers": sorted(set(reasons)),
        "candidate_holds": sorted(candidates, key=lambda r: (
            -r["gross_allocated_bytes"], str(r["path"]))),
        "generated_nonmeasurement_reason_counts": dict(sorted(by_reason.items())),
        "omitted_project_count": (
            coverage.get("scope_bounds", {}).get("direct_project_roots_omitted")
            if isinstance(coverage.get("scope_bounds"), dict) else None),
        "omitted_worktree_count": (
            coverage.get("scope_bounds", {}).get("canonical_git_worktrees_omitted")
            if isinstance(coverage.get("scope_bounds"), dict) else None),
        "nested_build_roots_out_of_scope": True,
        "other_home_project_trees_out_of_scope": True,
        "gross_allocated_bytes_not_unique_recoverable": True,
        "certified_recovered_bytes": 0,
        "predicted_unique_recoverable_bytes": None,
        "unexplained_physical_residual_bytes": None,
        "accepted_independent_gates_prior": 2,
        "gate_count": 8,
        "no_eligible_action_signed_receipt": None,
        "authority": "READ_ONLY_NO_APPLY",
        "native_second_cycle_and_owner_witness_required": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--l1-campaign", action="store_true",
                        help="one read-only Mac capacity+existing-L1-policy observation, never apply")
    args = parser.parse_args()
    base = [sys.executable, str(ROOT / "scripts/aoe2_storage.py"), "local-maintain"]
    x = observe(base + ["--json"], cwd=ROOT)
    y = observe(base + ["--extended", "--json"], cwd=ROOT)
    z = observe(base + ["--electron-only", "--json"], cwd=ROOT)
    census = observe([sys.executable, str(ROOT / "scripts/aoe2_storage_mac_pressure.py"),
                      "--limit", "1024", "--json"], cwd=ROOT, timeout=240)
    watcher = Path.home() / "projects/VPSSentry/scripts/mac_storage_pulse_health.py"
    hb = observe([sys.executable, str(watcher), "--json"], cwd=ROOT, timeout=12,
                 accept_hold=True) if watcher.is_file() and not watcher.is_symlink() else {
                     "overall": "UNKNOWN", "reason": "VPSSENTRY_WATCHDOG_UNAVAILABLE"
                 }
    result = plan(x, y, z, census, hb)
    if args.l1_campaign:
        capacity = observe(
            [sys.executable, str(ROOT / "scripts/aoe2_storage_mac_pressure.py"),
             "--capacity-only", "--json"], cwd=ROOT, timeout=250)
        result["l1_full_capacity_accounting"] = capacity
        result["l1_policy_exhaustion_decision"] = l1_exhaustion_receipt(result, capacity)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("AOE2WAR MAC STORAGE PLAN — READ ONLY")
        print("Status:", result["status"])
        print("Known cache allocation GiB:",
              round(result["known_cache_allocated_bytes"] / 1024**3, 3))
        for key, row in result["cache_lanes"].items():
            print(" ", key, row["status"],
                  (str(round(row["allocated_bytes"] / 1024**3, 3)) + " GiB")
                  if row["allocated_bytes"] is not None else "NOT MEASURED")
        print("Named census:", result["coverage"]["observed_path_count"],
              "displayed:", result["coverage"]["displayed_path_count"],
              "complete:", result["coverage"]["named_census_complete"])
        if result["coverage"]["incomplete_reasons"]:
            print("Census holds:", ",".join(result["coverage"]["incomplete_reasons"]))
        for hold in result["coverage"]["measurement_gaps"]:
            print("  NAMED PATH HOLD:", hold["name"], hold["reason"])
        print("Level 1 register:", len(result["level_1_candidate_register"]),
              "source allowlisted, 0 fully qualified")
        print("Level 2 register:", len(result["level_2_owner_review_register"]),
              "review-only, 0 authorized")
        if args.l1_campaign:
            receipt = result["l1_policy_exhaustion_decision"]
            print("LEVEL 1 EXHAUSTION:", receipt["decision"])
            print("Blockers:", ", ".join(receipt["blockers"]))
            print("No signed closure, no deletion, no unique APFS gain inferred")
        generated = result["gigabyte_generated_ranked_plan"]
        print("Generated >=256 MiB:", generated["ranked_count"],
              "HOLD; physical APFS gain UNKNOWN")
        for item in generated["ranked_generated"]:
            print("  GENERATED HOLD", round(item["allocated_bytes"] / 1024**3, 3),
                  "GiB", item["path"], ",".join(item["hold_reasons"]))
        print("Independent heartbeat:", result["heartbeat"]["overall"],
              "capacity:", result["heartbeat"]["capacity"])
        for action in result["priority_cache_actions"]:
            print("  OWNER APPROVAL REQUIRED:", action["requires_owner_authorization"])
        for row in result["review_only_large_buckets"][:6]:
            print("  REVIEW ONLY:", row["name"], row["classification"],
                  round((row["allocated_bytes"] or 0)/1024**3, 2), "GiB")
            if row["next_readonly_inspection"]:
                print("    NEXT READ-ONLY:", row["next_readonly_inspection"])
                print("    INCLUDES PROTECTED CHILD: no gross allocation may be treated as junk")
        print("No mutation. Named path totals overlap; unknown files are never junk by default.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
