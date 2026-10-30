"""Verify independently enrolled signed native source/finance/host/recovery receipts.

No signer is invented: an absent root-approved producer key or real signed
receipt is HOLD. These are MACHINE/PRODUCER attestations, not additional
human owner approval. Owner RSA PRE_STAGE/PRE_ACTIVATE is separate.
"""
from __future__ import annotations
import base64, hashlib, json, os, pathlib, stat, subprocess, tempfile
from datetime import datetime, timedelta, timezone
from aoe2_solo_website_root_phase import Hold, need, canonical, utc, digest

TRUST=pathlib.Path("/etc/aoe2war/solo-owner-website-v1/trusted-producers.json")
DOMAIN=b"AOE2WAR.SOLO_WEBSITE.NATIVE_PRODUCER_RECEIPT.V1\n"
CLASSES=("doctor","recovery","finance","host","source")

def safe_bytes(file,limit=262144):
    need(file.is_absolute(),"relative producer trust")
    for part in (file,*file.parents):
        st=part.lstat()
        need(st.st_uid==0 and not st.st_mode&0o022 and
             not stat.S_ISLNK(st.st_mode),"unprotected producer trust")
    fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and 0<st.st_size<=limit,
             "bad producer trust file")
        b=os.read(fd,limit+1)
        need(len(b)<=limit,"oversized producer trust file")
        return b
    finally:os.close(fd)

def verify_all(report):
    raw=safe_bytes(TRUST,32768)
    trust=json.loads(raw)
    need(type(trust)is dict and set(trust)==set(CLASSES),
         "not all independently reviewed native producers enrolled")
    claims=report["receipt_provenance"].get("signed_producers")
    need(type(claims)is dict and set(claims)==set(CLASSES),
         "missing machine-signed producer receipts")
    now=datetime.now(timezone.utc)
    for name in CLASSES:
        entry=claims[name]
        need(type(entry)is dict and set(entry)=={"payload","signature_base64"},
             "unbound native producer signature")
        body=entry["payload"]
        need(type(body)is dict and
             set(body)=={"producer","candidate_sha","attempt_id","phase",
                         "host","observed_at","content_sha256"} and
             body["producer"]==name and
             body["candidate_sha"]==report["candidate_sha"] and
             body["attempt_id"]==report["attempt_id"] and
             body["phase"]==report["phase"] and
             body["host"]=="ubuntu-4gb-hel1-11" and
             timedelta(0)<=now-utc(body["observed_at"])<=timedelta(seconds=120) and
             body["content_sha256"]==digest(canonical(
                report[{"doctor":"doctor","recovery":"recovery",
                        "finance":"finance","host":"mount",
                        "source":"source_scope"}[name]])),
             "producer signed stale/other scope/content")
        key=trust[name]
        need(type(key) is dict and
             set(key)=={"public_key_path","public_spki_sha256"} and
             type(key["public_key_path"]) is str and
             type(key["public_spki_sha256"]) is str and
             len(key["public_spki_sha256"])==64,
             "producer public key enrollment malformed")
        path=pathlib.Path(key["public_key_path"])
        pem=safe_bytes(path,16384)
        # SPKI pin is independently reviewable; never trust a key path alone.
        p=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-outform","DER"],
                         input=pem,capture_output=True,timeout=10)
        need(p.returncode==0 and hashlib.sha256(p.stdout).hexdigest()==
             key["public_spki_sha256"],"native producer SPKI identity changed")
        try:sig=base64.b64decode(entry["signature_base64"],validate=True)
        except (TypeError,ValueError) as exc:
            raise Hold("invalid native producer signature") from exc
        need(32<=len(sig)<=8192,"bad producer signature length")
        with tempfile.TemporaryDirectory(prefix="aoe2-native-producer-")as tmp:
            message=pathlib.Path(tmp)/"message"
            signed=pathlib.Path(tmp)/"signature"
            message.write_bytes(DOMAIN+canonical(body))
            signed.write_bytes(sig)
            # Ed25519 and Ed448 require raw-in; no private key is handled.
            v=subprocess.run(["/usr/bin/openssl","pkeyutl","-verify","-pubin",
                              "-inkey",str(path),"-rawin","-in",str(message),
                              "-sigfile",str(signed)],
                             capture_output=True,timeout=10)
        need(v.returncode==0,"native producer signature FAILED: "+name)
    return True
