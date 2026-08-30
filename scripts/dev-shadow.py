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

DIRECT_CHAT_TABLES = (
    "chat_messages",
    "direct_conversations",
    "direct_conversation_participants",
    "direct_messages",
    "direct_message_reactions",
    "direct_message_drafts",
    "direct_message_pins",
    "direct_message_translations",
)

CONTROL_PLANE_TABLES = (
    "ai_agents",
    "ai_request_traces",
    "betting_bot_configs",
    "bet_counter_actions",
)

MARKETPLACE_TABLES = (
    "user_activity_events",
    "marketplace_shops",
)

SHADOW_TABLES = (
    SOCIAL_TABLES
    + DIRECT_CHAT_TABLES
    + CONTROL_PLANE_TABLES
    + MARKETPLACE_TABLES
)

SAFE_PRODUCTION_ENV_KEYS = (
    "AOE2WAR_HALL_SCRIBE_PROMPT_ID",
    "AOE2WAR_HALL_SCRIBE_PROMPT_VERSION",
    "AOE2WAR_SCREENSHOT_VISION_MODEL",
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


def refresh_shadow() -> None:
    from aoe2_shadow import (
        refresh_shadow_v12,
    )

    refresh_shadow_v12()


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


def read_safe_production_runtime() -> tuple[dict[str, str], str | None]:
    # Read only AI-provider parity over SSH. The OpenAI credential is returned
    # only to this launcher and injected into the child Next process environment.
    # It is never printed or written to disk.
    remote = r"""
set -euo pipefail
PID="$(systemctl show aoe2hdbets-web.service -p MainPID --value)"
test -n "$PID"
test "$PID" != "0"
python3 - "$PID" <<'PYREMOTE'
import json
import sys
from pathlib import Path
pid = sys.argv[1]
wanted = {
    "AOE2WAR_HALL_SCRIBE_PROMPT_ID",
    "AOE2WAR_HALL_SCRIBE_PROMPT_VERSION",
    "AOE2WAR_SCREENSHOT_VISION_MODEL",
}
env = {}
raw = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")
for item in raw:
    if b"=" not in item:
        continue
    key, value = item.split(b"=", 1)
    key = key.decode("utf-8", "replace")
    if key in wanted:
        env[key] = value.decode("utf-8", "replace")
key_file = "/etc/aoe2hdbets/openai.key"
for item in raw:
    if item.startswith(b"OPENAI_API_KEY_FILE="):
        key_file = item.split(b"=", 1)[1].decode("utf-8", "replace")
        break
try:
    key = Path(key_file).read_text().strip()
except OSError:
    key = ""
print(json.dumps({"env": env, "openai_key": key}))
PYREMOTE
"""
    result = subprocess.run(
        [
            "ssh", "-T", "-o", "BatchMode=yes", "-o", "LogLevel=ERROR",
            SSH_TARGET, "bash", "-s",
        ],
        input=remote,
        text=True,
        capture_output=True,
        timeout=15,
    )
    if result.returncode != 0:
        if result.stderr.strip():
            print(
                "WARN: safe production AI runtime mirror unavailable: "
                + result.stderr.strip(),
                file=sys.stderr,
            )
        return {}, None
    try:
        import json
        payload = json.loads(result.stdout)
    except Exception:
        print(
            "WARN: safe production AI runtime mirror returned invalid data",
            file=sys.stderr,
        )
        return {}, None
    safe_env = {
        key: str(value)
        for key, value in dict(payload.get("env") or {}).items()
        if key in SAFE_PRODUCTION_ENV_KEYS and str(value).strip()
    }
    openai_key = str(payload.get("openai_key") or "").strip() or None
    return safe_env, openai_key


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
    # Radio WOLO V1 has one explicit operator. In writable local shadow,
    # the sanctioned Emaren preview identity owns that capability.
    env["RADIO_WOLO_OPERATOR_UIDS"] = preview_uid
    # Shadow Radio media is disposable/local and must never inherit a
    # production or ordinary development media root from the parent shell.
    env["RADIO_WOLO_MEDIA_DIR"] = str(
        ROOT / "storage" / "radio-wolo-shadow"
    )

    env["AOE2_BACKEND_UPSTREAM"] = PREVIEW_ORIGIN

    safe_prod_env, ephemeral_openai_key = read_safe_production_runtime()
    for key, value in safe_prod_env.items():
        env[key] = value

    if ephemeral_openai_key:
        env["OPENAI_API_KEY"] = ephemeral_openai_key
        env.pop("OPENAI_API_KEY_FILE", None)
    else:
        env.pop("OPENAI_API_KEY", None)
        env.pop("OPENAI_API_KEY_FILE", None)

    # Production application/chain mutation authority never enters shadow.
    env.pop("INTERNAL_API_KEY", None)
    env.pop("ADMIN_TOKEN", None)
    env.pop("AOE2WAR_PROD_DB_PREVIEW", None)
    env.pop("PGOPTIONS", None)

    print("=" * 60)
    print("AOE2WAR — WRITABLE PRODUCTION-SHAPED LOCAL SHADOW")
    print("=" * 60)
    print(f"PASS: local shadow DB: {SHADOW_DB}")
    print(f"PASS: local identity: {PREVIEW_NAME} ({preview_uid})")
    print("PASS: application database writes go ONLY to localhost shadow")
    print("PASS: production application/chain mutation credentials are absent")
    if ephemeral_openai_key:
        print(
            "PASS: OpenAI provider credential mirrored ephemerally "
            "(process memory only; never written or printed)"
        )
    else:
        print("NOTE: OpenAI provider credential unavailable; UI/data parity remains")
    if safe_prod_env:
        print(
            "PASS: safe production AI runtime settings mirrored: "
            + ", ".join(sorted(safe_prod_env))
        )
    print("PASS: production media/public read surfaces remain available")
    print()
    print("> Local code + hot reload: https://localhost:3000")
    print("> Clan/AI control plane: LOCAL WRITABLE PRODUCTION-SHAPED CLONE")
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
