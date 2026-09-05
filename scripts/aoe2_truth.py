#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REMOTE_PROGRAM = ROOT / "scripts" / "aoe2_truth_remote.mjs"
RECEIPT_DIR = ROOT / ".aoe2war-release" / "truth-receipts"

SSH_TARGET = os.environ.get(
    "AOE2WAR_TRUTH_SSH_TARGET",
    "root@157.180.114.124",
)

PROD_APP = os.environ.get(
    "AOE2WAR_TRUTH_PROD_APP",
    "/var/www/AoE2HDBets/app-prodn",
)

PROD_ENV = os.environ.get(
    "AOE2WAR_TRUTH_PROD_ENV",
    "/etc/aoe2hdbets/aoe2hdbets-web.env",
)


class TruthError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ"
    )


def latest_receipt(
    command: str | None = None,
) -> Path | None:
    if not RECEIPT_DIR.is_dir():
        return None

    pattern = (
        f"*-{command}.json"
        if command
        else "*.json"
    )

    matches = sorted(
        RECEIPT_DIR.glob(pattern),
        reverse=True,
    )

    return matches[0] if matches else None


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

    if not isinstance(
        payload,
        dict,
    ):
        raise TruthError(
            f"receipt must contain an object: {path}"
        )

    return payload


def write_receipt(
    command: str,
    payload: dict[str, Any],
) -> Path:
    RECEIPT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    suffix = command

    if command == "target":
        game = payload.get(
            "game"
        )

        if isinstance(
            game,
            dict,
        ):
            game_id = game.get(
                "id"
            )

            if (
                isinstance(
                    game_id,
                    int,
                ) and
                game_id > 0
            ):
                suffix = (
                    f"target-{game_id}"
                )

    path = (
        RECEIPT_DIR /
        f"{timestamp()}-{suffix}.json"
    )

    envelope = {
        "schema": 1,
        "kind":
            "aoe2war-truth-receipt",
        "generated_at":
            now_iso(),
        "command":
            command,
        "ssh_target":
            SSH_TARGET,
        "runtime_mutated":
            False,
        "database_mutated":
            False,
        "wolo_mutated":
            False,
        "payload":
            payload,
    }

    path.write_text(
        json.dumps(
            envelope,
            indent=2,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )

    return path


def remote_shell(
    command: str,
    game_id: int | None,
) -> str:
    if not REMOTE_PROGRAM.is_file():
        raise TruthError(
            f"missing remote truth program: {REMOTE_PROGRAM}"
        )

    encoded = base64.b64encode(
        REMOTE_PROGRAM.read_bytes()
    ).decode(
        "ascii"
    )

    game_value = (
        str(game_id)
        if game_id is not None
        else "0"
    )

    return f"""
set -euo pipefail

APP={json.dumps(PROD_APP)}
ENV_FILE={json.dumps(PROD_ENV)}

cd "$APP"

git_safe() {{
  git -c safe.directory="$APP" "$@"
}}

PRE_HEAD="$(git_safe rev-parse HEAD)"
PRE_DIRTY="$(git_safe status --porcelain --untracked-files=all)"
PRE_SERVICE="$(systemctl is-active aoe2hdbets-web.service || true)"
PRE_8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
PRE_8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"

test -z "$PRE_DIRTY"
test "$PRE_SERVICE" = "active"
test "$PRE_8092" = "1"
test "$PRE_8093" = "1"
test -r "$ENV_FILE"

set -a
source "$ENV_FILE"
set +a

test -n "${{DATABASE_URL:-}}"

export AOE2WAR_PROD_DB_PREVIEW=true
export AOE2WAR_TRUTH_COMMAND={json.dumps(command)}
export AOE2WAR_TRUTH_GAME_ID={json.dumps(game_value)}
export AOE2WAR_TRUTH_PRODUCTION_SOURCE="$PRE_HEAD"

PROGRAM_B64={json.dumps(encoded)}

set +e

NODE_OUTPUT="$(
  node \
    --experimental-strip-types \
    --experimental-loader \
    ./scripts/aoe2-alias-loader.mjs \
    --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    --input-type=module \
    --eval "$(
      printf '%s' "$PROGRAM_B64" |
      base64 -d
    )"
)"

NODE_RC=$?

set -e

POST_HEAD="$(git_safe rev-parse HEAD)"
POST_DIRTY="$(git_safe status --porcelain --untracked-files=all)"
POST_SERVICE="$(systemctl is-active aoe2hdbets-web.service || true)"
POST_8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
POST_8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"

test "$POST_HEAD" = "$PRE_HEAD"
test -z "$POST_DIRTY"
test "$POST_SERVICE" = "$PRE_SERVICE"
test "$POST_8092" = "$PRE_8092"
test "$POST_8093" = "$PRE_8093"

if [ "$NODE_RC" -ne 0 ]; then
  exit "$NODE_RC"
fi

printf '%s\\n' "$NODE_OUTPUT"
"""


def run_remote(
    command: str,
    game_id: int | None = None,
) -> dict[str, Any]:
    script = remote_shell(
        command,
        game_id,
    )

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
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=False,
    )

    if result.returncode != 0:
        detail = (
            result.stderr.strip() or
            result.stdout.strip() or
            "remote command failed without output"
        )

        raise TruthError(
            f"production truth command failed "
            f"(rc={result.returncode}):\n{detail}"
        )

    raw = result.stdout.strip()

    if not raw:
        raise TruthError(
            "production truth command returned no JSON"
        )

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise TruthError(
            "production truth command returned invalid JSON:\n"
            + raw[-4000:]
        ) from exc

    if not isinstance(
        payload,
        dict,
    ):
        raise TruthError(
            "production truth payload is not an object"
        )

    return payload


