#!/usr/bin/env python3
"""Evidence-first Release Frontier Ladder. Read-only diagnostic, never authority.

Consumes the canonical `aoe2war finish --dry-run --json` plan and optionally
a WoloChain read-only frontier observation. These files may be stale or
operator-supplied, so NOTHING here can authorize a release, infer a payment
outcome, or establish runtime parity. Refusal is an ordinary outcome.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

MAX_INPUT_BYTES = 256 * 1024

CONTROLS = (
    ("hd_de_producers_isolated", "HD + DE writers and signers independently fenced",
     "Witness all producer/ingress paths stopped or isolated for BOTH sites, not merely systemd unit names."),
    ("inflight_requests_and_accepted_tx_reconciled", "All accepted/in-flight requests reconciled",
     "Join both settlement journals to independent final chain outcomes; preserve unknown requests and liability holds."),
    ("claim_889_liability_preserved_and_release_reviewed", "Founder claim #889 independently adjudicated",
     "Establish exact historical payout outcome and amount from independent chain plus claim authority; never auto-retry."),
    ("fresh_quiesced_backup_hash_verified", "Current quiesced snapshot independently verified",
     "Take and hash BOTH settlement-state snapshots with all writers fenced; old nonexclusive backup is insufficient."),
    ("reviewed_code_only_rollback_rehearsed", "Two-service code-only rollback demonstrated",
     "Rehearse old-binary restoration without replaying payments, restoring bank state, or touching consensus."),
    ("bank_solvent_and_independently_checked", "Reserve and fee coverage independently reconciled",
     "Match current live balances to ALL outstanding liabilities, payout and escrow reserves, and fee floors."),
)
FOLLOW_ON = (
    ("paired_settlement_cutover", "Approve, execute and witness paired 8092/8093 code-only cutover"),
    ("source_transition", "Prove both running binaries, then advance source authority separately"),
    ("website_finish", "Run normal protected website Finish, certify and smoke test"),
)


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key[:80])
        result[key] = value
    return result


def read_json(path: Path) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise ValueError("Evidence must be a regular non-symlink file")
    with path.open("rb") as stream:
        raw = stream.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Evidence exceeds bounded size")
    try:
        parsed = json.loads(
            raw, object_pairs_hook=unique_object,
            parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Nonfinite JSON number")),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed JSON evidence") from exc
    if not isinstance(parsed, dict):
        raise ValueError("Evidence root must be a JSON object")
    return parsed


def _boolean(value: Any) -> bool:
    return value is True


def _utc(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.astimezone(timezone.utc) if d.tzinfo else None
    except ValueError:
        return None


def _nested(data: dict[str, Any], *keys: str) -> Any:
    part: Any = data
    for key in keys:
        if not isinstance(part, dict):
            return None
        part = part.get(key)
    return part


def analyze(finish: dict[str, Any], wolo: dict[str, Any] | None = None,
            *, now: datetime | None = None) -> dict[str, Any]:
    if finish.get("kind") != "aoe2war-finish-plan" or finish.get("schema") != 2:
        raise ValueError("Require an authentic-format finish dry-run plan")
    status = finish.get("status")
    if status not in ("BLOCKED", "READY", "READY_WITH_AUTOMATIC_REMEDIATION"):
        raise ValueError("Unexpected Finish status")
    documented = _nested(finish, "documentation_plan", "unknown_p1")
    findings = documented if isinstance(documented, list) else []
    wolo_p1 = [
        {"key": item.get("key"), "detail": item.get("detail")}
        for item in findings
        if isinstance(item, dict)
        and item.get("area") == "WoloChain"
        and item.get("key") == "vps-source-drift"
    ]
    blocker_list = finish.get("blockers")
    other_blockers = [str(x)[:160] for x in blocker_list] if isinstance(blocker_list, list) else []
    if not wolo_p1 and status == "BLOCKED":
        classification = "BLOCKED_UNCLASSIFIED"
    elif wolo_p1:
        classification = "WOLO_SETTLEMENT_RUNTIME_DRIFT"
    else:
        classification = "NO_WOLO_DRIFT_IN_THIS_PLAN"
    candidate = _nested(finish, "release", "github", "main_sha")
    deployed = _nested(finish, "release", "production", "source_sha")
    source = _nested(wolo or {}, "source_authority") or {}
    observed = (_nested(wolo or {}, "source_authority", "observed_at_utc")
                or _nested(wolo or {}, "chain_operational_progress", "observed_at_utc"))
    stamp = _utc(observed)
    current = now or datetime.now(timezone.utc)
    age_sec = (current - stamp).total_seconds() if stamp else None
    stale = age_sec is None or age_sec < -60 or age_sec > 3600

    signals = {
        "hd_de_producers_isolated": _nested(wolo or {}, "producer_inventory", "financial_producers_fenced"),
        "inflight_requests_and_accepted_tx_reconciled": _nested(wolo or {}, "financial_drain_certified"),
        "claim_889_liability_preserved_and_release_reviewed": _nested(wolo or {}, "claim_889_reconciled"),
        "fresh_quiesced_backup_hash_verified": _nested(wolo or {}, "fresh_quiesced_snapshot_proven"),
        "reviewed_code_only_rollback_rehearsed": _nested(wolo or {}, "live_rollback_rehearsed"),
        "bank_solvent_and_independently_checked": _nested(wolo or {}, "reserve_liability_parity_proven"),
    }
    steps = []
    for index, (key, label, evidence) in enumerate(CONTROLS, 1):
        signal = signals[key]
        # Even a true observational JSON flag does not prove independent
        # witness, protected signoff or release permission.
        state = "UNPROVEN" if signal is not True else "REPORTED_ONLY_NOT_AUTHORIZED"
        steps.append({
            "number": index, "id": key, "title": label,
            "state": state, "observation": signal if isinstance(signal, bool) else None,
            "required_evidence": evidence,
            "authorized": False,
        })
    for index, (key, label) in enumerate(FOLLOW_ON, len(CONTROLS) + 1):
        steps.append({"number": index, "id": key, "title": label,
                      "state": "NOT_AUTHORIZED", "authorized": False})
    next_step = next(
        (step for step in steps[:6] if step["observation"] is not True), steps[0]
    )
    next_task = next_step["required_evidence"]
    return {
        "schema": "aoe2war.release-frontier-ladder.v1",
        "finish_status": status,
        "blocker_class": classification,
        "website_candidate_sha": candidate if isinstance(candidate, str) else None,
        "active_website_source_sha": deployed if isinstance(deployed, str) else None,
        "wolo_drift": wolo_p1,
        "other_finish_blockers": other_blockers,
        "wolo_observation_age_seconds": round(age_sec) if age_sec is not None else None,
        "wolo_observation_stale": stale,
        "wolo_running_source": source.get("live_settlement_revision") if isinstance(source, dict) else None,
        "wolo_reviewed_source": source.get("expected_revision") if isinstance(source, dict) else None,
        "wolo_source_authority_reported_blocked": (
            source.get("status") == "BLOCKED" if isinstance(source, dict) else None
        ),
        "controls": steps,
        "next_task_id": next_step["id"] if classification == "WOLO_SETTLEMENT_RUNTIME_DRIFT" else "inspect_other_blocker",
        "next_task": next_task if classification == "WOLO_SETTLEMENT_RUNTIME_DRIFT"
                     else "Diagnose actual Finish blockers; never assume Wolo is the sole cause.",
        "website_release_authorized": False,
        "financial_release_authorized": False,
        "cutover_authorized": False,
        "nature": "READ_ONLY_UNTRUSTED_OBSERVATIONAL_HANDOFF",
        "note": "No unsigned source file can certify financial controls or clear a protected release gate.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--finish-plan", type=Path, required=True,
                        help="JSON output from ./bin/aoe2war finish --dry-run --json")
    parser.add_argument("--wolo-frontier", type=Path,
                        help="Optional WoloChain protected-release-frontier observational JSON")
    parser.add_argument("--json", action="store_true")
    opts = parser.parse_args(argv)
    try:
        report = analyze(
            read_json(opts.finish_plan),
            read_json(opts.wolo_frontier) if opts.wolo_frontier else None,
        )
    except (ValueError, OSError) as exc:
        print(json.dumps({"status": "UNPROVEN", "error": str(exc)[:180],
                          "website_release_authorized": False}), file=sys.stderr)
        return 2
    if opts.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print("⚔️  AOE2WAR RELEASE FRONTIER LADDER · READ ONLY")
        print("Finish: " + report["finish_status"] + " / " + report["blocker_class"])
        print("Website Git: " + str(report["website_candidate_sha"]))
        print("Wolo runtime: " + str(report["wolo_running_source"]))
        print("Wolo expected: " + str(report["wolo_reviewed_source"]))
        print("Observation: " + ("STALE OR MISSING" if report["wolo_observation_stale"] else "RECENT BUT NONAUTHORIZING"))
        for step in report["controls"]:
            print(f"  {step['number']}. {step['state']}: {step['title']}")
        print("NEXT TASK: " + report["next_task"])
        print("RESULT: NO RELEASE AUTHORITY. Use independently witnessed proof and protected controller.")
    return 2 if report["finish_status"] == "BLOCKED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
