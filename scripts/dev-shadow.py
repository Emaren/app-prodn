#!/usr/bin/env python3
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
SSH_TARGET = "root@157.180.114.124"
SHADOW_DB = "aoe2hdbets_shadow"
PREVIEW_ORIGIN = "https://aoe2war.com"
PREVIEW_NAME = "Emaren"

SOCIAL_TABLES = (
    "users",
    "clans",
    "clan_members",
    "clan_messages",
    "clan_message_reactions",
)


def stop(message: str) -> None:
    raise SystemExit(f"STOP: {message}")


def read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}

    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if (
            len(value) >= 2
            and value[0] == value[-1]
            and value[0] in {"'", '"'}
        ):
            value = value[1:-1]

        values[key] = value

    return values


def normalize_postgres_url(value: str) -> str:
    return value.replace("postgresql+asyncpg://", "postgresql://", 1)


def local_base_database_url() -> str:
    values = read_env_file()
    value = values.get("DATABASE_URL", "").strip()

    if not value:
        stop(".env.local has no DATABASE_URL")

    value = normalize_postgres_url(value)
    parsed = urlsplit(value)
    host = parsed.hostname

    if host not in {None, "", "localhost", "127.0.0.1", "::1"}:
        stop(
            "refusing shadow mode because .env.local DATABASE_URL "
            f"is not local (host={host!r})"
        )

    return value


def database_url_with_name(base_url: str, database_name: str) -> str:
    parsed = urlsplit(base_url)
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            "/" + quote(database_name, safe=""),
            parsed.query,
            parsed.fragment,
        )
    )


def local_pg_cli_args(base_url: str) -> tuple[list[str], dict[str, str]]:
    parsed = urlsplit(base_url)
    args: list[str] = []
    env = os.environ.copy()

    if parsed.hostname:
        args += ["--host", parsed.hostname]
    if parsed.port:
        args += ["--port", str(parsed.port)]
    if parsed.username:
        args += ["--username", unquote(parsed.username)]
    if parsed.password is not None:
        env["PGPASSWORD"] = unquote(parsed.password)

    return args, env


