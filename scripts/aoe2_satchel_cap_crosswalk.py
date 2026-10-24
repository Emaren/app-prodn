#!/usr/bin/env python3
"""Audit *literal source limits*, never authorize or raise any money ceiling.

Rules distinguish a finite-plan reserve from a per-UTC-day spending cap.
Missing code and indirect/dynamic rules remain UNKNOWN, not safe.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER_REQUEST_PER_BET = 10_000
OWNER_REQUEST_PER_DAY = 50_000
MAX_BYTES = 2_000_000

# The constrained syntax is intentional: a changed source implementation
# becomes UNKNOWN and demands human review rather than inventing a value.
RULES = (
    ("lib/betAutomation.ts", "auto_game_max", r"BET_AUTOMATION_MAX_PER_GAME_WOLO\s*=\s*([\d_]+)\s*;", "per_bet", OWNER_REQUEST_PER_BET),
    ("lib/betAutomation.ts", "finite_plan_reserve", r"BET_AUTOMATION_MAX_RESERVE_WOLO\s*=\s*([\d_]+)\s*;", "plan_reserve_not_daily", None),
    ("lib/warSatchelAutoSpendConsent.ts", "signed_per_game", r"c\.perGameCapWolo\s*<=\s*([\d_]+)", "per_bet", OWNER_REQUEST_PER_BET),
    ("lib/warSatchelAutoSpendConsent.ts", "signed_daily", r"c\.dailyCapWolo\s*<=\s*([\d_]+)", "per_utc_day", OWNER_REQUEST_PER_DAY),
    ("lib/warSatchelWagerReservation.ts", "wager_reservation", r"MAX_WAGER_UWOLO\s*=\s*BigInt\(([\d_]+)\)\s*\*\s*BigInt\(1000000\)", "per_bet", OWNER_REQUEST_PER_BET),
    ("lib/warSatchelDedicatedSignerClient.ts", "private_signer", r"BigInt\(p\.amountUwolo\)\s*>\s*BigInt\(([\d_]+)\)\s*\*\s*BigInt\(1000000\)", "per_bet", OWNER_REQUEST_PER_BET),
    ("lib/warSatchelFundedLedger.ts", "funded_reservation", r"input\.reserveUwolo\s*>\s*BigInt\(([\d_]+)\)\s*\*\s*BigInt\(1000000\)", "per_bet", OWNER_REQUEST_PER_BET),
)


def inspect(root: Path) -> dict:
    root = root.resolve()
    cache: dict[str, tuple[str, str] | None] = {}
    observations = []
    for rel, name, regex, unit, expected in RULES:
        if rel not in cache:
            path = root / rel
            try:
                if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
                    raise ValueError('untrusted_or_missing')
                raw = path.read_bytes()
                if len(raw) > MAX_BYTES:
                    raise ValueError('oversize')
                cache[rel] = (raw.decode('utf-8'), hashlib.sha256(raw).hexdigest())
            except (OSError, UnicodeError, ValueError):
                cache[rel] = None
        source = cache[rel]
        match = re.search(regex, source[0]) if source else None
        literal = int(match.group(1).replace('_', '')) if match else None
        classification = ('UNKNOWN_SOURCE' if literal is None else
                          'DISTINCT_FINITE_PLAN_RESERVE' if expected is None else
                          'MATCHES_OWNER_REQUEST' if literal == expected else 'CAP_CONTRACT_MISMATCH')
        observations.append({
            'rule': name, 'path': rel, 'meaning': unit, 'actual_wolo': literal,
            'owner_requested_wolo': expected, 'classification': classification,
            'source_sha256': source[1] if source else None,
        })
    mismatches = [x for x in observations if x['classification'] == 'CAP_CONTRACT_MISMATCH']
    unknowns = [x for x in observations if x['classification'] == 'UNKNOWN_SOURCE']
    return {
        'schema': 'aoe2war.satchel.literal_spend_cap_crosswalk.v1',
        'classification': 'NONAUTHORIZING_SOURCE_OBSERVATION',
        'status': 'INCOMPLETE_OR_MISMATCHED' if mismatches or unknowns else 'LITERALS_MATCH_OWNER_REQUEST_NOT_CERTIFIED',
        'owner_requested_max_per_bet_wolo': OWNER_REQUEST_PER_BET,
        'owner_requested_daily_utc_max_wolo': OWNER_REQUEST_PER_DAY,
        'mismatches': len(mismatches), 'unknown_rules': len(unknowns),
        'observations': observations,
        'all_economic_paths_verified': False,
        'custody_enabled': False, 'safe_to_deploy': False,
        'note': 'Signed mandates, outstanding reservations, settlement, SQL constraints and cross-repo Wolo signer require independent economic review; this tool changes none of them.',
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--check', action='store_true', help='fail on source mismatch or unknown; never authorize finance')
    args = parser.parse_args()
    report = inspect(args.root)
    result = json.dumps(report, sort_keys=True, indent=2) + '\n'
    if args.output:
        args.output.write_text(result, encoding='utf-8')
    print(result, end='')
    return 2 if args.check and report['status'] != 'LITERALS_MATCH_OWNER_REQUEST_NOT_CERTIFIED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
