#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATTERNS = (
    ("private-key", re.compile("-----BEGIN " + r"(?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("openai-token", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b")),
    (
        "bridge-token-assignment",
        re.compile(r"\bAOE2WAR_OS_BRIDGE_TOKEN\s*=\s*[^\s'\"$<{][^\s]{11,}"),
    ),
)


@dataclass(frozen=True)
class Finding:
    path: str
    line: int | None
    kind: str


def repository_paths() -> list[str]:
    process = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr.decode("utf-8", "replace").strip())
    return sorted(
        raw.decode("utf-8", "surrogateescape")
        for raw in process.stdout.split(b"\0")
        if raw
    )


def sensitive_path(relative: str) -> bool:
    path = PurePosixPath(relative)
    name = path.name.lower()
    if name in {"id_rsa", "id_ed25519"}:
        return True
    if path.suffix.lower() in {".pem", ".p12", ".pfx", ".key"}:
        return not name.endswith((".example", ".sample", ".template"))
    if name == ".env" or name.startswith(".env."):
        return not name.endswith((".example", ".sample", ".template"))
    return False


def scan_text(relative: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in CONTENT_PATTERNS:
            if pattern.search(line):
                findings.append(Finding(relative, line_number, kind))
    return findings


def scan_repository() -> tuple[list[Finding], list[str]]:
    findings: list[Finding] = []
    skipped_binary: list[str] = []
    for relative in repository_paths():
        path = ROOT / relative
        if sensitive_path(relative):
            findings.append(Finding(relative, None, "sensitive-file-path"))
        if path.is_symlink() or not path.is_file():
            continue
        with path.open("rb") as handle:
            prefix = handle.read(8192)
        if b"\0" in prefix:
            skipped_binary.append(relative)
            continue
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line_number, line in enumerate(handle, start=1):
                for kind, pattern in CONTENT_PATTERNS:
                    if pattern.search(line):
                        findings.append(Finding(relative, line_number, kind))
    return findings, skipped_binary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail closed on high-confidence secrets in tracked or candidate files."
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        findings, skipped_binary = scan_repository()
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"SECRET SCAN ERROR: {exc}", file=sys.stderr)
        return 2

    payload = {
        "schema": 1,
        "status": "FAILED" if findings else "PASS",
        "findings": [asdict(finding) for finding in findings],
        "skipped_binary_files": skipped_binary,
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif findings:
        print("SECRET SCAN: FAILED")
        for finding in findings:
            location = f":{finding.line}" if finding.line else ""
            print(f"  {finding.path}{location} [{finding.kind}]")
        print("Secret values are intentionally never echoed.")
    else:
        print(
            "SECRET SCAN: PASS · no high-confidence credentials found "
            f"({len(skipped_binary)} binary file(s) skipped)"
        )
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
