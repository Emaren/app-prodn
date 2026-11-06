#!/usr/bin/env python3
"""C02 exact-source PostgreSQL 16 synthetic migration rehearsal. ALWAYS HOLD.

This runs thirteen byte-pinned source migrations against four deliberately
minimal fake legacy tables in a newly initialized Unix-socket-only cluster.
It is not a C06 backup, C07 restoration, production schema proof, release
permit, or authority for applying ANY migration to HEL1.

Requires local non-root macOS PG16. No Docker, network, real database URL,
financial key, source mutations, real data, rollback controller or funds.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

APP_SOURCE_SHA = "7348803bc2ef7c93df389352ccafc97bc683cbe3"
CATALOG_SHA256 = "2121c25ac84e4731adfbde9029c22c53d765e6c57e747a3396ea72e00f24e8ba"
SCHEMA = "aoe2war.session-b.c02-local-pg16-migration-rehearsal-held.v1"
PORT = "55439"
EXPECTED_COUNT = 13
EXPECTED_TABLES = 29
EXPECTED_TRIGGERS = 53
FIXTURE = b"""
 CREATE TABLE users(id integer PRIMARY KEY);
 CREATE TABLE pending_wolo_claims(id integer PRIMARY KEY);
 CREATE TABLE bet_auto_executions(id integer PRIMARY KEY);
 CREATE TABLE bet_auto_presets (
   id integer PRIMARY KEY, until_out boolean NOT NULL DEFAULT true,
   games_remaining integer, winner_stake_wolo integer NOT NULL DEFAULT 1,
   desync_stake_wolo integer NOT NULL DEFAULT 0,
   CONSTRAINT ck_bet_auto_presets_game_plan CHECK(
     (until_out AND games_remaining IS NULL) OR
     (NOT until_out AND games_remaining BETWEEN 1 AND 100)
   )
 );
"""
CENSUS = b"""
 SELECT 'tables='||count(*) FROM pg_class c JOIN pg_namespace n
   ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
     AND c.relname LIKE 'war_satchel_%';
 SELECT 'rows='||COALESCE(sum(s.n_live_tup),0)
   FROM pg_stat_user_tables s WHERE s.schemaname='public'
     AND s.relname LIKE 'war_satchel_%';
 SELECT 'triggers='||count(*) FROM pg_trigger t
   JOIN pg_class c ON t.tgrelid=c.oid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname LIKE 'war_satchel_%'
     AND NOT t.tgisinternal;
"""
NEGATIVE = b"""
 INSERT INTO users(id) VALUES(1);
 INSERT INTO war_satchel_funded_balances(owner_user_id,available_uwolo)
 VALUES(1,-1);
