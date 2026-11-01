#!/usr/bin/env python3
"""Exact-byte dev-tool compatibility: @eslint/eslintrc 3.3.7 + minimatch 11.

No lint bypass. Refuses unknown package/source bytes and any vulnerable
minimatch version. Applies one named-import compatibility change in the
locally installed dev dependency only; yarn.lock remains source of packages.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

ORIGINAL_SHA256 = "2aef71cc401e776a9a9f531619ff6a7dbd90cfbbf46afad1c9bdeb566879e69c"
ORIGINAL = b'import minimatch from "minimatch";'
REPLACEMENT = b'import * as minimatch from "minimatch";'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def patch(root: Path):
    node_modules = root / "node_modules"
    eslintrc = node_modules / "@eslint/eslintrc"
    minimatch = node_modules / "minimatch"
    target = eslintrc / "lib/config-array/override-tester.js"
    for p in (eslintrc, minimatch, target):
        if p.is_symlink():
            raise RuntimeError("DEV_TOOL_SYMLINK_DRIFT")
    old_version = json.loads((eslintrc / "package.json").read_text())["version"]
    new_version = json.loads((minimatch / "package.json").read_text())["version"]
    if old_version != "3.3.7" or new_version != "11.0.3":
        raise RuntimeError("DEV_TOOL_VERSION_DRIFT")
    raw = target.read_bytes()
    after = raw.replace(ORIGINAL, REPLACEMENT)
    if raw == after and digest(raw) == digest_source_after():
        return "PASS_ALREADY_PATCHED"
    if digest(raw) != ORIGINAL_SHA256 or raw.count(ORIGINAL) != 1:
        raise RuntimeError("DEV_TOOL_EXACT_SOURCE_DRIFT")
    if not REPLACEMENT in after or after.count(REPLACEMENT) != 1:
        raise RuntimeError("DEV_TOOL_NAMED_IMPORT_NOT_UNIQUE")
    tmp = target.with_name(target.name + ".compat.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(after)
            f.flush()
            os.fsync(f.fileno())
        if digest(tmp.read_bytes()) != digest_source_after():
            raise RuntimeError("DEV_TOOL_PATCH_WRITE_DRIFT")
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            tmp.unlink()
    return "PASS_MINIMATCH11_NAMED_IMPORT_COMPAT"

def digest_source_after():
    # constant from the exact, reviewed original file with ONE import rewritten.
    return 'f4cf1f4e03de78918ee2f81ccc5d0fa330409e9161ed06226ab8f105f31a8cf5'

if __name__ == "__main__":
    try:
        p = argparse.ArgumentParser()
        p.add_argument("--root", type=Path, default=Path.cwd())
        args = p.parse_args()
        print(patch(args.root.resolve()))
    except (RuntimeError, OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        print("HOLD_ESLINT_MINIMATCH_COMPAT:" + str(e), file=sys.stderr)
        sys.exit(2)
