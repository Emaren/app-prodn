#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import (
    quote,
    urlsplit,
    urlunsplit,
)

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
CONTRACT_FILE = (
    ROOT
    / "config"
    / "aoe2war-operations.json"
)

BASE_ROOTS = (
    "users",
    "clans",
    "clan_members",
    "clan_messages",
    "clan_message_reactions",
    "ai_agents",
    "ai_request_traces",
    "betting_bot_configs",
    "bet_counter_actions",
    "marketplace_shops",
    "marketplace_inquiries",
    "marketplace_invoices",
    "marketplace_payments",
    "marketplace_tax_payments",
    "managed_media_assets",
    "workshop_status",
    "workshop_entries",
    "workshop_artifacts",
    "workshop_streams",
)

CHAT_AUXILIARY_ROOTS = (
    "chat_message_reactions",
    "chat_message_guest_reactions",
)

BOUNDED_TABLE = "user_activity_events"

# Generic activity remains bounded for speed. These
# sparse Marketplace events remain durable because
# they are current profile/operator control-plane truth,
# not disposable analytics history.
REQUIRED_ACTIVITY_TYPES = (
    "market_shop_proposal",
    "market_avatar_commission",
)


class ShadowError(RuntimeError):
    pass


def stop(message: str) -> None:
    raise ShadowError(message)


def load_contract() -> dict:
    return json.loads(
        CONTRACT_FILE.read_text()
    )


def development_contract() -> dict:
    return dict(
        load_contract().get(
            "development"
        )
        or {}
    )


def canonical_contract() -> dict:
    return dict(
        load_contract()["canonical"]
    )


def read_env_file() -> dict[str, str]:
    if not ENV_FILE.is_file():
        stop(
            f"local environment missing: {ENV_FILE}"
        )

    values: dict[str, str] = {}

    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()

        if (
            not line
            or line.startswith("#")
            or "=" not in line
        ):
            continue

        key, value = line.split(
            "=",
            1,
        )

        value = value.strip()

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {
                "'",
                '"',
            }
        ):
            value = value[1:-1]

        values[key.strip()] = value

    return values


def normalize_postgres_url(
    value: str,
) -> str:
    return value.replace(
        "postgresql+asyncpg://",
        "postgresql://",
        1,
    )


def local_base_database_url() -> str:
    value = (
        read_env_file()
        .get(
            "DATABASE_URL",
            "",
        )
        .strip()
    )

    if not value:
        stop(
            ".env.local has no DATABASE_URL"
        )

    value = normalize_postgres_url(
        value
    )

    parsed = urlsplit(value)

    if parsed.hostname not in {
        None,
        "",
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        stop(
            "refusing shadow mode because "
            "DATABASE_URL is not localhost"
        )

    return value


def database_url_with_name(
    base_url: str,
    database_name: str,
) -> str:
    parsed = urlsplit(base_url)

    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            "/"
            + quote(
                database_name,
                safe="",
            ),
            parsed.query,
            parsed.fragment,
        )
    )


def app_role_from_url(
    base_url: str,
) -> str:
    username = urlsplit(
        base_url
    ).username

    if not username:
        stop(
            "local DATABASE_URL has no username"
        )

    return username


def local_admin_env(
    base_url: str,
) -> dict[str, str]:
    parsed = urlsplit(base_url)

    env = os.environ.copy()

    for key in (
        "PGHOST",
        "PGUSER",
        "PGPASSWORD",
        "PGDATABASE",
        "PGSERVICE",
        "PGSERVICEFILE",
    ):
        env.pop(
            key,
            None,
        )

    if parsed.port:
        env["PGPORT"] = str(
            parsed.port
        )
    else:
        env.pop(
            "PGPORT",
            None,
        )

    return env


def admin_psql(
    base_url: str,
    *,
    database: str,
    sql: str,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "psql",
            "--no-psqlrc",
            "--dbname",
            database,
            "--set",
            "ON_ERROR_STOP=1",
            "-c" if not capture else "-Atc",
            sql,
        ],
        cwd=ROOT,
        env=local_admin_env(
            base_url
        ),
        text=True,
        stdout=(
            subprocess.PIPE
            if capture
            else None
        ),
        stderr=(
            subprocess.PIPE
            if capture
            else None
        ),
        check=False,
    )


