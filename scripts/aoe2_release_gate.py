#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_DIR = ROOT / ".aoe2war-release"
GATE_DIR = STATE_DIR / "gates"
MANIFEST_DIR = STATE_DIR / "manifests"

RISK_ORDER = {
    "NO_CHANGE": 0,
    "DOCUMENTATION": 10,
    "PRESENTATION": 20,
    "APPLICATION": 30,
    "INFRASTRUCTURE": 40,
    "WATCHER": 50,
    "REPLAY_TRUTH": 60,
    "FINANCIAL": 70,
    "DATABASE": 80,
}


class ReleaseGateError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run(
    args: list[str],
    *,
    timeout: int = 600,
    capture: bool = True,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        timeout=timeout,
        check=False,
    )


def run_bytes(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def git_text(*args: str) -> str:
    p = run(["git", *args], timeout=120)
    if p.returncode != 0:
        raise ReleaseGateError(
            f"git {' '.join(args)} failed: {(p.stderr or '').strip()}"
        )
    return (p.stdout or "").strip()


def git_lines(*args: str) -> list[str]:
    out = git_text(*args)
    return [line for line in out.splitlines() if line.strip()]


def is_ancestor(older: str, newer: str) -> bool:
    p = run(["git", "merge-base", "--is-ancestor", older, newer], timeout=60)
    return p.returncode == 0


def release_scope(data: dict) -> dict:
    local = data["local"]
    github = data["github"]
    prod = data["production"]
    head = local.get("head")
    if not head:
        raise ReleaseGateError("Local HEAD is unavailable.")

    if local.get("dirty_count") not in (0, None):
        return {
            "mode": "worktree",
            "base_sha": head,
            "target_sha": "WORKTREE",
            "changed_files": sorted(set(local.get("dirty_paths") or [])),
        }

    github_sha = github.get("main_sha")
    prod_sha = prod.get("source_sha") if prod.get("reachable") else None

    if prod_sha and prod_sha != head:
        if not is_ancestor(prod_sha, head):
            raise ReleaseGateError(
                "Production source is not an ancestor of local HEAD; stop and reconcile."
            )
        return {
            "mode": "committed",
            "base_sha": prod_sha,
            "target_sha": head,
            "changed_files": sorted(
                set(git_lines("diff", "--name-only", f"{prod_sha}..{head}"))
            ),
        }

    if github_sha and github_sha != head:
        if not is_ancestor(github_sha, head):
            raise ReleaseGateError(
                "Local HEAD is not a descendant of GitHub main; stop and reconcile."
            )
        return {
            "mode": "committed",
            "base_sha": github_sha,
            "target_sha": head,
            "changed_files": sorted(
                set(git_lines("diff", "--name-only", f"{github_sha}..{head}"))
            ),
        }

    return {
        "mode": "clean",
        "base_sha": head,
        "target_sha": head,
        "changed_files": [],
    }


def scope_digest(scope: dict) -> str:
    h = hashlib.sha256()
    h.update(scope["mode"].encode())
    h.update(b"\0")
    h.update(scope["base_sha"].encode())
    h.update(b"\0")
    h.update(scope["target_sha"].encode())
    h.update(b"\0")

    if scope["mode"] == "worktree":
        p = run_bytes(["git", "diff", "--binary", "HEAD"])
        if p.returncode != 0:
            raise ReleaseGateError("Unable to hash worktree diff.")
        h.update(p.stdout)

        p = run_bytes(["git", "ls-files", "--others", "--exclude-standard", "-z"])
        if p.returncode != 0:
            raise ReleaseGateError("Unable to enumerate untracked files.")
        for raw in sorted(x for x in p.stdout.split(b"\0") if x):
            h.update(raw)
            h.update(b"\0")
            path = ROOT / raw.decode("utf-8", "surrogateescape")
            if path.is_file():
                h.update(path.read_bytes())
            else:
                h.update(b"<non-file>")
            h.update(b"\0")
    elif scope["mode"] == "committed":
        p = run_bytes(
            ["git", "diff", "--binary", f"{scope['base_sha']}..{scope['target_sha']}"]
        )
        if p.returncode != 0:
            raise ReleaseGateError("Unable to hash committed release diff.")
        h.update(p.stdout)

    return h.hexdigest()


def path_risk(path: str) -> str:
    p = path.lower()

    if p.startswith("prisma/") or p == "prisma.config.ts":
        return "DATABASE"

    financial_tokens = (
        "settlement",
        "financial-authority",
        "market-integrity",
        "escrow",
        "payout",
        "/bets",
        "lib/bets",
        "staking",
        "wolo",
    )
    if any(token in p for token in financial_tokens):
        return "FINANCIAL"

    replay_tokens = (
        "replay",
        "unresolvedwatcherresult",
        "parser",
        "game_stats",
        "game-stats",
    )
    if any(token in p for token in replay_tokens):
        return "REPLAY_TRUTH"

    if "watcher" in p:
        return "WATCHER"

    infra_prefixes = (".github/", "deploy/")
    infra_exact = {
        "dockerfile",
        "package.json",
        "yarn.lock",
        "server.js",
        "next.config.js",
        "next.config.ts",
        "scripts/aoe2_release.py",
        "scripts/aoe2_release_gate.py",
        "scripts/aoe2_release_ship.py",
        "scripts/aoe2_release_stage.py",
        "scripts/aoe2_release_auto.py",
        "bin/aoe2-release",
        "bin/aoe2war-release",
        "bin/aoe2war",
        "deploy.md",
    }
    if p.startswith(infra_prefixes) or p in infra_exact:
        return "INFRASTRUCTURE"

    if p.startswith("docs/") or p.endswith(".md"):
        return "DOCUMENTATION"

    presentation_exact = {"app/appshell.tsx"}
    presentation_suffixes = (".css", ".scss")
    if p in presentation_exact or p.endswith(presentation_suffixes):
        return "PRESENTATION"

    return "APPLICATION"


def classify_risk(paths: list[str]) -> str:
    if not paths:
        return "NO_CHANGE"
    risks = [path_risk(path) for path in paths]
    return max(risks, key=lambda risk: RISK_ORDER[risk])


def existing_lintable(paths: list[str]) -> list[str]:
    suffixes = {".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"}
    result = []
    for rel in paths:
        path = ROOT / rel
        if path.is_file() and path.suffix.lower() in suffixes:
            result.append(rel)
    return sorted(set(result))


def focused_npm_tests(paths: list[str]) -> list[str]:
    lower = "\n".join(paths).lower()
    scripts: list[str] = []

    def add(name: str) -> None:
        if name not in scripts:
            scripts.append(name)

    if any(x in lower for x in ("replay", "parser", "unresolvedwatcherresult")):
        add("test:replay-truth")
    if any(x in lower for x in ("staking", "wolo", "settlement")):
        add("test:mainnet-staking")
    if "challenge" in lower:
        add("test:challenge")
    if "kingdom" in lower or "round-chamber" in lower:
        add("test:kingdom-civic")
        add("test:kingdom-expansion")
    if "bount" in lower:
        add("test:bounties")
    if "clan" in lower:
        add("test:clans-v2")
    if "zodiac" in lower:
        add("test:zodiac")
    if any(x in lower for x in ("i18n", "locale", "translator")):
        add("test:i18n")
    if "war-engine" in lower:
        add("test:war-engine")

    return scripts


def command_plan(scope: dict, risk: str) -> list[tuple[str, list[str], int]]:
    paths = scope["changed_files"]
    commands: list[tuple[str, list[str], int]] = []

    if scope["mode"] == "worktree":
        commands.append(("diff-check", ["git", "diff", "--check"], 60))
        commands.append(
            ("cached-diff-check", ["git", "diff", "--cached", "--check"], 60)
        )
    elif scope["mode"] == "committed":
        commands.append(
            (
                "release-diff-check",
                ["git", "diff", "--check", f"{scope['base_sha']}..{scope['target_sha']}"],
                60,
            )
        )

    commands.append(
        ("documentation-control-plane", ["python3", "scripts/docs_v2_check.py"], 120)
    )

    release_tooling = any(
        path
        in {
            "bin/aoe2-release",
            "bin/aoe2war-release",
            "bin/aoe2war",
            "scripts/aoe2_release.py",
            "scripts/aoe2_release_gate.py",
            "scripts/aoe2_release_ship.py",
            "scripts/aoe2_release_stage.py",
            "scripts/aoe2_release_auto.py",
            "tests/test_release_engineering.py",
            "tests/test_release_gate.py",
            "tests/test_release_ship.py",
            "tests/test_release_stage.py",
            "tests/test_release_auto.py",
            "tests/test_aoe2_cli.py",
        }
        for path in paths
    )
    if release_tooling:
        commands.append(
            (
                "release-engineering-tests",
                [
                    "python3",
                    "-m",
                    "unittest",
                    "tests/test_release_engineering.py",
                    "tests/test_release_gate.py",
                    "tests/test_release_ship.py",
                    "tests/test_release_stage.py",
                    "tests/test_release_auto.py",
                    "tests/test_aoe2_cli.py",
                ],
                120,
            )
        )
        commands.append(
            (
                "release-python-compile",
                [
                    "python3",
                    "-m",
                    "py_compile",
                    "scripts/aoe2_release.py",
                    "scripts/aoe2_release_gate.py",
                    "scripts/aoe2_release_ship.py",
                    "scripts/aoe2_release_stage.py",
                    "scripts/aoe2_release_auto.py",
                ],
                120,
            )
        )

    lintable = existing_lintable(paths)
    if lintable:
        commands.append(("typescript", ["npx", "tsc", "--noEmit"], 600))
        commands.append(("eslint-changed", ["npx", "eslint", *lintable], 600))

    if risk == "DATABASE":
        commands.append(("prisma-validate", ["npx", "prisma", "validate"], 180))

    for script in focused_npm_tests(paths):
        commands.append((script, ["npm", "run", script], 900))

    return commands


def execute_plan(
    plan: list[tuple[str, list[str], int]], *, quiet: bool
) -> tuple[bool, list[dict]]:
    results: list[dict] = []
    ok = True

    for label, args, timeout in plan:
        if not quiet:
            print()
            print(f"== {label.upper()} ==")
            print("$ " + shlex.join(args))

        try:
            p = run(args, timeout=timeout)
            rc = p.returncode
            out = p.stdout or ""
            err = p.stderr or ""
        except subprocess.TimeoutExpired as exc:
            rc = 124
            out = exc.stdout or ""
            err = exc.stderr or ""
            if isinstance(out, bytes):
                out = out.decode(errors="replace")
            if isinstance(err, bytes):
                err = err.decode(errors="replace")

        if not quiet:
            if out.strip():
                print(out.rstrip())
            if err.strip():
                print(err.rstrip())

        results.append(
            {
                "label": label,
                "command": shlex.join(args),
                "returncode": rc,
                "stdout_tail": out[-4000:],
                "stderr_tail": err[-4000:],
            }
        )
        if rc != 0:
            ok = False
            break

    return ok, results


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def gate_release(data: dict, *, json_output: bool = False) -> int:
    try:
        scope = release_scope(data)
        digest = scope_digest(scope)
        risk = classify_risk(scope["changed_files"])
        plan = command_plan(scope, risk)
    except ReleaseGateError as exc:
        payload = {"schema": 1, "kind": "gate-receipt", "status": "ERROR", "error": str(exc)}
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print(f"STOP: {exc}")
        return 2

    if not json_output:
        print("⚔️  AOE2WAR RELEASE GATE")
        print(f"Mode:           {scope['mode']}")
        print(f"Base:           {scope['base_sha']}")
        print(f"Target:         {scope['target_sha']}")
        print(f"Risk:           {risk}")
        print(f"Changed files:  {len(scope['changed_files'])}")
        for path in scope["changed_files"]:
            print(f"  - {path}")
        print(f"Scope SHA256:   {digest}")

    ok, results = execute_plan(plan, quiet=json_output)
    receipt = {
        "schema": 1,
        "kind": "gate-receipt",
        "generated_at": utc_now(),
        "status": "PASS" if ok else "FAIL",
        "mode": scope["mode"],
        "base_sha": scope["base_sha"],
        "target_sha": scope["target_sha"],
        "scope_sha256": digest,
        "risk_class": risk,
        "changed_files": scope["changed_files"],
        "commands": results,
    }
    stem = (
        scope["target_sha"][:12]
        if scope["target_sha"] != "WORKTREE"
        else f"worktree-{scope['base_sha'][:12]}"
    )
    path = GATE_DIR / f"{stem}-{digest[:12]}.json"
    write_json(path, receipt)
    receipt["receipt_path"] = str(path.relative_to(ROOT))
    receipt["receipt_sha256"] = sha256_file(path)

    if json_output:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print()
        print(f"Gate:           {receipt['status']}")
        print(f"Receipt:        {receipt['receipt_path']}")
        print(f"Receipt SHA256: {receipt['receipt_sha256']}")
        if ok:
            print("PASS: RELEASE GATE")
        else:
            print("FAIL: RELEASE GATE")

    return 0 if ok else 1


def matching_gate(scope: dict, digest: str) -> tuple[Path, dict] | None:
    if not GATE_DIR.exists():
        return None
    matches: list[tuple[float, Path, dict]] = []
    for path in GATE_DIR.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (
            payload.get("status") == "PASS"
            and payload.get("base_sha") == scope["base_sha"]
            and payload.get("target_sha") == scope["target_sha"]
            and payload.get("scope_sha256") == digest
        ):
            matches.append((path.stat().st_mtime, path, payload))
    if not matches:
        return None
    _, path, payload = max(matches, key=lambda item: item[0])
    return path, payload


def manifest_release(data: dict, *, json_output: bool = False) -> int:
    local = data["local"]
    github = data["github"]
    docs = data["documentation"]
    prod = data["production"]

    errors: list[str] = []
    if local.get("dirty_count") != 0:
        errors.append("local worktree is not clean")
    if not local.get("head") or local.get("head") != github.get("main_sha"):
        errors.append("Mac HEAD does not equal GitHub main")
    if docs.get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline is not a valid ancestor")
    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is not clean")
    if not prod.get("source_sha"):
        errors.append("production source SHA is unavailable")
    elif prod.get("source_sha") == local.get("head"):
        errors.append("production source already equals this release; manifest must be sealed before source advance")

    if errors:
        payload = {
            "schema": 1,
            "kind": "release-manifest-error",
            "status": "ERROR",
            "errors": errors,
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: RELEASE MANIFEST PRECONDITIONS FAILED")
            for error in errors:
                print(f"  - {error}")
        return 2

    try:
        scope = release_scope(data)
        if scope["mode"] != "committed":
            raise ReleaseGateError("Release manifest requires a committed release scope.")
        digest = scope_digest(scope)
    except ReleaseGateError as exc:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    gate = matching_gate(scope, digest)
    if not gate:
        message = "No matching PASS gate receipt. Run: aoe2-release gate"
        if json_output:
            print(json.dumps({"status": "ERROR", "error": message}, indent=2))
        else:
            print(f"STOP: {message}")
        return 2

    gate_path, gate_payload = gate
    release_sha = local["head"]
    implementation_sha = docs.get("implementation_baseline")
    risk = gate_payload["risk_class"]
    migrations = [
        path for path in scope["changed_files"]
        if path.startswith("prisma/migrations/")
    ]

    manifest = {
        "schema": 1,
        "kind": "aoe2war-release-manifest",
        "generated_at": utc_now(),
        "release_sha": release_sha,
        "implementation_sha": implementation_sha,
        "documentation_baseline": implementation_sha,
        "previous_production_sha": prod["source_sha"],
        "scope_sha256": digest,
        "risk_class": risk,
        "changed_files": scope["changed_files"],
        "migration_paths": migrations,
        "gate": {
            "status": "PASS",
            "receipt_path": str(gate_path.relative_to(ROOT)),
            "receipt_sha256": sha256_file(gate_path),
        },
        "policy": {
            "exact_sealed_commit": True,
            "build_beside_live": True,
            "preserve_rollback": True,
            "prove_internal_and_public": True,
            "wolo_mutation_allowed": False,
        },
    }

    manifest_path = MANIFEST_DIR / f"{release_sha}.json"
    write_json(manifest_path, manifest)
    digest_path = manifest_path.with_suffix(".json.sha256")
    manifest_sha = sha256_file(manifest_path)
    digest_path.write_text(
        f"{manifest_sha}  {manifest_path.name}\n",
        encoding="utf-8",
    )

    payload = {
        **manifest,
        "manifest_path": str(manifest_path.relative_to(ROOT)),
        "manifest_sha256": manifest_sha,
        "manifest_sha256_path": str(digest_path.relative_to(ROOT)),
    }

    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print("⚔️  AOE2WAR RELEASE MANIFEST")
        print(f"Release:        {release_sha}")
        print(f"Implementation: {implementation_sha}")
        print(f"Previous prod:  {prod['source_sha']}")
        print(f"Risk:           {risk}")
        print(f"Changed files:  {len(scope['changed_files'])}")
        print(f"Migrations:     {len(migrations)}")
        print(f"Gate receipt:   {gate_path.relative_to(ROOT)}")
        print(f"Manifest:       {manifest_path.relative_to(ROOT)}")
        print(f"Manifest SHA:   {manifest_sha}")
        print("PASS: RELEASE MANIFEST SEALED")

    return 0
