#!/usr/bin/env python3
"""Independent, signed Operation Storage Transfer v1 receipts (NO transfer tools).

A verified Ed25519 envelope is NOT itself proof that a filesystem was restored.
Physical independence additionally requires owner-enrolled native producer
identities and a real third-failure-domain restore witness. The database
enforces source sequence, prior hash, same-bytes receiver readback and a
separate auditor signature. No code copies, removes or scans payloads.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone, timedelta

SCHEMA = "aoe2war.storage-transfer.v1"
DOMAIN = b"AOE2WAR.STORAGE_TRANSFER.RECEIPT.V1\n"
TRUST = Path("/etc/aoe2war/storage-transfer-v1/producer-public-keys.json")
DB = Path("/var/lib/aoe2war-storage-transfer-v1/receipts.sqlite3")
EXPECTED_HOST = "ubuntu-4gb-hel1-11"
CLASSES = frozenset(("APP_DB", "TRAFFIC_SQLITE_WAL", "WOLO_CONSENSUS_FINANCE",
    "LOOP4_FINANCIAL", "WATCHER_REPLAY_MEDIA", "RELEASE_ROLLBACK_CONFIG", "M1_COLD_ARCHIVE"))
SOURCES = frozenset(("m1", "hel1-root", "hel1-volume"))
ROLES = frozenset(("source", "receiver", "restore"))
HASH = re.compile(r"[a-f0-9]{64}\Z")
OPAQUE = re.compile(r"[a-zA-Z0-9_-]{4,64}\Z")
COMMON = {"schema", "role", "campaign_id", "cohort_id", "sequence",
          "source_host", "receiver_host", "observed_at", "expires_at"}
FIELDS = {
    "source": {"source_fs_uuid", "source_failure_domain_id", "protected_class",
        "consistency", "source_bytes", "compressed_bytes", "compression_codec",
        "age_recipient_fp_sha256", "source_sha256", "ciphertext_sha256",
        "ciphertext_bytes", "transferred_bytes", "source_free_before",
        "source_free_after", "prev_source_receipt_sha256"},
    "receiver": {"source_receipt_sha256", "readback_sha256", "ciphertext_sha256",
        "bytes_received", "receiver_free_before", "receiver_free_after",
        "receiver_failure_domain_id"},
    "restore": {"receiver_receipt_sha256", "restored_source_sha256",
        "restored_bytes", "restore_failure_domain_id", "restore_method",
        "restore_evidence_sha256", "restore_result"}
}
MAX_INPUT = 65536

class Hold(ValueError):
    pass

def require(value, message):
    if not value:
        raise Hold("STORAGE_TRANSFER_HOLD: " + message)

def unique(pairs):
    item={}
    for key,value in pairs:
        require(key not in item,"duplicate JSON property")
        item[key]=value
    return item

def parse(raw):
    require(type(raw) is bytes and 0<len(raw)<=MAX_INPUT,"receipt size")
    return json.loads(raw,object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(Hold("nonfinite JSON")))

def canonical(data):
    return json.dumps(data,sort_keys=True,separators=(",",":"),
                      ensure_ascii=True,allow_nan=False).encode("ascii")

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def utc(value):
    require(type(value) is str and value.endswith("Z"),"UTC ISO8601 Z required")
    try:
        dt=datetime.fromisoformat(value[:-1]+"+00:00")
    except ValueError as exc:
        raise Hold("bad UTC timestamp") from exc
    require(dt.tzinfo is not None and dt.utcoffset()==timedelta(0),
            "non-UTC timestamp")
    return dt

def hex64(value):
    return type(value) is str and bool(HASH.fullmatch(value))

def opaque(value):
    return type(value) is str and bool(OPAQUE.fullmatch(value))

def integer(value):
    return type(value) is int and value>=0

def trusted_bytes(path, max_bytes):
    require(path.is_absolute(),"relative trust file")
    for node in (path,*path.parents):
        info=node.lstat()
        require(info.st_uid==0 and not info.st_mode&0o022 and
                not stat.S_ISLNK(info.st_mode),"unprotected trust ancestry")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        info=os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and 0<info.st_size<=max_bytes,
                "untrusted trust file")
        raw=os.read(fd,max_bytes+1)
        require(len(raw)<=max_bytes,"trust length")
        return raw
    finally:
        os.close(fd)

def load_trust(path=TRUST):
    """Root-owned distinct SPKI public keys; no private key lives on HEL1."""
    data=parse(trusted_bytes(path,MAX_INPUT))
    require(type(data) is dict and set(data)==SOURCES|{"intel","restore-auditor"},
            "source/Intel/restore key enrollment incomplete")
    identities=set()
    for host,entry in data.items():
        require(type(entry) is dict and set(entry)=={
            "key_id","public_key_path","public_spki_sha256","failure_domain_id"},
            "producer enrollment fields")
        require(opaque(entry["key_id"]) and opaque(entry["failure_domain_id"]) and
                hex64(entry["public_spki_sha256"]),"bad public-key enrollment")
        key_path=Path(entry["public_key_path"])
        pem=trusted_bytes(key_path,16384)
        output=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-outform","DER"],
            input=pem,capture_output=True,timeout=10,check=False)
        # RFC 8410 Ed25519 SubjectPublicKeyInfo: 12-byte DER prefix,
        # followed by the exact 32-byte public key. No RSA/ECDSA aliases.
        require(output.returncode==0 and
                len(output.stdout)==44 and
                output.stdout.startswith(bytes.fromhex("302a300506032b6570032100")) and
                sha(output.stdout)==entry["public_spki_sha256"],
                "producer must be real pinned Ed25519 SPKI")
        require(entry["public_spki_sha256"] not in identities,
                "same signing key reused by different hosts")
        identities.add(entry["public_spki_sha256"])
    # HEL1 root and its attached volume are the SAME failure domain,
    # despite having independent signing keys. Don't invent physical
    # independence from different mountpoint names.
    require(data["hel1-root"]["failure_domain_id"]==
            data["hel1-volume"]["failure_domain_id"],
            "HEL1 root/volume must declare same physical host domain")
    require(len({data["m1"]["failure_domain_id"],
                 data["hel1-root"]["failure_domain_id"],
                 data["intel"]["failure_domain_id"],
                 data["restore-auditor"]["failure_domain_id"]})==4,
            "source/Intel/independent restore failure domains not separate")
    return data

def validate_envelope(envelope,trust,now=None):
    """Cryptographic verification only. Does not claim native payload readback."""
    now=now or datetime.now(timezone.utc)
    require(type(envelope) is dict and set(envelope)=={
        "schema","signer_host","key_id","payload","signature_base64"},
        "envelope shape")
    require(envelope["schema"]==SCHEMA and type(envelope["payload"]) is dict,
            "envelope schema")
    p=envelope["payload"]
    role=p.get("role")
    require(role in ROLES and set(p)==COMMON|FIELDS[role] and
            p.get("schema")==SCHEMA,"receipt fields/schema")
    require(opaque(p["campaign_id"]) and opaque(p["cohort_id"]) and
            type(p["sequence"]) is int and p["sequence"]>=1 and
            p["source_host"] in SOURCES and p["receiver_host"]=="intel",
            "unknown campaign, source, receiver or sequence")
    observed,expires=utc(p["observed_at"]),utc(p["expires_at"])
    require(timedelta(0)<=now-observed<=timedelta(minutes=10) and
            observed<expires and timedelta(0)<expires-observed<=timedelta(minutes=15) and
            now<=expires,"receipt freshness/window")
    signer=p["source_host"] if role=="source" else (
        "intel" if role=="receiver" else "restore-auditor")
    require(envelope["signer_host"]==signer and signer in trust and
            envelope["key_id"]==trust[signer]["key_id"],
            "unrecognized producer/role signing identity")
    require(opaque(trust[signer]["failure_domain_id"]),"untrusted signing domain")
    if role=="source":
        require(p["protected_class"] in CLASSES and
                p["consistency"] in ("NATIVE_SNAPSHOT","QUIESCENT_IMMUTABLE") and
                p["compression_codec"] in ("zstd","gzip","none") and
                re.fullmatch(r"[a-f0-9-]{36}",p["source_fs_uuid"]) is not None and
                p["source_failure_domain_id"]==trust[signer]["failure_domain_id"] and
                all(integer(p[k]) for k in ("source_bytes","compressed_bytes",
                    "ciphertext_bytes","transferred_bytes","source_free_before",
                    "source_free_after")) and
                # Incompressible sources may produce slightly larger archives.
                p["transferred_bytes"]<=p["ciphertext_bytes"] and
                p["ciphertext_bytes"]>0 and
                all(hex64(p[k]) for k in ("age_recipient_fp_sha256",
                    "source_sha256","ciphertext_sha256")) and
                (p["prev_source_receipt_sha256"] is None or
                 hex64(p["prev_source_receipt_sha256"])),
                "source content/encryption/bytes/identity")
    elif role=="receiver":
        require(all(hex64(p[k]) for k in ("source_receipt_sha256",
                "readback_sha256","ciphertext_sha256")) and
                all(integer(p[k]) for k in ("bytes_received",
                    "receiver_free_before","receiver_free_after")) and
                p["receiver_failure_domain_id"]==trust["intel"]["failure_domain_id"],
                "receiver native readback contract")
    else:
        require(all(hex64(p[k]) for k in ("receiver_receipt_sha256",
                "restored_source_sha256","restore_evidence_sha256")) and
                integer(p["restored_bytes"]) and
                p["restore_failure_domain_id"]==
                    trust["restore-auditor"]["failure_domain_id"] and
                p["restore_method"]=="ISOLATED_CONTENT_READBACK" and
                p["restore_result"]=="PASS",
                "independent restore witness incomplete")
    require(type(envelope["signature_base64"]) is str,
            "producer signature missing")
    try:
        signature=base64.b64decode(envelope["signature_base64"],validate=True)
    except (ValueError,TypeError) as exc:
        raise Hold("malformed producer signature") from exc
    require(len(signature)==64,"Ed25519 signature must be 64 bytes")
    message=DOMAIN+canonical(p)
    with tempfile.TemporaryDirectory(prefix="aoe2-storage-receipt-") as tmp:
        data=Path(tmp)/"data"
        sigfile=Path(tmp)/"signature"
        data.write_bytes(message)
        sigfile.write_bytes(signature)
        result=subprocess.run(["/usr/bin/openssl","pkeyutl","-verify",
            "-pubin","-inkey",trust[signer]["public_key_path"],
            "-rawin","-in",str(data),"-sigfile",str(sigfile)],
            stdin=subprocess.DEVNULL,capture_output=True,timeout=10,check=False)
    require(result.returncode==0,"producer Ed25519 signature failed")
    return p,sha(canonical(envelope))

DDL = """
CREATE TABLE IF NOT EXISTS storage_transfer_receipt (
    campaign_id TEXT NOT NULL, cohort_id TEXT NOT NULL,
    sequence INTEGER NOT NULL, role TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE, body_json TEXT NOT NULL,
    signed_envelope_json TEXT NOT NULL, observed_at TEXT NOT NULL,
    PRIMARY KEY(campaign_id,cohort_id,sequence,role)
);
CREATE INDEX IF NOT EXISTS storage_transfer_receipt_lookup ON
    storage_transfer_receipt(campaign_id,cohort_id,role,sequence);
