#!/usr/bin/env python3
"""PRODUCT source/output authorization. Policy control, NOT an OS/DB/network sandbox.

No task payload is executed by this module. No directory or artifact is created.
The CLI checks the exact checked-out source and changed paths before CI continues.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

ORIGINS = {
    "Emaren/app-prodn": {
        "https://github.com/Emaren/app-prodn",
        "https://github.com/Emaren/app-prodn.git",
        "git@github.com:Emaren/app-prodn.git",
    },
    "Emaren/kingdom-traders": {
        "https://github.com/Emaren/kingdom-traders",
        "https://github.com/Emaren/kingdom-traders.git",
        "git@github.com:Emaren/kingdom-traders.git",
    },
}
APPROVED_SOURCE = {
    "scripts/product_boundary_guard.py",
    "scripts/product_signed_promotion_gate.py",
    "tests/test_product_boundary_guard.py",
    ".github/workflows/product-boundary.yml",
}
# Single independently inspectable executable-source admission; this is NOT a
# wildcard scripts/ allowance. Future source bytes/base require new review.
EXACT_REVIEWED_SCRIPT = "scripts/kingdom_index_source_audit.mjs"
EXACT_REVIEWED_BASE = "3933f695ec48d4e2cab68e93194b745fab2e4b7d"
EXACT_REVIEWED_SHA256 = "185defe7f93ea39bf1829b7a8eaf4a48f050b50d40ad1438c9be9ca468326a01"
# Existing source history stays admitted ONLY at its former exact base/hash.
# Factory V1 adds one source-reviewed inventory entry, no script wildcard.
EXACT_REVIEWED_FACTORY_BASE = "9f7b56f536ba51b4678ac43baebfae140ada6479"
EXACT_REVIEWED_FACTORY_SHA256 = "bb613ddbd9203f5ad5f2f19be8521db2dc64e03e36e7e4872da0f2b01c1beab8"
# Next dynamic route segments are deliberately NOT admitted by the general
# path grammar. This is one reviewed, immutable route blob and one exact base.
EXACT_REVIEWED_DYNAMIC_ROUTE = "app/api/media-assets/[kind]/[target]/route.ts"
EXACT_REVIEWED_DYNAMIC_BASE = "753c3631a12483c70e1538ccc3b087839677ff9d"
EXACT_REVIEWED_DYNAMIC_SHA256 = "bb1433119e955fd4e7bf9c6d2ecdcb64b0566ed01eef203d9fc224e1b5ba7243"
# Explicit owner-authorized PRODUCT Deployment OS source admission. These four
# SHA256-pinned scripts were reviewed as one source-bound set against the exact
# R1 canonical main base. This grants code REVIEW ONLY, not root execution or
# any extension of authorize_task / the actual 3032 admission boundary.
EXACT_REVIEWED_DEPLOYMENT_OS_BASE = "6f413a39864c7f54f3e3574150ca396819702416"
EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE = {
    "scripts/aoe2_product_release.py":
        "7b772e89781b1d09879866bf375e51ba873af22c579dfb73f6f45795379bf218",
    "scripts/aoe2_product_release_ledger.py":
        "d452f3b0fc31641beeab9ee4df5e6f29a64289faa3f25aa3fca46b60bda83bd9",
    "scripts/aoe2_product_release_transport.py":
        "2a5563f3b7a846839edfbccf8293a8bea4d65d9c32bc4e00bb7eed40074b4894",
    "scripts/aoe2_product_retention.py":
        "a169f1ddd6c541e45c05b3792750931e9ddfa6164399aabe998dc724924e53ae",
}
# F1 exact-source review, additive to the frozen historical R1 admission above.
# This is source admission only, NOT a production root install or owner permit.
# No script wildcard, source identity and base remain strictly pinned.
EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE = "1b6e36e2bf4b823b9192488f12074798232c22ab"
EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE = {
    'scripts/aoe2_product_release.py': 'b05d84de19ee5d28b637e916f9b678556719a3225ad42e356e18897eb1642dc4',
    'scripts/aoe2_product_release_ledger.py': 'd452f3b0fc31641beeab9ee4df5e6f29a64289faa3f25aa3fca46b60bda83bd9',
    'scripts/aoe2_product_release_transport.py': '1acc38ea67ec2f90ce7356541aa986515ab0fe1386292ef06a9f9010222d330a',
    'scripts/aoe2_product_retention.py': 'a169f1ddd6c541e45c05b3792750931e9ddfa6164399aabe998dc724924e53ae',
    'scripts/run_python_contract.py': '46152c770ea9fa63bd4187e12db9a7977450187e8097bbbcfa4a650732bc9657',
    'scripts/run_test_contract.py': '9ba61bcc1cc1c5edb8f2742dbad4b88aeef1e876ad2b5776abe5c5a830ef51bf',
}
# WE2/B exact reviewed protected-browser census admission for the canonical
# 2026-11-15 PRODUCT base. This is only a single immutable script blob; it does
# not authorize its execution, B signing, a new route, financial access, or
# arbitrary scripts. Next script byte/base change requires another review.
EXACT_REVIEWED_B_BROWSER_SCRIPT = "scripts/aoe2_r25_g_browser_acceptance.py"
EXACT_REVIEWED_B_BROWSER_BASE = "f436d6f3c1a04308e33b17db4a69c25a2d925fcf"
EXACT_REVIEWED_B_BROWSER_SHA256 = "0a5c7e1ae073da09e1d20c11aa3467c99dac701ebe39af43ca9673a58cd2cd11"
# One owner-attended B/OS admission for the *exact reviewed* 2026-11-16
# appearance transport guard. Neither the B branch nor scripts are wildcarded.
# A new base/guard byte requires a separately reviewed new policy change.
EXACT_REVIEWED_B_EMBER_BRANCH = "session-b/ember-november-polish-20261116"
EXACT_REVIEWED_B_EMBER_BASE = "d36e9f98e44b0a4de438c5cc623706873c333ca5"
EXACT_REVIEWED_B_EMBER_GUARD = "scripts/r25_b_guard_production_v1.cjs"
EXACT_REVIEWED_B_EMBER_SHA256 = "8edbc84bcb02933ca6955a9abe7f417172247108be8f8ecd91985355e181f6f1"

# WE3 Q09/Q17 40-link PAPER menu: one exact immutable Chrome acceptance
# source, only for the original reviewed #1415 branch and canonical base.
# This is a SOURCE REVIEW CANDIDATE, not a second reviewer endorsement,
# root permission or live website deployment authority. No wildcard scripts.
EXACT_REVIEWED_KINGDOM_MENU_BRANCH = "session-c/we3-kingdom-traders-menu-visibility-20261118"
EXACT_REVIEWED_KINGDOM_MENU_BASE = "81640c7d834c252fb1680190b3f431bd4beb3e58"
EXACT_REVIEWED_KINGDOM_MENU_SCRIPT = "scripts/r25_public_kingdom_menu_chrome.cjs"
EXACT_REVIEWED_KINGDOM_MENU_SHA256 = "c75151d78d67f0c83ac6b79d568e252630fe3f154a2f7df1d1a049edaeaface2"

OUTPUT_PREFIXES = ("artifacts/product-boundary/", "reports/product-boundary/")
DENIED_NAMES = {
    "financial", "finance", "custody", "wallet_signing", "wallet-signing",
    "secrets", "credentials", "private_keys", "signer", "reviewer",
    "payout", "payouts", "settlement", "native_finance", "native-finance",
    "live_orders", "real_orders", "recovery", "owner-private-recovery",
    "financial.sql", "dockerfile", "sudoers",
}
DENIED_SUFFIXES = {".sql", ".sh", ".bash", ".zsh", ".command", ".pem", ".key", ".p12"}
DENIED_DIRS = {"prisma", "systemd", "infra", "ops", ".ssh", ".aws", ".kube"}
DENIED_TEXT = ("execute-shell", "run-arbitrary-command", "8092", "8093", "8094", "8095")
ALLOWED_TASK_ARGV = (
    ("python3", "-I", "-B", "scripts/product_boundary_guard.py", "--check"),
    ("python3", "-I", "-B", "-m", "unittest", "discover", "-s", "tests",
     "-p", "test_product_boundary_guard.py", "-v"),
)
SHA = re.compile(r"^[a-f0-9]{40}$")
# One WE2 protected Factory source review. The two source blobs and original
# Chronicle main base are immutable pins, not a standing release authority.
# Future controller code, new branch or base require another exact review.
EXACT_WE2_FACTORY_BRANCH = "we2/factory-v3-incident-recovery-20261119"
EXACT_WE2_FACTORY_BASE = "6da478878478d2f32ceb2efba06c8a6a2c043301"
EXACT_WE2_FACTORY_SHA256 = {
    "scripts/aoe2_product_release.py":
        "84d9a0e277595b1492d88f19e7c9829dc2896929738328ec37419c792f1f23f5",
    "docs/release/artifacts/aoe2war_product_release_controller_v3.py":
        "3ca35f437b8da2f366f3d0f84662563dd68e5d9d4caf4cd31038ec0f9145c064",
    "tests/test_product_controller_recovery.py":
        "6eda90f9e39646657916b02d07993567c694f6f49e0906afb00b400e8aebdaaf",
}
# Kingdom menu was legitimately merged as canonical main after this Factory
# controller was installed. Preserve its up-to-date reviewed documents; this
# exact replay updates ONLY the DocsV2 registry for the source baseline.
# All three root/runner/test SHA pins and negative guards stay unchanged.
EXACT_WE2_FACTORY_DOCS_REVIEW = frozenset({
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
})
EXACT_WE2_FACTORY_CHANGED = frozenset(EXACT_WE2_FACTORY_SHA256) | {
    "scripts/product_boundary_guard.py", "tests/test_product_boundary_guard.py"
} | EXACT_WE2_FACTORY_DOCS_REVIEW
# WE2 root-security source review: one branch/base with immutable candidate
# guard/proxy bytes. This is *not* a scripts/ or WE2 wildcard.
EXACT_WE2_STORAGE_BRANCH = "we2/storage-protected-ingress-20261120"
EXACT_WE2_STORAGE_BASE = "815d66ef94900d29bb50b7241dc47927a4343955"
EXACT_WE2_STORAGE_PINS = {
    "scripts/r25_b_guard_production_v1.cjs":
      "4dc72a3b15675c480d52c7d1644c6786ffe82dea2b8708bb8b213bdc3e4e1e26",
    "docs/release/artifacts/aoe2war_storage_visual_exact_ingress_v1.conf":
      "463d7b269418d28663171a7b91d923146ca807f955ba5e217e9dbc47eefeaf10",
    "tests/test_r25_production_node_guard.py":
      "f1c2d19a2e41ce352271133edceb39cb10ac689b1ad42552a28783c994ebeab9",
    "tests/test_we2_storage_visual_exact_ingress.py":
      "72013ff895b25562c856c1bacc48946337331a0a1b26851a33e6dfdfd53b6e22",
    "docs/release/WE2_STORAGE_VISUAL_PROTECTED_INGRESS_20261120.md":
      "6343c400ec07347f621e5adbec09a8e7e673cc51a081630a1710a4cc13ca08fd",
}
EXACT_WE2_STORAGE_CHANGED = frozenset(EXACT_WE2_STORAGE_PINS) | {
    "scripts/product_boundary_guard.py",
    "tests/test_product_boundary_guard.py",
}
BRANCH = re.compile(r"^(?:session-c/[a-zA-Z0-9._/-]+|session-b/ember-november-polish-20261116|we2/factory-v3-incident-recovery-20261119|we2/storage-protected-ingress-20261120|main)$")
REPO = re.compile(r"^Emaren/(?:app-prodn|kingdom-traders)$")
SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9._+-]+$")


class BoundaryHold(ValueError):
    pass


def relative_path(raw: str) -> PurePosixPath:
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise BoundaryHold("EMPTY_OR_NUL_PATH")
    if raw.startswith(("/", "~", "\\", "$")) or re.match(r"^[a-zA-Z]:", raw):
        raise BoundaryHold("ABSOLUTE_OR_EXPANDING_PATH")
    if "\\" in raw or "//" in raw:
        raise BoundaryHold("NONCANONICAL_SEPARATOR")
    pieces = raw.split("/")
    if any(x in {"", ".", ".."} or not SAFE_COMPONENT.fullmatch(x) for x in pieces):
        raise BoundaryHold("TRAVERSAL_OR_UNSAFE_COMPONENT")
    if any(x == ".git" for x in pieces):
        raise BoundaryHold("GIT_METADATA_FORBIDDEN")
    return PurePosixPath(raw)


def authorize_source(raw: str) -> str:
    path = relative_path(raw)
    parts = tuple(x.lower() for x in path.parts)
    if any(x in DENIED_DIRS or x in DENIED_NAMES for x in parts):
        raise BoundaryHold("PROTECTED_SOURCE_NAMESPACE")
    if any(x in str(path).lower() for x in DENIED_TEXT):
        raise BoundaryHold("PROTECTED_NATIVE_OR_EXEC_SURFACE")
    if path.suffix.lower() in DENIED_SUFFIXES:
        raise BoundaryHold("PROTECTED_FILE_TYPE")
    if parts[0] in {"scripts", ".github"} and str(path) not in APPROVED_SOURCE:
        # General nonfinancial tests are allowed, but scripts/workflows are
        # restricted execution surfaces requiring a separate reviewed change.
        raise BoundaryHold("UNREVIEWED_EXECUTABLE_SURFACE")
    return str(path)


def exact_we2_storage_blob(checkout: Path, raw: str) -> str:
    """One immutable reviewed file, held to base/branch/source elsewhere."""
    expected = EXACT_WE2_STORAGE_PINS.get(raw)
    if expected is None:
        raise BoundaryHold("WE2_STORAGE_UNPINNED_FILE")
    path = checkout
    for component in relative_path(raw).parts:
        path = path / component
        if path.is_symlink():
            raise BoundaryHold("WE2_STORAGE_SYMLINK_ANCESTOR")
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
        st.st_uid != os.geteuid() or not 1 <= st.st_size <= 100_000 or
        stat.S_IMODE(st.st_mode) & 0o022):
        raise BoundaryHold("WE2_STORAGE_SINGLE_REGULAR_FILE")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(fd)
        if (live.st_dev, live.st_ino, live.st_size, live.st_mtime_ns) != (
            st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns):
            raise BoundaryHold("WE2_STORAGE_FILE_CHANGED")
        blob = os.read(fd, 100001)
    finally:
        os.close(fd)
    if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != expected:
        raise BoundaryHold("WE2_STORAGE_EXACT_SHA_MISMATCH")
    return raw


def authorize_changed_source(checkout: Path, base: str, raw: str) -> str:
    """No dynamic-route wildcard: admit one independently reviewable route."""
    if raw == EXACT_REVIEWED_KINGDOM_MENU_SCRIPT:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_REVIEWED_KINGDOM_MENU_BRANCH:
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_WRONG_BRANCH")
        if base != EXACT_REVIEWED_KINGDOM_MENU_BASE:
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_WRONG_BASE")
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_SYMLINK_ANCESTOR")
        path = checkout / relative_path(raw)
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or
            st.st_uid != os.geteuid() or not 1 <= st.st_size <= 25000 or
            stat.S_IMODE(st.st_mode) & 0o022):
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_SINGLE_FILE")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(fd)
            if (live.st_dev, live.st_ino, live.st_size) != (
                st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("KINGDOM_MENU_REVIEWED_INODE_CHANGED")
            blob = os.read(fd, 25001)
        finally:
            os.close(fd)
        if (len(blob) != st.st_size or
            hashlib.sha256(blob).hexdigest() != EXACT_REVIEWED_KINGDOM_MENU_SHA256):
            raise BoundaryHold("KINGDOM_MENU_REVIEWED_EXACT_SHA_MISMATCH")
        return raw
    if raw == EXACT_REVIEWED_B_EMBER_GUARD and base == EXACT_WE2_STORAGE_BASE:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_WE2_STORAGE_BRANCH:
            raise BoundaryHold("WE2_STORAGE_WRONG_BRANCH")
        return exact_we2_storage_blob(checkout, raw)
    if raw == EXACT_REVIEWED_B_EMBER_GUARD:
        if base != EXACT_REVIEWED_B_EMBER_BASE:
            raise BoundaryHold("B_EMBER_GUARD_WRONG_BASE")
        path = checkout / "scripts" / "r25_b_guard_production_v1.cjs"
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("B_EMBER_GUARD_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or
                not 1 <= st.st_size <= 25000 or stat.S_IMODE(st.st_mode) & 0o022):
            raise BoundaryHold("B_EMBER_GUARD_SINGLE_REGULAR_FILE")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(fd)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("B_EMBER_GUARD_INODE_CHANGED")
            blob = os.read(fd, 25001)
        finally:
            os.close(fd)
        if len(blob) != st.st_size or hashlib.sha256(blob).hexdigest() != EXACT_REVIEWED_B_EMBER_SHA256:
            raise BoundaryHold("B_EMBER_GUARD_EXACT_SHA_MISMATCH")
        return raw
    if raw == EXACT_REVIEWED_DYNAMIC_ROUTE:
        if base != EXACT_REVIEWED_DYNAMIC_BASE:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_WRONG_BASE")
        # Bound every component by this literal constant; never resolve a
        # caller-provided path with arbitrary bracket or traversal segments.
        parent = checkout
        for part in ("app", "api", "media-assets", "[kind]", "[target]"):
            parent = parent / part
            if parent.is_symlink():
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_SYMLINK_ANCESTOR")
        path = parent / "route.ts"
        st = path.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size <= 0 or st.st_size > 2_000_000:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_REGULAR_FILE_REQUIRED")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        try:
            live = os.fstat(descriptor)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_INODE_CHANGED")
            content = os.read(descriptor, 2_000_001)
        finally:
            os.close(descriptor)
        if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != EXACT_REVIEWED_DYNAMIC_SHA256:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_EXACT_SHA_MISMATCH")
        return raw
    if raw == EXACT_REVIEWED_B_BROWSER_SCRIPT:
        if base != EXACT_REVIEWED_B_BROWSER_BASE:
            raise BoundaryHold("B_BROWSER_REVIEWED_WRONG_BASE")
        relative = relative_path(raw)
        path = checkout / relative
        if (checkout / "scripts").is_symlink():
            raise BoundaryHold("B_BROWSER_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or not 1 <= st.st_size <= 100000):
            raise BoundaryHold("B_BROWSER_SINGLE_REGULAR_FILE_REQUIRED")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(descriptor)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("B_BROWSER_INODE_CHANGED")
            content = os.read(descriptor, 100001)
        finally:
            os.close(descriptor)
        if (len(content) != st.st_size or
                hashlib.sha256(content).hexdigest() != EXACT_REVIEWED_B_BROWSER_SHA256):
            raise BoundaryHold("B_BROWSER_EXACT_SHA_MISMATCH")
        return raw
    # One exact reviewed Factory-root pin transition on the sole WE2 branch.
    # This does not admit a general release runner or change root authority.
    if raw == "scripts/aoe2_product_release.py" and base == EXACT_WE2_FACTORY_BASE:
        if os.environ.get("BOUNDARY_BRANCH") != EXACT_WE2_FACTORY_BRANCH:
            raise BoundaryHold("WE2_FACTORY_RUNNER_BRANCH")
        target=checkout/"scripts/aoe2_product_release.py"
        st=target.lstat()
        if (target.is_symlink() or (checkout/"scripts").is_symlink()
            or not stat.S_ISREG(st.st_mode) or st.st_nlink!=1
            or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)&0o022
            or not 100<=st.st_size<=100000):
            raise BoundaryHold("WE2_FACTORY_RUNNER_CUSTODY")
        fd=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            live=os.fstat(fd)
            if (live.st_dev,live.st_ino,live.st_size)!=(st.st_dev,st.st_ino,st.st_size):
                raise BoundaryHold("WE2_FACTORY_RUNNER_INODE")
            raw_bytes=os.read(fd,100001)
        finally:
            os.close(fd)
        if len(raw_bytes)!=st.st_size or hashlib.sha256(raw_bytes).hexdigest()!=EXACT_WE2_FACTORY_SHA256["scripts/aoe2_product_release.py"]:
            raise BoundaryHold("WE2_FACTORY_RUNNER_SHA256")
        return raw
    if (raw in EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE or
            raw in EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE):
        if base == EXACT_REVIEWED_DEPLOYMENT_OS_BASE:
            pinned = EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE
        elif base == EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE:
            pinned = EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE
        else:
            raise BoundaryHold("DEPLOYMENT_OS_REVIEWED_WRONG_BASE")
        if raw not in pinned:
            raise BoundaryHold("DEPLOYMENT_OS_UNREVIEWED_FOR_BASE")
        relative = relative_path(raw)
        path = checkout / relative
        parent = checkout
        for part in relative.parts[:-1]:
            parent = parent / part
            if parent.is_symlink():
                raise BoundaryHold("DEPLOYMENT_OS_SYMLINK_ANCESTOR")
        st = path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1
                or st.st_uid != os.geteuid() or st.st_size <= 0
                or st.st_size > 100000):
            raise BoundaryHold("DEPLOYMENT_OS_SINGLE_REGULAR_FILE_REQUIRED")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            live = os.fstat(descriptor)
            if ((live.st_dev, live.st_ino, live.st_size)
                    != (st.st_dev, st.st_ino, st.st_size)):
                raise BoundaryHold("DEPLOYMENT_OS_INODE_CHANGED")
            content = os.read(descriptor, 100001)
        finally:
            os.close(descriptor)
        if (len(content) != st.st_size or hashlib.sha256(content).hexdigest()
                != pinned[raw]):
            raise BoundaryHold("DEPLOYMENT_OS_EXACT_SHA_MISMATCH")
        return raw
    relative = relative_path(raw)
    name = str(relative)
    if name != EXACT_REVIEWED_SCRIPT:
        return authorize_source(name)
    if base == EXACT_REVIEWED_BASE:
        expected_sha = EXACT_REVIEWED_SHA256
    elif base == EXACT_REVIEWED_FACTORY_BASE:
        expected_sha = EXACT_REVIEWED_FACTORY_SHA256
    else:
        raise BoundaryHold("REVIEWED_EXECUTABLE_WRONG_BASE")
    path = checkout / relative
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size < 1 or st.st_size > 500_000:
        raise BoundaryHold("REVIEWED_EXECUTABLE_NOT_SINGLE_REGULAR_FILE")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(descriptor)
        if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
            raise BoundaryHold("REVIEWED_EXECUTABLE_CHANGED_INODE")
        content = os.read(descriptor, 500_001)
    finally:
        os.close(descriptor)
    if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != expected_sha:
        raise BoundaryHold("REVIEWED_EXECUTABLE_EXACT_SHA_MISMATCH")
    return name


def authorize_output(raw: str, checkout: Path, product_root: Path) -> Path:
    relative = relative_path(raw)
    value = str(relative)
    if not any(value.startswith(prefix) for prefix in OUTPUT_PREFIXES):
        raise BoundaryHold("UNAPPROVED_ARTIFACT_DESTINATION")
    checkout = checkout.resolve(strict=True)
    product_root = product_root.resolve(strict=True)
    if not checkout.is_relative_to(product_root):
        raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
    candidate = checkout
    for part in relative.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise BoundaryHold("SYMLINK_DESTINATION")
        # Paths must not redirect to another filesystem, including bind mounts.
        if candidate.exists() and candidate.stat().st_dev != checkout.stat().st_dev:
            raise BoundaryHold("MOUNT_ESCAPE")
    if not candidate.resolve(strict=False).is_relative_to(checkout):
        raise BoundaryHold("DESTINATION_ESCAPE")
    return candidate


def authorize_task(payload: dict) -> tuple[str, ...]:
    if not isinstance(payload, dict) or set(payload) != {"argv", "cwd", "output"}:
        raise BoundaryHold("UNREVIEWED_TASK_FIELDS")
    argv = payload["argv"]
    if not isinstance(argv, list) or any(not isinstance(s, str) for s in argv):
        raise BoundaryHold("TASK_ARGV_REQUIRED")
    if tuple(argv) not in ALLOWED_TASK_ARGV:
        raise BoundaryHold("UNAUTHORIZED_COMMAND")
    if payload["cwd"] != "." or payload["output"] is not None:
        raise BoundaryHold("TASK_CWD_OR_OUTPUT_NOT_APPROVED")
    return tuple(argv)


def validate_git_pointer(checkout: Path, product_root: Path, repo_name: str) -> None:
    marker = checkout / ".git"
    if marker.is_symlink():
        raise BoundaryHold("SYMLINK_GIT_MARKER")
    if marker.is_dir():
        if marker.resolve(strict=True) != checkout.resolve(strict=True) / ".git":
            raise BoundaryHold("GIT_DIRECTORY_ESCAPE")
        return
    if not marker.is_file():
        raise BoundaryHold("MISSING_GIT_MARKER")
    data = marker.read_text(encoding="utf-8")
    if len(data) > 512 or not data.startswith("gitdir: ") or len(data.splitlines()) != 1:
        raise BoundaryHold("INVALID_GIT_POINTER")
    pointer = data.removeprefix("gitdir: ").strip()
    p = Path(pointer)
    if not p.is_absolute() or ".." in p.parts or p.is_symlink():
        raise BoundaryHold("UNSAFE_GIT_POINTER")
    try:
        actual = p.resolve(strict=True)
    except OSError as exc:
        raise BoundaryHold("UNRESOLVED_GIT_POINTER") from exc
    expected_bases = (
        product_root / ("app-prodn" if repo_name.endswith("app-prodn") else "kingdom-traders") / ".git" / "worktrees",
        product_root / "session-b-app-c02" / ".git" / "worktrees",
    )
    if not any(actual.is_relative_to(b.resolve(strict=False)) for b in expected_bases):
        raise BoundaryHold("GIT_POINTER_OUTSIDE_APPROVED_PRODUCT_ADMIN")
    if actual.stat().st_uid != checkout.stat().st_uid:
        raise BoundaryHold("GIT_POINTER_OWNER_MISMATCH")


def git(checkout: Path, *args: str) -> str:
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
    result = subprocess.run(["git", "-C", str(checkout), *args],
                            capture_output=True, text=True, timeout=25, env=env,
                            check=False)
    if result.returncode:
        raise BoundaryHold("GIT_COMMAND_FAILED:" + args[0])
    return result.stdout.strip()


def check_checkout(checkout: Path, repo_name: str, expected_sha: str,
                   expected_branch: str, product_root: Path,
                   *, ci: bool) -> dict:
    if not REPO.fullmatch(repo_name) or not SHA.fullmatch(expected_sha):
        raise BoundaryHold("BAD_PIN_OR_REPO")
    if not BRANCH.fullmatch(expected_branch) or "//" in expected_branch or ".." in expected_branch:
        raise BoundaryHold("BAD_BRANCH")
    if ci:
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != repo_name:
            raise BoundaryHold("UNTRUSTED_CI_IDENTITY")
        if checkout.resolve(strict=True) != Path(os.environ.get("GITHUB_WORKSPACE", "/nonexistent")).resolve(strict=True):
            raise BoundaryHold("CI_CHECKOUT_MISMATCH")
    else:
        if not checkout.resolve(strict=True).is_relative_to(product_root.resolve(strict=True)):
            raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
        if checkout.stat().st_uid != os.geteuid():
            raise BoundaryHold("SOURCE_OWNER_MISMATCH")
    if checkout.is_symlink() or checkout.stat().st_uid != (checkout / ".git").stat().st_uid:
        raise BoundaryHold("CHECKOUT_OWNER_OR_LINK_MISMATCH")
    validate_git_pointer(checkout, product_root, repo_name) if not ci else None
    if Path(git(checkout, "rev-parse", "--show-toplevel")).resolve(strict=True) != checkout.resolve(strict=True):
        raise BoundaryHold("WORKTREE_ROOT_MISMATCH")
    origin = git(checkout, "remote", "get-url", "origin")
    if origin not in ORIGINS[repo_name]:
        raise BoundaryHold("REMOTE_ORIGIN_MISMATCH")
    if git(checkout, "rev-parse", "HEAD") != expected_sha:
        raise BoundaryHold("SOURCE_SHA_MISMATCH")
    if not ci and git(checkout, "branch", "--show-current") != expected_branch:
        raise BoundaryHold("SOURCE_BRANCH_MISMATCH")
    if git(checkout, "status", "--porcelain=v1", "--untracked-files=normal"):
        raise BoundaryHold("DIRTY_SOURCE")
    return {"repo": repo_name, "sha": expected_sha, "branch": expected_branch, "origin": origin}


def changed_source(checkout: Path, base: str) -> list[str]:
    if not SHA.fullmatch(base):
        raise BoundaryHold("UNPINNED_BASE_SHA")
    names = git(checkout, "diff", "--name-only", "--diff-filter=ACMRTUXB",
                base, "HEAD", "--")
    changes = names.splitlines() if names else []
    for name in changes:
        authorize_changed_source(checkout, base, name)
        mode = git(checkout, "ls-files", "--stage", "--", name)
        if mode.startswith("120000 "):
            raise BoundaryHold("SYMLINK_SOURCE_CHANGE")
    return changes


def check_exact_we2_factory_source(checkout: Path, repo: str, branch: str,
                                  base: str, changes: list[str]) -> None:
    if branch != EXACT_WE2_FACTORY_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_FACTORY_BASE:
        raise BoundaryHold("WE2_FACTORY_EXACT_BASE_OR_REPO")
    if frozenset(changes) != EXACT_WE2_FACTORY_CHANGED or len(changes) != len(EXACT_WE2_FACTORY_CHANGED):
        raise BoundaryHold("WE2_FACTORY_EXACT_SOURCE_SCOPE")
    for relative, expected in EXACT_WE2_FACTORY_SHA256.items():
        target=checkout
        for component in Path(relative).parts:
            target=target/component
            if target.is_symlink():
                raise BoundaryHold("WE2_FACTORY_SYMLINK_ANCESTOR")
        st=target.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink!=1
            or st.st_uid != os.geteuid() or stat.S_IMODE(st.st_mode)&0o022
            or not 100<=st.st_size<=100000):
            raise BoundaryHold("WE2_FACTORY_PROTECTED_SOURCE_CUSTODY")
        fd=os.open(target,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            live=os.fstat(fd)
            if (live.st_dev,live.st_ino,live.st_size)!=(st.st_dev,st.st_ino,st.st_size):
                raise BoundaryHold("WE2_FACTORY_INODE_CHANGED")
            raw=os.read(fd,100001)
        finally:
            os.close(fd)
        if len(raw)!=st.st_size or hashlib.sha256(raw).hexdigest()!=expected:
            raise BoundaryHold("WE2_FACTORY_EXACT_SOURCE_SHA256_DRIFT")

def check_exact_we2_storage_source(checkout: Path, repo: str, branch: str,
                                   base: str, changes: list[str]) -> None:
    """No blanket branch, arbitrary changed script or later source revision."""
    if branch != EXACT_WE2_STORAGE_BRANCH:
        return
    if repo != "Emaren/app-prodn" or base != EXACT_WE2_STORAGE_BASE:
        raise BoundaryHold("WE2_STORAGE_EXACT_BASE_OR_REPO")
    if len(changes) != len(EXACT_WE2_STORAGE_CHANGED) or (
        frozenset(changes) != EXACT_WE2_STORAGE_CHANGED):
        raise BoundaryHold("WE2_STORAGE_EXACT_CHANGED_SET")
    for name in EXACT_WE2_STORAGE_PINS:
        exact_we2_storage_blob(checkout, name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", required=True)
    args = parser.parse_args()
    try:
        ci = os.environ.get("GITHUB_ACTIONS") == "true"
        repo_name = os.environ["BOUNDARY_REPOSITORY"]
        sha = os.environ["BOUNDARY_HEAD_SHA"]
        branch = os.environ["BOUNDARY_BRANCH"]
        base = os.environ["BOUNDARY_BASE_SHA"]
        checkout = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve(strict=True)
        product_root = Path(os.environ.get("PRODUCT_BOUNDARY_ROOT", str(Path.home() / "projects" / "AoE2WAR-LANES" / "PRODUCT")))
        receipt = check_checkout(checkout, repo_name, sha, branch, product_root, ci=ci)
        receipt["changed_files"] = changed_source(checkout, base)
        check_exact_we2_factory_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        check_exact_we2_storage_source(
            checkout,repo_name,branch,base,receipt["changed_files"])
        receipt.update(status="PASS_SOURCE_POLICY_ONLY", os_denial_proven=False)
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (BoundaryHold, KeyError, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "HOLD_PRODUCT_BOUNDARY", "reason": str(exc)}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
