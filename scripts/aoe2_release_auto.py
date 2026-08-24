#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shlex
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from aoe2_release_gate import (
    GATE_DIR,
    MANIFEST_DIR,
    ROOT,
    gate_release,
    manifest_release,
)
from aoe2_release_ship import (
    PROD_HOST,
    PROD_REPO,
    PUBLIC,
    SERVICE,
    activate_release,
    load_stage_receipt,
    parse_kv,
)
from aoe2_release_stage import (
    REMOTE_RECEIPT_ROOT,
    STAGE_RECEIPT_DIR,
    stage_release,
)


class AutoShipError(RuntimeError):
    pass


CONTROL_PLANE_DOCS = {
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}

MIGRATION_RECEIPT_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts"
)


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
    if prod.get("wolo_8092_count") != 1:
        errors.append("protected WOLO listener 8092 count must be exactly 1")
    if prod.get("wolo_8093_count") != 1:
        errors.append("protected WOLO listener 8093 count must be exactly 1")
    if (
        not prod.get("staged_build_id")
        and local.get("head")
        and prod.get("source_sha") == local.get("head")
    ):
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


def release_manifest(release_sha: str) -> dict:
    path = MANIFEST_DIR / f"{release_sha}.json"
    if not path.is_file():
        raise AutoShipError(
            f"release manifest is missing: {path.relative_to(ROOT)}"
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise AutoShipError(f"release manifest is invalid JSON: {exc}") from exc
    if payload.get("release_sha") != release_sha:
        raise AutoShipError("release manifest SHA binding is invalid")
    return payload


def _normalize_sql_ident(value: str) -> str:
    return value.strip().strip('"').lower()


def _sql_statements(sql: str) -> list[str]:
    """
    Split PostgreSQL migration text at top-level semicolons.

    Comments, quoted strings/identifiers, and dollar-quoted bodies remain
    opaque so trigger clauses such as BEFORE TRUNCATE are not mistaken for
    destructive TRUNCATE statements.
    """
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)

    while i < n:
        ch = sql[i]

        if sql.startswith("--", i):
            end = sql.find("\n", i + 2)
            if end < 0:
                break
            buf.append("\n")
            i = end + 1
            continue

        if sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            if end < 0:
                raise AutoShipError("unterminated SQL block comment")
            buf.append(" ")
            i = end + 2
            continue

        if ch == "'":
            start = i
            i += 1
            while i < n:
                if sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise AutoShipError("unterminated SQL string literal")
            buf.append(sql[start:i])
            continue

        if ch == '"':
            start = i
            i += 1
            while i < n:
                if sql[i] == '"':
                    if i + 1 < n and sql[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise AutoShipError("unterminated SQL quoted identifier")
            buf.append(sql[start:i])
            continue

        if ch == "$":
            match = re.match(
                r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$",
                sql[i:],
            )
            if match:
                tag = match.group(0)
                body_end = sql.find(tag, i + len(tag))
                if body_end < 0:
                    raise AutoShipError(
                        f"unterminated SQL dollar quote {tag}"
                    )
                end = body_end + len(tag)
                buf.append(sql[i:end])
                i = end
                continue

        if ch == ";":
            statement = "".join(buf).strip()
            if statement:
                statements.append(statement)
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    statement = "".join(buf).strip()
    if statement:
        statements.append(statement)

    return statements


def _sql_column_list(raw: str) -> set[str]:
    return {
        _normalize_sql_ident(match)
        for match in re.findall(
            r'"?([A-Za-z_][A-Za-z0-9_]*)"?',
            raw,
        )
    }


def _sql_dollar_bodies(sql: str) -> list[str]:
    """
    Return PostgreSQL dollar-quoted bodies for fail-closed procedural scanning.

    Automatic migrations may use read-only validation blocks and trigger
    functions, but procedural DML/DDL is outside the bounded additive lane.
    """
    return [
        match.group("body")
        for match in re.finditer(
            r"\$(?P<tag>[A-Za-z_][A-Za-z0-9_]*|)\$"
            r"(?P<body>[\s\S]*?)"
            r"\$(?P=tag)\$",
            sql,
        )
    ]


def migration_contract(release_sha: str) -> tuple[dict, list[str]]:
    manifest = release_manifest(release_sha)
    paths = [str(item) for item in (manifest.get("migration_paths") or [])]
    if not paths:
        return manifest, []

    if manifest.get("risk_class") not in {"FINANCIAL", "DATABASE"}:
        raise AutoShipError(
            "Prisma migrations require a DATABASE or FINANCIAL release gate"
        )

    allowed_path = re.compile(
        r"^prisma/migrations/[A-Za-z0-9_.-]+/migration\.sql$"
    )

    texts: list[tuple[str, str]] = []
    statements: list[tuple[str, str]] = []

    created_tables: set[str] = set()
    added_columns: dict[str, set[str]] = {}

    create_table = re.compile(
        r'^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\b',
        re.I | re.S,
    )

    alter_table = re.compile(
        r'^ALTER\s+TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s+'
        r'([\s\S]+)$',
        re.I,
    )

    add_column = re.compile(
        r'^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\s+([\s\S]+)$',
        re.I,
    )

    for rel in paths:
        if not allowed_path.fullmatch(rel):
            raise AutoShipError(
                f"migration path is outside the Prisma contract: {rel}"
            )

        path = (ROOT / rel).resolve()

        try:
            path.relative_to(
                (ROOT / "prisma/migrations").resolve()
            )
        except ValueError as exc:
            raise AutoShipError(
                f"migration escapes Prisma migrations: {rel}"
            ) from exc

        if not path.is_file():
            raise AutoShipError(
                f"migration file is missing: {rel}"
            )

        sql = path.read_text(encoding="utf-8")
        texts.append((rel, sql))

        for statement in _sql_statements(sql):
            statements.append((rel, statement))

            match = create_table.match(statement)
            if match:
                created_tables.add(
                    _normalize_sql_ident(match.group(1))
                )
                continue

            match = alter_table.match(statement)
            if not match:
                continue

            table = _normalize_sql_ident(match.group(1))
            body = match.group(2).strip()

            column = add_column.match(body)
            if column:
                added_columns.setdefault(
                    table,
                    set(),
                ).add(
                    _normalize_sql_ident(
                        column.group(1)
                    )
                )

    destructive = [
        (
            "DROP",
            re.compile(
                r'^DROP\b',
                re.I | re.S,
            ),
        ),
        (
            "TRUNCATE",
            re.compile(
                r'^TRUNCATE\b',
                re.I | re.S,
            ),
        ),
        (
            "CREATE OR REPLACE",
            re.compile(
                r'^CREATE\s+OR\s+REPLACE\b',
                re.I | re.S,
            ),
        ),
        (
            "ALTER NON-TABLE",
            re.compile(
                r'^ALTER\s+(?!TABLE\b)',
                re.I | re.S,
            ),
        ),
        (
            "COPY",
            re.compile(
                r'^COPY\b',
                re.I | re.S,
            ),
        ),
        (
            "ALTER TABLE DROP",
            re.compile(
                r'^ALTER\s+TABLE\b[\s\S]*?\bDROP\s+'
                r'(?:COLUMN|CONSTRAINT)\b',
                re.I,
            ),
        ),
        (
            "ALTER TABLE RENAME",
            re.compile(
                r'^ALTER\s+TABLE\b[\s\S]*?\bRENAME\b',
                re.I,
            ),
        ),
        (
            "ALTER COLUMN TYPE",
            re.compile(
                r'^ALTER\s+TABLE\b[\s\S]*?'
                r'\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b',
                re.I,
            ),
        ),
    ]

    for rel, statement in statements:
        for label, pattern in destructive:
            if pattern.match(statement):
                raise AutoShipError(
                    "migration contract rejects destructive SQL "
                    f"({label}) in {rel}"
                )

    procedural_mutation = re.compile(
        r"\b(?:"
        r"INSERT\s+INTO|"
        r"UPDATE\s+[A-Za-z_\"][\s\S]{0,160}?\s+SET|"
        r"DELETE\s+FROM|"
        r"MERGE\s+INTO|"
        r"TRUNCATE\b|"
        r"DROP\s+|"
        r"ALTER\s+|"
        r"COPY\s+|"
        r"CREATE\s+OR\s+REPLACE|"
        r"EXECUTE\b"
        r")",
        re.I,
    )

    for rel, statement in statements:
        for body in _sql_dollar_bodies(statement):
            if procedural_mutation.search(body):
                raise AutoShipError(
                    "procedural or dynamic SQL mutation is outside "
                    f"the automatic additive migration lane in {rel}"
                )

    if not created_tables and not any(
        added_columns.values()
    ):
        raise AutoShipError(
            "migration release has no additive CREATE TABLE "
            "or ADD COLUMN authority"
        )

    insert = re.compile(
        r'\bINSERT\s+INTO\s+(?:ONLY\s+)?'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\b',
        re.I,
    )

    merge = re.compile(
        r'\bMERGE\s+INTO\b',
        re.I,
    )

    create_index_target = re.compile(
        r'^CREATE\s+(?:UNIQUE\s+)?INDEX\b'
        r'[\s\S]*?\bON\s+'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\b',
        re.I,
    )

    create_index_columns = re.compile(
        r'^CREATE\s+(?:UNIQUE\s+)?INDEX\b'
        r'[\s\S]*?\bON\s+'
        r'"?[A-Za-z_][A-Za-z0-9_]*"?'
        r'(?:\s+USING\s+[A-Za-z_][A-Za-z0-9_]*)?'
        r'\s*\(([^)]+)\)',
        re.I,
    )

    create_trigger = re.compile(
        r'^CREATE\s+TRIGGER\b'
        r'[\s\S]*?\bON\s+'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\b',
        re.I,
    )

    update = re.compile(
        r'\bUPDATE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?'
        r'(?:\s+(?:AS\s+)?'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?)?'
        r'\s+SET\s+([\s\S]+)$',
        re.I,
    )

    delete = re.compile(
        r'\bDELETE\s+FROM\s+'
        r'"?([A-Za-z_][A-Za-z0-9_]*)"?\b',
        re.I | re.S,
    )

    add_unique = re.compile(
        r'^ADD\s+CONSTRAINT\s+'
        r'"?[A-Za-z_][A-Za-z0-9_]*"?\s+'
        r'UNIQUE\s*\(([^)]+)\)[\s\S]*$',
        re.I,
    )

    add_fk = re.compile(
        r'^ADD\s+CONSTRAINT\s+'
        r'"?[A-Za-z_][A-Za-z0-9_]*"?\s+'
        r'FOREIGN\s+KEY\s*\(([^)]+)\)[\s\S]*$',
        re.I,
    )

    for rel, statement in statements:
        for insert_match in insert.finditer(statement):
            table = _normalize_sql_ident(
                insert_match.group(1)
            )

            if table not in created_tables:
                raise AutoShipError(
                    "INSERT targets pre-existing table "
                    f"{table!r} in {rel}; automatic migration "
                    "mode forbids inserting new production truth "
                    "into pre-existing tables"
                )

        if merge.search(statement):
            raise AutoShipError(
                "MERGE is outside the automatic additive "
                f"migration lane in {rel}"
            )

        index_match = create_index_target.match(
            statement
        )

        if index_match:
            table = _normalize_sql_ident(
                index_match.group(1)
            )

            if table not in created_tables:
                columns_match = (
                    create_index_columns.match(
                        statement
                    )
                )

                if not columns_match:
                    raise AutoShipError(
                        "CREATE INDEX on pre-existing "
                        f"table {table!r} in {rel} "
                        "could not be proven additive"
                    )

                columns = _sql_column_list(
                    columns_match.group(1)
                )

                allowed = added_columns.get(
                    table,
                    set(),
                )

                if not columns or not columns.issubset(
                    allowed
                ):
                    raise AutoShipError(
                        "CREATE INDEX on pre-existing "
                        f"table {table!r} in {rel} may reference "
                        "only columns added by this release"
                    )

        trigger_match = create_trigger.match(
            statement
        )

        if trigger_match:
            table = _normalize_sql_ident(
                trigger_match.group(1)
            )

            if table not in created_tables:
                update_of = re.search(
                    r'\bUPDATE\s+OF\s+'
                    r'([\s\S]*?)\s+ON\s+',
                    statement,
                    re.I,
                )

                if not update_of:
                    raise AutoShipError(
                        "CREATE TRIGGER on pre-existing "
                        f"table {table!r} in {rel} must be "
                        "scoped through UPDATE OF to "
                        "same-release columns"
                    )

                trigger_columns = _sql_column_list(
                    update_of.group(1)
                )

                allowed = added_columns.get(
                    table,
                    set(),
                )

                if (
                    not trigger_columns
                    or not trigger_columns.issubset(
                        allowed
                    )
                ):
                    raise AutoShipError(
                        "CREATE TRIGGER on pre-existing "
                        f"table {table!r} in {rel} may reference "
                        "only columns added by this release"
                    )

                trigger_head = statement[
                    : trigger_match.end()
                ]

                if re.search(
                    r'\b(?:DELETE|TRUNCATE)\b',
                    trigger_head,
                    re.I,
                ):
                    raise AutoShipError(
                        "DELETE/TRUNCATE trigger events on "
                        f"pre-existing table {table!r} in {rel} "
                        "are outside the automatic additive lane"
                    )

        match = update.search(statement)

        if match:
            table = _normalize_sql_ident(
                match.group(1)
            )

            if table in created_tables:
                continue

            body = match.group(3)

            set_part = re.split(
                r'\b(?:FROM|WHERE|RETURNING)\b',
                body,
                maxsplit=1,
                flags=re.I,
            )[0]

            targets = {
                _normalize_sql_ident(column)
                for column in re.findall(
                    r'(?:'
                    r'"?[A-Za-z_][A-Za-z0-9_]*"?'
                    r'\s*\.\s*'
                    r')?'
                    r'"?([A-Za-z_][A-Za-z0-9_]*)"?'
                    r'\s*=',
                    set_part,
                )
            }

            allowed = added_columns.get(
                table,
                set(),
            )

            if not targets or not targets.issubset(
                allowed
            ):
                bad = sorted(targets - allowed)
                raise AutoShipError(
                    "UPDATE targets pre-existing column(s) "
                    f"{bad or sorted(targets)!r} on "
                    f"pre-existing table {table!r} in {rel}; "
                    "additive backfills may only populate "
                    "columns added by this release"
                )

            if not re.search(
                r'\bWHERE\b',
                statement,
                re.I,
            ):
                raise AutoShipError(
                    "UPDATE backfill against pre-existing "
                    f"table {table!r} in {rel} requires WHERE"
                )

            continue

        match = delete.search(statement)

        if match:
            table = _normalize_sql_ident(
                match.group(1)
            )

            if table not in created_tables:
                raise AutoShipError(
                    "DELETE targets pre-existing table "
                    f"{table!r} in {rel}; automatic "
                    "migration mode forbids deleting "
                    "pre-existing production truth"
                )

            continue

        match = alter_table.match(statement)

        if not match:
            continue

        table = _normalize_sql_ident(
            match.group(1)
        )
        body = match.group(2).strip()

        if table in created_tables:
            continue

        column = add_column.match(body)

        if column:
            definition = column.group(2)

            if re.search(
                r'\bNOT\s+NULL\b',
                definition,
                re.I,
            ):
                raise AutoShipError(
                    "ADD COLUMN on pre-existing table "
                    f"{table!r} in {rel} must remain "
                    "nullable in the automatic additive lane"
                )

            continue

        constraint = (
            add_unique.match(body)
            or add_fk.match(body)
        )

        if constraint:
            columns = _sql_column_list(
                constraint.group(1)
            )

            allowed = added_columns.get(
                table,
                set(),
            )

            if not columns or not columns.issubset(
                allowed
            ):
                raise AutoShipError(
                    "ADD CONSTRAINT on pre-existing table "
                    f"{table!r} in {rel} may reference "
                    "only columns added by this release"
                )

            continue

        raise AutoShipError(
            "ALTER TABLE targets pre-existing table "
            f"{table!r} in {rel}; automatic migration "
            "mode only permits nullable ADD COLUMN "
            "or constraints over same-release columns"
        )

    names = sorted(
        {
            Path(rel).parent.name
            for rel in paths
        }
    )

    if len(names) != len(paths):
        raise AutoShipError(
            "migration manifest contains duplicate "
            "migration directories"
        )

    return manifest, names


