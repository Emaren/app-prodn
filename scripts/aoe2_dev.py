#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "aoe2war-operations.json"


class DevError(RuntimeError):
    pass


def run(
    args: list[str],
    *,
    cwd: Path,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=(
            subprocess.PIPE
            if capture
            else None
        ),
        stderr=(
            subprocess.STDOUT
            if capture
            else None
        ),
        check=False,
    )


def checked(
    args: list[str],
    *,
    cwd: Path,
    capture: bool = True,
) -> str:
    result = run(
        args,
        cwd=cwd,
        capture=capture,
    )

    if result.returncode != 0:
        raise DevError(
            "command failed: "
            + " ".join(args)
            + (
                "\n"
                + (result.stdout or "")[-4000:]
                if capture
                else ""
            )
        )

    return (
        (result.stdout or "").strip()
        if capture
        else ""
    )


def load_contract() -> dict:
    return json.loads(CONTRACT.read_text())


def operator_repo() -> Path:
    value = load_contract()["canonical"][
        "operator_repo"
    ]
    return Path(value).expanduser().resolve()


def repo_root(cwd: Path) -> Path:
    output = checked(
        [
            "git",
            "rev-parse",
            "--show-toplevel",
        ],
        cwd=cwd,
    )
    return Path(output).resolve()


def git_common_dir(repo: Path) -> Path:
    output = checked(
        [
            "git",
            "rev-parse",
            "--git-common-dir",
        ],
        cwd=repo,
    )

    value = Path(output)

    if not value.is_absolute():
        value = repo / value

    return value.resolve()


def ensure_same_repository(
    candidate: Path,
) -> None:
    canonical = operator_repo()

    if (
        git_common_dir(candidate)
        != git_common_dir(canonical)
    ):
        raise DevError(
            f"{candidate} is not an AoE2WAR "
            "app-prodn worktree"
        )


def current_repo() -> Path:
    repo = repo_root(Path.cwd())
    ensure_same_repository(repo)
    return repo


def dependency_fingerprint(
    repo: Path,
) -> str:
    digest = hashlib.sha256()

    for name in (
        "package.json",
        "yarn.lock",
    ):
        file = repo / name

        if not file.is_file():
            raise DevError(
                f"{repo} is missing {name}"
            )

        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(file.read_bytes())
        digest.update(b"\0")

    return digest.hexdigest()


def parse_worktrees(
    canonical: Path,
) -> list[Path]:
    raw = checked(
        [
            "git",
            "worktree",
            "list",
            "--porcelain",
        ],
        cwd=canonical,
    )

    result = []

    for block in raw.split("\n\n"):
        for line in block.splitlines():
            if line.startswith("worktree "):
                result.append(
                    Path(
                        line.split(
                            " ",
                            1,
                        )[1]
                    ).resolve()
                )
                break

    return result


def find_dependency_donor(
    target: Path,
) -> Path | None:
    canonical = operator_repo()
    wanted = dependency_fingerprint(target)

    candidates = [
        canonical,
        *parse_worktrees(canonical),
    ]

    seen = set()

    for candidate in candidates:
        candidate = candidate.resolve()

        if candidate in seen:
            continue

        seen.add(candidate)

        if candidate == target.resolve():
            continue

        node_modules = (
            candidate / "node_modules"
        )

        if not node_modules.is_dir():
            continue

        try:
            fingerprint = (
                dependency_fingerprint(candidate)
            )
        except DevError:
            continue

        if fingerprint == wanted:
            return node_modules.resolve()

    return None


