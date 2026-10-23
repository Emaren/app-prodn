#!/usr/bin/env python3
"""Explicit ORIGINAL LIVE qualification modes; neither is a human/mainnet canary.

--capture: authorized LOCAL exact API source executes real auth/HMAC/archive/SQL
and its private notifier, with a controlled parser/capture/delivery transport.
--replay: CI replays the immutable sanitized capture into real HD PostgreSQL.
It never claims the private API ran in CI and needs no new GitHub credential.
"""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "5a2750849e59f0e4551c6e9e0417b59254cff467"
CAPTURE = ROOT / "tests/fixtures/controlled-live-api-hd-capture.json"

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=300, **kwargs)

parser = argparse.ArgumentParser(description=__doc__)
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--capture", action="store_true")
mode.add_argument("--replay", action="store_true")
parser.add_argument("--api-source", type=Path)
parser.add_argument("--api-python", type=Path)
args = parser.parse_args()
env = os.environ.copy()
for key in list(env):
    if key.startswith("PG") or key in {"DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "INTERNAL_API_KEY"}:
        env.pop(key, None)
# Never inherit an API path that could silently turn CI replay into execution.
for key in ("LIVE_ADMISSION_API_SOURCE", "LIVE_ADMISSION_API_PYTHON", "LIVE_ADMISSION_API_CAPTURE_OUTPUT"):
    env.pop(key, None)
env.update(RUN_LIVE_MARKET_PG_TESTS="1", PYTHONDONTWRITEBYTECODE="1")
command = ["node", "--experimental-strip-types", "--experimental-loader", "./scripts/aoe2-alias-loader.mjs",
           "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--test", "tests/live-watcher-admission-postgres.integration.test.mts"]
if args.capture:
    assert args.api_source and args.api_python, "capture requires explicit authorized local API source and interpreter"
    source = args.api_source.resolve(strict=True)
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip() == SOURCE
    assert not subprocess.check_output(["git", "status", "--porcelain"], cwd=source), "capture source must be clean"
    # Preserve the venv executable path: resolving its symlink would run the
    # base interpreter and silently discard the pinned environment.
    assert args.api_python.is_file()
    python = str(args.api_python.absolute())
    version = subprocess.check_output([python,"-c","import sys;print('.'.join(map(str,sys.version_info[:3])))"],text=True).strip()
    assert version == "3.12.3", "capture requires the source-pinned API Python3.12.3 runtime"
    freeze = subprocess.check_output([python,"-m","pip","freeze","--all"],text=True).splitlines()
    assert sorted(freeze) == sorted((source/"requirements.production.lock").read_text().splitlines()), "capture Python packages differ from exact API production lock"
    with tempfile.TemporaryDirectory(prefix="hd-live-capture-") as temporary:
        output = Path(temporary) / "capture.json"
        env.update(LIVE_ADMISSION_API_SOURCE=str(source), LIVE_ADMISSION_API_PYTHON=python,
                   LIVE_ADMISSION_API_CAPTURE_OUTPUT=str(output), LIVE_ADMISSION_TEST_MODE="actual-api-controlled-parser")
        print("Actual LOCAL controlled API qualification:", SOURCE, flush=True)
        run(command, cwd=ROOT, env=env)
        data = output.read_bytes()
        CAPTURE.write_bytes(data)
        CAPTURE.with_suffix(".sha256").write_text(hashlib.sha256(data).hexdigest()+"\n")
        print("Sanitized controlled capture saved; source/HMAC qualification, no financial authority:", hashlib.sha256(data).hexdigest())
else:
    assert not args.api_source and not args.api_python, "replay never accepts an API source or interpreter"
    data = CAPTURE.read_bytes()
    assert hashlib.sha256(data).hexdigest() == CAPTURE.with_suffix(".sha256").read_text().strip(), "capture checksum mismatch"
    env.update(LIVE_ADMISSION_TEST_MODE="immutable-capture-replay", LIVE_ADMISSION_CAPTURE=str(CAPTURE))
    print("CI fixture replay ONLY: immutable controlled capture -> actual HD PostgreSQL; API does not execute", flush=True)
    run(command, cwd=ROOT, env=env)
