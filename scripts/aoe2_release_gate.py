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

    financial_prefixes = (
        "lib/bet",
        "lib/desync",
        "app/api/bets/",
        "app/bets/",
        "tests/bet",
        "tests/betting",
        "tests/desync",
    )
    if p.startswith(financial_prefixes):
        return "FINANCIAL"

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
        "scripts/aoe2_release_rollback.py",
        "scripts/aoe2_audit.py",
        "scripts/aoe2_update.py",
        "scripts/aoe2_doctor.py",
        "scripts/aoe2_finish.py",
        "scripts/aoe2_operator_bridge.py",
        "scripts/aoe2_storage_retention.py",
        "scripts/aoe2_storage.py",
        "scripts/aoe2_docs.py",
        "scripts/aoe2_speed.py",
        "scripts/aoe2_rollback_archive_one.sh",
        "tests/test_aoe2_storage.py",
        "tests/test_aoe2_docs.py",
        "tests/test_aoe2_speed.py",
        "config/aoe2war-operations.json",
        "config/test-contract.json",
        ".nvmrc",
        "lib/aoe2Os.ts",
        "app/api/admin/aoe2war-os/route.ts",
        "app/api/internal/aoe2war-os/bridge/route.ts",
        "bin/aoe2-release",
        "bin/aoe2war-release",
        "bin/aoe2war",
        "tests/test_aoe2_storage_retention.py",
        "scripts/run_test_contract.py",
        "scripts/scan_tracked_secrets.py",
        "tests/test_test_contract.py",
        "tests/test_scan_tracked_secrets.py",
        "deploy.md",
        "scripts/aoe2_council.py",
        "scripts/aoe2_workspace.py",
        "scripts/aoe2_host.py",
        "scripts/aoe2_recovery.py",
        "scripts/aoe2_speed_pulse.py",
        "scripts/aoe2_facts.py",
        "scripts/aoe2_dev.py",
        "scripts/aoe2_shadow.py",
        "scripts/dev-shadow.py",
        "scripts/check_dependency_contract.py",
        "tests/test_aoe2_council.py",
        "tests/test_aoe2_workspace.py",
        "tests/test_aoe2_host.py",
        "tests/test_aoe2_recovery.py",
        "tests/test_aoe2_speed_pulse.py",
        "tests/test_aoe2_facts.py",
        "tests/test_aoe2_dev.py",
        "tests/test_aoe2_shadow.py",
        "tests/test_dependency_contract.py",
        "tests/test_aoe2_os_closure_gate.py",
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
    commands.append(
        ("tracked-secret-scan", ["python3", "scripts/scan_tracked_secrets.py"], 120)
    )

    if risk not in {"NO_CHANGE", "DOCUMENTATION"}:
        commands.append(
            (
                "dependency-contract",
                ["python3", "scripts/check_dependency_contract.py"],
                120,
            )
        )
        commands.append(
            ("active-node-test-contract", ["python3", "scripts/run_test_contract.py"], 300)
        )

    release_tooling = any(
        path
        in {
            "bin/aoe2-release",
            "bin/aoe2war-release",
            "bin/aoe2war",
            "scripts/aoe2_audit.py",
            "scripts/aoe2_update.py",
            "scripts/aoe2_doctor.py",
            "scripts/aoe2_finish.py",
            "scripts/aoe2_operator_bridge.py",
            "scripts/aoe2_storage_retention.py",
            "scripts/aoe2_storage.py",
            "scripts/aoe2_docs.py",
            "scripts/aoe2_speed.py",
            "scripts/aoe2_rollback_archive_one.sh",
            "tests/test_aoe2_storage.py",
            "tests/test_aoe2_docs.py",
            "tests/test_aoe2_speed.py",
            "config/aoe2war-operations.json",
            "scripts/aoe2_release.py",
            "scripts/aoe2_release_gate.py",
            "scripts/aoe2_release_ship.py",
            "scripts/aoe2_release_stage.py",
            "scripts/aoe2_release_auto.py",
            "scripts/aoe2_release_rollback.py",
            "tests/test_release_engineering.py",
            "tests/test_release_gate.py",
            "tests/test_release_ship.py",
            "tests/test_release_stage.py",
            "tests/test_release_auto.py",
            "tests/test_release_rollback.py",
            "tests/test_aoe2_cli.py",
            "tests/test_aoe2_storage_retention.py",
            "scripts/run_test_contract.py",
            "scripts/scan_tracked_secrets.py",
            "tests/test_test_contract.py",
            "tests/test_scan_tracked_secrets.py",
            "scripts/aoe2_council.py",
            "scripts/aoe2_workspace.py",
            "scripts/aoe2_host.py",
            "scripts/aoe2_recovery.py",
            "scripts/aoe2_speed_pulse.py",
            "scripts/aoe2_facts.py",
            "scripts/aoe2_dev.py",
            "scripts/aoe2_shadow.py",
            "scripts/dev-shadow.py",
            "scripts/check_dependency_contract.py",
            "tests/test_aoe2_council.py",
            "tests/test_aoe2_workspace.py",
            "tests/test_aoe2_host.py",
            "tests/test_aoe2_recovery.py",
            "tests/test_aoe2_speed_pulse.py",
            "tests/test_aoe2_facts.py",
            "tests/test_aoe2_dev.py",
            "tests/test_aoe2_shadow.py",
            "tests/test_dependency_contract.py",
            "tests/test_aoe2_os_closure_gate.py",
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
                    "tests/test_release_rollback.py",
                    "tests/test_aoe2_cli.py",
                    "tests/test_aoe2_audit.py",
                    "tests/test_aoe2_update.py",
                    "tests/test_aoe2_doctor.py",
                    "tests/test_aoe2_finish.py",
                    "tests/test_aoe2_operator_bridge.py",
                    "tests/test_aoe2_storage_retention.py",
                    "tests/test_aoe2_storage.py",
                    "tests/test_aoe2_docs.py",
                    "tests/test_aoe2_speed.py",
                    "tests/test_aoe2_council.py",
                    "tests/test_aoe2_workspace.py",
                    "tests/test_aoe2_host.py",
                    "tests/test_aoe2_recovery.py",
                    "tests/test_aoe2_speed_pulse.py",
                    "tests/test_aoe2_facts.py",
                    "tests/test_aoe2_dev.py",
                    "tests/test_aoe2_shadow.py",
                    "tests/test_dependency_contract.py",
                    "tests/test_aoe2_os_closure_gate.py",
                    "tests/test_test_contract.py",
                    "tests/test_scan_tracked_secrets.py",
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
                    "scripts/aoe2_release_rollback.py",
                    "scripts/aoe2_audit.py",
                    "scripts/aoe2_update.py",
                    "scripts/aoe2_doctor.py",
                    "scripts/aoe2_finish.py",
                    "scripts/aoe2_operator_bridge.py",
                    "scripts/aoe2_storage_retention.py",
                    "scripts/aoe2_storage.py",
                    "scripts/aoe2_docs.py",
                    "scripts/aoe2_speed.py",
                    "scripts/aoe2_council.py",
                    "scripts/aoe2_workspace.py",
                    "scripts/aoe2_host.py",
                    "scripts/aoe2_recovery.py",
                    "scripts/aoe2_speed_pulse.py",
                    "scripts/aoe2_facts.py",
                    "scripts/aoe2_dev.py",
                    "scripts/aoe2_shadow.py",
                    "scripts/dev-shadow.py",
                    "scripts/check_dependency_contract.py",
                    "scripts/run_test_contract.py",
                    "scripts/scan_tracked_secrets.py",
                ],
                120,
            )
        )

    os_control_tooling = any(
        path in {
            "lib/aoe2Os.ts",
            "app/api/admin/aoe2war-os/route.ts",
            "app/api/internal/aoe2war-os/bridge/route.ts",
            "scripts/aoe2_operator_bridge.py",
            "tests/aoe2war-os-control.test.mts",
            "tests/test_aoe2_operator_bridge.py",
        }
        for path in paths
    )
    if os_control_tooling:
        commands.append(
            (
                "aoe2war-os-control-tests",
                [
                    "node",
                    "--experimental-strip-types",
                    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
                    "--test",
                    "tests/aoe2war-os-control.test.mts",
                ],
                120,
            )
        )

    lintable = existing_lintable(paths)
    prisma_generate_added = False

    if lintable and (ROOT / "prisma" / "schema.prisma").exists():
        commands.append(
            (
                "prisma-generate",
                ["npx", "prisma", "generate"],
                300,
            )
        )
        prisma_generate_added = True

    if lintable:
        commands.append(("typescript", ["npx", "tsc", "--noEmit"], 600))
        commands.append(("eslint-changed", ["npx", "eslint", *lintable], 600))

    if risk == "DATABASE":
        if (
            not prisma_generate_added
            and (ROOT / "prisma" / "schema.prisma").exists()
        ):
            commands.append(
                (
                    "prisma-generate",
                    ["npx", "prisma", "generate"],
                    300,
                )
            )
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