def pct(
    numerator: int,
    denominator: int,
) -> str:
    if denominator <= 0:
        return "n/a"

    return (
        f"{100 * numerator / denominator:.2f}%"
    )


def print_counts(
    title: str,
    values: dict[str, Any],
    limit: int | None = None,
) -> None:
    print()
    print(title)

    rows = list(
        values.items()
    )

    if limit is not None:
        rows = rows[:limit]

    if not rows:
        print("  —")
        return

    width = max(
        len(str(key))
        for key, _value
        in rows
    )

    for key, value in rows:
        print(
            f"  {str(key):<{width}}  {value}"
        )


def print_census(
    payload: dict[str, Any],
    receipt: Path,
) -> None:
    final_games = int(
        payload["finalGames"]
    )

    coverage = payload[
        "coverage"
    ]

    contract = payload[
        "contract"
    ]

    topology_known = int(
        coverage.get(
            "topologyKnown",
            coverage["teamResolved"],
        )
    )

    topology_unknown = int(
        coverage.get(
            "topologyUnknown",
            coverage["teamUnknown"],
        )
    )

    topology_unexplained = int(
        coverage.get(
            "unexplainedTopologyDebt",
            topology_unknown,
        )
    )

    print(
        "⚔️  AOE2WAR REPLAY TRUTH CENSUS"
    )
    print()
    print(
        f"Production source:     "
        f"{payload.get('productionSource', '')[:12]}"
    )
    print(
        f"Generated:             "
        f"{payload.get('generatedAt')}"
    )
    print(
        "Database read-only:    "
        "PROVEN"
    )
    print()
    print(
        f"Final games:           "
        f"{final_games}"
    )
    print(
        f"Topology known:        "
        f"{topology_known} "
        f"({pct(topology_known, final_games)})"
    )
    print(
        f"Topology unresolved:   "
        f"{topology_unknown}"
    )
    print(
        f"Topology unexplained:  "
        f"{topology_unexplained}"
    )
    print(
        f"Two-team resolver:     "
        f"{coverage['teamResolved']} "
        f"({pct(coverage['teamResolved'], final_games)})"
    )
    print(
        f"Results resolved:      "
        f"{coverage['resultResolved']} "
        f"({pct(coverage['resultResolved'], final_games)})"
    )
    print(
        f"Legacy both resolved:  "
        f"{coverage['bothResolved']} "
        f"({pct(coverage['bothResolved'], final_games)})"
    )
    print(
        f"Legacy two-team debt:  "
        f"{coverage['teamUnknown']}"
    )
    print(
        f"Result debt:           "
        f"{coverage['resultUnknown']}"
    )
    print(
        f"Legacy both unknown:   "
        f"{coverage['bothUnknown']}"
    )
    print(
        f"Unknown player-results:"
        f" {coverage['unknownParticipantResults']}"
    )
    print(
        f"Unresolved disconnect:"
        f" {coverage['unresolvedDisconnectGames']}"
    )
    print()
    print(
        f"Contract mismatches:   "
        f"{contract['contractMismatchGames']}"
    )
    print(
        f"Scalar authority rows: "
        f"{contract['scalarAuthorityRows']}"
    )
    print(
        f"Scalar incoherent:     "
        f"{contract['scalarAuthorityIncoherent']}"
    )

    debt = payload[
        "debt"
    ]

    print_counts(
        "Topology classes",
        debt.get(
            "topologyClassBuckets",
            {},
        ),
    )

    print_counts(
        "Topology recovery",
        debt.get(
            "topologyRecoveryBuckets",
            {},
        ),
    )

    print_counts(
        "Truth-debt routes",
        debt[
            "routeBuckets"
        ],
    )

    print_counts(
        "Parse-reason debt",
        debt[
            "parseReasonBuckets"
        ],
        limit=20,
    )

    print_counts(
        "Player-count debt",
        debt[
            "playerCountBuckets"
        ],
    )

    print_counts(
        "Truth-reason debt",
        debt[
            "truthReasonBuckets"
        ],
        limit=20,
    )

    print()
    print(
        f"Receipt: {receipt}"
    )