def production_migration_script(
    *,
    release_sha: str,
    migration_names: list[str],
) -> str:
    q = shlex.quote
    expected = "\n".join(migration_names)
    release_short = release_sha[:12]

    return f"""
set -Eeuo pipefail
RELEASE={q(release_sha)}
RELEASE_SHORT={q(release_short)}
PROD_REPO={q(PROD_REPO)}
RECEIPT_ROOT={q(MIGRATION_RECEIPT_ROOT)}
EXPECTED_MIGRATIONS={q(expected)}

tmp=""
cred=""
cleanup() {{
  set +e
  [ -n "$tmp" ] && git -C "$PROD_REPO" worktree remove --force "$tmp" >/dev/null 2>&1
  [ -n "$cred" ] && rm -f "$cred"
}}
trap cleanup EXIT INT TERM

cd "$PROD_REPO"
test -z "$(git status --porcelain --untracked-files=all)" \
  || {{ echo "STOP: production source worktree is dirty" >&2; exit 71; }}

git fetch --quiet origin main
test "$(git rev-parse origin/main)" = "$RELEASE" \
  || {{ echo "STOP: production origin/main is not the release SHA" >&2; exit 72; }}

tmp="$(mktemp -d /tmp/aoe2war-migrate-${{RELEASE_SHORT}}-XXXXXX)"
rmdir "$tmp"
git worktree add --quiet --detach "$tmp" "$RELEASE"
ln -s "$PROD_REPO/node_modules" "$tmp/node_modules"

cred="$(mktemp /tmp/aoe2war-db-env.XXXXXX)"
chmod 600 "$cred"
python3 - "$PROD_REPO" > "$cred" <<'PY'
from pathlib import Path
from urllib.parse import unquote, urlsplit
import shlex
import sys

repo = Path(sys.argv[1])
candidates = [repo / ".env", repo / ".env.production", repo / ".env.local"]
database_url = None
for candidate in candidates:
    if not candidate.is_file():
        continue
    for raw in candidate.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() != "DATABASE_URL":
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {{chr(34), chr(39)}}:
            value = value[1:-1]
        database_url = value
        break
    if database_url:
        break

if not database_url:
    raise SystemExit("STOP: production DATABASE_URL is unavailable")

raw = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
parsed = urlsplit(raw)
if parsed.scheme not in {"postgresql", "postgres"}:
    raise SystemExit("STOP: production DATABASE_URL scheme is not PostgreSQL")

values = {{
    "PGHOST": parsed.hostname or "",
    "PGPORT": str(parsed.port or 5432),
    "PGUSER": unquote(parsed.username or ""),
    "PGPASSWORD": unquote(parsed.password or ""),
    "PGDATABASE": unquote(parsed.path.lstrip("/")),
    "DATABASE_URL": raw,
}}
for key, value in values.items():
    print(f"export {{key}}={{shlex.quote(value)}}")
PY
# shellcheck disable=SC1090
. "$cred"
rm -f "$cred"
cred=""

test -n "$PGDATABASE" || {{ echo "STOP: production DB name is empty" >&2; exit 73; }}
printf 'database\\t%s\\n' "$PGDATABASE"

expected_file="$tmp/.expected-migrations"
repo_file="$tmp/.repo-migrations"
applied_file="$tmp/.applied-migrations"
pending_file="$tmp/.pending-migrations"

printf '%s\\n' "$EXPECTED_MIGRATIONS" | sed '/^$/d' | sort -u > "$expected_file"
find "$tmp/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort -u > "$repo_file"
psql -X -v ON_ERROR_STOP=1 -Atqc \
  'select migration_name from "_prisma_migrations" where finished_at is not null and rolled_back_at is null order by migration_name;' \
  > "$applied_file"
comm -23 "$repo_file" "$applied_file" > "$pending_file"

unexpected="$(comm -23 "$pending_file" "$expected_file" || true)"
[ -z "$unexpected" ] \
  || {{ echo "STOP: production has pending migrations outside this release: $unexpected" >&2; exit 74; }}

release_pending="$(comm -12 "$pending_file" "$expected_file" || true)"
expected_count="$(wc -l < "$expected_file" | tr -d ' ')"
pending_count="$(printf '%s\\n' "$release_pending" | sed '/^$/d' | wc -l | tr -d ' ')"

receipt_match=""
while IFS= read -r candidate; do
  status="$candidate/migration-status.txt"
  [ -f "$status" ] || continue
  grep -Fqx "release_sha=$RELEASE" "$status" || continue
  grep -Fqx "status=APPLIED" "$status" || continue
  ok=1
  while IFS= read -r migration; do
    [ -n "$migration" ] || continue
    grep -Fqx "migration=$migration" "$status" || ok=0
  done < "$expected_file"
  [ "$ok" = 1 ] && receipt_match="$candidate"
done < <(
  find "$RECEIPT_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name "migration-*-${{RELEASE_SHORT}}" -print 2>/dev/null | sort
)

if [ "$pending_count" = "0" ]; then
  [ -n "$receipt_match" ] \
    || {{ echo "STOP: release migrations are applied but durable migration receipt is missing" >&2; exit 75; }}
  printf 'mode\\talready-applied\\n'
  printf 'receipt_dir\\t%s\\n' "$receipt_match"
  exit 0
fi

[ "$pending_count" = "$expected_count" ] \
  || {{ echo "STOP: release migration frontier is partially applied" >&2; exit 76; }}
cmp -s "$pending_file" "$expected_file" \
  || {{ echo "STOP: pending migration frontier differs from release manifest" >&2; exit 77; }}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
receipt="$RECEIPT_ROOT/migration-${{stamp}}-${{RELEASE_SHORT}}"
sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$receipt"
dump="$receipt/pre-migration.dump"

pg_dump -Fc --no-owner --no-acl -f "$dump"
dump_sha="$(sha256sum "$dump" | awk '{{print $1}}')"
test -n "$dump_sha"

(
  cd "$tmp"
  DATABASE_URL="$DATABASE_URL" ./node_modules/.bin/prisma migrate deploy
)

for migration in $(cat "$expected_file"); do
  count="$(psql -X -v ON_ERROR_STOP=1 -Atqc \
    "select count(*) from \\"_prisma_migrations\\" where migration_name='$migration' and finished_at is not null and rolled_back_at is null;")"
  [ "$count" = "1" ] \
    || {{ echo "STOP: migration did not land exactly once: $migration" >&2; exit 78; }}
done

failed="$(psql -X -v ON_ERROR_STOP=1 -Atqc \
  'select count(*) from "_prisma_migrations" where finished_at is null and rolled_back_at is null;')"
[ "$failed" = "0" ] \
  || {{ echo "STOP: Prisma reports unfinished migration rows" >&2; exit 79; }}

status="$receipt/migration-status.txt"
{{
  printf 'status=APPLIED\\n'
  printf 'release_sha=%s\\n' "$RELEASE"
  printf 'database=%s\\n' "$PGDATABASE"
  printf 'dump=pre-migration.dump\\n'
  printf 'dump_sha256=%s\\n' "$dump_sha"
  while IFS= read -r migration; do
    [ -n "$migration" ] && printf 'migration=%s\\n' "$migration"
  done < "$expected_file"
}} > "$status"
sha256sum "$status" > "$status.sha256"

printf 'mode\\tapplied\\n'
printf 'receipt_dir\\t%s\\n' "$receipt"
printf 'dump_sha256\\t%s\\n' "$dump_sha"
"""


