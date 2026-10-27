#!/usr/bin/env python3
"""Operator-private, durable single-use owner REVIEW journal for Kingdom adoption.

An approved protected release dispatcher does not yet exist. This source never
starts the web service, dispatches release actions, authorizes finance, or
treats review consumption as deployment authorization.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import stat

import aoe2_release_stage_adoption as adoption

POLICY = adoption.POLICY
JOURNAL_NAME = "kingdom-adoption-review-v1.sqlite3"
PRODUCTION_ROOT = Path("/var/lib/aoe2war-kingdom-adoption-review-v1")


def _fsync_directory(parent: Path) -> None:
    descriptor = os.open(str(parent), os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _connect(state_root: Path, *, test_root: bool = False):
    adoption.require(state_root.is_absolute() and state_root.is_dir()
                     and not state_root.is_symlink(),
                     "ADOPTION_NONCE_ROOT_UNTRUSTED")
    folder = state_root.resolve()
    adoption.require(folder == state_root,
                     "ADOPTION_NONCE_ROOT_INDIRECT")
    info = state_root.stat()
    adoption.require(info.st_uid == os.geteuid()
                     and stat.S_IMODE(info.st_mode) == 0o700,
                     "ADOPTION_NONCE_ROOT_PERMISSIONS")
    parent = state_root.parent.stat()
    adoption.require(test_root or (
        parent.st_uid == 0 and
        not (parent.st_mode & (stat.S_IWGRP | stat.S_IWOTH))
    ), "ADOPTION_NONCE_PARENT_UNTRUSTED")
    path = state_root / JOURNAL_NAME
    adoption.require(not path.is_symlink(),
                     "ADOPTION_NONCE_JOURNAL_SYMLINK")
    created = False
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY
                     | getattr(os, "O_NOFOLLOW", 0), 0o600)
    except FileExistsError:
        pass
    else:
        os.close(fd)
        created = True
    meta = path.stat()
    adoption.require(stat.S_ISREG(meta.st_mode)
                     and meta.st_uid == os.geteuid()
                     and stat.S_IMODE(meta.st_mode) == 0o600
                     and meta.st_nlink == 1,
                     "ADOPTION_NONCE_JOURNAL_PERMISSIONS")
    if created:
        _fsync_directory(state_root)
    cx = sqlite3.connect(str(path), timeout=5, isolation_level=None)
    try:
        mode = cx.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
        cx.execute("PRAGMA synchronous=EXTRA")
        adoption.require(mode.lower() == "delete"
                         and cx.execute("PRAGMA synchronous").fetchone()[0] == 3,
                         "ADOPTION_NONCE_DURABILITY_UNVERIFIED")
        cx.execute("""CREATE TABLE IF NOT EXISTS adoption_reviews(
            nonce TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('ISSUED','REVIEW_CONSUMED')),
            signed_packet_sha256 TEXT,
            CHECK ((state='ISSUED' AND signed_packet_sha256 IS NULL) OR
                   (state='REVIEW_CONSUMED' AND signed_packet_sha256 IS NOT NULL))
        )""")
        return cx
    except BaseException:
        cx.close()
        raise


def issue_review_only(payload: dict, *, state_root: Path = PRODUCTION_ROOT,
                      test_root: bool = False) -> dict:
    """Persist a proposed challenge, not a release permit or signed assertion."""
    adoption.require(type(payload) is dict
                     and payload.get("kind") == POLICY
                     and payload.get("phase") == "ADOPT_ALREADY_STAGED"
                     and type(payload.get("nonce")) is str
                     and adoption.NONCE.fullmatch(payload["nonce"]),
                     "ADOPTION_REVIEW_CHALLENGE_INVALID")
    # The issued packet must be identical to what the owner will sign.
    # A later verified signature cannot rewrite any payload field.
    encoded = adoption.canonical(payload).decode("ascii")
    cx = _connect(state_root, test_root=test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        cx.execute(
            "INSERT INTO adoption_reviews(nonce,payload_json,state)"
            " VALUES(?,?,'ISSUED')",
            (payload["nonce"], encoded),
        )
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return {"status": "OWNER_REVIEW_ISSUED_NOT_AUTHORIZED",
            "nonce": payload["nonce"], "release_authorized": False,
            "dispatch_enabled": False, "website_activated": False}


def consume_signed_review_once(
    packet: dict, facts: dict, *, state_root: Path = PRODUCTION_ROOT,
    public_key: Path = adoption.TRUST_PUBLIC,
    now=None, test_root: bool = False,
) -> dict:
    """Verify and durably consume one owner REVIEW signature without dispatch.

    No API in this module promotes review-consumed to activation authority.
    Any later real controller needs a separately reviewed protected state
    transition and transaction-specific authorization.
    """
    adoption.require(type(packet) is dict and type(packet.get("payload")) is dict,
                     "ADOPTION_REVIEW_PACKET_INVALID")
    nonce = packet["payload"].get("nonce")
    adoption.require(type(nonce) is str and adoption.NONCE.fullmatch(nonce),
                     "ADOPTION_REVIEW_NONCE_INVALID")
    cx = _connect(state_root, test_root=test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        row = cx.execute(
            "SELECT payload_json,state FROM adoption_reviews WHERE nonce=?",
            (nonce,),
        ).fetchone()
        adoption.require(row is not None, "ADOPTION_REVIEW_NONCE_UNKNOWN")
        adoption.require(row[1] == "ISSUED", "ADOPTION_REVIEW_ALREADY_CONSUMED_NO_RETRY")
        adoption.require(adoption.canonical(packet["payload"]).decode("ascii")
                         == row[0], "ADOPTION_REVIEW_ISSUED_PAYLOAD_CHANGED")
        checked = adoption.verify_signed_adoption_review(
            packet, facts, public_key=public_key, now=now,
            test_root=test_root,
        )
        checksum = checked["signed_packet_sha256"]
        n = cx.execute(
            "UPDATE adoption_reviews"
            " SET state='REVIEW_CONSUMED',signed_packet_sha256=?"
            " WHERE nonce=? AND state='ISSUED'",
            (checksum, nonce),
        ).rowcount
        adoption.require(n == 1, "ADOPTION_REVIEW_NONCE_RACE")
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return {"status": "OWNER_REVIEW_CONSUMED_NO_DISPATCH",
            "owner_packet_sha256": checksum,
            "review_nonce_consumed": True,
            "release_authorized": False,
            "dispatch_enabled": False,
            "website_activated": False,
            "financial_release_authorized": False}