def print_audit(
    payload: dict[str, Any],
    receipt: Path,
) -> None:
    contract = payload[
        "contract"
    ]

    passed = bool(
        payload.get(
            "pass"
        )
    )

    print(
        "⚔️  AOE2WAR REPLAY TRUTH AUDIT"
    )
    print()
    print(
        f"Production source:   "
        f"{payload.get('productionSource', '')[:12]}"
    )
    print(
        f"Final games checked: "
        f"{payload.get('finalGames')}"
    )
    print(
        "Database read-only:  PROVEN"
    )
    print()
    print(
        f"Contract mismatches: "
        f"{contract['contractMismatchGames']}"
    )
    print(
        f"Scalar authority:    "
        f"{contract['scalarAuthorityRows']}"
    )
    print(
        f"Scalar incoherent:   "
        f"{contract['scalarAuthorityIncoherent']}"
    )
    print()
    print(
        "AUDIT: "
        + (
            "PASS"
            if passed
            else "FAIL"
        )
    )
    print(
        f"Receipt: {receipt}"
    )


def print_closure(
    payload: dict[str, Any],
    receipt: Path,
) -> None:
    closure = payload["closure"]
    final_games = int(closure["finalGames"])
    accounted = int(closure["fullyAccounted"])
    resolved = int(closure["resolved"])
    unresolved = int(closure["unresolved"])

    print(
        "⚔️  AOE2WAR REPLAY CERTAINTY CLOSURE"
    )
    print()
    print(
        f"Production source:     "
        f"{payload.get('productionSource', '')[:12]}"
    )
    print(
        "Database read-only:    PROVEN"
    )
    print()
    print(
        f"Final games:           {final_games}"
    )
    print(
        f"Resolved truth:        "
        f"{resolved} ({pct(resolved, final_games)})"
    )
    print(
        f"Unresolved truth:      {unresolved}"
    )
    print(
        f"Disposition accounted: "
        f"{accounted} ({pct(accounted, final_games)})"
    )
    print(
        f"Unclassified:          "
        f"{closure['unclassified']}"
    )
    print(
        f"Parser-work candidates:"
        f" {closure['parserWorkCandidates']}"
    )
    print(
        f"Human/evidence cases:  "
        f"{closure['humanEvidenceCandidates']}"
    )
    print(
        f"Terminal current-vault:"
        f" {closure['terminalForCurrentVault']}"
    )
    print()

    print_counts(
        "Closure dispositions",
        closure.get(
            "dispositionBuckets",
            {},
        ),
    )

    print_counts(
        "Current-vault certainty",
        closure.get(
            "currentVaultCertaintyBuckets",
            {},
        ),
    )

    print()
    print(
        "CLOSURE CLASSIFICATION: "
        + (
            "COMPLETE"
            if closure.get("complete")
            else "INCOMPLETE"
        )
    )
    print(
        f"Receipt: {receipt}"
    )