def apply_production_migrations_if_needed(release_sha: str) -> str | None:
    manifest, migration_names = migration_contract(release_sha)
    if not migration_names:
        return None

    print()
    print("== PRODUCTION DATABASE MIGRATIONS ==")
    print("Policy:         additive/backward-compatible only")
    print(f"Gate:           {manifest.get('risk_class')}")
    print("Database:       exact pending frontier only")
    print("Backup:         durable pg_dump before first mutation")
    print("WOLO:           untouched")
    print("Migrations:")
    for name in migration_names:
        print(f"  - {name}")

    script = production_migration_script(
        release_sha=release_sha,
        migration_names=migration_names,
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=1800,
    )
    result = parse_kv(p.stdout or "")
    if p.returncode != 0:
        detail = ((p.stderr or "") or (p.stdout or "")).strip()
        raise AutoShipError(
            "protected production migration phase failed"
            + (f": {detail[-6000:]}" if detail else "")
        )

    receipt = result.get("receipt_dir")
    if not receipt or not receipt.startswith(
        f"{MIGRATION_RECEIPT_ROOT}/migration-"
    ):
        raise AutoShipError("production migration phase returned no durable receipt")

    print(f"Migration mode: {result.get('mode') or 'verified'}")
    print(f"Receipt:        {receipt}")
    if result.get("dump_sha256"):
        print(f"Backup SHA256:  {result['dump_sha256']}")
    print("PASS: production migrations applied/verified before activation")
    return receipt


