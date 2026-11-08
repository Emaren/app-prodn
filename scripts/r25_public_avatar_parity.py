#!/usr/bin/env python3
"""Read-only HEL1 public avatar parity; no database access, writes or release actions.

Supply three or more *already publicly exposed* managed-avatar handles; compare
current candidate port against the preserved original website's image bytes.
Run from the host with both services available on loopback; never proxy finance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener, Request

MAX_IMAGE = 2_000_000
MAX_TARGETS = 20
AVATAR_TARGET = re.compile(r"user-u-[a-f0-9]{32}-featured\Z")
FINANCIAL_PORTS = frozenset({8092, 8093, 8094, 8095})
FALLBACK = "/champions/players/silhouette.card.webp"

@dataclass(frozen=True)
class MediaProof:
    sha256: str
    proxy: str
    content_type: str
    length: int


def safe_origin(raw: str, label: str) -> str:
    url = urlsplit(raw)
    if (url.scheme != "http" or url.hostname != "127.0.0.1"
            or url.username is not None or url.password is not None
            or url.path not in ("", "/") or url.query or url.fragment
            or url.port is None or not 1024 <= url.port <= 65535
            or url.port in FINANCIAL_PORTS):
        raise ValueError(f"HOLD_{label}_NOT_ALLOWED_LOOPBACK_HTTP")
    return f"http://127.0.0.1:{url.port}"


def check_targets(targets: list[str]) -> list[str]:
    if not 3 <= len(targets) <= MAX_TARGETS:
        raise ValueError("HOLD_AVATAR_SAMPLE_COUNT")
    if any(not AVATAR_TARGET.fullmatch(x) for x in targets):
        raise ValueError("HOLD_UNREVIEWED_AVATAR_HANDLE")
    if len(set(targets)) != len(targets):
        raise ValueError("HOLD_DUPLICATE_AVATAR_HANDLE")
    return targets


class NoExternalRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urlsplit(req.full_url), urlsplit(newurl)
        if (new.scheme, new.hostname, new.port) != (old.scheme, old.hostname, old.port):
            raise ValueError("HOLD_AVATAR_REDIRECT_LEFT_LOOPBACK")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_image(origin: str, target: str) -> MediaProof:
    path = f"/api/media-assets/avatar/{target}?" + urlencode({
        "fallback": FALLBACK, "size": "card",
    })
    response = build_opener(NoExternalRedirects()).open(
        Request(origin + path, headers={"Accept": "image/webp", "User-Agent": "AoE2WAR-Nonfinancial-R25-Parity/1"}),
        timeout=10,
    )
    with response:
        if response.status != 200:
            raise ValueError("HOLD_AVATAR_HTTP_STATUS")
        mime = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if mime not in {"image/webp", "image/jpeg", "image/png", "image/avif"}:
            raise ValueError("HOLD_AVATAR_NON_IMAGE_RESPONSE")
        data = response.read(MAX_IMAGE + 1)
        if not data or len(data) > MAX_IMAGE:
            raise ValueError("HOLD_AVATAR_BODY_SIZE")
        return MediaProof(
            sha256=hashlib.sha256(data).hexdigest(),
            proxy=response.headers.get("X-AoE2WAR-Media-Proxy", ""),
            content_type=mime,
            length=len(data),
        )


def verify(legacy: list[MediaProof], candidate: list[MediaProof]) -> dict:
    if len(legacy) < 3 or len(legacy) != len(candidate):
        raise ValueError("HOLD_AVATAR_INSUFFICIENT_PARITY")
    if any(x.proxy != "direct-managed" for x in legacy):
        raise ValueError("HOLD_LEGACY_PORTRAIT_NOT_MANAGED")
    if len({x.sha256 for x in legacy}) < 3:
        raise ValueError("HOLD_LEGACY_NOT_THREE_DISTINCT_PORTRAITS")
    if any(x.proxy != "direct-managed" for x in candidate):
        raise ValueError("HOLD_CANDIDATE_RETURNED_FALLBACK")
    for old, new in zip(legacy, candidate):
        if old.sha256 != new.sha256 or old.content_type != new.content_type or old.length != new.length:
            raise ValueError("HOLD_IMAGE_CONTENT_OR_IDENTITY_MISMATCH")
    manifest = [f"{p.sha256}:{p.length}:{p.content_type}" for p in candidate]
    return {
        "schema": "aoe2war.r25.public-avatar-parity.v1",
        "status": "PASS_PUBLIC_AVATAR_PARITY",
        "checked": len(candidate),
        "distinct_managed_portraits": len({p.sha256 for p in candidate}),
        "content_manifest_sha256": hashlib.sha256("\n".join(manifest).encode()).hexdigest(),
        "read_only": True,
        "financial_authorized": False,
        "production_mutation": False,
        "accepts_as_full_site_release": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-origin", default="http://127.0.0.1:3030")
    parser.add_argument("--candidate-origin", default="http://127.0.0.1:3032")
    parser.add_argument("--target", action="append", required=True)
    args = parser.parse_args(argv)
    try:
        original = safe_origin(args.legacy_origin, "LEGACY_ORIGIN")
        new = safe_origin(args.candidate_origin, "CANDIDATE_ORIGIN")
        if original == new:
            raise ValueError("HOLD_ORIGINS_IDENTICAL")
        targets = check_targets(args.target)
        report = verify(
            [fetch_image(original, target) for target in targets],
            [fetch_image(new, target) for target in targets],
        )
        print(json.dumps(report, sort_keys=True))
        return 0
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and str(exc).startswith("HOLD_") else "HOLD_NETWORK_OR_RUNTIME_ERROR"
        print(json.dumps({"schema":"aoe2war.r25.public-avatar-parity.v1",
            "status":reason, "read_only":True, "financial_authorized":False,
            "production_mutation":False, "accepts_as_full_site_release":False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