def print_target(
    payload: dict[str, Any],
    receipt: Path,
) -> None:
    game = payload[
        "game"
    ]

    truth = payload[
        "truth"
    ]

    participants = payload[
        "participants"
    ]

    team = payload[
        "team"
    ]

    topology = payload.get(
        "topology",
        {
            "known":
                team.get("known"),
            "classification":
                "LEGACY_TEAM_PROJECTION",
            "format":
                team.get("format"),
            "provenance":
                team.get("provenance"),
            "structuralDisposition":
                None,
            "recoveryRoute":
                None,
        },
    )

    print(
        "⚔️  AOE2WAR REPLAY TRUTH TARGET"
    )
    print()
    print(
        f"Game:               {game['id']}"
    )
    print(
        f"Production source:  "
        f"{payload.get('productionSource', '')[:12]}"
    )
    print(
        f"Parse source:       {game.get('parseSource')}"
    )
    print(
        f"Parse reason:       {game.get('parseReason')}"
    )
    print(
        f"Parse iteration:    {game.get('parseIteration')}"
    )
    print(
        f"Disconnect:         {game.get('disconnectDetected')}"
    )
    print(
        f"Stored winner:      {game.get('storedWinner')}"
    )
    print()
    print(
        f"Truth winner:       {truth.get('winner')}"
    )
    print(
        f"Candidate winner:   {truth.get('candidateWinner')}"
    )
    print(
        f"Confidence:         {truth.get('confidence')}"
    )
    print(
        f"Stats eligible:     {truth.get('statsEligible')}"
    )
    print(
        f"Betting eligible:   {truth.get('bettingEligible')}"
    )
    print(
        "Truth reasons:      "
        + ", ".join(
            truth.get(
                "truthReasons",
                [],
            )
        )
    )
    print()
    print(
        f"Topology known:     {topology.get('known')}"
    )
    print(
        f"Topology class:     {topology.get('classification')}"
    )
    print(
        f"Topology format:    {topology.get('format')}"
    )
    print(
        f"Topology source:    {topology.get('provenance')}"
    )
    print(
        f"Topology state:     {topology.get('structuralDisposition')}"
    )
    print(
        "Topology route:     "
        + (
            str(
                topology.get(
                    "recoveryRoute"
                )
            )
            if topology.get(
                "recoveryRoute"
            )
            else "—"
        )
    )
    print()
    print(
        f"Two-team known:     {team.get('known')}"
    )
    print(
        f"Team mode:          {team.get('mode')}"
    )
    print(
        f"Team format:        {team.get('format')}"
    )
    print(
        "Team blockers:      "
        + (
            ", ".join(
                team.get(
                    "reasonCodes",
                    [],
                )
            )
            or "—"
        )
    )
    print()
    print(
        f"Player results:     "
        f"{participants['wins']}W / "
        f"{participants['losses']}L / "
        f"{participants['unknown']} unknown"
    )
    print(
        f"Contract mismatch:  "
        f"{payload.get('contractMismatch')}"
    )
    print(
        f"Route:              {payload.get('route')}"
    )

    parse_run = payload.get(
        "latestParseRun"
    )

    projection = payload.get(
        "currentAcceptedProjection"
    )

    adjudication = payload.get(
        "effectiveAdjudication"
    )

    print()
    print(
        "Latest parse run:    "
        + (
            (
                f"#{parse_run.get('id')} "
                f"{parse_run.get('parserName')} "
                f"{parse_run.get('parserVersion')} "
                f"{parse_run.get('passName')} "
                f"v{parse_run.get('passVersion')}"
            )
            if parse_run
            else "—"
        )
    )

    print(
        "Current projection:  "
        + (
            (
                f"#{projection.get('id')} "
                f"{projection.get('resultEligibility')}"
            )
            if projection
            else "—"
        )
    )

    print(
        "Adjudication:        "
        + (
            (
                f"#{adjudication.get('id')} "
                f"affectsStats={adjudication.get('affectsStats')} "
                f"affectsBets={adjudication.get('affectsBets')}"
            )
            if adjudication
            else "—"
        )
    )

    print()
    print(
        f"Receipt: {receipt}"
    )