def digest_file_set(
    paths: tuple[str, ...],
) -> str:
    digest = hashlib.sha256()

    for relative in sorted(paths):
        path = ROOT / relative

        digest.update(
            relative.encode(
                "utf-8"
            )
        )
        digest.update(b"\0")

        if path.is_file():
            digest.update(
                path.read_bytes()
            )
        else:
            digest.update(
                b"<missing>"
            )

        digest.update(b"\0")

    return digest.hexdigest()


def command_identity(
    args: list[str],
) -> str:
    result = run(
        args,
        timeout=30,
    )

    if result.returncode != 0:
        raise ReleaseGateError(
            "cannot resolve validation "
            "toolchain identity: "
            + shlex.join(args)
        )

    return (
        result.stdout
        or ""
    ).strip()


def implementation_digest(
    scope: dict,
) -> str:
    digest = hashlib.sha256()

    digest.update(
        scope["base_sha"].encode()
    )
    digest.update(b"\0")

    implementation_paths = [
        path
        for path in scope["changed_files"]
        if path_risk(path)
        != "DOCUMENTATION"
    ]

    for path in implementation_paths:
        digest.update(
            path.encode(
                "utf-8"
            )
        )
        digest.update(b"\0")

    if scope["mode"] == "committed":
        if implementation_paths:
            result = run_bytes(
                [
                    "git",
                    "diff",
                    "--binary",
                    (
                        f"{scope['base_sha']}.."
                        f"{scope['target_sha']}"
                    ),
                    "--",
                    *implementation_paths,
                ],
                timeout=120,
            )

            if result.returncode != 0:
                raise ReleaseGateError(
                    "unable to hash implementation diff"
                )

            digest.update(
                result.stdout
            )

    elif scope["mode"] == "worktree":
        # Worktree receipts are never inherited across
        # commits. Bind them to the entire unpublished scope.
        digest.update(
            scope_digest(
                scope
            ).encode()
        )

    return digest.hexdigest()


