#!/usr/bin/env python3
"""Read-only, source-bound diagnostic digest for Renaissance integrated Chrome.

NEVER grades Kingdom Index, treats fixture tests as prod, or changes the
underlying job result. Designed to run with if: always() after browser jobs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

SCHEMA = "aoe2war.renaissance.integrated-chrome-digest.v1"
FILES = {
    "brain": "brain-next-app-receipt.json",
    "intelligence": "kingdom-intelligence-next-receipt.json",
    "tests": "kingdom-tests-next-receipt.json",
}
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
BUILD = re.compile(r"[A-Za-z0-9_-]{5,128}\Z")


def _safe_text(value: object, limit: int = 190) -> str:
    # Do not let fixture-supplied text inject markdown headings or command markup.
    return " ".join(str(value).replace("\x60", "'").replace("|", "/").split())[:limit]


def _read_json(path: Path) -> dict:
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 1024 * 1024:
        raise ValueError("Expected bounded, regular source receipt is missing or unsafe")
    obj = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("Receipt must be an object")
    return obj


def analyze(page: str, evidence: Path, expected_sha: str) -> dict:
    if page not in FILES or not HEX40.fullmatch(expected_sha):
        raise ValueError("Invalid page or expected source identity")
    if not evidence.is_dir() or evidence.is_symlink():
        raise ValueError("Evidence directory missing or unsafe")
    stamp = evidence / "BUILD_ID"
    if not stamp.is_file() or stamp.is_symlink() or stamp.stat().st_size > 256:
        raise ValueError("Missing or unsafe emitted BUILD_ID")
    build = stamp.read_text(encoding="ascii").strip()
    if not BUILD.fullmatch(build):
        raise ValueError("Malformed emitted BUILD_ID")
    source = _read_json(evidence / FILES[page])
    recorded_sha = source.get("sourceSha") if page == "brain" else source.get("source_sha")
    recorded_build = source.get("emittedBuildId") if page == "brain" else source.get("build_id")
    if recorded_sha != expected_sha or recorded_build != build:
        raise ValueError("Receipt source SHA or emitted BUILD_ID mismatch")
    if source.get("productionAttested", source.get("production_attested", False)) is not False:
        raise ValueError("Candidate receipt improperly claims production attestation")
    if source.get("certified", False) is not False:
        raise ValueError("Candidate receipt improperly claims certification")

    issues = []
    checks = 0
    passed = 0
    blocked = {}
    status = source.get("status")
    if page == "brain":
        real = source.get("realApi")
        fixtures = source.get("controlledFixtures")
        if not isinstance(real, list) or not isinstance(fixtures, list) or not real or not fixtures:
            raise ValueError("Missing real-browser and controlled-fixture cohorts")
        for sample in real:
            if not isinstance(sample, dict) or not isinstance(sample.get("checks"), dict):
                raise ValueError("Malformed real browser sample")
            for label, verdict in sample["checks"].items():
                checks += 1
                if verdict is True: passed += 1
                else: issues.append(f"{sample.get('viewport','unknown')}:{label}={verdict!s}")
        for fixture in fixtures:
            if not isinstance(fixture, dict):
                raise ValueError("Malformed fixture")
            checks += 1
            if fixture.get("passed") is True: passed += 1
            else:
                name = fixture.get("name", "unnamed")
                details = f"{name}:pass=false"
                if "indexRequests" in fixture:
                    details += f"; indexRequests={fixture['indexRequests']}"
                if "error" in fixture: details += f"; error={fixture['error']}"
                issues.append(details)
        success = status == "PASS" and checks == passed
    elif page == "intelligence":
        cases = source.get("cases")
        if not isinstance(cases, list) or not cases:
            raise ValueError("Missing Intelligence case evidence")
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("checks"), dict):
                raise ValueError("Malformed Intelligence case")
            tag = f"{case.get('mode','unknown')}@{case.get('viewport_width','?')}"
            for label, verdict in case["checks"].items():
                checks += 1
                if verdict is True: passed += 1
                else: issues.append(f"{tag}:{label}={verdict!s}")
            if case.get("pass") is not True:
                issues.append(f"{tag}:case failed" + (f" ({case['error']})" if case.get("error") else ""))
            for attempt in case.get("requests", {}).get("blocked_nonread_paths", []):
                if not isinstance(attempt, dict): raise ValueError("Invalid blocked-request record")
                key = f"{attempt.get('method','?')} {attempt.get('path','?')}"
                blocked[key] = blocked.get(key, 0) + 1
        success = status == "PASS" and all(c.get("pass") is True for c in cases) and checks == passed
    else:
        items = source.get("checks")
        if not isinstance(items, list) or not items:
            raise ValueError("Missing Tests checks")
        for item in items:
            if not isinstance(item, dict): raise ValueError("Malformed Tests check")
            checks += 1
            if item.get("state") == "PASS": passed += 1
            else: issues.append(f"{item.get('name','unnamed')}:state={item.get('state')}")
        blockers = source.get("shared_claim_blocker", {})
        if not isinstance(blockers, dict): raise ValueError("Malformed whole-page claim verdict")
        for viewport, blocked_claim in blockers.items():
            if blocked_claim is not False: issues.append(f"{viewport}:whole-page-claim-blocker={blocked_claim}")
        success = (status == "PASS_INSPECTOR_ONLY" and type(source.get("passed")) is int
                   and source["passed"] == passed and checks == passed and not issues)
    if status not in ("PASS", "FAIL", "PASS_INSPECTOR_ONLY"):
        raise ValueError("Unknown or missing browser receipt status")
    if not success and not issues:
        issues.append("Receipt status contradicts executed evidence")
    return {
        "schema": SCHEMA,
        "page": page,
        "source_sha": expected_sha,
        "build_id": build,
        "browser_receipt_status": status,
        "evidence_class": "CANDIDATE_ONLY_NOT_A_CERTIFICATE",
        "accepted_candidate_test": success,
        "passed_assertions": passed,
        "total_assertions": checks,
        "failed_evidence": [_safe_text(item) for item in issues[:30]],
        "additional_failed_evidence_count": max(0, len(issues)-30),
        "blocked_attempts_by_method_path": dict(sorted(blocked.items())),
        "production_attested": False,
        "certified": False,
        "quality_score": None,
    }


def markdown(report: dict) -> str:
    result = "PASS (candidate only)" if report["accepted_candidate_test"] else "FAIL / INCOMPLETE"
    lines = [f"### Renaissance integrated Chrome: {report['page']}",
             f"- **Verdict:** {result}. Not production-attested; not certified.",
             f"- **Exact source:** \x60{report['source_sha']}\x60; **emitted BUILD_ID:** \x60{report['build_id']}\x60.",
             f"- **Assertions:** {report['passed_assertions']}/{report['total_assertions']} true; original status \x60{report['browser_receipt_status']}\x60."]
    for item in report["failed_evidence"]:
        lines.append(f"- **FAIL evidence:** {_safe_text(item)}")
    if report["additional_failed_evidence_count"]:
        lines.append(f"- **Additional failure entries:** {report['additional_failed_evidence_count']}")
    for key, count in report["blocked_attempts_by_method_path"].items():
        lines.append(f"- **Blocked attempt (not executed):** {_safe_text(key)} × {count}. No implicit allowlist.")
    lines.append("- **Rubric points:** UNKNOWN. Browser/fixture checks never award /100 quality points.\n")
    return "\n".join(lines)


def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--page", choices=sorted(FILES), required=True)
    p.add_argument("--evidence-dir", type=Path, required=True)
    p.add_argument("--expected-sha", required=True)
    p.add_argument("--json-out", type=Path, required=True)
    p.add_argument("--summary-file", type=Path)
    a=p.parse_args()
    try:
        report=analyze(a.page,a.evidence_dir,a.expected_sha)
    except (OSError, ValueError, UnicodeError, json.JSONDecodeError) as exc:
        # Fail-closed even when the underlying browser job exited zero.
        print(f"STOP: malformed/missing integrated Chrome evidence: {_safe_text(exc)}", file=sys.stderr)
        return 2
    a.json_out.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n", encoding="utf-8")
    value=markdown(report)
    print(value)
    if a.summary_file:
        with a.summary_file.open("a", encoding="utf-8") as dst: dst.write(value+"\n")
    return 0  # The browser step, NOT the reporter, owns PASS/FAIL exit status.


if __name__ == "__main__":
    raise SystemExit(main())
