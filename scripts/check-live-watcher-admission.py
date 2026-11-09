#!/usr/bin/env python3
"""Qualify controlled ORIGINAL LIVE upload -> private HD admission, not custody.

Exact Replay API source, production Python lock, real Watcher authentication,
HMAC, archive, SQL commit and post-commit notifier feed canonical HD writers.
The parser/capture and notifier delivery remain explicitly fixture-controlled.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "5a2750849e59f0e4551c6e9e0417b59254cff467"

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=300, **kwargs)

with tempfile.TemporaryDirectory(prefix="hd-live-api-") as temporary:
    root = Path(temporary)
    source = root / "api"
    run(["git", "clone", "--quiet", "--no-checkout", os.environ.get("LIVE_ADMISSION_API_LOCAL_SOURCE") or
         "https://github.com/Emaren/api-prodn.git", str(source)])
    run(["git", "checkout", "--quiet", "--detach", SOURCE], cwd=source)
    assert not subprocess.check_output(["git", "status", "--porcelain"], cwd=source)
    python = os.environ.get("LIVE_ADMISSION_API_PYTHON")
    if not python:
        run([sys.executable, "-m", "venv", str(root / "venv")])
        python = str(root / "venv/bin/python")
        run([python, "-m", "pip", "install", "--quiet", "-r", str(source / "requirements.production.lock")])
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("PG") or key in {"DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "INTERNAL_API_KEY"}:
            env.pop(key, None)
    env.update(LIVE_ADMISSION_API_SOURCE=str(source), LIVE_ADMISSION_API_PYTHON=python,
               RUN_LIVE_MARKET_PG_TESTS="1", PYTHONDONTWRITEBYTECODE="1")
    print("Controlled ORIGINAL LIVE API source:", SOURCE, flush=True)
    run(["node", "--experimental-strip-types", "--experimental-loader", "./scripts/aoe2-alias-loader.mjs",
         "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--test", "tests/live-watcher-market-admission-postgres.test.mts"], cwd=ROOT, env=env)