def validation_context(
    scope: dict,
) -> dict[str, str]:
    if (
        scope["target_sha"]
        != "WORKTREE"
    ):
        tree_digest = git_text(
            "rev-parse",
            (
                f"{scope['target_sha']}"
                "^{tree}"
            ),
        )
    else:
        tree_digest = scope_digest(
            scope
        )

    dependency_digest = digest_file_set(
        (
            "package.json",
            "yarn.lock",
        )
    )

    test_contract_digest = digest_file_set(
        (
            "config/test-contract.json",
            "scripts/run_test_contract.py",
            "scripts/aoe2-alias-loader.mjs",
            "scripts/check_dependency_contract.py",
        )
    )

    validator_digest = sha256_file(
        Path(__file__).resolve()
    )

    operations = json.loads(
        (
            ROOT
            / "config"
            / "aoe2war-operations.json"
        ).read_text()
    )

    toolchain_payload = {
        "contract": (
            operations.get(
                "toolchain"
            )
            or {}
        ),
        "node": command_identity(
            [
                "node",
                "--version",
            ]
        ),
        "python": command_identity(
            [
                "python3",
                "--version",
            ]
        ),
        "yarn": command_identity(
            [
                "yarn",
                "--version",
            ]
        ),
    }

    toolchain_digest = hashlib.sha256(
        json.dumps(
            toolchain_payload,
            sort_keys=True,
            separators=(
                ",",
                ":",
            ),
        ).encode()
    ).hexdigest()

    return {
        "tree_digest": tree_digest,
        "implementation_digest": (
            implementation_digest(
                scope
            )
        ),
        "dependency_digest": (
            dependency_digest
        ),
        "test_contract_digest": (
            test_contract_digest
        ),
        "toolchain_digest": (
            toolchain_digest
        ),
        "validator_digest": (
            validator_digest
        ),
    }


VALIDATION_CONTEXT_KEYS = (
    "tree_digest",
    "implementation_digest",
    "dependency_digest",
    "test_contract_digest",
    "toolchain_digest",
    "validator_digest",
)