"""

def create_schema(conn):
    """Only owner-approved offline setup runs this; ingest itself never migrates."""
    conn.executescript(DDL)

def lookup(conn,campaign,cohort,sequence,role):
    return conn.execute("SELECT sha256,body_json FROM storage_transfer_receipt "
        "WHERE campaign_id=? AND cohort_id=? AND sequence=? AND role=?",
        (campaign,cohort,sequence,role)).fetchone()

def ingest(conn,envelope,trust,now=None):
    """One SQLite IMMEDIATE transaction = one accepted signature + replay fence."""
    p,digest=validate_envelope(envelope,trust,now)
    campaign,cohort,sequence,role=(p["campaign_id"],p["cohort_id"],
                                  p["sequence"],p["role"])
    require(not conn.in_transaction,"must begin as separate transaction")
    conn.execute("BEGIN IMMEDIATE")
    try:
        require(lookup(conn,campaign,cohort,sequence,role) is None,
                "receipt replay or sequence collision")
        source=lookup(conn,campaign,cohort,sequence,"source")
        if role=="source":
            old=conn.execute("SELECT sequence,sha256 FROM storage_transfer_receipt "
              "WHERE campaign_id=? AND cohort_id=? AND role='source' "
              "ORDER BY sequence DESC LIMIT 1",(campaign,cohort)).fetchone()
            require(sequence==(old[0]+1 if old else 1) and
                    p["prev_source_receipt_sha256"]==(old[1] if old else None),
                    "source sequence, replay or parent hash")
        else:
            require(source is not None,"receiver/restore without immutable source")
            sp=json.loads(source[1])
            require(p["source_host"]==sp["source_host"] and
                    p["receiver_host"]==sp["receiver_host"],
                    "source/receiver identity changed")
            if role=="receiver":
                require(p["source_receipt_sha256"]==source[0] and
                        sp["transferred_bytes"]==sp["ciphertext_bytes"] and
                        p["bytes_received"]==sp["ciphertext_bytes"] and
                        p["ciphertext_sha256"]==sp["ciphertext_sha256"] and
                        p["readback_sha256"]==sp["ciphertext_sha256"] and
                        trust[sp["source_host"]]["failure_domain_id"]!=
                            p["receiver_failure_domain_id"],
                        "receiver did not attest SAME complete ciphertext bytes")
            else:
                receiver=lookup(conn,campaign,cohort,sequence,"receiver")
                require(receiver is not None,"restore without receiver readback")
                rp=json.loads(receiver[1])
                require(p["receiver_receipt_sha256"]==receiver[0] and
                        p["restored_source_sha256"]==sp["source_sha256"] and
                        p["restored_bytes"]==sp["source_bytes"] and
                        p["restore_failure_domain_id"] not in (
                            sp["source_failure_domain_id"],
                            rp["receiver_failure_domain_id"]),
                        "independent restore mismatch/same failure domain")
        conn.execute("INSERT INTO storage_transfer_receipt "
            "(campaign_id,cohort_id,sequence,role,sha256,body_json,"
            "signed_envelope_json,observed_at) VALUES (?,?,?,?,?,?,?,?)",
            (campaign,cohort,sequence,role,digest,canonical(p).decode(),
             canonical(envelope).decode(),p["observed_at"]))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    # Distinguish signature assertions from real on-disk restore validation.
    return {"status":{"source":"SOURCE_SIGNED",
                      "receiver":"INTEL_READBACK_SIGNED",
                      "restore":"ISOLATED_RESTORE_AUDITOR_SIGNED"}[role],
            "receipt_sha256":digest,"campaign_id":campaign,"cohort_id":cohort,
            "sequence":sequence,"financial_or_cleanup_authority":False}

def verify_stored_receipt(conn,campaign,cohort,sequence,role,trust):
    """Reverify immutable historical signed ENVELOPE, not merely a DB flag.

    Historical verification checks original signed observed-at time; it does
    not assert receipt is currently fresh. Retain old public keys when rotating
    producer identities, or archived proof loses cryptographic recheck.
    """
    row=conn.execute("SELECT sha256,body_json,signed_envelope_json,observed_at "
        "FROM storage_transfer_receipt WHERE campaign_id=? AND cohort_id=? "
        "AND sequence=? AND role=?",
        (campaign,cohort,sequence,role)).fetchone()
    require(row is not None,"historical signed receipt missing")
    claimed,payload_json,envelope_json,observed=row
    envelope=parse(envelope_json.encode("utf-8"))
    p=envelope["payload"]
    checked,digest=validate_envelope(envelope,trust,now=utc(p["observed_at"]))
    require(digest==claimed and canonical(p).decode()==payload_json and
            checked["observed_at"]==observed,
            "stored signed receipt mutated after original ingest")
    return {"receipt_sha256":digest,"role":role,
            "signature_reverified":True,
            "fresh_live_observation":False}


def open_existing_db(path=DB):
    require(path.is_absolute() and not path.is_symlink(),"untrusted ledger DB")
    for node in (path,*path.parents):
        st=node.lstat()
        require(st.st_uid==0 and not st.st_mode&0o022 and
                not stat.S_ISLNK(st.st_mode),"unprotected receipt ledger")
    info=path.stat()
    require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode)&0o077==0,
            "root-only receipt ledger required")
    db=sqlite3.connect(str(path),timeout=5,isolation_level=None)
    db.execute("PRAGMA busy_timeout=5000")
    db.execute("PRAGMA synchronous=FULL")
    return db

def read_bounded_envelope(path):
    """O_NOFOLLOW same-file-description root ingress; never read giant spools."""
    require(path.is_absolute() and not path.is_symlink(),
            "untrusted incoming envelope path")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and
                0<before.st_size<=MAX_INPUT,"oversized/nonfile envelope")
        data=os.read(fd,MAX_INPUT+1)
        after=os.fstat(fd)
        require(0<len(data)<=MAX_INPUT and
                (before.st_dev,before.st_ino,before.st_size)==
                (after.st_dev,after.st_ino,after.st_size) and
                len(data)==before.st_size,
                "incoming envelope replaced/truncated during read")
        return data
    finally:
        os.close(fd)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action",choices=["validate","ingest"])
    parser.add_argument("envelope",type=Path)
    args=parser.parse_args()
    require(sys.platform=="linux" and os.geteuid()==0 and
            socket.gethostname()==EXPECTED_HOST,"not enrolled HEL1 root")
    raw=read_bounded_envelope(args.envelope)
    trust=load_trust()
    envelope=parse(raw)
    if args.action=="validate":
        payload,digest=validate_envelope(envelope,trust)
        result={"status":"SIGNATURE_VALID_ONLY_NOT_INGESTED",
                "role":payload["role"],"receipt_sha256":digest}
    else:
        conn=open_existing_db()
        try:result=ingest(conn,envelope,trust)
        finally:conn.close()
    print(json.dumps(result,sort_keys=True))

if __name__=="__main__":
    try:main()
    except (Hold,OSError,sqlite3.Error,ValueError,KeyError,
            subprocess.TimeoutExpired,subprocess.SubprocessError) as error:
        print("HOLD: "+str(error),file=sys.stderr)
        raise SystemExit(2)
