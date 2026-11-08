#!/usr/bin/env python3
"""Read-only native R25 fallback cache admission; never changes runtime or DB.

Usage (only after independently approved 3033 stage):
  python3 -B -m scripts.r25_public_avatar_cache_acceptance \
    --origin http://127.0.0.1:3033 \
    --source EXACT_SOURCE_SHA40 --build EXACT_NEXT_BUILD_ID

This narrowly probes one intentionally unknown public avatar target. Three
real assigned managed-avatar byte-parity checks remain a SEPARATE required
test: python3 -B -m scripts.r25_public_avatar_parity --help
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from urllib.request import Request, build_opener

from scripts.r25_public_avatar_parity import NoExternalRedirects, safe_origin

TARGET = "missing-public-r25-test-avatar"
PATH = "/api/media-assets/avatar/" + TARGET + "?size=card"
MAX_IMAGE_BYTES = 2_000_000
CACHE_EXPECTED = "public, max-age=60, must-revalidate"
SHA40 = re.compile(r"[a-f0-9]{40}\Z")
BUILD_ID = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")


@dataclass(frozen=True)
class AvatarCacheReceipt:
    status: int
    content_type: str
    media_proxy: str
    fallback: str
    cache_control: str
    source: str
    build: str
    length: int
    sha256: str


def verify(proof: AvatarCacheReceipt, expected_source: str, expected_build: str) -> dict:
    if not SHA40.fullmatch(expected_source) or not BUILD_ID.fullmatch(expected_build):
        raise ValueError("HOLD_UNPINNED_CANDIDATE_IDENTITY")
    if proof.status != 200:
        raise ValueError("HOLD_FALLBACK_HTTP_NOT_200")
    if proof.source != expected_source or proof.build != expected_build:
        raise ValueError("HOLD_FALLBACK_WRONG_RUNTIME_IDENTITY")
    if proof.media_proxy != "direct-public" or proof.fallback != "1":
        raise ValueError("HOLD_FALLBACK_NOT_EXPLICITLY_IDENTIFIED")
    if proof.content_type not in ("image/webp", "image/png", "image/jpeg"):
        raise ValueError("HOLD_FALLBACK_INVALID_IMAGE_TYPE")
    if not 0 < proof.length <= MAX_IMAGE_BYTES or not re.fullmatch(r"[a-f0-9]{64}", proof.sha256):
        raise ValueError("HOLD_FALLBACK_BODY_INVALID")
    if proof.cache_control != CACHE_EXPECTED:
        raise ValueError("HOLD_FALLBACK_STALE_OR_UNBOUNDED_CACHE")
    return {
        "schema": "aoe2war.r25.avatar-fallback-cache-admission.v1",
        "status": "PASS_FALLBACK_BOUNDED_CACHE",
        "checked": 1,
        "source_sha": expected_source,
        "build_id": expected_build,
        "body_sha256": proof.sha256,
        "body_bytes": proof.length,
        "cache_control": proof.cache_control,
        "read_only": True,
        "financial_authorized": False,
        "production_mutation": False,
        "accepts_as_full_site_release": False,
    }


def fetch(origin: str) -> AvatarCacheReceipt:
    url = safe_origin(origin, "AVATAR_CANDIDATE_ORIGIN") + PATH
    request = Request(url, headers={
        "Accept": "image/webp",
        "Cache-Control": "no-cache",
        "User-Agent": "AoE2WAR-SessionB-R25-Fallback-Cache-Admission/1",
    })
    with build_opener(NoExternalRedirects()).open(request, timeout=10) as response:
        data = response.read(MAX_IMAGE_BYTES + 1)
        return AvatarCacheReceipt(
            status=response.status,
            content_type=response.headers.get("Content-Type", "").split(";", 1)[0].lower().strip(),
            media_proxy=response.headers.get("X-AoE2WAR-Media-Proxy", ""),
            fallback=response.headers.get("X-AoE2WAR-Media-Fallback", ""),
            cache_control=response.headers.get("Cache-Control", ""),
            source=response.headers.get("X-AoE2WAR-Source", ""),
            build=response.headers.get("X-AoE2WAR-Build-ID", ""),
            length=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:3033")
    parser.add_argument("--source", required=True)
    parser.add_argument("--build", required=True)
    args = parser.parse_args(argv)
    try:
        receipt = fetch(args.origin)
        report = verify(receipt, args.source, args.build)
        print(json.dumps(report, sort_keys=True))
        return 0
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and str(exc).startswith("HOLD_") else "HOLD_AVATAR_CACHE_PROBE_FAILED"
        print(json.dumps({
            "schema": "aoe2war.r25.avatar-fallback-cache-admission.v1",
            "status": reason,
            "read_only": True,
            "financial_authorized": False,
            "production_mutation": False,
            "accepts_as_full_site_release": False,
        }, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