def prove_bootstrap_authority(
    base_url: str,
) -> str:
    result = admin_psql(
        base_url,
        database="postgres",
        sql=(
            "SELECT "
            "current_user || '|' || "
            "rolsuper::text || '|' || "
            "rolcreatedb::text "
            "FROM pg_roles "
            "WHERE rolname=current_user;"
        ),
    )

    if result.returncode != 0:
        stop(
            "cannot query local PostgreSQL "
            "bootstrap authority: "
            + result.stderr[-2000:]
        )

    pieces = result.stdout.strip().split(
        "|"
    )

    if len(pieces) != 3:
        stop(
            "local PostgreSQL bootstrap "
            "proof was malformed"
        )

    user, is_super, can_createdb = pieces

    if is_super not in {
        "t",
        "true",
    }:
        stop(
            "local shadow restore requires "
            "a local PostgreSQL superuser"
        )

    if can_createdb not in {
        "t",
        "true",
    }:
        stop(
            "local bootstrap authority "
            "cannot create databases"
        )

    return user


def prove_app_role(
    base_url: str,
    app_role: str,
) -> None:
    safe_role = app_role.replace(
        "'",
        "''",
    )

    result = admin_psql(
        base_url,
        database="postgres",
        sql=(
            "SELECT "
            "rolname || '|' || "
            "rolcreatedb::text "
            "FROM pg_roles "
            f"WHERE rolname='{safe_role}';"
        ),
    )

    if result.returncode != 0:
        stop(
            "cannot inspect local application role"
        )

    proof = result.stdout.strip()

    if not proof:
        stop(
            "local application PostgreSQL "
            f"role is missing: {app_role}"
        )

    role, createdb = proof.split(
        "|",
        1,
    )

    if role != app_role:
        stop(
            "unexpected local application role"
        )

    if createdb in {
        "t",
        "true",
    }:
        stop(
            f"{app_role} unexpectedly has CREATEDB; "
            "least-privilege contract violated"
        )


def rebuild_shadow_database(
    base_url: str,
    *,
    database_name: str,
    app_role: str,
) -> None:
    if not database_name.replace(
        "_",
        "",
    ).isalnum():
        stop(
            "unsafe shadow database identifier"
        )

    if not app_role.replace(
        "_",
        "",
    ).isalnum():
        stop(
            "unsafe shadow role identifier"
        )

    drop = admin_psql(
        base_url,
        database="postgres",
        sql=(
            "DROP DATABASE IF EXISTS "
            f'"{database_name}" '
            "WITH (FORCE);"
        ),
        capture=False,
    )

    if drop.returncode != 0:
        stop(
            "local bootstrap authority "
            "could not drop disposable shadow"
        )

    create = admin_psql(
        base_url,
        database="postgres",
        sql=(
            "CREATE DATABASE "
            f'"{database_name}" '
            "OWNER "
            f'"{app_role}";'
        ),
        capture=False,
    )

    if create.returncode != 0:
        stop(
            "local bootstrap authority "
            "could not create disposable shadow"
        )


def run_local_schema(
    shadow_url: str,
) -> None:
    env = os.environ.copy()

    env["DATABASE_URL"] = shadow_url

    env.pop(
        "AOE2WAR_PROD_DB_PREVIEW",
        None,
    )
    env.pop(
        "PGOPTIONS",
        None,
    )

    prerequisite = subprocess.run(
        [
            "psql",
            shadow_url,
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            "--command",
            (
                "CREATE SEQUENCE IF NOT EXISTS "
                "battle_public_number_seq "
                "AS INTEGER "
                "START WITH 2820 "
                "INCREMENT BY 1 "
                "NO MINVALUE "
                "NO MAXVALUE "
                "CACHE 1;"
            ),
        ],
        cwd=ROOT,
        env=env,
        check=False,
    )

    if prerequisite.returncode != 0:
        stop(
            "local sequence prerequisite failed"
        )

    schema = subprocess.run(
        [
            "npx",
            "prisma",
            "db",
            "push",
            "--accept-data-loss",
        ],
        cwd=ROOT,
        env=env,
        check=False,
    )

    if schema.returncode != 0:
        stop(
            "current Prisma schema could not "
            "build the local shadow"
        )


