#!/usr/bin/env python3
"""Read-only source/byte verification of the private v1.6.4 GitHub draft.

This does not publish the release or modify any local or production file.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

from aoe2_watcher_release import (
    all_release_files, validate_bundle, WatcherReleasePromotionError
)

REPO = "Emaren/aoe2-watcher"
VERSION = "1.6.4"
SOURCE_SHA = "a223ad41c1a877e30e6f532c915aa40499d2c746"

class DraftProofError(RuntimeError):
    pass


def fetch_draft() -> dict:
    # GET /releases/tags/{tag} may return 404 for an unpublished draft.
    # The authenticated collection endpoint includes drafts for repo writers.
    result = subprocess.run([
        "gh", "api", "-X", "GET", f"repos/{REPO}/releases?per_page=100",
    ], capture_output=True, text=True, check=False, timeout=35)
    if result.returncode != 0:
        raise DraftProofError(
            "STOP: cannot list authenticated GitHub releases: "
            + (result.stderr or "").strip()[:250]
        )
    try:
        releases = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise DraftProofError("STOP: malformed GitHub release list") from exc
    if not isinstance(releases, list):
        raise DraftProofError("STOP: GitHub releases response is not a list")
    matches = [
        release for release in releases
        if isinstance(release, dict) and release.get("tag_name") == f"v{VERSION}"
    ]
    if len(matches) != 1:
        raise DraftProofError(
            f"STOP: expected exactly one authenticated v{VERSION} draft, found {len(matches)}"
        )
    value = matches[0]
    if (value.get("draft") is not True
        or value.get("prerelease") is True
        or value.get("target_commitish") != SOURCE_SHA):
        raise DraftProofError("STOP: release is not a private draft bound to the expected source")
    return value


def prove_draft(root: Path, payload: dict) -> list[dict]:
    try:
        local = validate_bundle(root, VERSION)
    except WatcherReleasePromotionError as exc:
        raise DraftProofError(f"STOP: local bundle failed protected validation: {exc}") from exc
    if len(local) != len(all_release_files(VERSION)):
        raise DraftProofError("STOP: unexpected number of local certified files")
    assets = payload.get("assets")
    if not isinstance(assets, list) or len(assets) != len(local):
        raise DraftProofError("STOP: GitHub draft asset count differs from local bundle")
    local_bytes = Counter((row["sha256"], row["bytes"]) for row in local)
    remote_bytes = Counter()
    names = set()
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("name"), str):
            raise DraftProofError("STOP: GitHub asset metadata is invalid")
        if asset["name"] in names:
            raise DraftProofError("STOP: duplicate GitHub release asset filename")
        names.add(asset["name"])
        digest = str(asset.get("digest") or "")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
            raise DraftProofError("STOP: GitHub release asset missing valid SHA-256 digest")
        size = asset.get("size")
        if type(size) is not int or size <= 0:
            raise DraftProofError("STOP: GitHub release asset missing byte count")
        remote_bytes[digest[7:], size] += 1
    if local_bytes != remote_bytes:
        raise DraftProofError(
            "STOP: GitHub release digest+size multiset differs from certified local files"
        )
    return local


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    payload = fetch_draft()
    proven = prove_draft(args.bundle, payload)
    print(f"PASS: v{VERSION} private GitHub draft {len(proven)}/{len(proven)} SHA-256+size matched")
    print(f"Source: {SOURCE_SHA}")
    print(f"Draft release ID: {payload.get('id')}")
    print("PUBLICATION NOT PERFORMED; PRODUCTION NOT MODIFIED")


if __name__ == "__main__":
    main()