def print_status(
    latest_envelope: dict[str, Any] | None,
    latest_path: Path | None,
    census_envelope: dict[str, Any] | None,
    census_path: Path | None,
    audit_envelope: dict[str, Any] | None,
    audit_path: Path | None,
    closure_envelope: dict[str, Any] | None,
    closure_path: Path | None,
) -> None:
    print(
        "⚔️  AOE2WAR REPLAY TRUTH OS"
    )
    print()

    if (
        not latest_envelope or
        not latest_path
    ):
        print(
            "State:        NO RECEIPT"
        )
        print(
            "Next:         aoe2war truth census"
        )
        return

    print(
        f"Last command: "
        f"{latest_envelope.get('command')}"
    )
    print(
        f"Generated:    "
        f"{latest_envelope.get('generated_at')}"
    )
    print(
        f"Last receipt: "
        f"{latest_path}"
    )

    if (
        census_envelope and
        census_path
    ):
        census = census_envelope.get(
            "payload"
        )

        if isinstance(
            census,
            dict,
        ):
            coverage = census.get(
                "coverage",
                {},
            )

            contract = census.get(
                "contract",
                {},
            )

            print()
            print(
                "Latest census"
            )
            print(
                f"  Final games: "
                f"{census.get('finalGames')}"
            )
            print(
                f"  Result debt: "
                f"{coverage.get('resultUnknown')}"
            )
            print(
                f"  Topology unresolved: "
                f"{coverage.get('topologyUnknown', coverage.get('teamUnknown'))}"
            )
            print(
                f"  Topology unexplained: "
                f"{coverage.get('unexplainedTopologyDebt', coverage.get('teamUnknown'))}"
            )
            print(
                f"  Mismatches:  "
                f"{contract.get('contractMismatchGames')}"
            )
            print(
                f"  Receipt:     "
                f"{census_path}"
            )

    if (
        audit_envelope and
        audit_path
    ):
        audit = audit_envelope.get(
            "payload"
        )

        if isinstance(
            audit,
            dict,
        ):
            contract = audit.get(
                "contract",
                {},
            )

            print()
            print(
                "Latest audit"
            )
            print(
                "  State:       "
                + (
                    "PASS"
                    if audit.get("pass")
                    else "FAIL"
                )
            )
            print(
                f"  Mismatches:  "
                f"{contract.get('contractMismatchGames')}"
            )
            print(
                f"  Scalar bad:  "
                f"{contract.get('scalarAuthorityIncoherent')}"
            )
            print(
                f"  Receipt:     "
                f"{audit_path}"
            )



    if (
        closure_envelope and
        closure_path
    ):
        closure_payload = closure_envelope.get(
            "payload"
        )

        if isinstance(
            closure_payload,
            dict,
        ):
            closure = closure_payload.get(
                "closure",
                {},
            )

            print()
            print(
                "Latest certainty closure"
            )
            print(
                f"  Accounted:   "
                f"{closure.get('fullyAccounted')}/"
                f"{closure.get('finalGames')} "
                f"({closure.get('accountedPercent')}%)"
            )
            print(
                f"  Resolved:    "
                f"{closure.get('resolved')}"
            )
            print(
                f"  Unresolved:  "
                f"{closure.get('unresolved')}"
            )
            print(
                f"  Unclassified:"
                f" {closure.get('unclassified')}"
            )
            print(
                f"  State:       "
                + (
                    "COMPLETE"
                    if closure.get("complete")
                    else "INCOMPLETE"
                )
            )
            print(
                f"  Receipt:     "
                f"{closure_path}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war truth",
        description=(
            "Read-only Replay Truth OS "
            "for production corpus debt, "
            "cross-layer audits and one-game forensics."
        ),
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True,
    )

    status_parser = sub.add_parser(
        "status",
        help="show the newest durable truth receipt",
    )
    status_parser.add_argument(
        "--json",
        action="store_true",
    )

    census_parser = sub.add_parser(
        "census",
        help="run a hard read-only production truth-debt census",
    )
    census_parser.add_argument(
        "--json",
        action="store_true",
    )

    audit_parser = sub.add_parser(
        "audit",
        help="run the full cross-layer replay-truth contract audit",
    )
    audit_parser.add_argument(
        "--json",
        action="store_true",
    )

    closure_parser = sub.add_parser(
        "closure",
        help=(
            "classify every final game as resolved or one explicit "
            "current-vault recovery/impossibility disposition"
        ),
    )
    closure_parser.add_argument(
        "--json",
        action="store_true",
    )

    target_parser = sub.add_parser(
        "target",
        help="inspect one production GameStats replay",
    )
    target_parser.add_argument(
        "game_id",
        type=int,
    )
    target_parser.add_argument(
        "--json",
        action="store_true",
    )

    args = parser.parse_args()

    try:
        if args.command == "status":
            receipt = latest_receipt()

            census_receipt = (
                latest_receipt(
                    "census"
                )
            )

            audit_receipt = (
                latest_receipt(
                    "audit"
                )
            )

            closure_receipt = (
                latest_receipt(
                    "closure"
                )
            )

            envelope = (
                load_json(
                    receipt
                )
                if receipt
                else None
            )

            census_envelope = (
                load_json(
                    census_receipt
                )
                if census_receipt
                else None
            )

            audit_envelope = (
                load_json(
                    audit_receipt
                )
                if audit_receipt
                else None
            )

            closure_envelope = (
                load_json(
                    closure_receipt
                )
                if closure_receipt
                else None
            )

            if args.json:
                print(
                    json.dumps(
                        {
                            "latestReceipt":
                                str(receipt)
                                if receipt
                                else None,

                            "latest":
                                envelope,

                            "censusReceipt":
                                str(census_receipt)
                                if census_receipt
                                else None,

                            "census":
                                census_envelope,

                            "auditReceipt":
                                str(audit_receipt)
                                if audit_receipt
                                else None,

                            "audit":
                                audit_envelope,

                            "closureReceipt":
                                str(closure_receipt)
                                if closure_receipt
                                else None,

                            "closure":
                                closure_envelope,
                        },
                        indent=2,
                        sort_keys=True,
                    )
                )
            else:
                print_status(
                    envelope,
                    receipt,
                    census_envelope,
                    census_receipt,
                    audit_envelope,
                    audit_receipt,
                    closure_envelope,
                    closure_receipt,
                )

            return 0

        game_id = (
            args.game_id
            if args.command == "target"
            else None
        )

        payload = run_remote(
            args.command,
            game_id,
        )

        receipt = write_receipt(
            args.command,
            payload,
        )

        if args.json:
            print(
                json.dumps(
                    {
                        "receipt":
                            str(receipt),
                        "payload":
                            payload,
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
        elif args.command == "census":
            print_census(
                payload,
                receipt,
            )
        elif args.command == "audit":
            print_audit(
                payload,
                receipt,
            )
        elif args.command == "closure":
            print_closure(
                payload,
                receipt,
            )
        else:
            print_target(
                payload,
                receipt,
            )

        if (
            args.command == "audit" and
            not payload.get("pass")
        ):
            return 1

        return 0

    except (
        OSError,
        subprocess.TimeoutExpired,
        TruthError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        print(
            f"STOP: {exc}",
            file=sys.stderr,
        )

        return 2


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
