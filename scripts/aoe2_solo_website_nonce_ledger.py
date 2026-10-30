#!/usr/bin/env python3
"""Solo-owner website root-owned durable nonce ledger. No deploy interface."""
from __future__ import annotations
import fcntl, hashlib, json, os, re, secrets, stat
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE = Path("/var/lib/aoe2war-solo-website-v1")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
POLICY = "aoe2war.solo-owner.website.admission.v1"
HEX64 = re.compile(r"[0-9a-f]{64}\\Z")

class Hold(RuntimeError): pass

def need(value, message):
    if not value: raise Hold("SOLO_OWNER_LEDGER_HOLD: " + message)

def raw(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()

def sha(obj):
    return hashlib.sha256(raw(obj)).hexdigest()

def utc(t):
    return t.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")

def parse_time(value):
    try: dt = datetime.fromisoformat(value.replace("Z","+00:00"))
    except (ValueError, AttributeError) as exc: raise Hold("invalid UTC timestamp") from exc
    need(dt.utcoffset()==timedelta(0),"non-UTC time")
    return dt

class Journal:
    def __init__(self, state=STATE, lock=LOCK, *, test_mode=False):
        self.state,self.lock,self.test_mode=Path(state),Path(lock),test_mode
    def secure(self,path,directory=False):
        need(path.is_absolute(),"nonabsolute protected path")
        for part in (path,*path.parents): need(not part.is_symlink(),"linked protected path")
        st=path.stat()
        need(stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode),"protected type")
        need(not st.st_mode & 0o022,"writable protected path")
        if not self.test_mode: need(os.geteuid()==0 and st.st_uid==0,"root required")
    @contextmanager
    def exclusive(self):
        self.secure(self.state,True);self.secure(self.lock)
        fd=os.open(self.lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError as exc: raise Hold("global release lock busy") from exc
            yield
        finally:
            fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
    def name(self,attempt,phase,kind):
        need(type(attempt) is str and bool(HEX64.fullmatch(attempt)),"bad attempt")
        need(phase in ("PRE_STAGE","PRE_ACTIVATE") and kind in ("issue","used","staged"),"bad phase")
        return self.state/(attempt+"-"+phase+"-"+kind+".json")
    def read(self,attempt,phase,kind):
        p=self.name(attempt,phase,kind);self.secure(p)
        b=p.read_bytes();need(0<len(b)<=16384,"oversized journal")
        return json.loads(b)
    def write_once(self,attempt,phase,kind,item):
        p=self.name(attempt,phase,kind)
        b=raw(item);need(len(b)<=16384,"oversized journal")
        try: fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        except FileExistsError as exc: raise Hold("nonce replay") from exc
        with os.fdopen(fd,"wb") as f:
            f.write(b);f.flush();os.fsync(f.fileno())
        d=os.open(self.state,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(d)
        finally: os.close(d)
        return hashlib.sha256(b).hexdigest()
    def issue(self,phase,candidate,*,attempt=None,lease=None,stage_sha=None,now=None):
        now=now or datetime.now(timezone.utc)
        need(bool(re.fullmatch(r"[0-9a-f]{40}",candidate)),"bad source SHA")
        with self.exclusive():
            if phase=="PRE_STAGE":
                need(attempt is None and lease is None and stage_sha is None,"stage must be fresh")
                attempt,lease=secrets.token_hex(32),secrets.token_hex(32)
            else:
                need(type(lease) is str and HEX64.fullmatch(lease) and
                     type(stage_sha) is str and HEX64.fullmatch(stage_sha),"activation binding")
                prior=self.read(attempt,"PRE_STAGE","issue")
                used=self.read(attempt,"PRE_STAGE","used")
                staged=self.read(attempt,"PRE_STAGE","staged")
                need(prior["candidate_sha"]==candidate and prior["lease_id"]==lease and
                     used["issue_sha256"]==sha(prior) and
                     staged.get("source")=="PROTECTED_STAGE_ENGINE" and
                     staged["stage_sha256"]==stage_sha,"unverified protected stage")
            challenge={"schema":1,"policy":POLICY,"phase":phase,"candidate_sha":candidate,
                       "attempt_id":attempt,"lease_id":lease,"nonce":secrets.token_hex(32),
                       "issued_at":utc(now),"expires_at":utc(now+timedelta(minutes=10))}
            self.write_once(attempt,phase,"issue",challenge)
            return challenge
    def consume_under_existing_lock(self,challenge,packet_sha,host_sha,*,now=None):
        """Caller MUST hold original release.lock through protected deploy."""
        now=now or datetime.now(timezone.utc)
        a,ph=challenge["attempt_id"],challenge["phase"]
        need(all(type(v) is str and HEX64.fullmatch(v) for v in (packet_sha,host_sha)),"missing hashes")
        need(self.read(a,ph,"issue")==challenge,"untrusted challenge")
        need(parse_time(challenge["issued_at"])<=now<=parse_time(challenge["expires_at"]),"expired")
        return self.write_once(a,ph,"used",{"schema":1,"policy":POLICY,
            "attempt_id":a,"phase":ph,"nonce":challenge["nonce"],
            "lease_id":challenge["lease_id"],"issue_sha256":sha(challenge),
            "owner_packet_sha256":packet_sha,"host_sha256":host_sha,
            "consumed_at":utc(now),"status":"CONSUMED_NOT_DEPLOYED"})
    def mark_staged_under_existing_lock(self,challenge,stage_sha):
        """Only genuine protected engine may call this after durable stage."""
        need(challenge["phase"]=="PRE_STAGE" and type(stage_sha) is str and HEX64.fullmatch(stage_sha),"stage SHA")
        self.read(challenge["attempt_id"],"PRE_STAGE","used")
        return self.write_once(challenge["attempt_id"],"PRE_STAGE","staged",
           {"source":"PROTECTED_STAGE_ENGINE","stage_sha256":stage_sha})