def latest_stage_receipt(
    release_sha: str,
    staged_build_id: str | None = None,
) -> Path:
    candidates: list[tuple[float, Path]] = []
    for path in STAGE_RECEIPT_DIR.glob(f"{release_sha}-*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if (
            payload.get("status") == "STAGED"
            and payload.get("release_sha") == release_sha
            and (
                staged_build_id is None
                or payload.get("staged_build_id") == staged_build_id
            )
        ):
            candidates.append((path.stat().st_mtime, path))

    if not candidates:
        raise AutoShipError(
            "no exact local STAGED receipt matches the release SHA and live candidate BUILD_ID"
        )
    return max(candidates, key=lambda item: item[0])[1]


def remote_stage_hydration_script(
    *,
    release_sha: str,
    staged_build_id: str,
    previous_sha: str,
    active_build_id: str,
    live_build_version: str,
) -> str:
    """Build a read-only VPS proof for one exact durable staged candidate."""
    q = shlex.quote
    return f"""
set -Eeuo pipefail
cd {q(PROD_REPO)}
RELEASE={q(release_sha)}
STAGED_BUILD={q(staged_build_id)}
PREVIOUS={q(previous_sha)}
ACTIVE_BUILD={q(active_build_id)}
LIVE_VERSION={q(live_build_version)}
SERVICE={q(SERVICE)}
RECEIPT_ROOT={q(REMOTE_RECEIPT_ROOT)}

die() {{ echo "$1" >&2; exit "${{2:-44}}"; }}
assert_eq() {{
  label="$1"; actual="$2"; expected="$3"
  [ "$actual" = "$expected" ] || die "$label mismatch"
}}
wolo_count() {{ ss -ltn | grep -Ec ":$1[[:space:]]" || true; }}
artifact_hash() {{
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -C "$1" -cf - . \
  | sha256sum | awk '{{print $1}}'
}}
status_value() {{
  key="$1"
  count="$(grep -Ec "^${{key}}=" "$status_file" || true)"
  [ "$count" = 1 ] || die "durable stage status has missing or duplicate $key"
  sed -n "s/^${{key}}=//p" "$status_file"
}}

test -d "$RECEIPT_ROOT" || die "durable stage receipt root is missing" 43
mapfile -d '' receipt_dirs < <(
  find "$RECEIPT_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name "stage-*-${{RELEASE:0:12}}" -print0 | sort -z
)
matching=()
for candidate in "${{receipt_dirs[@]}}"; do
  candidate_status="$candidate/stage-status.txt"
  [ -f "$candidate_status" ] || continue
  if grep -Fxc "release_sha=$RELEASE" "$candidate_status" >/dev/null \
    && grep -Fxc "staged_build_id=$STAGED_BUILD" "$candidate_status" >/dev/null; then
    matching+=("$candidate")
  fi
done
printf 'match_count\t%s\n' "${{#matching[@]}}"
[ "${{#matching[@]}}" = 1 ] \
  || die "expected exactly one durable receipt for the live staged candidate" 42

receipt="${{matching[0]}}"
status_file="$receipt/stage-status.txt"
for evidence in release-manifest.json gate-receipt.json stage-status.txt \
  stage-receipt.json stage-receipt.json.sha256; do
  [ -f "$receipt/$evidence" ] \
    || die "missing durable stage evidence: $evidence" 43
  [ ! -L "$receipt/$evidence" ] \
    || die "durable stage evidence must not be a symlink: $evidence" 43
done

source_sha="$(git rev-parse HEAD)"
dirty_count="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
service_state="$(systemctl is-active "$SERVICE" || true)"
active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
candidate_build="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
sidecar_version="$(tr -d '\r\n' < .aoe2war-build-version 2>/dev/null || true)"
internal_version="$(
  curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion", ""))'
)"
wolo8092="$(wolo_count 8092)"
wolo8093="$(wolo_count 8093)"

assert_eq "production source" "$source_sha" "$PREVIOUS"
assert_eq "production dirty count" "$dirty_count" 0
assert_eq "service state" "$service_state" active
assert_eq "active BUILD_ID" "$active_build" "$ACTIVE_BUILD"
assert_eq "staged BUILD_ID" "$candidate_build" "$STAGED_BUILD"
assert_eq "live build-version sidecar" "$sidecar_version" "$LIVE_VERSION"
assert_eq "internal build version" "$internal_version" "$LIVE_VERSION"
assert_eq "WOLO 8092 listener count" "$wolo8092" 1
assert_eq "WOLO 8093 listener count" "$wolo8093" 1
test ! -e .next-release/cache || die "staged artifact contains rebuildable cache"

artifact_sha="$(artifact_hash .next-release)"
manifest_sha="$(sha256sum "$receipt/release-manifest.json" | awk '{{print $1}}')"
gate_sha="$(sha256sum "$receipt/gate-receipt.json" | awk '{{print $1}}')"
stage_receipt_sha="$(sha256sum "$receipt/stage-receipt.json" | awk '{{print $1}}')"
sidecar_receipt_sha="$(awk 'NR == 1 {{print $1}}' "$receipt/stage-receipt.json.sha256")"
assert_eq "durable stage receipt digest" "$stage_receipt_sha" "$sidecar_receipt_sha"

assert_eq "stage status" "$(status_value status)" STAGED
assert_eq "status release SHA" "$(status_value release_sha)" "$RELEASE"
assert_eq "status previous SHA" "$(status_value previous_sha)" "$PREVIOUS"
assert_eq "status source SHA" "$(status_value source_sha)" "$PREVIOUS"
assert_eq "status active BUILD_ID" "$(status_value active_build_id)" "$ACTIVE_BUILD"
assert_eq "status staged BUILD_ID" "$(status_value staged_build_id)" "$STAGED_BUILD"
assert_eq "status live build version" "$(status_value live_build_version)" "$LIVE_VERSION"
candidate_version="$(status_value candidate_build_version)"
[ -n "$candidate_version" ] || die "candidate build version is missing"
assert_eq "status artifact digest" "$(status_value artifact_sha256)" "$artifact_sha"
assert_eq "status service" "$(status_value service)" active
assert_eq "status WOLO 8092" "$(status_value wolo8092)" 1
assert_eq "status WOLO 8093" "$(status_value wolo8093)" 1
assert_eq "status receipt directory" "$(status_value receipt_dir)" "$receipt"
assert_eq "isolated worktree proof" "$(status_value isolated_worktree)" 1
assert_eq "dependency-contract proof" "$(status_value dependency_contract_unchanged)" 1
assert_eq "cache-free proof" "$(status_value cache_free_artifact)" 1
assert_eq "artifact relocation proof" "$(status_value artifact_path_relocated)" 1
assert_eq "live source mutation proof" "$(status_value live_source_mutated)" 0
assert_eq "live public mutation proof" "$(status_value live_public_mutated)" 0
assert_eq "live node_modules mutation proof" "$(status_value live_node_modules_mutated)" 0
assert_eq "live build-version mutation proof" "$(status_value live_build_version_mutated)" 0

printf 'status\tSTAGED\n'
printf 'release_sha\t%s\n' "$RELEASE"
printf 'previous_sha\t%s\n' "$PREVIOUS"
printf 'source_sha\t%s\n' "$source_sha"
printf 'active_build_id\t%s\n' "$active_build"
printf 'staged_build_id\t%s\n' "$candidate_build"
printf 'live_build_version\t%s\n' "$internal_version"
printf 'candidate_build_version\t%s\n' "$candidate_version"
printf 'artifact_sha256\t%s\n' "$artifact_sha"
printf 'service\t%s\n' "$service_state"
printf 'wolo8092\t%s\n' "$wolo8092"
printf 'wolo8093\t%s\n' "$wolo8093"
printf 'receipt_dir\t%s\n' "$receipt"
printf 'manifest_sha256\t%s\n' "$manifest_sha"
printf 'gate_sha256\t%s\n' "$gate_sha"
printf 'stage_receipt_sha256\t%s\n' "$stage_receipt_sha"
printf 'manifest_b64\t'; base64 -w0 "$receipt/release-manifest.json"; printf '\n'
printf 'gate_b64\t'; base64 -w0 "$receipt/gate-receipt.json"; printf '\n'
printf 'stage_receipt_b64\t'; base64 -w0 "$receipt/stage-receipt.json"; printf '\n'
"""


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _decode_evidence(result: dict[str, str], key: str) -> bytes:
    raw = result.get(key)
    if not raw:
        raise AutoShipError(f"durable stage evidence is missing {key}")
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise AutoShipError(f"durable stage evidence has invalid {key}") from exc


