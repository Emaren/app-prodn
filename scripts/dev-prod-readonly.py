#!/usr/bin/env python3

import json
import os
import socket
import subprocess
import sys
import time
from urllib.parse import quote, unquote, urlsplit, urlunsplit

SSH_TARGET = "root@157.180.114.124"
LOCAL_DB_PORT = 55432
PREVIEW_ORIGIN = "https://aoe2war.com"
PREVIEW_NAME = "Emaren"


def stop(message: str) -> None:
    raise SystemExit(f"STOP: {message}")


def read_prod_database_url() -> str:
    remote_script = r'''
set -euo pipefail

PID="$(systemctl show aoe2hdbets-web.service -p MainPID --value)"
test -n "$PID"
test "$PID" != "0"

python3 - "$PID" <<'PYREMOTE'
import sys

pid = sys.argv[1]
items = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")

for item in items:
    if item.startswith(b"DATABASE_URL="):
        sys.stdout.write(
            item.split(b"=", 1)[1].decode("utf-8", "strict")
        )
        raise SystemExit(0)

raise SystemExit("DATABASE_URL missing from aoe2hdbets-web.service process")
PYREMOTE
'''

    result = subprocess.run(
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
        input=remote_script,
        text=True,
        capture_output=True,
    )

    if result.returncode != 0:
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        stop("could not read production DATABASE_URL over SSH")

    value = result.stdout.strip()

    if not value.startswith(
        ("postgresql://", "postgresql+asyncpg://", "postgres://")
    ):
        stop("production DATABASE_URL had an unexpected scheme")

    return value


def parse_prod_database(value: str):
    normalized = value.replace(
        "postgresql+asyncpg://",
        "postgresql://",
        1,
    )
    parsed = urlsplit(normalized)

    if not parsed.hostname:
        stop("production DATABASE_URL has no host")
    if not parsed.username or parsed.password is None:
        stop("production DATABASE_URL has no credentials")

    return parsed