def ensure_dependencies(
    target: Path,
) -> None:
    node_modules = target / "node_modules"
    target_fingerprint = (
        dependency_fingerprint(target)
    )

    if node_modules.is_symlink():
        resolved = node_modules.resolve()

        donor_root = resolved.parent

        try:
            donor_fingerprint = (
                dependency_fingerprint(
                    donor_root
                )
            )
        except DevError:
            donor_fingerprint = ""

        if (
            resolved.is_dir()
            and donor_fingerprint
            == target_fingerprint
        ):
            print(
                "PASS: exact-compatible "
                "dependency bridge already present"
            )
        else:
            node_modules.unlink()

    if not node_modules.exists():
        donor = find_dependency_donor(
            target
        )

        if donor is not None:
            node_modules.symlink_to(
                donor,
                target_is_directory=True,
            )

            print(
                "PASS: exact-compatible "
                "node_modules donor bridged"
            )
        else:
            print(
                "> No exact dependency donor; "
                "materializing frozen dependencies..."
            )

            checked(
                [
                    "yarn",
                    "install",
                    "--frozen-lockfile",
                    "--non-interactive",
                ],
                cwd=target,
                capture=False,
            )

            print(
                "PASS: frozen dependencies materialized"
            )

    probe = (
        "for (const p of "
        "['next','react','pg','sharp',"
        "'@prisma/client']) "
        "{ require.resolve(p); }"
    )

    checked(
        [
            "node",
            "-e",
            probe,
        ],
        cwd=target,
    )

    print(
        "PASS: next/react/pg/sharp/prisma "
        "dependency runtime resolved"
    )


def read_env(
    file: Path,
) -> dict[str, str]:
    values = {}

    if not file.is_file():
        return values

    for raw in file.read_text().splitlines():
        line = raw.strip()

        if (
            not line
            or line.startswith("#")
            or "=" not in line
        ):
            continue

        key, value = line.split("=", 1)
        value = value.strip()

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {"'", '"'}
        ):
            value = value[1:-1]

        values[key.strip()] = value

    return values


def database_url_is_local(
    value: str,
) -> bool:
    normalized = value.replace(
        "postgresql+asyncpg://",
        "postgresql://",
        1,
    )

    host = urlsplit(
        normalized
    ).hostname

    return host in {
        None,
        "",
        "localhost",
        "127.0.0.1",
        "::1",
    }


def prove_local_env(
    file: Path,
) -> None:
    values = read_env(file)
    url = values.get(
        "DATABASE_URL",
        "",
    ).strip()

    if not url:
        raise DevError(
            f"{file} has no DATABASE_URL"
        )

    if not database_url_is_local(url):
        raise DevError(
            f"{file} DATABASE_URL is not local"
        )


def ensure_env(
    target: Path,
) -> None:
    canonical = operator_repo()
    canonical_env = canonical / ".env.local"
    target_env = target / ".env.local"

    prove_local_env(canonical_env)

    if target.resolve() != canonical.resolve():
        if not (
            target_env.exists()
            or target_env.is_symlink()
        ):
            target_env.symlink_to(
                canonical_env
            )

            print(
                "PASS: localhost-only "
                ".env.local bridged"
            )

    prove_local_env(target_env)

    print(
        "PASS: worktree DATABASE_URL "
        "is localhost-only"
    )


def run_prisma_generate(
    target: Path,
) -> None:
    prisma = (
        target
        / "node_modules"
        / ".bin"
        / "prisma"
    )

    if not prisma.exists():
        raise DevError(
            "Prisma executable is missing "
            "after dependency preparation"
        )

    checked(
        [
            str(prisma),
            "validate",
        ],
        cwd=target,
        capture=False,
    )

    checked(
        [
            str(prisma),
            "generate",
        ],
        cwd=target,
        capture=False,
    )

    print(
        "PASS: Prisma schema valid and "
        "worktree client generated"
    )


def run_dependency_contract(
    target: Path,
) -> None:
    checked(
        [
            "python3",
            "scripts/check_dependency_contract.py",
        ],
        cwd=target,
        capture=False,
    )


def prepare(
    target: Path,
) -> None:
    ensure_same_repository(target)

    print(
        "⚔️  AOE2WAR DEV PREPARE"
    )
    print(
        f"Worktree: {target}"
    )

    ensure_env(target)
    ensure_dependencies(target)
    run_dependency_contract(target)
    run_prisma_generate(target)

    print(
        "PASS: worktree development "
        "environment is ready"
    )


def refresh(
    target: Path,
) -> None:
    prepare(target)

    checked(
        [
            "python3",
            "scripts/dev-shadow.py",
            "refresh",
        ],
        cwd=target,
        capture=False,
    )

    print(
        "PASS: writable production-shaped "
        "shadow refreshed"
    )