def validation_fields_match(
    payload: dict,
    context: dict[str, str],
    *,
    include_tree: bool,
) -> bool:
    keys = (
        VALIDATION_CONTEXT_KEYS
        if include_tree
        else tuple(
            key
            for key
            in VALIDATION_CONTEXT_KEYS
            if key != "tree_digest"
        )
    )

    return all(
        payload.get(key)
        == context.get(key)
        for key in keys
    )


def reduced_revalidation_plan(
    scope: dict,
) -> list[
    tuple[
        str,
        list[str],
        int,
    ]
]:
    commands = []

    if scope["mode"] == "committed":
        commands.append(
            (
                "release-diff-check",
                [
                    "git",
                    "diff",
                    "--check",
                    (
                        f"{scope['base_sha']}.."
                        f"{scope['target_sha']}"
                    ),
                ],
                60,
            )
        )

    elif scope["mode"] == "worktree":
        commands.append(
            (
                "diff-check",
                [
                    "git",
                    "diff",
                    "--check",
                ],
                60,
            )
        )

    commands.extend(
        [
            (
                "documentation-control-plane",
                [
                    "python3",
                    "scripts/docs_v2_check.py",
                ],
                120,
            ),
            (
                "tracked-secret-scan",
                [
                    "python3",
                    "scripts/scan_tracked_secrets.py",
                ],
                120,
            ),
            (
                "dependency-contract",
                [
                    "python3",
                    "scripts/check_dependency_contract.py",
                ],
                120,
            ),
        ]
    )

    return commands


def reusable_validation_gate(
    scope: dict,
    context: dict[str, str],
) -> tuple[
    Path,
    dict,
] | None:
    if (
        scope["mode"]
        != "committed"
        or not GATE_DIR.exists()
    ):
        return None

    matches = []

    for path in GATE_DIR.glob(
        "*.json"
    ):
        try:
            payload = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )
        except Exception:
            continue

        if (
            payload.get("status")
            != "PASS"
            or int(
                payload.get(
                    "schema"
                )
                or 0
            )
            < 2
            or payload.get(
                "base_sha"
            )
            != scope["base_sha"]
            or not validation_fields_match(
                payload,
                context,
                include_tree=False,
            )
        ):
            continue

        prior_target = str(
            payload.get(
                "target_sha"
            )
            or ""
        )

        current_target = str(
            scope["target_sha"]
        )

        if (
            not prior_target
            or prior_target
            == "WORKTREE"
            or prior_target
            == current_target
        ):
            continue

        if not is_ancestor(
            prior_target,
            current_target,
        ):
            continue

        matches.append(
            (
                path.stat().st_mtime,
                path,
                payload,
            )
        )

    if not matches:
        return None

    _, path, payload = max(
        matches,
        key=lambda item: item[0],
    )

    return path, payload