"""


class Hold(Exception):
    pass


def checked(argv, *, env=None, input_data=None, timeout=30):
    try:
        return subprocess.run(argv, input=input_data, env=env,
                              capture_output=True, check=False, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Hold("LOCAL_PROCESS_FAILED_CLOSED") from e


def catalog(repo: Path):
    # The SHA identifies the frozen release source; the fixed BYTE manifest
    # validates the checked-out tree even in a shallow GitHub CI checkout.
    base = repo / "prisma" / "migrations"
    if not base.is_dir() or base.is_symlink():
        raise Hold("HELD_APP_SOURCE_UNAVAILABLE")
    paths = sorted(p for p in base.glob("*/migration.sql")
                   if "war_satchel" in str(p.parent.name)
                   or p.parent.name.endswith("satchel_authoritative_product_limits"))
    if len(paths) != EXPECTED_COUNT:
        raise Hold("MIGRATION_COUNT_DRIFT")
    digest, rows = hashlib.sha256(), []
    for path in paths:
        name = str(path.relative_to(repo))
        if not re.fullmatch(r"prisma/migrations/[a-zA-Z0-9_]+/migration\.sql", name)                 or path.is_symlink() or path.parent.is_symlink():
            raise Hold("MIGRATION_PATH_UNSAFE")
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                before = os.fstat(fd)
                if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 500_000:
                    raise Hold("PINNED_MIGRATION_UNAVAILABLE")
                raw = os.read(fd, 500_001)
                after = os.fstat(fd)
                if len(raw) != before.st_size or any(
                        getattr(before, k) != getattr(after, k)
                        for k in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")):
                    raise Hold("PINNED_MIGRATION_CHANGED_WHILE_READING")
            finally:
                os.close(fd)
        except OSError as exc:
            raise Hold("PINNED_MIGRATION_UNAVAILABLE") from exc
        digest.update(name.encode("ascii") + b"\0" + hashlib.sha256(raw).digest())
        rows.append((name, raw))
    if digest.hexdigest() != CATALOG_SHA256:
        raise Hold("PINNED_MIGRATION_BYTES_DRIFT")
    return rows


def restricted_receipt(path: Path, obj: dict):
    if not path.is_absolute() or ".." in path.parts or path.is_symlink():
        raise Hold("RECEIPT_PATH_INVALID")
    p = path.parent
    s = p.lstat()
    if not stat.S_ISDIR(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o700 \
            or s.st_uid != os.geteuid() or p.is_symlink():
        raise Hold("RECEIPT_DIRECTORY_NOT_PRIVATE")
    body = (json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n").encode()
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
    except OSError as exc:
        raise Hold("RECEIPT_WRITE_FAILED") from exc
    return hashlib.sha256(body).hexdigest()


def rehearse(repo: Path, pg_bin: Path):
    if os.geteuid() == 0:
        raise Hold("REFUSE_ROOT_PG16_TEST")
    rows = catalog(repo)
    cmds = ("initdb", "pg_ctl", "psql")
    if not all((pg_bin / c).is_file() for c in cmds):
        raise Hold("PG16_BINARY_SET_ABSENT")
    version = checked([str(pg_bin / "initdb"), "--version"])
    if version.returncode or not version.stdout.startswith(b"initdb (PostgreSQL) 16."):
        raise Hold("PG16_EXACT_MAJOR_REQUIRED")

    with tempfile.TemporaryDirectory(prefix="c02pg-") as temp:
        root = Path(temp)
        if len(str(root / "sock" / (".s.PGSQL." + PORT))) > 96:
            raise Hold("MACOS_PRIVATE_SOCKET_PATH_TOO_LONG")
        sock = root / "sock"
        sock.mkdir(mode=0o700)
        data = root / "data"
        env = {k: os.environ[k] for k in ("HOME", "PATH", "USER", "LANG")
               if k in os.environ}
        env.update({"PGHOST": str(sock), "PGPORT": PORT,
                    "PGUSER": os.environ.get("USER", ""),
                    "PGDATABASE": "postgres"})
        running = False
        try:
            init = checked([str(pg_bin / "initdb"), "-D", str(data),
                            "--no-instructions", "--auth-local=trust",
                            "--auth-host=reject"], env=env)
            if init.returncode:
                raise Hold("DISPOSABLE_PG16_INIT_REFUSED")
            opts = f"-c listen_addresses='' -c unix_socket_directories={sock} -c port={PORT}"
            start = checked([str(pg_bin / "pg_ctl"), "-D", str(data), "-l",
                             str(root / "pg.log"), "-o", opts, "-w", "start"], env=env)
            if start.returncode:
                raise Hold("DISPOSABLE_PG16_START_REFUSED")
            running = True
            psql = [str(pg_bin / "psql"), "-X", "-v", "ON_ERROR_STOP=1", "-q"]
            if checked(psql, env=env, input_data=FIXTURE).returncode:
                raise Hold("SYNTHETIC_BASELINE_INVALID")
            for i, (_name, raw) in enumerate(rows, 1):
                p = checked(psql + ["-1"], env=env, input_data=raw)
                if p.returncode:
                    raise Hold(f"PINNED_MIGRATION_{i}_REFUSED")
            census = checked(psql + ["-A", "-t"], env=env, input_data=CENSUS)
            if census.returncode:
                raise Hold("PG16_CENSUS_UNAVAILABLE")
            observed = census.stdout.decode("ascii").strip().splitlines()
            if observed != ["tables=29", "rows=0", "triggers=53"]:
                raise Hold("PG16_TABLE_TRIGGER_ROW_CENSUS_DRIFT")
            negative = checked(psql + ["-1"], env=env, input_data=NEGATIVE)
            if negative.returncode == 0 or \
                    b"ck_satchel_funded_balance_nonnegative" not in negative.stderr:
                raise Hold("PG16_NEGATIVE_ACCOUNTING_CONSTRAINT_NOT_PROVEN")
            # Transaction -1 rolled back synthetic user insert as well.
            no_finance = checked(psql + ["-A", "-t"], env=env, input_data=CENSUS)
            if no_finance.returncode or \
                    no_finance.stdout.decode("ascii").strip().splitlines() != observed:
                raise Hold("PG16_NEGATIVE_TEST_MUTATED_FINANCIAL_TABLES")
            return {
                "schema": SCHEMA, "status": "HOLD_SYNTHETIC_ONLY",
                "app_held_source_sha": APP_SOURCE_SHA,
                "migration_catalog_sha256": CATALOG_SHA256,
                "migration_count": len(rows),
                "pg_major": 16,
                "observed": observed,
                "negative_accounting_constraint_rejected": True,
                "all_synthetic": True, "public_tcp_listener_created": False,
                "live_database_accessed": False,
                "C06_backup_verified": False,
                "C07_real_restore_verified": False,
                "C02_physically_admitted": False,
                "funded_release_authorized": False,
                "test_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        finally:
            if running:
                stop = checked([str(pg_bin / "pg_ctl"), "-D", str(data),
                                "-m", "immediate", "-w", "stop"], env=env)
                if stop.returncode:
                    raise Hold("DISPOSABLE_PG16_STOP_NOT_CONFIRMED")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path,
                        default=Path("/opt/homebrew/opt/postgresql@16/bin"))
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args(argv)
    try:
        repo = Path(__file__).resolve().parents[1]
        report = rehearse(repo, args.pg_bin)
        if args.receipt is not None:
            report["receipt_sha256"] = restricted_receipt(args.receipt, report)
    except (Hold, UnicodeError, ValueError) as exc:
        reason = str(exc) if type(exc) is Hold else "C02_REHEARSAL_UNAVAILABLE"
        print(json.dumps({"schema": SCHEMA, "status": "STOP",
                          "reason": reason, "funded_release_authorized": False},
                         sort_keys=True))
        return 2
    print(json.dumps(report, sort_keys=True))
    return 3


if __name__ == "__main__":
    sys.exit(main())