def _is_lower_hex(value: object, length: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) == length
        and all(ch in "0123456789abcdef" for ch in value)
    )


def validate_hydrated_stage_evidence(
    result: dict[str, str],
    *,
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> tuple[bytes, bytes, bytes, dict, dict, dict]:
    expected = {
        "status": "STAGED",
        "release_sha": release_sha,
        "previous_sha": production.get("source_sha"),
        "source_sha": production.get("source_sha"),
        "active_build_id": production.get("active_build_id"),
        "staged_build_id": staged_build_id,
        "live_build_version": production.get("internal_build_version"),
        "service": "active",
        "wolo8092": "1",
        "wolo8093": "1",
    }
    for key, value in expected.items():
        if not value or result.get(key) != str(value):
            raise AutoShipError(
                f"durable stage evidence {key} does not match live production"
            )

    for key in (
        "artifact_sha256",
        "manifest_sha256",
        "gate_sha256",
        "stage_receipt_sha256",
    ):
        if not _is_lower_hex(result.get(key), 64):
            raise AutoShipError(f"durable stage evidence has invalid {key}")

    receipt_dir = result.get("receipt_dir") or ""
    if not receipt_dir.startswith(f"{REMOTE_RECEIPT_ROOT}/stage-"):
        raise AutoShipError("durable stage evidence is outside the canonical receipt root")
    if not result.get("candidate_build_version"):
        raise AutoShipError("durable stage evidence is missing candidate build version")

    manifest_bytes = _decode_evidence(result, "manifest_b64")
    gate_bytes = _decode_evidence(result, "gate_b64")
    stage_receipt_bytes = _decode_evidence(result, "stage_receipt_b64")
    for key, content in (
        ("manifest_sha256", manifest_bytes),
        ("gate_sha256", gate_bytes),
        ("stage_receipt_sha256", stage_receipt_bytes),
    ):
        if _sha256_bytes(content) != result[key]:
            raise AutoShipError(f"durable stage evidence digest mismatch: {key}")

    try:
        manifest = json.loads(manifest_bytes)
        gate = json.loads(gate_bytes)
        receipt = json.loads(stage_receipt_bytes)
    except Exception as exc:
        raise AutoShipError("durable stage evidence contains invalid JSON") from exc

    previous_sha = str(production["source_sha"])
    if manifest.get("schema") != 1 or manifest.get("kind") != "aoe2war-release-manifest":
        raise AutoShipError("durable release manifest kind/schema is invalid")
    if manifest.get("release_sha") != release_sha:
        raise AutoShipError("durable release manifest release SHA mismatch")
    if manifest.get("previous_production_sha") != previous_sha:
        raise AutoShipError("durable release manifest previous source mismatch")
    if manifest.get("migration_paths") and manifest.get("risk_class") not in {"FINANCIAL", "DATABASE"}:
        raise AutoShipError(
            "durable staged release has migrations without a DATABASE/FINANCIAL gate"
        )
    if "yarn.lock" in (manifest.get("changed_files") or []):
        raise AutoShipError(
            "durable staged release changes yarn.lock; isolated dependency swap is required"
        )

    gate_binding = manifest.get("gate") or {}
    gate_rel = gate_binding.get("receipt_path")
    if not gate_rel or gate_binding.get("receipt_sha256") != result["gate_sha256"]:
        raise AutoShipError("durable manifest does not bind the exact gate receipt")
    gate_path = (ROOT / str(gate_rel)).resolve()
    try:
        gate_path.relative_to(GATE_DIR.resolve())
    except ValueError as exc:
        raise AutoShipError("durable gate receipt path is outside the gate directory") from exc
    if (
        gate.get("schema") != 1
        or gate.get("kind") != "gate-receipt"
        or gate.get("status") != "PASS"
        or gate.get("target_sha") != release_sha
        or gate.get("scope_sha256") != manifest.get("scope_sha256")
    ):
        raise AutoShipError("durable gate receipt does not match the release manifest")

    receipt_expectations = {
        "schema": 1,
        "kind": "aoe2war-stage-result",
        "status": "STAGED",
        "release_sha": release_sha,
        "previous_production_sha": previous_sha,
        "source_sha": previous_sha,
        "active_build_id": str(production["active_build_id"]),
        "staged_build_id": staged_build_id,
        "live_build_version": str(production["internal_build_version"]),
        "candidate_build_version": result["candidate_build_version"],
        "artifact_sha256": result["artifact_sha256"],
        "manifest_sha256": result["manifest_sha256"],
        "gate_sha256": result["gate_sha256"],
        "remote_receipt_dir": receipt_dir,
        "service": "active",
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
        "isolated_worktree": True,
        "dependency_contract_unchanged": True,
        "cache_free_artifact": True,
        "artifact_path_relocated": True,
        "live_source_mutated": False,
        "live_public_mutated": False,
        "live_node_modules_mutated": False,
        "live_build_version_mutated": False,
        "live_runtime_mutated": False,
        "wolo_mutated": False,
    }
    for key, value in receipt_expectations.items():
        if receipt.get(key) != value:
            raise AutoShipError(f"durable stage receipt mismatch: {key}")

    manifest_path = MANIFEST_DIR / f"{release_sha}.json"
    if receipt.get("manifest_path") != str(manifest_path.relative_to(ROOT)):
        raise AutoShipError("durable stage receipt manifest path mismatch")
    if receipt.get("gate_path") != str(gate_path.relative_to(ROOT)):
        raise AutoShipError("durable stage receipt gate path mismatch")
    if manifest.get("risk_class") != receipt.get("risk_class"):
        raise AutoShipError("durable stage receipt risk class mismatch")

    return (
        manifest_bytes,
        gate_bytes,
        stage_receipt_bytes,
        manifest,
        gate,
        receipt,
    )


def _install_exact_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if not path.is_file() or path.read_bytes() != content:
            raise AutoShipError(
                f"local release evidence conflicts with durable evidence: {path.relative_to(ROOT)}"
            )
        return

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent,
            prefix=f".{path.name}.hydrate-",
            delete=False,
        ) as handle:
            temp_name = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, 0o600)
        try:
            os.link(temp_name, path)
        except FileExistsError:
            if not path.is_file() or path.read_bytes() != content:
                raise AutoShipError(
                    f"local release evidence raced with conflicting content: {path.relative_to(ROOT)}"
                )
    finally:
        if temp_name:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass


