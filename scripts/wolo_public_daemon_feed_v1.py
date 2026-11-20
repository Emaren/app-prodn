#!/usr/bin/env python3
"""Public-safe, read-only projection of actual WoloChain consensus journal events.

Root installation and a separate tightly scoped timer are required. Never run
this from the public website. The web reads ONLY the derived bounded JSON file.
No arbitrary paths, unit names, user-supplied filters, credentials or writes to
the chain are supported.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

UNIT = "wolochaind-mainnet.service"
DEST_DIR = Path("/var/lib/aoe2war-wolo-public-daemon-v1")
DEST = DEST_DIR / "feed.json"
SCHEMA = "aoe2war.wolo-public-daemon-feed.v1"
ANSI = re.compile(r"\x1b\[[0-9;]*m")
LOG = re.compile(r"(?P<time>(?:1[0-2]|[1-9]):[0-5][0-9](?:AM|PM)) INF "
                 r"(?P<event>[A-Za-z ]+?) (?P<fields>[a-z][a-z0-9_]*=.*)\Z")
FIELD = re.compile(r"([a-z][a-z0-9_]*)=([A-Za-z0-9._:/+-]{1,130})\Z")
HEXDIGEST = re.compile(r"[0-9A-Fa-f]{1,128}\Z")
EVENT_FIELDS = {
    "received complete proposal block": ("consensus", {"hash", "height", "module"}),
    "finalizing commit of block": ("consensus", {"hash", "height", "module", "num_txs", "root"}),
    "finalized block": ("state", {"block_app_hash", "height", "module", "num_txs_res", "num_val_updates"}),
    "executed block": ("state", {"app_hash", "height", "module"}),
    "committed state": ("state", {"block_app_hash", "height", "module"}),
    "indexed block events": ("txindex", {"height", "module"}),
}
NUMERIC_FIELDS = {"height", "num_txs", "num_txs_res", "num_val_updates"}
HASH_FIELDS = {"hash", "root", "block_app_hash", "app_hash"}

def admit(raw: str) -> str | None:
    """Accept only fully recognized real node event shapes; rebuild bounded ANSI."""
    if len(raw) > 800:
        return None
    plain = ANSI.sub("", raw.strip())
    if any(ord(char) < 32 or ord(char) > 126 for char in plain):
        return None
    match = LOG.fullmatch(plain)
    if not match:
        return None
    event = match.group("event")
    spec = EVENT_FIELDS.get(event)
    if spec is None:
        return None
    module, allowed = spec
    fields: list[tuple[str, str]] = []
    seen: set[str] = set()
    for token in match.group("fields").split(" "):
        item = FIELD.fullmatch(token)
        if item is None:
            return None
        key, value = item.groups()
        if key not in allowed or key in seen:
            return None
        seen.add(key)
        if key in NUMERIC_FIELDS and (not value.isdecimal() or int(value) > 10**12):
            return None
        if key in HASH_FIELDS and not HEXDIGEST.fullmatch(value):
            return None
        fields.append((key, value))
    if not {"module", "height"}.issubset(seen):
        return None
    if dict(fields)["module"] != module or int(dict(fields)["height"]) < 1:
        return None
    prefix = ("\x1b[90m" + match.group("time") + "\x1b[0m "
              "\x1b[32mINF\x1b[0m \x1b[1m" + event + "\x1b[0m")
    return prefix + "".join(" \x1b[36m" + key + "=\x1b[0m" + value for key, value in fields)

def project(raw: str) -> dict:
    accepted = [value for line in raw.splitlines() if (value := admit(line)) is not None]
    lines = accepted[-40:]
    return {
        "schema": SCHEMA,
        "ok": bool(lines),
        "source": UNIT,
        "label": "wolochaind-mainnet.journal",
        "sampledAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lines": lines,
    }

def check_output_directory() -> None:
    st = DEST_DIR.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or stat.S_IMODE(st.st_mode) != 0o755:
        raise RuntimeError("PUBLIC_PROJECTION_DIRECTORY_CUSTODY_HOLD")

def collect() -> None:
    if os.geteuid() != 0:
        raise RuntimeError("PROTECTED_PRODUCER_INSTALL_REQUIRED")
    check_output_directory()
    run = subprocess.run(
        ["/usr/bin/journalctl", "-u", UNIT, "-n", "60", "--no-pager", "-o", "cat"],
        capture_output=True, timeout=8, check=False,
    )
    if run.returncode != 0 or len(run.stdout) > 65536:
        raise RuntimeError("BOUNDED_JOURNAL_READ_HOLD")
    payload = project(run.stdout.decode("utf-8", "replace"))
    data = (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()
    if len(data) > 20000:
        raise RuntimeError("PUBLIC_FEED_OVERSIZE_HOLD")
    temp = DEST_DIR / ("feed." + str(os.getpid()) + ".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o644)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, DEST)
        os.chmod(DEST, 0o644)
        directory = os.open(DEST_DIR, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temp.exists():
            temp.unlink()

if __name__ == "__main__":
    if sys.argv != [sys.argv[0], "collect"]:
        raise SystemExit("USAGE: wolo_public_daemon_feed_v1.py collect")
    try:
        collect()
    except Exception as exc:
        raise SystemExit(type(exc).__name__ + ": " + str(exc)[:90])
