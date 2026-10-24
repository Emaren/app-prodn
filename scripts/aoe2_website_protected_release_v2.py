#!/usr/bin/env python3
"""Protected website-only transaction controller (NO broad Wolo P1 waiver).

Run only from an exact independently reviewed controller checkout, while its
candidate-root is the clean canonical main checkout. No production action is
permitted without separate four-human phase attestations and an independently
signed fresh Wolo observer response. A protected failing command is never
retried. Underlying source P1 remains BLOCKED in every output/receipt.

Pre-stage approval precedes the artifact; activation must use a new approval
over the actual staged receipt, BUILD_ID, artifact and fresh Wolo truth.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import io
import json
import os
import stat
import subprocess
import sys
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aoe2_website_release_v2 import (
    MAIN_SOURCE_SHA, PRODUCTION_SHA, STATE_ROOT, TRUST_ROOT,
    Hold, assess, canonical, consume_signed_review, git, issue_challenge,
    protected_key, read_json, require, source_scope, utc_time,
)

ROOT = Path(__file__).resolve().parents[1]
WITNESS = Path("/usr/local/libexec/aoe2war-website-witness-v2")
WITNESS_KEY = "runtime_witness.pem"
IMMUTABLE_KEYS = frozenset({
    "wolo8092", "wolo8093", "consensus", "wolo_config_sha256",
    "financial_writers_sha256", "signer_capabilities_sha256",
    "financial_hold_sha256", "source_p1_original"
})
ALLOWED_PHASES = frozenset({"PRE_STAGE", "PRE_ACTIVATE"})


def digest(data) -> str:
    return hashlib.sha256(canonical(data)).hexdigest()


def digest_file(path: Path) -> str:
    require(path.is_file() and not path.is_symlink(), "missing/linked exact stage file")
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def strict_json_bytes(raw: bytes) -> dict:
    from aoe2_website_release_v2 import no_duplicates
    require(len(raw) < 2_000_000 and len(raw) > 0, "empty/oversized witness output")
    try:
        parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates)
    except (UnicodeError, ValueError, TypeError) as exc:
        raise Hold("malformed/duplicate witness JSON") from exc
    require(type(parsed) is dict, "invalid witness object")
    return parsed


def verify_detached(payload: dict, signature: str, key: Path) -> None:
    try:
        signature_bytes = base64.b64decode(signature, validate=True)
    except (TypeError, ValueError, binascii.Error) as exc:
        raise Hold("bad witness signature encoding") from exc
    require(32 <= len(signature_bytes) <= 8192, "bad witness signature size")
    import tempfile
    with tempfile.TemporaryDirectory(prefix="aoe2-witness-") as folder:
        message = Path(folder) / "observation"
        detached = Path(folder) / "signature"
        message.write_bytes(canonical(payload))
        detached.write_bytes(signature_bytes)
        p = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(key),
             "-signature", str(detached), str(message)],
            capture_output=True, timeout=10, check=False,
        )
    require(p.returncode == 0, "invalid independently signed witness")


def verify_witness_receipt(packet: dict, *, trust_root=TRUST_ROOT,
                           now=None, allow_test_root=False) -> dict:
    require(packet.get("schema") == 1 and packet.get("kind") ==
            "aoe2war-independent-runtime-witness-v1", "unsupported witness")
    payload = packet.get("payload")
    require(type(payload) is dict and type(packet.get("signature")) is str,
            "witness lacks signed payload")
    when = now or datetime.now(timezone.utc)
    observed = utc_time(payload.get("observed_at"))
    require(timedelta(seconds=0) <= when - observed <= timedelta(seconds=90),
            "stale/future runtime witness")
    require(payload.get("source_p1_open") is True and
            payload.get("financial_release_authorized") is False and
            payload.get("custody_authorized") is False and
            payload.get("claim_889_resolved") is False,
            "witness attempted source-P1/financial escalation")
    immutable = payload.get("immutable")
    require(type(immutable) is dict and set(immutable) == IMMUTABLE_KEYS,
            "missing or unknown complete immutable runtime census")
    p1 = immutable["source_p1_original"]
    require(type(p1) is dict and
            p1.get("key") == "vps-source-drift" and p1.get("status") == "BLOCKED" and
            type(p1.get("detail")) is str and len(p1["detail"]) >= 10,
            "missing raw Wolo original P1 findings")
    for service in ("wolo8092", "wolo8093", "consensus"):
        value = immutable[service]
        require(type(value) is dict and type(value.get("pid")) is int and
                value["pid"] > 0 and type(value.get("exe_sha256")) is str and
                len(value["exe_sha256"]) == 64 and
                all(c in "0123456789abcdef" for c in value["exe_sha256"]) and
                type(value.get("inode")) is int and value["inode"] > 0,
                "incomplete Wolo executing process evidence")
    for field in IMMUTABLE_KEYS - {"wolo8092", "wolo8093", "consensus", "source_p1_original"}:
        require(type(immutable[field]) is str and
                len(immutable[field]) == 64 and
                all(c in "0123456789abcdef" for c in immutable[field]),
                "malformed protected unchanged digest " + field)
    require(type(payload.get("website")) is dict and
            type(payload["website"].get("source_sha")) is str and
            type(payload["website"].get("build_id")) is str,
            "unbound active website runtime")
    protected_key(trust_root / WITNESS_KEY, trust_root,
                  allow_test_root=allow_test_root)
    verify_detached(payload, packet["signature"], trust_root / WITNESS_KEY)
    return payload


def fresh_witness(*, trust_root=TRUST_ROOT, executable=WITNESS,
                  allow_test_root=False) -> dict:
    require(executable.is_absolute() and executable.is_file() and
            not executable.is_symlink(), "independent observer executable unavailable")
    m = executable.stat()
    if not allow_test_root:
        require(m.st_uid == 0, "observer executable is not root provisioned")
    require(not (m.st_mode & (stat.S_IWGRP | stat.S_IWOTH)),
            "observer executable writable by untrusted party")
    p = subprocess.run([str(executable), "--json"], capture_output=True,
                       timeout=40, check=False, env={"PATH": "/usr/bin:/bin"})
    require(p.returncode == 0, "independent Wolo runtime observation failed")
    packet = strict_json_bytes(p.stdout)
    verify_witness_receipt(packet, trust_root=trust_root,
                           allow_test_root=allow_test_root)
    return packet


def same_financial_runtime(before: dict, after: dict) -> None:
    b, a = before["payload"], after["payload"]
    require(b["immutable"] == a["immutable"],
            "Wolo executable/PID/config/signer/writer/P1 state CHANGED")
    require(b["website"]["source_sha"] == a["website"]["source_sha"]
            and b["website"]["build_id"] == a["website"]["build_id"],
            "website runtime changed during isolated staging")


def evidence_bind(packet: dict, signed_prestate: dict, current: dict,
                  *, target: str, trust_root=TRUST_ROOT, now=None,
                  allow_test_root=False) -> None:
    pb = verify_witness_receipt(signed_prestate, trust_root=trust_root,
                                now=now, allow_test_root=allow_test_root)
    pc = verify_witness_receipt(current, trust_root=trust_root,
                               now=now, allow_test_root=allow_test_root)
    p = packet["payload"]
    require(p["wolo_prestate_sha256"] == digest(pb),
            "independent Wolo evidence is not source-signature-bound")
    require(pb["immutable"] == pc["immutable"],
            "Wolo source/consensus/financial/hold changed after review")
    require(pc["website"]["source_sha"] == PRODUCTION_SHA,
            "active website source deviated from certified runtime")
    require(p["candidate_sha"] == target, "website candidate changed")



def verify_signed_noninterference(receipt: dict, *, scope: dict,
                                  packet: dict, trust_root=TRUST_ROOT,
                                  now=None, allow_test_root=False) -> dict:
    """Require independent Source + Finance attestations; never trust paths alone."""
    require(receipt.get("schema") == 2 and receipt.get("kind") ==
            "aoe2war-website-source-finance-boundary-v2", "wrong noninterference proof")
    payload = receipt.get("payload")
    signatures = receipt.get("signatures")
    require(type(payload) is dict and type(signatures) is dict and
            set(signatures) == {"source_reviewer", "finance_reviewer"},
            "independent source and finance approvals required")
    require(payload.get("base_sha") == PRODUCTION_SHA and
            payload.get("candidate_sha") == MAIN_SOURCE_SHA and
            payload.get("scope_sha256") == scope["scope_sha256"] and
            payload.get("changed_paths") == scope["paths"],
            "source/finance review not bound to actual nine-file source diff")
    issued = utc_time(payload.get("reviewed_at"))
    current = now or datetime.now(timezone.utc)
    require(timedelta(0) <= current - issued <= timedelta(minutes=60),
            "stale source/finance noninterference review")
    require(payload.get("legacy_financial_get_side_effects_exist") is True and
            payload.get("passive_health_probes_only") is True and
            payload.get("dependencies_transitively_reviewed") is True and
            payload.get("fast_uri_319_reviewed") is True and
            payload.get("ssr_layout_server_actions_reviewed") is True and
            payload.get("restart_financial_worker_impact_proven") is True and
            payload.get("new_financial_source_paths") == [] and
            payload.get("new_financial_writes") is False and
            payload.get("migration_paths") == [] and
            payload.get("unresolved_financial_effects") == [] and
            payload.get("wolo_p1_unwaived") is True and
            payload.get("funded_activation") is False,
            "source/finance noninterference not affirmatively and completely proven")
    # The detached Source reviewer is FIFTH and independent from the council.
    from aoe2_website_release_v2 import ROLES
    identities = []
    for role in (*ROLES, "source_reviewer", "runtime_witness"):
        key = trust_root / (role + ".pem")
        protected_key(key, trust_root, allow_test_root=allow_test_root)
        identity = subprocess.run(
            ["openssl", "pkey", "-pubin", "-in", str(key),
             "-pubout", "-outform", "DER"],
            capture_output=True, timeout=10, check=False)
        require(identity.returncode == 0 and len(identity.stdout) > 0,
                "unparseable independent source-review key")
        identities.append(hashlib.sha256(identity.stdout).hexdigest())
    require(len(set(identities)) == len(identities),
            "source reviewer impersonates independent role")
    for role in ("source_reviewer", "finance_reviewer"):
        verify_detached(payload, signatures[role], trust_root / (role + ".pem"))
    require(packet["payload"].get("financial_noninterference_sha256") == digest(payload),
            "financial noninterference signed receipt not bound by all four roles")
    require(packet["payload"].get("source_review_sha256") == digest(payload),
            "source review not bound by all four roles")
    return payload


def assert_exact_release_manifest(candidate_repo: Path, packet: dict,
                                  scope: dict) -> None:
    import aoe2_release_ship as ship
    _file, manifest, manifest_sha = ship.load_manifest(MAIN_SOURCE_SHA)
    _gate, gate_sha = ship.gate_integrity(manifest)
    p = packet["payload"]
    require(manifest.get("release_sha") == MAIN_SOURCE_SHA and
            manifest.get("previous_production_sha") == PRODUCTION_SHA and
            manifest.get("changed_files") == scope["paths"] and
            manifest.get("migration_paths") == [] and
            manifest.get("risk_class") == p["risk_class"] and
            manifest_sha == p["manifest_sha256"] and gate_sha == p["gate_sha256"],
            "candidate source/manifest/gate differ from signed scoped release")

def stage_facts(candidate_repo: Path, supplied_path: Path) -> dict:
    # Load actual controller-verified stage evidence, never arbitrary JSON fields.
    import aoe2_release_ship as ship
    require(supplied_path.is_absolute(), "stage path must be absolute")
    local_receipt_dir = (candidate_repo / ".aoe2war-release" / "stage-receipts").resolve()
    resolved = supplied_path.resolve(strict=True)
    require(resolved.parent == local_receipt_dir and not supplied_path.is_symlink(),
            "stage receipt outside canonical operator authority")
    (path, receipt, receipt_sha, _mp, manifest, manifest_sha, _gp, gate_sha) = (
        ship.load_stage_receipt(str(resolved))
    )
    require(receipt.get("status") == "STAGED" and
            receipt.get("release_sha") == MAIN_SOURCE_SHA and
            receipt.get("previous_production_sha") == PRODUCTION_SHA,
            "stage not the exact nine-path main deployment")
    require(manifest.get("migration_paths") == [],
            "unpermitted migration in website-only stage")
    return {"path": str(path), "sha": receipt_sha, "receipt": receipt,
            "manifest_sha256": manifest_sha, "gate_sha256": gate_sha,
            "artifact_sha256": receipt["artifact_sha256"],
            "build_id": receipt["staged_build_id"]}



def operator_source_provenance(*, root: Path = ROOT) -> dict:
    """Seal executed operator code, not only the public website candidate.

    A separate operator checkout executes release scripts. Its full tracked
    scripts/deploy surface must be an exact clean Git tree. Signers bind the
    commit and actual bytes, not just the two admission Python entrypoints.
    """
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(),
            "untrusted operator controller checkout")
    sha = git(root, "rev-parse", "--verify", "HEAD")
    require(len(sha) == 40 and all(c in "0123456789abcdef" for c in sha),
            "unreviewable operator controller commit")
    require(git(root, "status", "--porcelain", "--untracked-files=all",
                "--ignore-submodules=none") == "",
            "dirty operator controller checkout")
    flags = git(root, "ls-files", "-v", "-z")
    require(flags.endswith("\x00"), "truncated operator Git index flags")
    for entry in flags[:-1].split("\x00"):
        require(len(entry) >= 3 and entry[1:2] == " " and entry[0] == "H",
                "hidden operator Git index source")
    paths_raw = git(root, "ls-files", "-z", "--", "scripts", "deploy")
    require(paths_raw.endswith("\x00"), "empty operator executable inventory")
    paths = paths_raw[:-1].split("\x00")
    require(len(paths) == len(set(paths)) and len(paths) >= 6,
            "incomplete operator source inventory")
    manifest = []
    for name in paths:
        require(name.startswith(("scripts/", "deploy/")) and ".." not in name.split("/"),
                "untrusted operator source path")
        location = root / name
        require(location.is_file() and not location.is_symlink(),
                "linked/missing operator executable source")
        require(all(not part.is_symlink() for part in location.parents
                    if part != root and root in part.parents),
                "symlinked operator source directory")
        manifest.append([name, digest_file(location)])
    required = {
        "scripts/aoe2_website_protected_release_v2.py",
        "scripts/aoe2_website_release_v2.py", "scripts/aoe2_release.py",
        "scripts/aoe2_release_ship.py", "scripts/aoe2_release_stage.py",
        "scripts/aoe2_release_gate.py",
    }
    require(required.issubset(set(paths)), "missing governed operator source")
    return {"commit_sha": sha, "inventory_sha256": digest(manifest)}



def reviewer_packet_binding(packet: dict, *, candidate_repo: Path,
                            scope: dict, trust_root=TRUST_ROOT,
                            now=None, allow_test_root=False) -> None:
    p = packet["payload"]
    require(p.get("protected_dispatch_sha256") == digest_file(Path(__file__)),
            "protected dispatcher implementation SHA not signed")
    operator = operator_source_provenance()
    require(p.get("operator_controller_commit_sha") == operator["commit_sha"] and
            p.get("operator_source_inventory_sha256") ==
            operator["inventory_sha256"],
            "operator release code is not signed exact-source authority")
    require(p.get("candidate_sha") == MAIN_SOURCE_SHA and
            scope["candidate"] == MAIN_SOURCE_SHA, "wrong website release")
    require(p.get("risk_class") in ("PRESENTATION", "INFRASTRUCTURE"),
            "FINANCIAL candidate cannot use nine-path exception")
    assess(packet, candidate=MAIN_SOURCE_SHA, actual_scope=scope,
           trust_root=trust_root, now=now, allow_test_root=allow_test_root)


def _run_guarded_release(candidate_repo: Path, mode: str,
                         *, stage_receipt: str | None = None) -> dict:
    """Call the SAME guarded release libraries within the caller's held lease.

    Launching aoe2_release.py in a child process would independently acquire
    deployment_lock() while its parent still owns that nonreentrant flock.
    Do not transfer or waive the lease: perform the normal stage/activate
    library operation exactly once under this process's existing lease.
    """
    require(mode in ("stage", "activate"), "unsupported protected action")
    import aoe2_release as release
    import aoe2_release_ship as ship
    import aoe2_release_stage as stage

    # The executable modules live in the separately sealed operator branch;
    # their app/manifests/receipts MUST resolve from the exact main candidate.
    for mod in (release, ship, stage):
        require(Path(mod.ROOT).resolve() == candidate_repo.resolve(),
                "release module points at wrong candidate root")
    if mode == "activate":
        require(stage_receipt is not None,
                "activation must cite exact stage receipt")
    data = release.collect()
    require(data.get("local", {}).get("head") == MAIN_SOURCE_SHA and
            data.get("local", {}).get("dirty_count") == 0,
            "mutating release source/dirty preflight failed")

    output = io.StringIO()
    with redirect_stdout(output):
        if mode == "stage":
            rc = stage.stage_release(data, json_output=True)
        else:
            rc = ship.activate_release(
                data, stage_receipt=stage_receipt,
                dry_run=False, json_output=True)
    require(rc == 0, "protected stage/activation failed: no blind retry")
    result = strict_json_bytes(output.getvalue().encode("utf-8"))
    require(result.get("status") ==
            ("STAGED" if mode == "stage" else "CERTIFIED"),
            "protected release returned unverified stage/certification state")
    return result


def verified_operation(*, operation: str, candidate_repo: Path,
                       packet_path: Path | None = None, witness_before: Path | None = None,
                       noninterference_receipt: Path | None = None,
                       stage_receipt: Path | None = None,
                       attempt_id: str | None = None,
                       previous_stage_sha: str | None = None,
                       trust_root=TRUST_ROOT, state_root=STATE_ROOT,
                       now=None, allow_test_root=False,
                       observer=fresh_witness, dispatch=_run_guarded_release) -> dict:
    """All challenge, stage and activation transitions hold ONE real release lease."""
    require(operation in ("issue-stage", "stage", "issue-activation", "activate"),
            "unsupported website-only operation")
    require(candidate_repo.is_absolute() and candidate_repo.is_dir() and
            not candidate_repo.is_symlink(), "candidate checkout not canonical")
    candidate_repo = candidate_repo.resolve()
    # Validate release scope before and INSIDE the protected lease.
    source_scope(candidate_repo, MAIN_SOURCE_SHA)
    # Lease implementation is the SAME existing protected global release lease,
    # with its local-deploy lock in the source-specific operator plane.
    os.environ["AOE2WAR_WEBSITE_CANDIDATE_ROOT"] = str(candidate_repo)
    import aoe2_release as release
    try:
        with release.deployment_lock():
            scope = source_scope(candidate_repo, MAIN_SOURCE_SHA)
            operator_source_provenance()
            current = observer(trust_root=trust_root,
                               allow_test_root=allow_test_root)
            verify_witness_receipt(current, trust_root=trust_root,
                                   now=now, allow_test_root=allow_test_root)
            require(current["payload"]["website"]["source_sha"] == PRODUCTION_SHA,
                    "production source changed before release")
            if operation == "issue-stage":
                return issue_challenge(state_root=state_root, candidate=MAIN_SOURCE_SHA,
                                       phase="PRE_STAGE", now=now,
                                       allow_test_root=allow_test_root)
            if operation == "issue-activation":
                require(stage_receipt is not None, "stage receipt required")
                facts = stage_facts(candidate_repo, stage_receipt)
                require(type(previous_stage_sha) is str and len(previous_stage_sha) == 64
                        and all(c in "0123456789abcdef" for c in previous_stage_sha),
                        "previous consumed signed stage approval digest required")
                result = issue_challenge(state_root=state_root,
                    candidate=MAIN_SOURCE_SHA, phase="PRE_ACTIVATE", now=now,
                    attempt_id=attempt_id, previous_stage_sha=previous_stage_sha,
                    allow_test_root=allow_test_root)
                return {**result, "artifact_sha256": facts["artifact_sha256"],
                        "stage_receipt_sha256": facts["sha"],
                        "build_id": facts["build_id"]}
            require(packet_path is not None and witness_before is not None
                    and noninterference_receipt is not None,
                    "signed four-role approval, source+finance and original Wolo witness required")
            packet = read_json(packet_path)
            prestate = read_json(witness_before)
            reviewer_packet_binding(packet, candidate_repo=candidate_repo,
                                    scope=scope, trust_root=trust_root, now=now,
                                    allow_test_root=allow_test_root)
            verify_signed_noninterference(read_json(noninterference_receipt),
                scope=scope, packet=packet, trust_root=trust_root, now=now,
                allow_test_root=allow_test_root)
            assert_exact_release_manifest(candidate_repo, packet, scope)
            expected = "PRE_STAGE" if operation == "stage" else "PRE_ACTIVATE"
            require(packet["payload"].get("phase") == expected, "wrong authorization phase")
            evidence_bind(packet, prestate, current, target=MAIN_SOURCE_SHA,
                          trust_root=trust_root, now=now, allow_test_root=allow_test_root)
            if operation == "activate":
                require(packet["payload"].get("wolo_poststage_sha256") ==
                        digest(prestate["payload"]),
                        "activation Wolo post-stage witness SHA not signed")
                require(stage_receipt is not None, "missing actual stage")
                facts = stage_facts(candidate_repo, stage_receipt)
                p = packet["payload"]
                require(facts["sha"] == p["stage_receipt_sha256"] and
                        facts["artifact_sha256"] == p["artifact_sha256"] and
                        facts["build_id"] == p["build_id"] and
                        facts["manifest_sha256"] == p["manifest_sha256"] and
                        facts["gate_sha256"] == p["gate_sha256"],
                        "stage artifact/BUILD_ID/manifest/gate substituted")
            # Source cannot drift between signed validation and lease-held dispatch.
            reviewer_packet_binding(packet, candidate_repo=candidate_repo,
                                    scope=scope, trust_root=trust_root, now=now,
                                    allow_test_root=allow_test_root)
            signed = consume_signed_review(packet=packet, candidate=MAIN_SOURCE_SHA,
                actual_scope=scope, state_root=state_root, trust_root=trust_root,
                now=now, allow_test_root=allow_test_root)
            # Strictly one dispatch under the same global lease; never raw systemctl.
            result = dispatch(candidate_repo, operation, stage_receipt=(
                str(stage_receipt) if operation == "activate" else None))
            after = observer(trust_root=trust_root,
                             allow_test_root=allow_test_root)
            verify_witness_receipt(after, trust_root=trust_root, now=now,
                                   allow_test_root=allow_test_root)
            require(current["payload"]["immutable"] == after["payload"]["immutable"],
                    "Wolo/finance runtime drift after protected operation")
            if operation == "stage":
                same_financial_runtime(current, after)
                require(result.get("status") == "STAGED" and
                        result.get("release_sha") == MAIN_SOURCE_SHA and
                        result.get("wolo_mutated") is False,
                        "stage returned nonconforming proof")
            else:
                require(result.get("status") == "CERTIFIED" and
                        result.get("release_sha") == MAIN_SOURCE_SHA and
                        result.get("wolo_mutated") is False and
                        after["payload"]["website"]["source_sha"] == MAIN_SOURCE_SHA,
                        "activation not independently runtime certified")
            return {"status": "SOURCE_BOUND_WEBSITE_ONLY_CERTIFIED" if
                    operation == "activate" else "SOURCE_BOUND_WEBSITE_ONLY_STAGED",
                    "candidate_sha": MAIN_SOURCE_SHA, "phase": expected,
                    "authorization_sha256": signed["signed_packet_sha256"],
                    "original_wolo_p1": after["payload"]["immutable"]["source_p1_original"],
                    "financial_release_authorized": False,
                    "custody_authorized": False, "claim_889_resolved": False,
                    "website_release_authorized": operation == "activate",
                    "protected_release_result": result}
    except (Hold, OSError, subprocess.SubprocessError) as exc:
        raise Hold("PROTECTED WEBSITE HOLD: " + str(exc)) from exc


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("operation", choices=["issue-stage", "stage",
                                          "issue-activation", "activate"])
    ap.add_argument("--candidate-repo", type=Path, required=True)
    ap.add_argument("--packet", type=Path)
    ap.add_argument("--signed-wolo-prestate", type=Path)
    ap.add_argument("--signed-noninterference", type=Path)
    ap.add_argument("--stage-receipt", type=Path)
    ap.add_argument("--attempt-id")
    ap.add_argument("--previous-stage-approval-sha256")
    args = ap.parse_args()
    try:
        result = verified_operation(
            operation=args.operation, candidate_repo=args.candidate_repo,
            packet_path=args.packet, witness_before=args.signed_wolo_prestate,
            noninterference_receipt=args.signed_noninterference,
            stage_receipt=args.stage_receipt,
            attempt_id=args.attempt_id,
            previous_stage_sha=args.previous_stage_approval_sha256)
    except (Hold, OSError, ValueError, subprocess.SubprocessError) as exc:
        result = {"status": "HOLD", "reason": str(exc),
                  "website_release_authorized": False,
                  "financial_release_authorized": False,
                  "custody_authorized": False,
                  "original_wolo_source_p1_preserved": True,
                  "production_mutation_authorized": False}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
