#!/usr/bin/env python3
"""Narrow historical Satchel *simulation-only* migration cohort release identity.

October 18, 2026: the current website release contains the sixth pending C3a
simulation guard repair, while five earlier, still-unapplied Satchel migrations
were already present in the previous production checkout. The generic release
manifest lists only changed SQL paths and cannot safely apply a partial
Prisma migration history. This exception seals the exact six-file cohort,
never any future Satchel funding/withdrawal/real-credit migration.

The ordinary protected release still MUST:
  * prove the real production pending migration frontier is these exact six;
  * enforce the normal full source, tests, DB risk, and permissions gate;
  * stage in isolation, back up production and record a durable receipt;
  * never touch WoloChain signers or the financial activation switch.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

PREVIOUS_PRODUCTION_SOURCE = "cf564f6e4968b3860813d1a0d2296337b7105553"
EXPECTED_SOURCE_MIGRATIONS = 118
PINNED = (
    ("20261014_103500_war_satchel_noncrediting_foundation", "de584eba527eb414666b6c850e35378ee9c57081"),
    ("20261014_133000_war_satchel_wallet_owner_challenges", "b88ec91bfe51c621f2722c86d20cd0399c516460"),
    ("20261014_150000_war_satchel_simulated_double_entry", "37bdca571c54174f063ac40562446b5162d10269"),
    ("20261014_164500_war_satchel_simulation_concurrency_guard", "bfe55c4d852d4b17c92e070d7e103c02ce0e27a4"),
    ("20261014_191500_war_satchel_simulation_single_owner", "7dda438c358c41fb002e56779b5f5f09862f0b33"),
    ("20261015_151500_war_satchel_simulation_guard_correction", "911a9684b14d163fe1ad4b2b04cfec7a60268e69"),
)
COHORT_PATHS = tuple(
    f"prisma/migrations/{name}/migration.sql" for name, _ in PINNED
)
LATEST_PATH = COHORT_PATHS[-1]
HEX40 = re.compile(r"^[0-9a-f]{40}$")


class SatchelSimulationCohortError(ValueError):
    pass


def prove_exact_source(root: Path) -> None:
    """Source identity only; does NOT certify live DB or permit spending."""
    actual = sorted((root / "prisma/migrations").glob("*/migration.sql"))
    if len(actual) != EXPECTED_SOURCE_MIGRATIONS:
        raise SatchelSimulationCohortError(
            "simulation-only release source migration census changed"
        )
    for (name, expected), rel in zip(PINNED, COHORT_PATHS, strict=True):
        path = root / rel
        if (
            path.is_symlink()
            or path.parent.is_symlink()
            or not path.is_file()
            or not HEX40.fullmatch(expected)
            or path.parent.name != name
        ):
            raise SatchelSimulationCohortError(
                "simulation-only release has an unsafe SQL source path"
            )
        p = subprocess.run(
            ["git", "-C", str(root), "hash-object", "--", str(path)],
            capture_output=True, text=True, timeout=20, check=False,
        )
        if p.returncode != 0 or p.stdout.strip() != expected:
            raise SatchelSimulationCohortError(
                "simulation-only release SQL source bytes changed: " + name
            )


def scoped_manifest_paths(
    root: Path, previous_production_sha: str, changed_files: list[str],
) -> list[str]:
    """Include the five backlog migrations iff the sixth is the only new SQL.

    This never automatically extends a financial release or a later source;
    the normal frontier must independently prove six pending on production.
    """
    changed_sql = sorted(
        path for path in changed_files
        if path.startswith("prisma/migrations/")
    )
    if (
        previous_production_sha != PREVIOUS_PRODUCTION_SOURCE
        or changed_sql != [LATEST_PATH]
    ):
        return changed_sql
    prove_exact_source(root)
    return list(COHORT_PATHS)


def is_exact_cohort_contract(root: Path, manifest: dict) -> bool:
    paths = manifest.get("migration_paths") or []
    if paths != list(COHORT_PATHS):
        return False
    if manifest.get("previous_production_sha") != PREVIOUS_PRODUCTION_SOURCE:
        raise SatchelSimulationCohortError(
            "simulation-only release has different production ancestor"
        )
    if manifest.get("risk_class") not in {"DATABASE", "FINANCIAL"}:
        raise SatchelSimulationCohortError(
            "simulation-only release requires full database risk gate"
        )
    changed_sql = sorted(
        p for p in (manifest.get("changed_files") or [])
        if p.startswith("prisma/migrations/")
    )
    if changed_sql != [LATEST_PATH]:
        raise SatchelSimulationCohortError(
            "simulation-only release changed non-allowlisted migration source"
        )
    prove_exact_source(root)
    return True
