#!/usr/bin/env python3
from __future__ import annotations

import json
import shlex
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from aoe2_release_gate import ROOT, gate_release, manifest_release
from aoe2_release_ship import PUBLIC, PROD_HOST, activate_release
from aoe2_release_stage import STAGE_RECEIPT_DIR, stage_release


class AutoShipError(RuntimeError):
    pass


CONTROL_PLANE_DOCS = {
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}


def run(args: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def git(*args: str) -> str:
    p = run(["git", *args], timeout=120)
    if p.returncode != 0:
        raise AutoShipError(
            f"git {' '.join(args)} failed: {(p.stderr or '').strip()}"
        )
    return (p.stdout or "").rstrip("\n")


def is_ancestor(older: str, newer: str) -> bool:
    return (
        run(
            ["git", "merge-base", "--is-ancestor", older, newer],
            timeout=60,
        ).returncode
        == 0
    )


def changed_paths(base: str, head: str) -> list[str]:
    if base == head:
        return []
    return [
        line
        for line in git("diff", "--name-only", f"{base}..{head}").splitlines()
        if line.strip()
    ]


def documentation_only(paths: list[str]) -> bool:
    return bool(paths) and all(
        path.startswith("docs/")
        or path.endswith(".md")
        or path.endswith(".mdx")
        for path in paths
    )


def porcelain_paths(text: str) -> set[str]:
    result: set[str] = set()
    for line in text.splitlines():
        value = line[3:] if len(line) > 3 else line
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        if value:
            result.add(value)
    return result


def preflight_errors(data: dict) -> list[str]:
    local = data["local"]
    prod = data["production"]
    errors: list[str] = []

    if local.get("branch") != "main":
        errors.append("local branch must be main")
    if local.get("dirty_count") != 0:
        errors.append("local worktree must be clean; review and commit edits first")
    if not local.get("head"):
        errors.append("local HEAD is unavailable")
    if data["documentation"].get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline is not a valid ancestor")
    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is not clean")
    if prod.get("service") != "active":
        errors.append("AoE2WAR production service is not active")
    if not prod.get("version_parity"):
        errors.append("internal/public production version parity is not healthy")
    if (prod.get("wolo_8092_count") or 0) < 1:
        errors.append("protected WOLO listener 8092 is missing")
    if (prod.get("wolo_8093_count") or 0) < 1:
        errors.append("protected WOLO listener 8093 is missing")
    if prod.get("staged_build_id"):
        errors.append("a staged candidate already exists; resolve it before plain ship")
    if local.get("head") and prod.get("source_sha") == local.get("head"):
        errors.append("production already serves local HEAD; there is nothing new to ship")

    return errors


def ensure_documentation_baseline(data: dict) -> str:
    head = git("rev-parse", "HEAD")
    baseline = data["documentation"].get("implementation_baseline")
    if not baseline:
        raise AutoShipError("Documentation Baseline is unavailable.")
    if not is_ancestor(baseline, head):
        raise AutoShipError(
            "Documentation Baseline is not an ancestor of local HEAD."
        )

    since_baseline = changed_paths(baseline, head)
    if not since_baseline or documentation_only(since_baseline):
        return head

    p = run(
        [
            "python3",
            "scripts/docs_v2_check.py",
            "--write",
            "--refresh-baseline",
        ],
        timeout=180,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "documentation baseline refresh failed:\n"
            + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        )

    dirty = porcelain_paths(
        git("status", "--porcelain", "--untracked-files=all")
    )
    unexpected = sorted(dirty - CONTROL_PLANE_DOCS)
    if unexpected:
        raise AutoShipError(
            "documentation refresh changed unexpected paths: "
            + ", ".join(unexpected)
        )

    if dirty:
        p = run(
            [
                "git",
                "add",
                "docs/DOCUMENTATION_CONTROL_PLANE.md",
                "docs/document-registry.json",
            ]
        )
        if p.returncode != 0:
            raise AutoShipError("unable to stage documentation baseline refresh")

        p = run(
            [
                "git",
                "commit",
                "-m",
                f"Document release implementation {head[:12]}",
            ],
            timeout=120,
        )
        if p.returncode != 0:
            raise AutoShipError(
                "documentation baseline commit failed:\n"
                + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
            )

    final_head = git("rev-parse", "HEAD")
    if git("status", "--porcelain", "--untracked-files=all"):
        raise AutoShipError(
            "worktree is not clean after documentation baseline refresh"
        )
    return final_head


def publish_exact(head: str) -> None:
    parts = git("ls-remote", "origin", "refs/heads/main").split()
    remote_sha = parts[0] if parts else ""

    if remote_sha == head:
        return

    if not remote_sha:
        raise AutoShipError("GitHub main could not be resolved")
    if not is_ancestor(remote_sha, head):
        raise AutoShipError(
            "GitHub main is not an ancestor of local HEAD; "
            "refusing non-fast-forward publish"
        )

    p = run(
        ["git", "push", "origin", f"{head}:refs/heads/main"],
        timeout=180,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "git push failed:\n"
            + ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
        )

    parts = git("ls-remote", "origin", "refs/heads/main").split()
    remote_after = parts[0] if parts else ""
    if remote_after != head:
        raise AutoShipError(
            "GitHub main did not land on the exact sealed release HEAD"
        )


def latest_stage_receipt(release_sha: str) -> Path:
    candidates: list[tuple[float, Path]] = []
    for path in STAGE_RECEIPT_DIR.glob(f"{release_sha}-*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (
            payload.get("status") == "STAGED"
            and payload.get("release_sha") == release_sha
        ):
            candidates.append((path.stat().st_mtime, path))

    if not candidates:
        raise AutoShipError(
            "stage succeeded but no matching local STAGED receipt exists"
        )
    return max(candidates, key=lambda item: item[0])[1]


def route_proof() -> None:
    for path in ("/", "/api/lobby", "/api/bets", "/api/deployment-version"):
        with urllib.request.urlopen(
            PUBLIC.rstrip("/") + path,
            timeout=12,
        ) as response:
            if response.status != 200:
                raise AutoShipError(
                    f"public route failed: {path} -> {response.status}"
                )

    remote = (
        "set -euo pipefail; "
        "for p in / /api/lobby /api/bets /api/deployment-version; do "
        'curl -fsS --max-time 12 -o /dev/null "http://127.0.0.1:3030$p"; '
        "done"
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(remote)}",
        ],
        timeout=90,
    )
    if p.returncode != 0:
        raise AutoShipError(
            "independent internal route proof failed: "
            + ((p.stderr or "") or (p.stdout or "")).strip()
        )


