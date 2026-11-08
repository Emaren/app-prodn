#!/usr/bin/env python3
"""R25 public player-avatar byte parity, read-only exact-source release gate.

No media writes, no uploads, no DB queries, no money, no account information.
Use genuine 3030 managed bytes as historical reference; never count 200 as parity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import sys
import urllib.error
import urllib.request

FALLBACK_QUERY = "size=card&fallback=%2Fchampions%2Fplayers%2Fsilhouette.webp"
MAX_WEBP_BYTES = 1_500_000
# Fixed from independently read-only HEL1 HTTP GET at 2026-11-08 02:33Z.
# Any old reference drift requires a fresh, independently reviewed identity.
EXPECTED_3030 = {
    "sniper": {
        "managed_sha256": "87cd2af1c80e7df61056bbee1ac7efc99618f8f5cab6e1e9ec7dee86c3ed1f45",
        "static_fallback_sha256": "cbc27cd922e4c72e6128d5cba1079fac71956c5b1963e15a540961daa752bf1e",
    },
    "dil-pascana": {
        "managed_sha256": "afbfb3979c9eb5f6c12569e26a436b8c7bebbc746daece48a456d673d38603d8",
        "static_fallback_sha256": "24caf5ef022491a2909efda0d2c6944db97da6d7e2d8444968aedcf98a05f04f",
    },
    "emaren": {
        "managed_sha256": "9700616d7b885285059c7b029a3e50581c8bcad71471bd072a3ddafc15ed5c0a",
        "static_fallback_sha256": None,  # Historically the same public bytes.
    },
}


class Hold(RuntimeError):
    pass


def need(ok: bool, reason: str) -> None:
    if not ok:
        raise Hold(reason)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_webp(port: int, alias: str) -> bytes:
    need(port in (3030, 3032, 3033) and alias in EXPECTED_3030,
         "UNKNOWN_PORT_OR_AVATAR_REFERENCE")
    url = (
        f"http://127.0.0.1:{port}/api/media-assets/avatar/"
        f"{alias}?{FALLBACK_QUERY}"
    )
    req = urllib.request.Request(
        url, method="GET",
        headers={"Host": "aoe2war.com", "User-Agent": "aoe2war-r25-readonly-avatar-parity/1",
                 "Accept": "image/webp"},
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=10) as response:
            need(response.status == 200 and response.url == url,
                 "IMAGE_RESPONSE_NOT_EXACT_200")
            need(response.headers.get_content_type() == "image/webp",
                 "IMAGE_CONTENT_TYPE_NOT_WEBP")
            data = response.read(MAX_WEBP_BYTES + 1)
            need(12 <= len(data) <= MAX_WEBP_BYTES, "WEBP_BYTES_OUTSIDE_LIMIT")
            need(data.startswith(b"RIFF") and data[8:12] == b"WEBP",
                 "WEBP_FILE_SIGNATURE_INVALID")
            return data
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise Hold("PUBLIC_READONLY_AVATAR_FETCH_FAILED:" + type(e).__name__) from e


def comparison(alias: str, reference: bytes, candidate: bytes) -> dict:
    need(alias in EXPECTED_3030, "AVATAR_NOT_IN_FROZEN_PUBLIC_CENSUS")
    baseline = EXPECTED_3030[alias]
    actual_reference = sha256(reference)
    need(actual_reference == baseline["managed_sha256"],
         "OLD_REFERENCE_MANAGED_BYTES_CHANGED:" + alias)
    fallback = baseline["static_fallback_sha256"]
    need(fallback is None or actual_reference != fallback,
         "OLD_REFERENCE_IS_UNREVIEWED_FALLBACK:" + alias)
    actual_candidate = sha256(candidate)
    return {
        "alias": alias, "reference_sha256": actual_reference,
        "candidate_sha256": actual_candidate,
        "candidate_matches_reference": actual_candidate == actual_reference,
        "candidate_is_known_fallback": fallback is not None and actual_candidate == fallback,
    }


def audit(port: int) -> dict:
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == "ubuntu-4gb-hel1-11",
         "ROOT_HEL1_READONLY_CONTEXT_REQUIRED")
    need(port in (3032, 3033), "CANDIDATE_PORT_NOT_REVIEWED")
    rows = []
    for alias in EXPECTED_3030:
        rows.append(comparison(alias, fetch_webp(3030, alias), fetch_webp(port, alias)))
    passed = all(x["candidate_matches_reference"] and not x["candidate_is_known_fallback"]
                 for x in rows)
    return {
        "schema": "aoe2war.session-b.r25.public-avatar-byte-parity.v1",
        "status": "PASS_AVATAR_MANAGED_BYTE_PARITY" if passed else "HOLD_AVATAR_MANAGED_BYTE_PARITY",
        "candidate_port": port,
        "http200_alone_never_sufficient": True,
        "tested_public_aliases": len(rows),
        "matched": sum(x["candidate_matches_reference"] for x in rows),
        "known_fallback_substitutions": sum(x["candidate_is_known_fallback"] for x in rows),
        "rows": rows, "production_mutation": False, "financial_authorized": False,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--phase", choices=("selftest", "audit"), required=True)
    p.add_argument("--candidate-port", type=int)
    args = p.parse_args()
    if args.phase == "selftest":
        need(args.candidate_port is None and len(EXPECTED_3030) == 3 and
             all(len(x["managed_sha256"]) == 64 for x in EXPECTED_3030.values()) and
             all(x["static_fallback_sha256"] != x["managed_sha256"]
                 for x in EXPECTED_3030.values()),
             "FROZEN_REFERENCE_SHAPE_CHANGED")
        print("PASS_STATIC_EXACT_READONLY_AVATAR_PARITY_CONTRACT")
        return
    need(args.candidate_port in (3032, 3033), "CANDIDATE_PORT_NOT_REVIEWED")
    result = audit(args.candidate_port)
    print(json.dumps(result, sort_keys=True))
    if result["status"] != "PASS_AVATAR_MANAGED_BYTE_PARITY":
        raise SystemExit(3)


if __name__ == "__main__":
    try:
        main()
    except (Hold, ValueError, OSError) as err:
        print(json.dumps({"status": "HOLD_AVATAR_BYTE_PARITY_AUDIT",
                          "reason": str(err)[:160], "production_mutation": False,
                          "financial_authorized": False}, sort_keys=True))
        sys.exit(3)
