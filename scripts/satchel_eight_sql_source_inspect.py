#!/usr/bin/env python3
"""Exact-byte, read-only review of the eight HELD Satchel/Mecha SQL migrations.

This utility does not connect to PostgreSQL, execute SQL, acquire a release
permit, write receipts, or authorize the existing additive-only release lane.
Its source pin is deliberately independent of the application commit SHA:
documentation/tests can evolve while these eight specific SQL bodies remain fixed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
from pathlib import Path

EXPECTED_MIGRATIONS: tuple[tuple[str, str], ...] = (
    ("20261017_012000_war_satchel_funded_ledger_foundation",
     "d9ce0911c7bce85855b21ba25761d6a6a2d97c7af93e5673dfa56ac3b571628a"),
    ("20261018_020000_war_satchel_physical_receipt_consumption",
     "d086e9082d0ef32bb8b21141fd265ff48442e5bf5e0b0b9844ef7f59fceeca8d"),
    ("20261018_040000_war_satchel_financial_authorizations",
     "b71149530696bf875a1a149aa137d72090b0ba14b0d60b99d661af9404cf18d0"),
    ("20261018_041000_war_satchel_withdrawal_physical_consumption",
     "5666df04a8417cdcd86d83c6fc05241c5e3c5f4fb30944ee7228f6107010fd6b"),
    ("20261018_042000_war_satchel_auto_spend_mandate",
     "20b8dd518910eb838913221fa5c6f956c3af9035cc7c9bc9d514b6ddc963e62f"),
    ("20261019_010000_war_satchel_wager_authority",
     "e421a2adb225f71c1583379cd2cdbdc7e898680b3c8d91a07ed074c37b8a6208"),
    ("20261021_220000_hd_financial_maintenance_fence",
     "8a165ab5a52a41ed800e4376e6d7af634cb7fa80eab78a2ec1f6c89b88c70013"),
    ("20261021_230000_satchel_authoritative_product_limits",
     "547538622da0b8c539e0f28c9e1ba9b1a526b578331dcf306cd309df14248ce1"),
)

# Expected categories are disclosure of review complexity, not SQL authorization.
COMPLEXITY_BY_MIGRATION = (
    "new_financial_tables_with_immutable_guards",
    "procedural_receipt_consumption_and_existing_receipt_backfill",
    "procedural_authority_tables_and_dynamic_triggers",
    "procedural_withdrawal_consumption_and_existing_withdrawal_backfill",
    "new_owner_signed_mandate_with_immutable_guard",
    "procedural_live_wager_admission_triggers",
    "new_closed_by_default_hd_maintenance_policy",
    "replaces_existing_check_constraints_and_changes_timestamp_default",
)


def read_direct_regular(path: Path) -> bytes:
    # No directory traversal or symlinks in this source-only inspection.
    if any(part in {"..", ""} for part in path.parts):
        raise ValueError("invalid source path")
    for parent in (path.parent.parent, path.parent):
        if not stat.S_ISDIR(parent.lstat().st_mode):
            raise ValueError("migration parent is not a direct directory")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 2_097_152:
        raise ValueError("migration is not a bounded regular file")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or opened.st_size > 2_097_152:
            raise ValueError("opened migration is not a bounded regular file")
        raw = os.read(fd, 2_097_153)
        if len(raw) > 2_097_152 or len(raw) != opened.st_size:
            raise ValueError("migration changed or exceeded the bounded read")
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError("migration file changed during inspection")
        return raw
    finally:
        os.close(fd)


def inspect(root: Path) -> dict:
    base = root / "prisma" / "migrations"
    results = []
    for (name, pin), complexity in zip(EXPECTED_MIGRATIONS, COMPLEXITY_BY_MIGRATION):
        path = base / name / "migration.sql"
        row = {"migration": name, "sha256_expected": pin, "complexity": complexity}
        try:
            data = read_direct_regular(path)
            digest = hashlib.sha256(data).hexdigest()
            row["sha256_actual"] = digest
            row["bytes"] = len(data)
            row["exact_match"] = digest == pin
        except (OSError, ValueError) as exc:
            row["exact_match"] = False
            # Deliberately do not output arbitrary paths, secrets or OS error text.
            row["read_failure"] = type(exc).__name__
        results.append(row)

    verified = len(results) == 8 and all(row["exact_match"] for row in results)
    return {
        "schema": 1,
        "kind": "satchel-eight-sql-source-inspection",
        "status": "EXACT_SQL_REVIEW_ONLY" if verified else "STOP_SOURCE_DRIFT",
        "all_eight_migration_bytes_match": verified,
        "migrations": results,
        "production_database_read": False,
        "database_modified": False,
        "wolo_signing_or_broadcast": False,
        "approved_for_generic_additive_release": False,
        "financial_migration_receipt_present": False,
        "financial_release_authorized": False,
        "next_gate": "independently reviewed finance-specific migration procedure,"
                     " current production backups/restore witness and scoped operator approval",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify exact original eight held financial SQL bodies; never deploy"
    )
    parser.add_argument("--root", type=Path,
                        default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    report = inspect(args.root)
    print(json.dumps(report, sort_keys=True, indent=2))
    return 0 if report["all_eight_migration_bytes_match"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