def final_errors(data: dict, release_sha: str) -> list[str]:
    prod = data["production"]
    cert = data.get("certification", {})
    errors: list[str] = []

    if prod.get("source_sha") != release_sha:
        errors.append("production source does not equal shipped release")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is dirty")
    if prod.get("service") != "active":
        errors.append("AoE2WAR service is not active")
    if prod.get("staged_build_id"):
        errors.append("staged build still exists after activation")
    if not prod.get("version_parity"):
        errors.append("internal/public build-version parity failed")
    if (prod.get("wolo_8092_count") or 0) < 1:
        errors.append("WOLO 8092 listener missing after ship")
    if (prod.get("wolo_8093_count") or 0) < 1:
        errors.append("WOLO 8093 listener missing after ship")
    if cert.get("status") != "CERTIFIED":
        errors.append("active runtime does not have matching certified provenance")
    if cert.get("release_sha") != release_sha:
        errors.append("certification receipt does not bind shipped release")

    return errors


def ship_all(
    *,
    collect: Callable[[], dict],
    initial: dict,
    json_output: bool = False,
) -> int:
    if json_output:
        print(
            json.dumps(
                {
                    "status": "ERROR",
                    "error": (
                        "plain one-command ship currently uses operator text output; "
                        "use phase-specific --json commands for machine automation"
                    ),
                },
                indent=2,
            )
        )
        return 2

    errors = preflight_errors(initial)
    if errors:
        print("STOP: ONE-COMMAND SHIP PREFLIGHT BLOCKED")
        for error in errors:
            print(f"  - {error}")
        return 2

    print("⚔️  AOE2WAR ONE-COMMAND SHIP")
    print("Mode:           fail-closed automatic transmission")
    print("Commit policy:  user code must already be committed")
    print("Docs policy:    generated baseline may be committed automatically")
    print("WOLO:           observe only")
    print()

    try:
        print("== DOCUMENTATION BASELINE ==")
        release_head = ensure_documentation_baseline(initial)
        print(f"Release HEAD:   {release_head}")

        data = collect()

        print()
        print("== RELEASE GATE ==")
        if gate_release(data, json_output=False) != 0:
            return 1

        print()
        print("== GITHUB EXACT PUBLISH ==")
        publish_exact(release_head)
        print(f"GitHub main:    {release_head}")

        data = collect()

        print()
        print("== RELEASE MANIFEST ==")
        if manifest_release(data, json_output=False) != 0:
            return 1

        print()
        print("== STAGE BESIDE LIVE ==")
        if stage_release(data, json_output=False) != 0:
            return 1

        stage_receipt = latest_stage_receipt(release_head)
        print(f"Stage receipt:  {stage_receipt.relative_to(ROOT)}")

        staged_data = collect()

        print()
        print("== ACTIVATION PREFLIGHT ==")
        if (
            activate_release(
                staged_data,
                stage_receipt=str(stage_receipt),
                dry_run=True,
                json_output=False,
            )
            != 0
        ):
            return 1

        print()
        print("== ACTIVATE + CERTIFY ==")
        if (
            activate_release(
                staged_data,
                stage_receipt=str(stage_receipt),
                dry_run=False,
                json_output=False,
            )
            != 0
        ):
            return 1

        print()
        print("== INDEPENDENT FINAL PROOF ==")
        final = collect()
        errors = final_errors(final, release_head)
        if errors:
            print("STOP: FINAL CERTIFICATION FAILED")
            for error in errors:
                print(f"  - {error}")
            return 2

        route_proof()

        cert = final["certification"]
        prod = final["production"]
        print(f"Source:         {prod['source_sha']}")
        print(f"Active build:   {prod['active_build_id']}")
        print(f"Build version:  {prod['internal_build_version']}")
        print(f"Provenance:     {cert['status']}")
        print(f"Receipt:        {cert['receipt_path']}")
        print(
            "WOLO:           "
            f"8092={prod['wolo_8092_count']}  "
            f"8093={prod['wolo_8093_count']}  UNTOUCHED"
        )
        print()
        print("PASS: RELEASE SHIPPED + CERTIFIED — WOLO UNTOUCHED")
        return 0

    except (
        AutoShipError,
        OSError,
        subprocess.SubprocessError,
        urllib.error.URLError,
    ) as exc:
        print(f"STOP: ONE-COMMAND SHIP FAILED: {exc}")
        return 2