def local_database_url(parsed) -> str:
    username = quote(unquote(parsed.username), safe="")
    password = quote(unquote(parsed.password), safe="")
    netloc = f"{username}:{password}@127.0.0.1:{LOCAL_DB_PORT}"

    return urlunsplit(
        (
            "postgresql",
            netloc,
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )


def start_tunnel(parsed):
    remote_host = parsed.hostname
    remote_port = parsed.port or 5432

    process = subprocess.Popen(
        [
            "ssh",
            "-N",
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "ExitOnForwardFailure=yes",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ServerAliveCountMax=3",
            "-L",
            f"127.0.0.1:{LOCAL_DB_PORT}:{remote_host}:{remote_port}",
            SSH_TARGET,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    deadline = time.time() + 15

    while time.time() < deadline:
        if process.poll() is not None:
            stderr = process.stderr.read().strip() if process.stderr else ""
            if stderr:
                print(stderr, file=sys.stderr)
            stop("SSH database tunnel exited before becoming ready")

        try:
            with socket.create_connection(
                ("127.0.0.1", LOCAL_DB_PORT),
                timeout=0.3,
            ):
                return process
        except OSError:
            time.sleep(0.2)

    process.terminate()
    stop("SSH database tunnel did not become ready")


def pg_probe(env: dict[str, str]) -> dict:
    code = r'''
const { Client } = require("pg");

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    options:
      "-c default_transaction_read_only=on " +
      "-c statement_timeout=20000 " +
      "-c lock_timeout=2000 " +
      "-c application_name=aoe2war_local_prod_preview_verify",
  });

  await client.connect();

  const settings = await client.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('transaction_read_only') AS transaction_read_only,
      current_setting('default_transaction_read_only') AS default_read_only
  `);

  const emaren = await client.query(
    `
      SELECT uid, is_admin
      FROM users
      WHERE lower(coalesce(in_game_name, '')) = lower($1)
         OR lower(coalesce(steam_persona_name, '')) = lower($1)
      ORDER BY is_admin DESC, id ASC
      LIMIT 1
    `,
    [process.env.AOE2WAR_PREVIEW_USER_NAME]
  );

  await client.end();

  const row = settings.rows[0];
  const user = emaren.rows[0];

  if (
    row.transaction_read_only !== "on" ||
    row.default_read_only !== "on"
  ) {
    throw new Error("database session is not read-only");
  }

  if (!user || !user.uid) {
    throw new Error("could not resolve Emaren in production users");
  }

  process.stdout.write(
    JSON.stringify({
      database: row.database_name,
      user: row.database_user,
      previewUid: user.uid,
      previewIsAdmin: Boolean(user.is_admin),
    })
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
'''

    result = subprocess.run(
        ["node", "-e", code],
        env=env,
        text=True,
        capture_output=True,
    )

    if result.returncode != 0:
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        stop("production DB read-only proof failed")

    return json.loads(result.stdout)


def wait_for_local_https(process) -> bool:
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


def main() -> int:
    print("============================================================")
    print("AOE2WAR — LOCAL CODE / LIVE PRODUCTION DATA")
    print("============================================================")

    prod_database_url = read_prod_database_url()
    parsed = parse_prod_database(prod_database_url)
    tunnel = start_tunnel(parsed)
    node = None

    try:
        env = os.environ.copy()
        env["NODE_ENV"] = "development"
        env["DATABASE_URL"] = local_database_url(parsed)

        # Two independent fences:
        # 1. PGOPTIONS covers PostgreSQL clients that honor libpq-style env.
        # 2. lib/prisma.ts also sends the read-only startup option explicitly.
        env["PGOPTIONS"] = (
            "-c default_transaction_read_only=on "
            "-c statement_timeout=20000 "
            "-c lock_timeout=2000 "
            "-c application_name=aoe2war_local_prod_preview"
        )
        env["AOE2WAR_PROD_DB_PREVIEW"] = "true"

        # Existing preview identity and safe production read machinery.
        env["AOE2WAR_PREVIEW_DATA_BASE"] = PREVIEW_ORIGIN
        env["AOE2WAR_PREVIEW_USER_NAME"] = PREVIEW_NAME

        # Server-side parser/game-stat reads go to the public production app,
        # not the dead local :3330 API.
        env["AOE2_BACKEND_UPSTREAM"] = PREVIEW_ORIGIN

        # Never carry a production internal API credential onto the Mac.
        env.pop("INTERNAL_API_KEY", None)
        env.pop("ADMIN_TOKEN", None)

        proof = pg_probe(env)
        env["AOE2WAR_PREVIEW_USER_UID"] = proof["previewUid"]

        print(
            "PASS: live production PostgreSQL reachable through SSH "
            f"(db={proof['database']})"
        )
        print("PASS: transaction_read_only=on")
        print("PASS: default_transaction_read_only=on")
        print(
            "PASS: preview identity resolved: "
            f"{PREVIEW_NAME} ({proof['previewUid']}) "
            f"admin={proof['previewIsAdmin']}"
        )
        print("PASS: production DATABASE_URL remains memory-only")
        print("PASS: production INTERNAL_API_KEY/ADMIN_TOKEN not imported")
        print("PASS: backend reads use public https://aoe2war.com")
        print()
        print("> Local source + hot reload: https://localhost:3000")
        print("> Production data: LIVE")
        print("> Production DB writes: READ-ONLY fenced")
        print()

        node = subprocess.Popen(
            ["node", "server.js"],
            env=env,
        )

        if wait_for_local_https(node):
            subprocess.Popen(
                ["open", "https://localhost:3000/clans/aoe2war"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        return node.wait()

    except KeyboardInterrupt:
        return 130

    finally:
        if node is not None and node.poll() is None:
            node.terminate()
            try:
                node.wait(timeout=3)
            except subprocess.TimeoutExpired:
                node.kill()

        if tunnel.poll() is None:
            tunnel.terminate()
            try:
                tunnel.wait(timeout=3)
            except subprocess.TimeoutExpired:
                tunnel.kill()


if __name__ == "__main__":
    raise SystemExit(main())