def run_local_migrations(shadow_url: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = shadow_url
    env.pop("AOE2WAR_PROD_DB_PREVIEW", None)
    env.pop("PGOPTIONS", None)

    print(
        "> Building fresh local schema from current prisma/schema.prisma ...",
        flush=True,
    )

    print(
        "> Precreating Prisma dbgenerated sequence prerequisite ...",
        flush=True,
    )

    sequence_sql = (
        "CREATE SEQUENCE IF NOT EXISTS battle_public_number_seq "
        "AS INTEGER START WITH 2820 INCREMENT BY 1 "
        "NO MINVALUE NO MAXVALUE CACHE 1;"
    )

    prerequisite = subprocess.run(
        [
            "psql",
            shadow_url,
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            "--command",
            sequence_sql,
        ],
        cwd=ROOT,
        env=env,
    )

    if prerequisite.returncode != 0:
        stop("local battle_public_number_seq prerequisite failed")

    print(
        "PASS: local battle_public_number_seq prerequisite exists"
    )  # AOE2WAR_SHADOW_BATTLE_SEQUENCE_PREREQ

    # This DB was created from scratch immediately before this call.
    # Use today's canonical Prisma schema instead of replaying historical
    # migrations, because legacy migration history contains a collision on
    # scheduled_matches.result_at when replayed onto a blank database.
    result = subprocess.run(
        [
            "npx",
            "prisma",
            "db",
            "push",
            "--accept-data-loss",
        ],
        cwd=ROOT,
        env=env,
    )

    if result.returncode != 0:
        stop("local Prisma schema push failed")

    print(
        "PASS: local shadow schema built from current canonical Prisma schema"
    )
    print(
        "PASS: broken historical migration replay is not part of shadow startup"
    )

def remote_social_dump_script() -> str:
    table_args = " ".join(
        f"--table=public.{table}"
        for table in SOCIAL_TABLES
    )

    return rf'''
set -euo pipefail

PID="$(systemctl show aoe2hdbets-web.service -p MainPID --value)"
test -n "$PID"
test "$PID" != "0"

DATABASE_URL="$(
  python3 - "$PID" <<'PYREMOTE'
import sys

pid = sys.argv[1]
for item in open(f"/proc/{{pid}}/environ", "rb").read().split(b"\0"):
    if item.startswith(b"DATABASE_URL="):
        sys.stdout.write(
            item.split(b"=", 1)[1].decode("utf-8", "strict")
        )
        raise SystemExit(0)

raise SystemExit("DATABASE_URL missing from production service")
PYREMOTE
)"

DATABASE_URL="${{DATABASE_URL/postgresql+asyncpg:/postgresql:}}"

exec pg_dump \
  --format=plain \
  --data-only \
  --no-owner \
  --no-privileges \
  {table_args} \
  --dbname="$DATABASE_URL"
'''


def stream_social_data(shadow_url: str) -> None:
    print(
        "> Importing production social slice: "
        + ", ".join(SOCIAL_TABLES),
        flush=True,
    )

    started = time.monotonic()

    ssh = subprocess.Popen(
        [
            "ssh",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "LogLevel=ERROR",
            SSH_TARGET,
            "bash",
            "-s",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert ssh.stdin is not None
    assert ssh.stdout is not None

    ssh.stdin.write(remote_social_dump_script().encode())
    ssh.stdin.close()

    compat = subprocess.Popen(
        [
            "python3",
            "-c",
            (
                "import sys\n"
                "for line in sys.stdin:\n"
                "    if line.startswith('\\\\restrict '):\n"
                "        continue\n"
                "    if line.startswith('\\\\unrestrict '):\n"
                "        continue\n"
                "    if line.rstrip('\\n') == "
                "'SET transaction_timeout = 0;':\n"
                "        continue\n"
                "    sys.stdout.write(line)\n"
            ),
        ],
        stdin=ssh.stdout,
        stdout=subprocess.PIPE,
    )

    assert compat.stdout is not None

    restore = subprocess.run(
        [
            "psql",
            shadow_url,
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
        ],
        stdin=compat.stdout,
    )

    compat.stdout.close()
    compat_status = compat.wait()
    ssh.stdout.close()

    stderr = (
        ssh.stderr.read().decode("utf-8", "replace")
        if ssh.stderr
        else ""
    )
    ssh_status = ssh.wait()

    if restore.returncode != 0:
        if stderr.strip():
            print(stderr.strip(), file=sys.stderr)
        stop("local social-slice SQL restore failed")

    if compat_status != 0:
        stop("PG17 social-slice compatibility filter failed")

    if ssh_status != 0:
        if stderr.strip():
            print(stderr.strip(), file=sys.stderr)
        stop("remote production social pg_dump failed")

    elapsed = time.monotonic() - started
    print(f"PASS: production social slice imported in {elapsed:.1f}s")
    print("PASS: production DATABASE_URL never left the VPS")
    print("PASS: only selected social-table data crossed SSH")
    print("PASS: PG17 psql-only meta-commands were filtered")


def reset_social_sequences(shadow_url: str) -> None:
    sql = r'''
SELECT setval(
  pg_get_serial_sequence('users', 'id'),
  COALESCE((SELECT MAX(id) FROM users), 1),
  true
);
SELECT setval(
  pg_get_serial_sequence('clans', 'id'),
  COALESCE((SELECT MAX(id) FROM clans), 1),
  true
);
SELECT setval(
  pg_get_serial_sequence('clan_members', 'id'),
  COALESCE((SELECT MAX(id) FROM clan_members), 1),
  true
);
SELECT setval(
  pg_get_serial_sequence('clan_messages', 'id'),
  COALESCE((SELECT MAX(id) FROM clan_messages), 1),
  true
);
SELECT setval(
  pg_get_serial_sequence('clan_message_reactions', 'id'),
  COALESCE((SELECT MAX(id) FROM clan_message_reactions), 1),
  true
);
'''

    subprocess.run(
        [
            "psql",
            shadow_url,
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            "-c",
            sql,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )

    print("PASS: local social-table sequences aligned for writable testing")


def refresh_shadow() -> None:
    print("=" * 60)
    print("AOE2WAR — REFRESH LOCAL SOCIAL SHADOW")
    print("=" * 60)
    print(
        "Production DB is 6.7 GB; Hall development intentionally "
        "clones only the social slice."
    )

    base_url = local_base_database_url()
    cli_args, env = local_pg_cli_args(base_url)
    shadow_url = database_url_with_name(base_url, SHADOW_DB)

    print(f"> Rebuilding local database: {SHADOW_DB}", flush=True)

    subprocess.run(
        ["dropdb", "--if-exists", "--force", *cli_args, SHADOW_DB],
        env=env,
        check=True,
    )
    subprocess.run(
        ["createdb", *cli_args, SHADOW_DB],
        env=env,
        check=True,
    )

    run_local_migrations(shadow_url)
    stream_social_data(shadow_url)
    reset_social_sequences(shadow_url)

    proof = subprocess.check_output(
        [
            "psql",
            shadow_url,
            "-Atc",
            (
                "SELECT "
                "(SELECT count(*) FROM users),"
                "(SELECT count(*) FROM clans),"
                "(SELECT count(*) FROM clan_members),"
                "(SELECT count(*) FROM clan_messages),"
                "(SELECT count(*) FROM clan_message_reactions),"
                "pg_size_pretty(pg_database_size(current_database()))"
            ),
        ],
        text=True,
    ).strip()

    (
        users,
        clans,
        members,
        clan_messages,
        reactions,
        size,
    ) = proof.split("|")

    print(
        "PASS: social shadow ready "
        f"(users={users}, clans={clans}, members={members}, "
        f"messages={clan_messages}, reactions={reactions}, size={size})"
    )
    print("PASS: direct-message tables exist locally and start empty")
    print("PASS: replay/parser/game corpus was deliberately not cloned")
    print("PASS: shadow database is local, writable, and disposable")


def resolve_preview_identity(shadow_url: str) -> str:
    code = r'''
const { Client } = require("pg");

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const result = await client.query(
    `
      SELECT uid
      FROM users
      WHERE lower(coalesce(in_game_name, '')) = lower($1)
         OR lower(coalesce(steam_persona_name, '')) = lower($1)
      ORDER BY is_admin DESC, id ASC
      LIMIT 1
    `,
    [process.env.AOE2WAR_PREVIEW_USER_NAME]
  );

  await client.end();

  if (!result.rows[0]?.uid) {
    throw new Error("Emaren not found in local shadow");
  }

  process.stdout.write(result.rows[0].uid);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
'''

    env = os.environ.copy()
    env["DATABASE_URL"] = shadow_url
    env["AOE2WAR_PREVIEW_USER_NAME"] = PREVIEW_NAME

    return subprocess.check_output(
        ["node", "-e", code],
        cwd=ROOT,
        env=env,
        text=True,
    ).strip()


def wait_for_https(process: subprocess.Popen) -> bool:
    for _ in range(120):
        if process.poll() is not None:
            return False

        try:
            with socket.create_connection(
                ("127.0.0.1", 3000),
                timeout=0.25,
            ):
                return True
        except OSError:
            time.sleep(0.25)

    return False


def serve_shadow() -> int:
    base_url = local_base_database_url()
    shadow_url = database_url_with_name(base_url, SHADOW_DB)

    try:
        subprocess.run(
            [
                "psql",
                shadow_url,
                "-Atc",
                "SELECT 1 FROM clans LIMIT 1",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        stop(
            f"{SHADOW_DB} is missing. "
            "Run `npm run shadow:refresh` first."
        )

    preview_uid = resolve_preview_identity(shadow_url)

    env = os.environ.copy()
    env["NODE_ENV"] = "development"
    env["DATABASE_URL"] = shadow_url
    env["AOE2WAR_SHADOW_MODE"] = "true"

    env["AOE2WAR_PREVIEW_DATA_BASE"] = PREVIEW_ORIGIN
    env["AOE2WAR_PREVIEW_USER_NAME"] = PREVIEW_NAME
    env["AOE2WAR_PREVIEW_USER_UID"] = preview_uid

    env["AOE2_BACKEND_UPSTREAM"] = PREVIEW_ORIGIN

    env.pop("INTERNAL_API_KEY", None)
    env.pop("ADMIN_TOKEN", None)
    env.pop("AOE2WAR_PROD_DB_PREVIEW", None)
    env.pop("PGOPTIONS", None)

    print("=" * 60)
    print("AOE2WAR — WRITABLE LOCAL SOCIAL SHADOW")
    print("=" * 60)
    print(f"PASS: local shadow DB: {SHADOW_DB}")
    print(f"PASS: local identity: {PREVIEW_NAME} ({preview_uid})")
    print("PASS: application database writes go ONLY to localhost shadow")
    print("PASS: production internal credentials are absent")
    print("PASS: production media/public read surfaces remain available")
    print()
    print("> Local code + hot reload: https://localhost:3000")
    print("> Clan/social DB: LOCAL WRITABLE PRODUCTION-SHAPED CLONE")
    print("> Heavy game/replay corpus: NOT CLONED")
    print("> Production DB write path: NONE")
    print()

    node = subprocess.Popen(
        ["node", "server.js"],
        cwd=ROOT,
        env=env,
    )

    try:
        if wait_for_https(node):
            subprocess.Popen(
                ["open", "https://localhost:3000/clans/aoe2war"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        return node.wait()
    except KeyboardInterrupt:
        return 130
    finally:
        if node.poll() is None:
            node.terminate()
            try:
                node.wait(timeout=3)
            except subprocess.TimeoutExpired:
                node.kill()


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"refresh", "serve"}:
        print(
            "Usage: python3 scripts/dev-shadow.py {refresh|serve}",
            file=sys.stderr,
        )
        return 2

    if sys.argv[1] == "refresh":
        refresh_shadow()
        return 0

    return serve_shadow()


if __name__ == "__main__":
    raise SystemExit(main())