def gate_release(
    data: dict,
    *,
    json_output: bool = False,
) -> int:
    try:
        scope = release_scope(
            data
        )
        digest = scope_digest(
            scope
        )
        risk = classify_risk(
            scope["changed_files"]
        )
        context = validation_context(
            scope
        )
    except ReleaseGateError as exc:
        payload = {
            "schema": 2,
            "kind": "gate-receipt",
            "status": "ERROR",
            "error": str(exc),
        }

        if json_output:
            print(
                json.dumps(
                    payload,
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print(
                f"STOP: {exc}"
            )

        return 2

    exact = matching_gate(
        scope,
        digest,
        context=context,
    )

    if exact is not None:
        path, payload = exact

        result = {
            **payload,
            "reused": True,
            "reuse_mode": "EXACT",
            "receipt_path": str(
                path.relative_to(
                    ROOT
                )
            ),
            "receipt_sha256": (
                sha256_file(
                    path
                )
            ),
        }

        if json_output:
            print(
                json.dumps(
                    result,
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print(
                "⚔️  AOE2WAR RELEASE GATE"
            )
            print(
                f"Mode:           {scope['mode']}"
            )
            print(
                f"Base:           {scope['base_sha']}"
            )
            print(
                f"Target:         {scope['target_sha']}"
            )
            print(
                f"Risk:           {risk}"
            )
            print(
                "Validation:     REUSED EXACT"
            )
            print(
                "Receipt:        "
                + str(
                    path.relative_to(
                        ROOT
                    )
                )
            )
            print(
                "PASS: RELEASE GATE "
                "(EXACT RECEIPT REUSED)"
            )

        return 0

    reusable = reusable_validation_gate(
        scope,
        context,
    )

    if reusable is not None:
        prior_path, prior_payload = reusable
        plan = reduced_revalidation_plan(
            scope
        )
        validation_mode = (
            "IMPLEMENTATION_REUSE"
        )
    else:
        prior_path = None
        prior_payload = None
        plan = command_plan(
            scope,
            risk,
        )
        validation_mode = "FULL"

    if not json_output:
        print(
            "⚔️  AOE2WAR RELEASE GATE"
        )
        print(
            f"Mode:           {scope['mode']}"
        )
        print(
            f"Base:           {scope['base_sha']}"
        )
        print(
            f"Target:         {scope['target_sha']}"
        )
        print(
            f"Risk:           {risk}"
        )
        print(
            "Changed files:  "
            + str(
                len(
                    scope[
                        "changed_files"
                    ]
                )
            )
        )

        for path in scope[
            "changed_files"
        ]:
            print(
                f"  - {path}"
            )

        print(
            f"Scope SHA256:   {digest}"
        )
        print(
            "Validation:     "
            + validation_mode
        )

        if prior_path is not None:
            print(
                "Inherited:      "
                + str(
                    prior_path.relative_to(
                        ROOT
                    )
                )
            )

    ok, results = execute_plan(
        plan,
        quiet=json_output,
    )

    receipt = {
        "schema": 2,
        "kind": "gate-receipt",
        "generated_at": utc_now(),
        "status": (
            "PASS"
            if ok
            else "FAIL"
        ),
        "mode": scope["mode"],
        "base_sha": (
            scope["base_sha"]
        ),
        "target_sha": (
            scope["target_sha"]
        ),
        "scope_sha256": digest,
        "risk_class": risk,
        "changed_files": (
            scope["changed_files"]
        ),
        **context,
        "validation_mode": (
            validation_mode
        ),
        "validation_reused_from": (
            str(
                prior_path.relative_to(
                    ROOT
                )
            )
            if prior_path
            is not None
            else None
        ),
        "validation_reused_target": (
            prior_payload.get(
                "target_sha"
            )
            if prior_payload
            is not None
            else None
        ),
        "commands": results,
    }

    stem = (
        scope["target_sha"][:12]
        if scope["target_sha"]
        != "WORKTREE"
        else (
            "worktree-"
            + scope[
                "base_sha"
            ][:12]
        )
    )

    path = (
        GATE_DIR
        / (
            f"{stem}-"
            f"{digest[:12]}.json"
        )
    )

    write_json(
        path,
        receipt,
    )

    receipt["receipt_path"] = str(
        path.relative_to(
            ROOT
        )
    )

    receipt["receipt_sha256"] = (
        sha256_file(
            path
        )
    )

    if json_output:
        print(
            json.dumps(
                receipt,
                indent=2,
                sort_keys=True,
            )
        )
    else:
        print()
        print(
            "Gate:           "
            + receipt["status"]
        )
        print(
            "Validation:     "
            + validation_mode
        )
        print(
            "Receipt:        "
            + receipt[
                "receipt_path"
            ]
        )
        print(
            "Receipt SHA256: "
            + receipt[
                "receipt_sha256"
            ]
        )

        if ok:
            print(
                "PASS: RELEASE GATE"
            )
        else:
            print(
                "FAIL: RELEASE GATE"
            )

    return (
        0
        if ok
        else 1
    )


def matching_gate(
    scope: dict,
    digest: str,
    *,
    context: dict[str, str]
    | None = None,
) -> tuple[
    Path,
    dict,
] | None:
    if not GATE_DIR.exists():
        return None

    if context is None:
        context = validation_context(
            scope
        )

    matches = []

    for path in GATE_DIR.glob(
        "*.json"
    ):
        try:
            payload = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )
        except Exception:
            continue

        if (
            payload.get("status")
            == "PASS"
            and int(
                payload.get(
                    "schema"
                )
                or 0
            )
            >= 2
            and payload.get(
                "base_sha"
            )
            == scope["base_sha"]
            and payload.get(
                "target_sha"
            )
            == scope["target_sha"]
            and payload.get(
                "scope_sha256"
            )
            == digest
            and validation_fields_match(
                payload,
                context,
                include_tree=True,
            )
        ):
            matches.append(
                (
                    path.stat().st_mtime,
                    path,
                    payload,
                )
            )

    if not matches:
        return None

    _, path, payload = max(
        matches,
        key=lambda item: item[0],
    )

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