def serve(
    target: Path,
) -> int:
    prepare(target)

    print(
        "PASS: launching local shadow as Emaren"
    )

    os.chdir(target)

    os.execvp(
        "npm",
        [
            "npm",
            "run",
            "dev:shadow",
        ],
    )

    return 0


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(
        r"[^a-z0-9]+",
        "-",
        value,
    )
    value = value.strip("-")

    if not value:
        raise DevError(
            "feature name contains no usable characters"
        )

    return value


def new_worktree(
    name: str,
    *,
    refresh_shadow: bool,
) -> Path:
    canonical = operator_repo()

    if checked(
        [
            "git",
            "branch",
            "--show-current",
        ],
        cwd=canonical,
    ) != "main":
        raise DevError(
            "canonical operator repo is not on main"
        )

    if checked(
        [
            "git",
            "status",
            "--porcelain",
        ],
        cwd=canonical,
    ):
        raise DevError(
            "canonical operator repo is dirty"
        )

    slug = slugify(name)

    target = (
        canonical.parent
        / f"app-prodn-{slug}"
    )

    branch = f"feature/{slug}"

    if target.exists():
        raise DevError(
            f"target already exists: {target}"
        )

    branch_probe = run(
        [
            "git",
            "show-ref",
            "--verify",
            "--quiet",
            f"refs/heads/{branch}",
        ],
        cwd=canonical,
    )

    if branch_probe.returncode == 0:
        raise DevError(
            f"branch already exists: {branch}"
        )

    checked(
        [
            "git",
            "worktree",
            "add",
            "-b",
            branch,
            str(target),
            "main",
        ],
        cwd=canonical,
        capture=False,
    )

    prepare(target)

    if refresh_shadow:
        checked(
            [
                "python3",
                "scripts/dev-shadow.py",
                "refresh",
            ],
            cwd=target,
            capture=False,
        )

    print()
    print(
        "PASS: feature worktree created"
    )
    print(
        f"Branch:   {branch}"
    )
    print(
        f"Worktree: {target}"
    )
    print()
    print(
        f'cd "{target}"'
    )
    print(
        "aoe2war dev serve"
    )

    return target


def print_status(
    target: Path,
) -> None:
    ensure_same_repository(target)

    branch = checked(
        [
            "git",
            "branch",
            "--show-current",
        ],
        cwd=target,
    )

    head = checked(
        [
            "git",
            "rev-parse",
            "HEAD",
        ],
        cwd=target,
    )

    dirty = checked(
        [
            "git",
            "status",
            "--porcelain",
        ],
        cwd=target,
    )

    env_file = target / ".env.local"
    node_modules = target / "node_modules"

    print(
        "⚔️  AOE2WAR DEV STATUS"
    )
    print()
    print(
        f"Worktree:     {target}"
    )
    print(
        f"Branch:       {branch or 'DETACHED'}"
    )
    print(
        f"HEAD:         {head}"
    )
    print(
        "Dirty:        "
        + ("YES" if dirty else "NO")
    )
    print(
        "Local env:    "
        + (
            "READY"
            if env_file.exists()
            else "MISSING"
        )
    )
    print(
        "Dependencies: "
        + (
            "READY"
            if node_modules.is_dir()
            else "MISSING"
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war dev"
    )

    sub = parser.add_subparsers(
        dest="command"
    )

    sub.add_parser("status")
    sub.add_parser("prepare")
    sub.add_parser("refresh")
    sub.add_parser("serve")

    create = sub.add_parser("new")
    create.add_argument("name")
    create.add_argument(
        "--no-refresh",
        action="store_true",
    )

    args = parser.parse_args()

    try:
        if args.command in {
            None,
            "status",
        }:
            print_status(
                current_repo()
            )
            return 0

        if args.command == "prepare":
            prepare(
                current_repo()
            )
            return 0

        if args.command == "refresh":
            refresh(
                current_repo()
            )
            return 0

        if args.command == "serve":
            return serve(
                current_repo()
            )

        if args.command == "new":
            new_worktree(
                args.name,
                refresh_shadow=(
                    not args.no_refresh
                ),
            )
            return 0

        return 2

    except DevError as exc:
        print(
            f"STOP: {exc}",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
