#!/usr/bin/env python3
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = "debian-openssl-3.0.x"
ENGINE_NAME = "schema-engine"
SEED_DIR = ROOT / ".prisma-engine-seed"
ENGINE_PATH = SEED_DIR / f"{ENGINE_NAME}-{TARGET}"
METADATA_PATH = SEED_DIR / "metadata.json"
VERSION_MANIFEST = ROOT / "node_modules" / "@prisma" / "engines-version" / "package.json"
MAX_COMPRESSED_BYTES = 128 * 1024 * 1024
MAX_RAW_BYTES = 512 * 1024 * 1024


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_checksum(raw: bytes, label: str) -> str:
    text = raw.decode("ascii", "strict").strip()
    token = text.split()[0] if text else ""
    if not re.fullmatch(r"[0-9a-f]{64}", token):
        raise RuntimeError(f"invalid {label} checksum")
    return token


def fetch_bytes(url: str, *, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "AoE2WAR-Prisma-Engine-Seed/1"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(MAX_COMPRESSED_BYTES + 1)
def candidate_engine_commit() -> str:
    payload = json.loads(VERSION_MANIFEST.read_text(encoding="utf-8"))
    commit = str((payload.get("prisma") or {}).get("enginesVersion") or "")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("candidate Prisma enginesVersion is invalid")
    return commit


def seed() -> dict[str, object]:
    if SEED_DIR.exists() or SEED_DIR.is_symlink():
        raise RuntimeError("Prisma engine seed directory already exists")

    commit = candidate_engine_commit()
    base = (
        "https://binaries.prisma.sh/all_commits/"
        f"{commit}/{TARGET}/{ENGINE_NAME}"
    )
    gz_url = base + ".gz"
    gz_sha_url = gz_url + ".sha256"
    raw_sha_url = base + ".sha256"

    expected_gz = parse_checksum(fetch_bytes(gz_sha_url), "compressed")
    expected_raw = parse_checksum(fetch_bytes(raw_sha_url), "raw")
    compressed = fetch_bytes(gz_url)
    if len(compressed) > MAX_COMPRESSED_BYTES:
        raise RuntimeError("compressed Prisma engine exceeds size limit")
    actual_gz = sha256_bytes(compressed)
    if actual_gz != expected_gz:
        raise RuntimeError("compressed Prisma engine checksum mismatch")

    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        raw = stream.read(MAX_RAW_BYTES + 1)
    if len(raw) > MAX_RAW_BYTES:
        raise RuntimeError("Prisma engine exceeds decompressed size limit")
    actual_raw = sha256_bytes(raw)
    if actual_raw != expected_raw:
        raise RuntimeError("Prisma engine checksum mismatch")
    SEED_DIR.mkdir(mode=0o700)
    partial = ENGINE_PATH.with_name(ENGINE_PATH.name + f".partial.{os.getpid()}")
    partial.write_bytes(raw)
    os.chmod(partial, 0o755)
    os.replace(partial, ENGINE_PATH)

    version = subprocess.run(
        [str(ENGINE_PATH), "--version"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=20,
        check=False,
    )
    expected_version = f"schema-engine-cli {commit}"
    if version.returncode != 0 or version.stdout.strip() != expected_version:
        raise RuntimeError("downloaded Prisma engine version proof failed")

    payload: dict[str, object] = {
        "schema": 1,
        "kind": "aoe2war-prisma-engine-seed",
        "status": "PASS",
        "target": TARGET,
        "engine_commit": commit,
        "engine_sha256": actual_raw,
        "compressed_sha256": actual_gz,
        "source_url": gz_url,
        "checksum_url": raw_sha_url,
        "compressed_checksum_url": gz_sha_url,
        "engine_relative_path": str(ENGINE_PATH.relative_to(ROOT)),
    }
    metadata_partial = METADATA_PATH.with_name(
        METADATA_PATH.name + f".partial.{os.getpid()}"
    )
    metadata_partial.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.chmod(metadata_partial, 0o600)
    os.replace(metadata_partial, METADATA_PATH)
    return payload


def main() -> int:
    payload = seed()
    print(json.dumps(payload, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