def hydrate_stage_receipt(
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> Path:
    previous_sha = production.get("source_sha")
    active_build_id = production.get("active_build_id")
    live_build_version = production.get("internal_build_version")
    if not _is_lower_hex(release_sha, 40) or not _is_lower_hex(previous_sha, 40):
        raise AutoShipError("cannot hydrate a stage receipt without exact release/source SHAs")
    if not staged_build_id or not active_build_id or not live_build_version:
        raise AutoShipError("cannot hydrate a stage receipt without exact live build identity")
    if production.get("wolo_8092_count") != 1 or production.get("wolo_8093_count") != 1:
        raise AutoShipError("cannot hydrate while protected WOLO listener counts are unsafe")

    script = remote_stage_hydration_script(
        release_sha=release_sha,
        staged_build_id=staged_build_id,
        previous_sha=str(previous_sha),
        active_build_id=str(active_build_id),
        live_build_version=str(live_build_version),
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=180,
    )
    result = parse_kv(p.stdout or "")
    if p.returncode != 0:
        count = result.get("match_count")
        if count is not None and count != "1":
            raise AutoShipError(
                "cross-host stage recovery requires exactly one durable receipt; "
                f"found {count}"
            )
        detail = ((p.stderr or "") or (p.stdout or "")).strip()
        raise AutoShipError(
            "durable stage receipt verification failed"
            + (f": {detail}" if detail else "")
        )

    (
        manifest_bytes,
        gate_bytes,
        stage_receipt_bytes,
        manifest,
        _gate,
        receipt,
    ) = validate_hydrated_stage_evidence(
        result,
        release_sha=release_sha,
        staged_build_id=staged_build_id,
        production=production,
    )

    gate_path = (ROOT / str(manifest["gate"]["receipt_path"])).resolve()
    manifest_path = MANIFEST_DIR / f"{release_sha}.json"
    manifest_digest_path = manifest_path.with_suffix(".json.sha256")
    stage_path = STAGE_RECEIPT_DIR / (
        f"{release_sha}-{receipt['artifact_sha256'][:12]}.json"
    )
    _install_exact_bytes(gate_path, gate_bytes)
    _install_exact_bytes(manifest_path, manifest_bytes)
    _install_exact_bytes(
        manifest_digest_path,
        f"{result['manifest_sha256']}  {manifest_path.name}\n".encode(),
    )
    _install_exact_bytes(stage_path, stage_receipt_bytes)

    try:
        load_stage_receipt(str(stage_path))
    except Exception as exc:
        raise AutoShipError(
            f"hydrated stage receipt failed the activation contract: {exc}"
        ) from exc
    return stage_path


def resolve_stage_receipt(
    release_sha: str,
    staged_build_id: str,
    production: dict,
) -> tuple[Path, bool]:
    try:
        return latest_stage_receipt(release_sha, staged_build_id), False
    except AutoShipError:
        return hydrate_stage_receipt(release_sha, staged_build_id, production), True


def route_proof() -> None:
    for path in ("/", "/api/lobby", "/api/bets", "/api/deployment-version"):
        url = PUBLIC.rstrip("/") + path
        p = run(
            [
                "curl",
                "-fsS",
                "--connect-timeout",
                "4",
                "--max-time",
                "12",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                url,
            ],
            timeout=15,
        )
        status = (p.stdout or "").strip()

        if p.returncode != 0 or status != "200":
            detail = (
                (p.stderr or "")
                or status
                or f"curl exit {p.returncode}"
            ).strip()

            raise AutoShipError(
                f"public route failed: {path} -> {detail}"
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
    if prod.get("wolo_8092_count") != 1:
        errors.append("WOLO 8092 listener count is not exactly 1 after ship")
    if prod.get("wolo_8093_count") != 1:
        errors.append("WOLO 8093 listener count is not exactly 1 after ship")
    if cert.get("status") != "CERTIFIED":
        errors.append("active runtime does not have matching certified provenance")
    if cert.get("release_sha") != release_sha:
        errors.append("certification receipt does not bind shipped release")

    return errors


def activate_and_certify(
    *,
    collect: Callable[[], dict],
    release_head: str,
    stage_receipt: Path,
) -> int:
    apply_production_migrations_if_needed(release_head)
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
    print("== ACTIVATE SOURCE + BUILD + RUNTIME, THEN CERTIFY ==")
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
        staged_build_id = initial["production"].get("staged_build_id")
        if staged_build_id:
            release_head = str(initial["local"]["head"])
            print("== RESUME EXACT STAGED RELEASE ==")
            stage_receipt, hydrated = resolve_stage_receipt(
                release_head,
                str(staged_build_id),
                initial["production"],
            )
            print(f"Release HEAD:   {release_head}")
            print(f"Staged build:   {staged_build_id}")
            print(f"Stage receipt:  {stage_receipt.relative_to(ROOT)}")
            if hydrated:
                print("Receipt source: durable VPS evidence (rehydrated and re-verified)")
            print("Resume policy:  exact receipt + artifact only; no rebuild or republish")
            return activate_and_certify(
                collect=collect,
                release_head=release_head,
                stage_receipt=stage_receipt,
            )

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

        staged_data = collect()
        staged_build_id = staged_data["production"].get("staged_build_id")
        if not staged_build_id:
            raise AutoShipError(
                "stage reported success but production has no staged BUILD_ID"
            )
        stage_receipt, hydrated = resolve_stage_receipt(
            release_head,
            str(staged_build_id),
            staged_data["production"],
        )
        print(f"Stage receipt:  {stage_receipt.relative_to(ROOT)}")
        if hydrated:
            print("Receipt source: durable VPS evidence (rehydrated and re-verified)")
        return activate_and_certify(
            collect=collect,
            release_head=release_head,
            stage_receipt=stage_receipt,
        )

    except (
        AutoShipError,
        OSError,
        subprocess.SubprocessError,
    ) as exc:
        print(f"STOP: ONE-COMMAND SHIP FAILED: {exc}")
        return 2