def query_lines(
    database_url: str,
    sql: str,
) -> list[str]:
    result = subprocess.run(
        [
            "psql",
            database_url,
            "--no-psqlrc",
            "-Atc",
            sql,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.returncode != 0:
        stop(
            "local PostgreSQL query failed: "
            + result.stderr[-2000:]
        )

    return [
        line
        for line in result.stdout.splitlines()
        if line.strip()
    ]


def local_public_tables(
    shadow_url: str,
) -> set[str]:
    return set(
        query_lines(
            shadow_url,
            (
                "SELECT tablename "
                "FROM pg_tables "
                "WHERE schemaname='public';"
            ),
        )
    )


def local_fk_pairs(
    shadow_url: str,
) -> list[tuple[str, str]]:
    lines = query_lines(
        shadow_url,
        """
SELECT
  source.relname || '|' ||
  target.relname
FROM pg_constraint constraint_row
JOIN pg_class source
  ON source.oid=constraint_row.conrelid
JOIN pg_namespace source_ns
  ON source_ns.oid=source.relnamespace
JOIN pg_class target
  ON target.oid=constraint_row.confrelid
JOIN pg_namespace target_ns
  ON target_ns.oid=target.relnamespace
WHERE constraint_row.contype='f'
  AND source_ns.nspname='public'
  AND target_ns.nspname='public';
""",
    )

    result = []

    for line in lines:
        source, target = line.split(
            "|",
            1,
        )

        result.append(
            (
                source,
                target,
            )
        )

    return result


def compute_fk_closure(
    roots: set[str],
    pairs: list[tuple[str, str]],
) -> set[str]:
    closure = set(roots)

    changed = True

    while changed:
        changed = False

        for source, target in pairs:
            if (
                source in closure
                and target not in closure
            ):
                closure.add(
                    target
                )
                changed = True

    return closure


def desired_snapshot_tables(
    shadow_url: str,
) -> set[str]:
    available = local_public_tables(
        shadow_url
    )

    roots = {
        table
        for table in BASE_ROOTS
        if table in available
    }

    roots.update(
        table
        for table in CHAT_AUXILIARY_ROOTS
        if table in available
    )

    roots.update(
        table
        for table in available
        if table.startswith(
            "direct_"
        )
    )

    roots.discard(
        BOUNDED_TABLE
    )

    return compute_fk_closure(
        roots,
        local_fk_pairs(
            shadow_url
        ),
    )


def remote_target() -> str:
    host = canonical_contract()[
        "production_host"
    ]

    if "@" in host:
        return host

    return "root@" + host


def remote_db_prefix() -> str:
    service = shlex.quote(
        canonical_contract()["service"]
    )

    # Deliberately NOT an f-string. Bash ${...} parameter
    # expansion must remain literal and must never be parsed
    # as a Python expression.
    template = r"""
set -euo pipefail

PID="$(
  systemctl show \
    __AOE2WAR_SERVICE__ \
    -p MainPID \
    --value
)"

test -n "$PID"
test "$PID" != "0"

DATABASE_URL="$(
python3 - "$PID" <<'PYREMOTE'
import sys

pid = sys.argv[1]

for item in open(
    f"/proc/{pid}/environ",
    "rb",
).read().split(b"\0"):
    if item.startswith(
        b"DATABASE_URL="
    ):
        sys.stdout.write(
            item.split(
                b"=",
                1,
            )[1].decode(
                "utf-8",
                "strict",
            )
        )
        raise SystemExit(0)

raise SystemExit(
    "DATABASE_URL missing from "
    "production web service"
)
PYREMOTE
)"

DATABASE_URL="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
"""

    return template.replace(
        "__AOE2WAR_SERVICE__",
        service,
    )


def remote_table_inventory() -> set[str]:
    script = (
        remote_db_prefix()
        + r'''
exec psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --dbname="$DATABASE_URL" \
  --command="
    SELECT tablename
    FROM pg_tables
    WHERE schemaname='public'
    ORDER BY tablename;
  "
'''
    )

    result = subprocess.run(
        [
            "ssh",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "LogLevel=ERROR",
            remote_target(),
            "bash",
            "-s",
        ],
        cwd=ROOT,
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.returncode != 0:
        stop(
            "cannot inventory production "
            "tables: "
            + result.stderr[-3000:]
        )

    return {
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip()
    }


def compatible_pg_dump_stream(
    tables: list[str],
) -> subprocess.Popen[bytes]:
    for table in tables:
        if not table.replace(
            "_",
            "",
        ).isalnum():
            stop(
                "unsafe PostgreSQL table identifier: "
                + table
            )

    args = [
        "pg_dump",
        "--format=plain",
        "--data-only",
        "--no-owner",
        "--no-privileges",
        "--disable-triggers",
    ]

    args.extend(
        f"--table=public.{table}"
        for table in tables
    )

    dump_command = (
        " ".join(
            shlex.quote(value)
            for value in args
        )
        + ' --dbname="$DATABASE_URL"'
    )

    script = (
        remote_db_prefix()
        + "\nexec "
        + dump_command
        + "\n"
    )

    ssh = subprocess.Popen(
        [
            "ssh",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "LogLevel=ERROR",
            remote_target(),
            "bash",
            "-s",
        ],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert ssh.stdin is not None
    assert ssh.stdout is not None

    ssh.stdin.write(
        script.encode()
    )
    ssh.stdin.close()

    return ssh


def is_pg_dump_compatibility_line(
    line: bytes,
) -> bool:
    """Return True for PG17 dump lines unsupported by older psql."""
    stripped = line.rstrip(
        b"\r\n"
    )

    return (
        line.startswith(
            b"\\restrict "
        )
        or line.startswith(
            b"\\unrestrict "
        )
        or stripped
        == b"SET transaction_timeout = 0;"
    )


def restore_snapshot(
    base_url: str,
    *,
    database_name: str,
    tables: list[str],
) -> None:
    ssh = compatible_pg_dump_stream(
        tables
    )

    assert ssh.stdout is not None

    # Restore through the LOCAL PostgreSQL bootstrap authority.
    # The application role remains NOCREATEDB and receives no
    # production credential. Superuser restore is required because
    # pg_dump --disable-triggers protects circular FK graphs.
    restore = subprocess.Popen(
        [
            "psql",
            "--no-psqlrc",
            "--dbname",
            database_name,
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
        ],
        cwd=ROOT,
        env=local_admin_env(
            base_url
        ),
        stdin=subprocess.PIPE,
    )

    assert restore.stdin is not None

    filtered = 0
    pipe_failed = False

    try:
        for line in ssh.stdout:
            if is_pg_dump_compatibility_line(
                line
            ):
                filtered += 1
                continue

            try:
                restore.stdin.write(
                    line
                )
            except BrokenPipeError:
                pipe_failed = True
                break
    finally:
        try:
            restore.stdin.close()
        except BrokenPipeError:
            pipe_failed = True

        ssh.stdout.close()

    restore_status = restore.wait()

    remote_stderr = (
        ssh.stderr.read().decode(
            "utf-8",
            "replace",
        )
        if ssh.stderr
        else ""
    )

    ssh_status = ssh.wait()

    if restore_status != 0:
        if remote_stderr.strip():
            print(
                remote_stderr.strip(),
                file=sys.stderr,
            )

        stop(
            "local snapshot restore failed"
        )

    if pipe_failed:
        stop(
            "local psql closed the production "
            "snapshot stream unexpectedly"
        )

    if ssh_status != 0:
        if remote_stderr.strip():
            print(
                remote_stderr.strip(),
                file=sys.stderr,
            )

        stop(
            "production pg_dump failed"
        )

    print(
        "PASS: PostgreSQL compatibility "
        f"filter removed {filtered} "
        "PG17-only command(s)"
    )


def stream_bounded_table(
    shadow_url: str,
    *,
    table: str,
    limit: int,
) -> int:
    if limit <= 0:
        return 0

    if not table.replace(
        "_",
        "",
    ).isalnum():
        stop(
            "unsafe bounded table identifier"
        )

    script = (
        remote_db_prefix()
        + f'''
exec psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --dbname="$DATABASE_URL" \
  --command="
    COPY (
      SELECT *
      FROM public.{table}
      ORDER BY id DESC
      LIMIT {int(limit)}
    )
    TO STDOUT;
  "
'''
    )

    ssh = subprocess.Popen(
        [
            "ssh",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "LogLevel=ERROR",
            remote_target(),
            "bash",
            "-s",
        ],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert ssh.stdin is not None
    assert ssh.stdout is not None

    ssh.stdin.write(
        script.encode()
    )
    ssh.stdin.close()

    local = subprocess.run(
        [
            "psql",
            shadow_url,
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            "--command",
            (
                f"COPY public.{table} "
                "FROM STDIN;"
            ),
        ],
        cwd=ROOT,
        stdin=ssh.stdout,
        check=False,
    )

    ssh.stdout.close()

    stderr = (
        ssh.stderr.read().decode(
            "utf-8",
            "replace",
        )
        if ssh.stderr
        else ""
    )

    ssh_status = ssh.wait()

    if local.returncode != 0:
        stop(
            f"bounded {table} local COPY failed"
        )

    if ssh_status != 0:
        if stderr.strip():
            print(
                stderr.strip(),
                file=sys.stderr,
            )

        stop(
            f"bounded {table} production "
            "COPY failed"
        )

    count = int(
        query_lines(
            shadow_url,
            f"SELECT count(*) FROM {table};",
        )[0]
    )

    return count


def stream_required_activity_events(
    shadow_url: str,
    *,
    table: str = BOUNDED_TABLE,
) -> int:
    if not REQUIRED_ACTIVITY_TYPES:
        return 0

    if not table.replace(
        "_",
        "",
    ).isalnum():
        stop(
            "unsafe required activity table identifier"
        )

    before = int(
        query_lines(
            shadow_url,
            f"SELECT count(*) FROM {table};",
        )[0]
    )

    min_rows = query_lines(
        shadow_url,
        (
            "SELECT COALESCE(MIN(id),0) "
            f"FROM {table};"
        ),
    )

    local_min_id = (
        int(min_rows[0])
        if min_rows
        else 0
    )

    quoted_types = ", ".join(
        "'" +
        value.replace(
            "'",
            "''",
        ) +
        "'"
        for value
        in REQUIRED_ACTIVITY_TYPES
    )

    older_clause = (
        f"AND id < {local_min_id}"
        if local_min_id > 0
        else ""
    )

    script = (
        remote_db_prefix()
        + f'''
exec psql \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --dbname="$DATABASE_URL" \
  --command="
    COPY (
      SELECT *
      FROM public.{table}
      WHERE type IN ({quoted_types})
        {older_clause}
      ORDER BY id ASC
    )
    TO STDOUT;
  "
'''
    )

    ssh = subprocess.Popen(
        [
            "ssh",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "LogLevel=ERROR",
            remote_target(),
            "bash",
            "-s",
        ],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert ssh.stdin is not None
    assert ssh.stdout is not None

    ssh.stdin.write(
        script.encode()
    )

    ssh.stdin.close()

    local = subprocess.run(
        [
            "psql",
            shadow_url,
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            "--command",
            (
                f"COPY public.{table} "
                "FROM STDIN;"
            ),
        ],
        cwd=ROOT,
        stdin=ssh.stdout,
        check=False,
    )

    ssh.stdout.close()

    stderr = (
        ssh.stderr.read().decode(
            "utf-8",
            "replace",
        )
        if ssh.stderr
        else ""
    )

    ssh_status = ssh.wait()

    if local.returncode != 0:
        stop(
            f"required {table} local COPY failed"
        )

    if ssh_status != 0:
        if stderr.strip():
            print(
                stderr.strip(),
                file=sys.stderr,
            )

        stop(
            f"required {table} production COPY failed"
        )

    after = int(
        query_lines(
            shadow_url,
            f"SELECT count(*) FROM {table};",
        )[0]
    )

    return max(
        0,
        after - before,
    )


def reset_sequences(
    shadow_url: str,
    tables: list[str],
) -> None:
    aligned = 0

    for table in tables:
        if not table.replace(
            "_",
            "",
        ).isalnum():
            stop(
                "unsafe sequence table identifier: "
                + table
            )

        sequence_rows = query_lines(
            shadow_url,
            (
                "SELECT pg_get_serial_sequence("
                f"'public.{table}',"
                "'id'"
                ");"
            ),
        )

        # UUID/string IDs or tables without an owned sequence
        # legitimately have nothing to align.
        if not sequence_rows:
            continue

        sequence = sequence_rows[0].strip()

        if not sequence:
            continue

        stats = query_lines(
            shadow_url,
            (
                "SELECT "
                "COALESCE(MAX(id),1)::text "
                "|| '|' || "
                "(COUNT(*) > 0)::text "
                f'FROM public."{table}";'
            ),
        )

        if len(stats) != 1 or "|" not in stats[0]:
            stop(
                "sequence statistics were malformed "
                f"for {table}"
            )

        max_id_raw, has_rows_raw = stats[0].split(
            "|",
            1,
        )

        max_id = int(max_id_raw)

        has_rows = has_rows_raw in {
            "t",
            "true",
        }

        sequence_literal = sequence.replace(
            "'",
            "''",
        )

        query_lines(
            shadow_url,
            (
                "SELECT setval("
                f"'{sequence_literal}'::regclass,"
                f"{max_id},"
                + (
                    "true"
                    if has_rows
                    else "false"
                )
                + ");"
            ),
        )

        aligned += 1

    print(
        "PASS: writable local sequences aligned "
        f"({aligned} sequence(s))"
    )


def prove_database_owner(
    base_url: str,
    *,
    database_name: str,
    expected_owner: str,
) -> None:
    result = admin_psql(
        base_url,
        database="postgres",
        sql=(
            "SELECT pg_get_userbyid(datdba) "
            "FROM pg_database "
            f"WHERE datname='{database_name}';"
        ),
    )

    if (
        result.returncode != 0
        or result.stdout.strip()
        != expected_owner
    ):
        stop(
            "shadow database ownership proof failed"
        )


def core_counts(
    shadow_url: str,
) -> dict[str, int]:
    wanted = (
        "users",
        "clans",
        "clan_messages",
        "direct_conversations",
        "direct_messages",
        "direct_message_reactions",
        "marketplace_shops",
        BOUNDED_TABLE,
    )

    available = local_public_tables(
        shadow_url
    )

    result: dict[str, int] = {}

    for table in wanted:
        if table not in available:
            continue

        result[table] = int(
            query_lines(
                shadow_url,
                f"SELECT count(*) FROM {table};",
            )[0]
        )

    return result


def refresh_shadow_v12() -> None:
    started = time.monotonic()

    print("=" * 60)
    print(
        "AOE2WAR — REFRESH LOCAL "
        "PRODUCTION-SHAPED SHADOW V1.2"
    )
    print("=" * 60)

    base_url = (
        local_base_database_url()
    )

    development = (
        development_contract()
    )

    database_name = str(
        development.get(
            "shadow_database"
        )
        or "aoe2hdbets_shadow"
    )

    configured_role = str(
        development.get(
            "shadow_app_role"
        )
        or "aoe2user"
    )

    url_role = app_role_from_url(
        base_url
    )

    if url_role != configured_role:
        stop(
            "DATABASE_URL application role "
            "does not match machine contract: "
            f"{url_role} != {configured_role}"
        )

    bootstrap_user = (
        prove_bootstrap_authority(
            base_url
        )
    )

    prove_app_role(
        base_url,
        configured_role,
    )

    print(
        "PASS: local bootstrap authority = "
        + bootstrap_user
    )

    print(
        "PASS: application role remains "
        f"NOCREATEDB = {configured_role}"
    )

    print(
        "> Rebuilding disposable shadow "
        "through local bootstrap authority..."
    )

    rebuild_shadow_database(
        base_url,
        database_name=database_name,
        app_role=configured_role,
    )

    shadow_url = database_url_with_name(
        base_url,
        database_name,
    )

    print(
        "PASS: disposable database recreated "
        "without elevating application role"
    )

    print(
        "> Building current Prisma schema "
        "as normal application role..."
    )

    run_local_schema(
        shadow_url
    )

    prove_database_owner(
        base_url,
        database_name=database_name,
        expected_owner=configured_role,
    )

    print(
        "PASS: shadow owner = "
        + configured_role
    )

    desired = desired_snapshot_tables(
        shadow_url
    )

    remote_available = (
        remote_table_inventory()
    )

    snapshot_tables = sorted(
        desired
        & remote_available
    )

    local_only = sorted(
        desired
        - remote_available
    )

    if not snapshot_tables:
        stop(
            "production snapshot table "
            "selection is empty"
        )

    print(
        "> Automatic FK-complete "
        "production snapshot:"
    )

    for table in snapshot_tables:
        print(
            "  - "
            + table
        )

    for table in local_only:
        print(
            "NOTE: local-schema-only table "
            "starts empty: "
            + table
        )

    restore_snapshot(
        base_url,
        database_name=database_name,
        tables=snapshot_tables,
    )

    print(
        "PASS: FK-complete production "
        "snapshot restored locally"
    )

    bounded_rows = 0

    activity_limit = int(
        development.get(
            "shadow_activity_event_limit"
        )
        or 0
    )

    local_available = local_public_tables(
        shadow_url
    )

    if (
        BOUNDED_TABLE in local_available
        and BOUNDED_TABLE
        in remote_available
        and activity_limit > 0
    ):
        bounded_rows = (
            stream_bounded_table(
                shadow_url,
                table=BOUNDED_TABLE,
                limit=activity_limit,
            )
        )

        print(
            "PASS: bounded activity history "
            f"restored ({bounded_rows}/"
            f"{activity_limit} max)"
        )

    required_activity_rows = 0

    if (
        BOUNDED_TABLE
        in local_available
        and BOUNDED_TABLE
        in remote_available
    ):
        required_activity_rows = (
            stream_required_activity_events(
                shadow_url,
                table=BOUNDED_TABLE,
            )
        )

        print(
            "PASS: profile-critical Marketplace "
            "activity restored "
            f"(+{required_activity_rows} "
            "historical row(s))"
        )

    sequence_tables = sorted(
        set(snapshot_tables)
        | (
            {
                BOUNDED_TABLE
            }
            if (
                bounded_rows
                or required_activity_rows
            )
            else set()
        )
    )

    reset_sequences(
        shadow_url,
        sequence_tables,
    )

    prove_app_role(
        base_url,
        configured_role,
    )

    prove_database_owner(
        base_url,
        database_name=database_name,
        expected_owner=configured_role,
    )

    counts = core_counts(
        shadow_url
    )

    elapsed = (
        time.monotonic()
        - started
    )

    print()
    print(
        "PASS: production DATABASE_URL "
        "never left the VPS"
    )
    print(
        "PASS: production mutation "
        "credentials never entered local app"
    )
    print(
        "PASS: local app role still "
        "has NOCREATEDB"
    )
    print(
        "PASS: application writes remain "
        "localhost-only"
    )
    print(
        "PASS: automatic FK closure "
        "replaced manual table chasing"
    )

    print(
        "PASS: shadow counts: "
        + ", ".join(
            f"{key}={value}"
            for key, value
            in counts.items()
        )
    )

    print(
        "PASS: shadow refresh completed "
        f"in {elapsed:.1f}s"
    )


if __name__ == "__main__":
    try:
        refresh_shadow_v12()
    except ShadowError as exc:
        print(
            f"STOP: {exc}",
            file=sys.stderr,
        )
        raise SystemExit(2)
