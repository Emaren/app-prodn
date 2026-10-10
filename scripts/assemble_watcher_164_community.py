#!/usr/bin/env python3
"""Assemble the explicitly unsigned-macOS Watcher 1.6.4 community release.

Local, non-publishing operation. Signed Windows bytes + tested unsigned Mac/Linux
bytes must all have the same exact runtime source and proven GitHub run identity.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

from aoe2_watcher_release import canonical_files, validate_bundle, sha256_file

VERSION = "1.6.4"
SOURCE_SHA = "a223ad41c1a877e30e6f532c915aa40499d2c746"
WINDOWS_RUN = 38087777891
CI_RUN = 38087519262
REPO = "Emaren/aoe2-watcher"
SIGNED_WINDOWS = {
    "AoE2HDBets Watcher Setup 1.6.4.exe":
        "1b26ff51e5c1b3fc6d7dfde2fe7ea1eb62e0f6d636c98caa9237de15378f554d",
    "AoE2HDBets Watcher 1.6.4.exe":
        "ff00e37669f3aa97d360071f463201fb616aa7653bf2bd8e46bbb7ae59ca18da",
}

class BundleAssemblyError(RuntimeError):
    pass


def require_run(run_id: int, name: str, event: str) -> None:
    cmd = [
        "gh", "run", "view", str(run_id), "-R", REPO,
        "--json", "name,event,headSha,conclusion",
    ]
    result = subprocess.run(
        cmd, text=True, capture_output=True, timeout=35, check=False,
    )
    if result.returncode:
        raise BundleAssemblyError(f"STOP: cannot verify GitHub run {run_id}")
    payload = json.loads(result.stdout)
    want = dict(name=name, event=event, headSha=SOURCE_SHA, conclusion="success")
    for key, value in want.items():
        if payload.get(key) != value:
            raise BundleAssemblyError(
                f"STOP: run {run_id} {key} does not match sealed authority"
            )


def unique_file(root: Path, name: str) -> Path:
    if not root.is_dir() or root.is_symlink():
        raise BundleAssemblyError(f"STOP: missing/untrusted artifact directory: {root}")
    matches = [p for p in root.rglob(name) if p.name == name]
    if len(matches) != 1:
        raise BundleAssemblyError(f"STOP: expected one copy of {name}, got {len(matches)}")
    p = matches[0]
    if not p.is_file() or p.is_symlink() or p.stat().st_size == 0:
        raise BundleAssemblyError(f"STOP: untrusted artifact file: {name}")
    return p


def verify_windows(root: Path) -> None:
    inventory = unique_file(root, "SIGNED_WINDOWS_SHA256.txt").read_text(encoding="utf-8-sig")
    rows = {}
    for line in inventory.splitlines():
        m = re.fullmatch(r"([0-9a-f]{64})  (.+)", line.strip())
        if not m or m.group(2) in rows:
            raise BundleAssemblyError("STOP: invalid signed-Windows checksum inventory")
        rows[m.group(2)] = m.group(1)
    if rows != SIGNED_WINDOWS:
        raise BundleAssemblyError("STOP: signed-Windows manifest not authoritative")
    for name, digest in SIGNED_WINDOWS.items():
        if sha256_file(unique_file(root, name)) != digest:
            raise BundleAssemblyError(f"STOP: signed Windows bytes mismatch: {name}")


def build_bundle(windows: Path, mac: Path, linux: Path, output: Path) -> list[dict]:
    if output.exists():
        raise BundleAssemblyError("STOP: output must be a new, nonexisting directory")
    verify_windows(windows)
    files = canonical_files(VERSION)
    generated = {"latest.yml", "latest-linux.yml"}
    try:
        output.mkdir(parents=True)
        for name in files:
            if name in generated:
                continue
            root = windows if name in SIGNED_WINDOWS else (
                linux if name.endswith(".AppImage") else mac
            )
            source = unique_file(root, name)
            shutil.copyfile(source, output / name)

        installer = (output / "AoE2HDBets Watcher Setup 1.6.4.exe").read_bytes()
        sha512 = base64.b64encode(hashlib.sha512(installer).digest()).decode()
        timestamp = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        (output / "latest.yml").write_text(
            f"version: {VERSION}\n"
            "files:\n"
            f"  - url: AoE2HDBets%20Watcher%20Setup%20{VERSION}.exe\n"
            f"    sha512: {sha512}\n"
            f"    size: {len(installer)}\n"
            f"path: AoE2HDBets Watcher Setup {VERSION}.exe\n"
            f"sha512: {sha512}\n"
            f"releaseDate: '{timestamp}'\n", encoding="utf-8",
        )
        appimage = output / f"AoE2HDBets Watcher-{VERSION}.AppImage"
        linux_bytes = appimage.read_bytes()
        linux_sha = base64.b64encode(hashlib.sha512(linux_bytes).digest()).decode()
        (output / "latest-linux.yml").write_text(
            f"version: {VERSION}\n"
            "files:\n"
            f"  - url: AoE2HDBets Watcher-{VERSION}.AppImage\n"
            f"    sha512: {linux_sha}\n"
            f"    size: {len(linux_bytes)}\n"
            f"path: AoE2HDBets Watcher-{VERSION}.AppImage\n"
            f"sha512: {linux_sha}\n"
            f"releaseDate: '{timestamp}'\n", encoding="utf-8",
        )
        rows = []
        for name in files:
            p = output / name
            rows.append({"filename": name, "bytes": p.stat().st_size, "sha256": sha256_file(p)})

        (output / f"SHA256SUMS-{VERSION}.txt").write_text(
            "".join(f"{r['sha256']}  {r['filename']}\n" for r in rows), encoding="utf-8"
        )
        release = {
            "schema": 2,
            "release": f"AoE2HDBets Watcher {VERSION}",
            "version": VERSION,
            "runtime_source_sha": SOURCE_SHA,
            "build_source_sha": SOURCE_SHA,
            "windows_signing_run_id": WINDOWS_RUN,
            "nonwindows_build_run_id": CI_RUN,
            "macos_build_authority": "local-clean-exact-source-unsigned-manual",
            "distribution_policy": {
                "windows": "azure-artifact-signed-rfc3161",
                "macos": "unsigned-manual-only-no-autoupdate",
                "linux": "unsigned-appimage",
            },
            "files": rows,
        }
        (output / f"watcher-release-manifest-{VERSION}.json").write_text(
            json.dumps(release, indent=2) + "\n", encoding="utf-8"
        )
        # The production promoter validates every file, receipt, native Mac ZIP
        # SHA512, and updater version/path before it can plan a remote mutation.
        validation = validate_bundle(output, VERSION)
        if len(validation) != len(files) + 2:
            raise BundleAssemblyError("STOP: incomplete immutable release inventory")
        return validation
    except Exception:
        # Preserve failed evidence for diagnosis: never silently delete output.
        raise


def require_local_mac_build(root: Path) -> None:
    """Require the local macOS build to come from the exact clean watcher tree."""
    if root.name != "dist":
        raise BundleAssemblyError("STOP: macOS input must be the Watcher dist directory")
    watcher = root.parent
    def git(*args: str) -> str:
        result = subprocess.run(
            ["git", "-C", str(watcher), *args],
            text=True, capture_output=True, timeout=20, check=False,
        )
        if result.returncode:
            raise BundleAssemblyError("STOP: cannot establish local macOS source")
        return result.stdout.strip()
    if git("rev-parse", "HEAD") != SOURCE_SHA:
        raise BundleAssemblyError("STOP: local Mac build source is not the signed 1.6.4 SHA")
    if git("status", "--porcelain"):
        raise BundleAssemblyError("STOP: Watcher worktree changed during local Mac build")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--windows", type=Path, required=True)
    parser.add_argument("--macos", type=Path, required=True)
    parser.add_argument("--linux", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require_run(WINDOWS_RUN, "Sign Windows Watcher", "workflow_dispatch")
    require_local_mac_build(args.macos)
    require_run(CI_RUN, "Watcher CI", "pull_request")
    result = build_bundle(args.windows, args.macos, args.linux, args.output)
    print("PASS: 1.6.4 community bundle sealed (Windows signed, local Mac manual unsigned, Linux unsigned)")
    print("Files:", len(result), "including both immutable receipts")
    print("Bundle:", args.output)
    print("NO PUBLICATION OR PRODUCTION MUTATION WAS PERFORMED.")


if __name__ == "__main__":
    main()
