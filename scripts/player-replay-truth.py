#!/usr/bin/env python3
"""Read-only player inventory and exact-baseline evidence audit; never applies truth."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SHA = re.compile(r"[a-f0-9]{64}\Z")

def canonical_receipt_dir():
    common = subprocess.check_output(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=ROOT, text=True).strip()
    return Path(common).parent / ".aoe2war-release/truth-receipts"

def targets_from_file(path):
    values = json.loads(Path(path).read_text())
    if not isinstance(values, list) or not 1 <= len(values) <= 10:
        raise ValueError("expected 1-10 exact player identities")
    result = []
    for value in values:
        if not isinstance(value, dict) or set(value) - {"name", "uid"}:
            raise ValueError("player accepts only name and optional canonical UID")
        name = value.get("name")
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            raise ValueError("exact player name required")
        if "uid" in value and (not isinstance(value["uid"], str) or not re.fullmatch(r"u_[a-zA-Z0-9_-]{1,96}", value["uid"])):
            raise ValueError("invalid canonical UID")
        result.append({**value, "name": name.strip()})
    if len({(v["name"].casefold(), v.get("uid")) for v in result}) != len(result):
        raise ValueError("duplicate target identity")
    return result

def evidence_targets(path, expected):
    raw = Path(path).read_bytes()
    if not SHA.fullmatch(expected) or hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("baseline digest mismatch")
    value = json.loads(raw)
    value = value.get("payload", value)
    # A baseline is an inventory, never an apply plan or result authority.
    if value.get("mutations") != {"production": 0, "parserRows": 0, "identityRows": 0, "currentRatingRows": 0, "wolo": 0}:
        raise ValueError("baseline must prove no mutations")
    unknown, controls, roster, bindings = set(), set(), set(), {}
    for player in value["players"]:
        if player["identityAmbiguous"]:
            raise ValueError("resolve player ambiguity before evidence campaign")
        for case in player["cases"]:
            ident, digest = case["id"], case["replayHash"]
            if type(ident) is not int or ident <= 0 or not SHA.fullmatch(digest):
                raise ValueError("invalid exact game binding")
            if ident in bindings and bindings[ident] != digest:
                raise ValueError("mixed source hash for one game")
            bindings[ident] = digest
            if not case["fullBattleTruth"]:
                unknown.add(ident)
                if not case["roster"]["complete"]:
                    roster.add(ident)
        controls.update(c["id"] for c in [c for c in player["cases"] if c["fullBattleTruth"]][:2])
    ids = sorted(unknown | controls)
    return {"ids": sorted(unknown), "controls": sorted(controls), "rosterIds": sorted(roster), "bindings": {str(i): bindings[i] for i in ids}}

def seal(payload, directory, kind):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(payload, sort_keys=True, indent=2) + "\n").encode()
    digest = hashlib.sha256(raw).hexdigest()
    path = directory / f"player-first-{kind}-{digest}.json"
    with path.open("xb") as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())
    path.chmod(0o400)
    return {"path": str(path), "sha256": digest, "bytes": len(raw)}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["baseline", "evidence"])
    parser.add_argument("--targets", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--baseline-sha256")
    parser.add_argument("--receipt-dir", type=Path)
    args = parser.parse_args(argv)
    if args.mode == "baseline":
        if not args.targets or args.baseline:
            parser.error("baseline requires --targets, without --baseline")
        targets = targets_from_file(args.targets)
        source = ROOT / "scripts/player_replay_truth_remote.mjs"
    else:
        if not args.baseline or not args.baseline_sha256 or args.targets:
            parser.error("evidence requires --baseline and --baseline-sha256, without --targets")
        targets = evidence_targets(args.baseline, args.baseline_sha256)
        source = ROOT / "scripts/player_replay_evidence_remote.mjs"
    program = source.read_text()
    marker = "const targets = []; // injected exact scope"
    if program.count(marker) != 1:
        raise ValueError("remote scope marker missing or ambiguous")
    program = program.replace(marker, "const targets=" + json.dumps(targets, ensure_ascii=True) + ";")
    spec = importlib.util.spec_from_file_location("truth", ROOT / "scripts/aoe2_truth.py")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    with tempfile.TemporaryDirectory(prefix="aoe2war-player-observe-") as temp:
        rendered = Path(temp) / "observer.mjs"
        rendered.write_text(program)
        truth.REMOTE_PROGRAM = rendered
        payload = truth.run_remote("census")
    envelope = {"kind": "aoe2war-player-first-" + args.mode, "schema": 1,
                "observerSha256": hashlib.sha256(program.encode()).hexdigest(),
                "baselineSha256": args.baseline_sha256,
                "databaseMutated": False, "runtimeMutated": False, "woloMutated": False,
                "payload": payload}
    receipt = seal(envelope, args.receipt_dir or canonical_receipt_dir(), args.mode)
    print(json.dumps(receipt, indent=2))

if __name__ == "__main__":
    main()
