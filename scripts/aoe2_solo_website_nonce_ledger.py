#!/usr/bin/env python3
"""Solo-owner website root-owned durable nonce ledger. No deploy interface."""
from __future__ import annotations
import fcntl, hashlib, json, os, re, secrets, stat, threading
from contextlib import contextmanager, nullcontext
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE = Path("/var/lib/aoe2war-solo-website-v1")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
POLICY = "aoe2war.solo-owner.website.admission.v1"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")

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
        self._held_fd=None
        self._held_thread=None
    def secure(self,path,directory=False):
        need(path.is_absolute(),"nonabsolute protected path")
        for part in (path,*path.parents): need(not part.is_symlink(),"linked protected path")
        st=path.stat()
        need(stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode),"protected type")
        if path == self.lock:
            # Original shared UID1000 release.lock is not a root-secret.
            # Never chown/replace, chmod to writeable, or create a second lock.
            need(st.st_uid == (os.getuid() if self.test_mode else 1000) and
                 stat.S_ISREG(st.st_mode) and
                 (st.st_mode & 0o777) == (0o600 if self.test_mode else 0o644),
                 "native original uid1000/mode0644 release.lock changed")
            if not self.test_mode:
                for ancestor in (self.lock.parent,*self.lock.parent.parents):
                    st_ancestor=ancestor.lstat()
                    need(stat.S_ISDIR(st_ancestor.st_mode) and
                         st_ancestor.st_uid==0 and
                         not st_ancestor.st_mode & 0o022,
                         "UID1000 can replace canonical lock through ancestor")
        else:
            need(not st.st_mode & 0o022,"writable protected journal")
            if not self.test_mode: need(os.geteuid()==0 and st.st_uid==0,"root-only journal")
    def inherited_lease_fd(self):
        # The v4-style SSH lease passes the SAME open file description to
        # child FD 200, unlike a separately reacquired recursive flock.
        self.secure(self.lock)
        try: inherited=os.fstat(200)
        except OSError as exc: raise Hold("SOLO_OWNER_LEDGER_HOLD: no inherited FD200 release lease") from exc
        original=self.lock.lstat()
        need((inherited.st_dev,inherited.st_ino)==(original.st_dev,original.st_ino),
             "inherited release lease inode mismatch")
        if not self.test_mode:
            need(os.geteuid()==0,"root-only phase consumption")
        # Require another independent OFD to observe an exclusive lock. This
        # is a necessary liveness check, not independently sufficient consent.
        probe=os.open(self.lock,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            try: fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: pass
            else:
                fcntl.flock(probe,fcntl.LOCK_UN)
                raise Hold("SOLO_OWNER_LEDGER_HOLD: global release lease not held")
        finally: os.close(probe)
    @contextmanager
    def exclusive(self):
        self.secure(self.state,True);self.secure(self.lock)
        fd=os.open(self.lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError as exc: raise Hold("global release lock busy") from exc
            need(self._held_fd is None,"reentrant release lock")
            self._held_fd,self._held_thread=fd,threading.get_ident()
            yield
        finally:
            self._held_fd,self._held_thread=None,None
            fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
    def name(self,attempt,phase,kind):
        need(type(attempt) is str and bool(HEX64.fullmatch(attempt)),"bad attempt")
        need(phase in ("PRE_STAGE","PRE_ACTIVATE") and kind in ("issue","used","staged","observation"),"bad phase")
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
    def refuse_unreconciled_phases(self):
        # A lost SSH/activation result cannot be cured by issuing another
        # nonce while the old protected website operation is UNKNOWN.
        # Match exact root-owned O_EXCL journal files, never user JSON.
        self.secure(self.state,True)
        # Historical append-only issue/receipt records are not new
        # in-flight attempts. Never permanently exhaust a 4096-file cap.
        for file in self.state.iterdir():
            if not file.name.endswith("-used.json"):
                continue
            self.secure(file)
            match=re.fullmatch(
                r"([0-9a-f]{64})-(PRE_STAGE|PRE_ACTIVATE)-used.json",
                file.name)
            need(match is not None,"uncanonical used nonce record")
            attempt,phase=match.groups()
            if phase=="PRE_STAGE":
                outcome=self.name(attempt,"PRE_STAGE","staged")
            else:
                completed=self.state/(attempt+"-PRE_ACTIVATE-completed.json")
                reconciled=self.state/(attempt+"-PRE_ACTIVATE-rollback-reconciled.json")
                need(not completed.is_symlink() and not reconciled.is_symlink(),
                     "linked activation outcome marker")
                outcome=completed if completed.is_file() else reconciled
            need(outcome.is_file() and not outcome.is_symlink(),
                 "previous consumed phase outcome unresolved; never redispatch")
            self.secure(outcome)

    def refuse_parallel_unconsumed_challenges(self,now):
        # The authenticated observer selects exactly ONE outstanding fresh
        # challenge. Reject a second concurrent one at the point of issuance.
        for file in self.state.iterdir():
            match=re.fullmatch(
                r"([a-f0-9]{64})-(PRE_STAGE|PRE_ACTIVATE)-issue.json",
                file.name)
            if not match:
                continue
            attempt,phase=match.groups()
            used=self.name(attempt,phase,"used")
            if used.is_symlink():
                raise Hold("SOLO_OWNER_LEDGER_HOLD: linked used marker")
            if used.exists():
                self.secure(used)
                continue
            prior=self.read(attempt,phase,"issue")
            if parse_time(prior["expires_at"])>now:
                raise Hold("SOLO_OWNER_LEDGER_HOLD: another unconsumed owner intent")

    def issue(self,phase,candidate,*,attempt=None,lease=None,stage_sha=None,
              observation=None,now=None,under_original_lease=False):
        now=now or datetime.now(timezone.utc)
        need(bool(re.fullmatch(r"[0-9a-f]{40}",candidate)),"bad source SHA")
        # A native phase issuer must use the same inherited HEL1 FD200 as
        # the audit collector; a separately reacquired flock is not allowed.
        if under_original_lease:
            self.inherited_lease_fd()
        with (nullcontext() if under_original_lease else self.exclusive()):
            self.refuse_unreconciled_phases()
            self.refuse_parallel_unconsumed_challenges(now)
            if phase=="PRE_STAGE":
                need(lease is None and stage_sha is None,"stage must be fresh")
                # Root issuer may reserve a random attempt ID for READ-ONLY
                # independent audit BEFORE a challenge exists. Never accept
                # an externally supplied attempt at the SSH boundary.
                need(attempt is None or
                     (type(attempt) is str and HEX64.fullmatch(attempt)),
                     "bad root-reserved attempt")
                attempt,lease=attempt or secrets.token_hex(32),secrets.token_hex(32)
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
            # A failed audit must not leave an issued challenge. Commit
            # the root-audited snapshot FIRST and the challenge LAST under
            # the same original lock. Orphan snapshot is not an authority.
            if not self.test_mode:
                need(type(observation) is dict and
                     observation.get("schema")==1 and
                     type(observation.get("observation")) is dict,
                     "no independent native audit before challenge")
            if observation is not None:
                self.write_once(attempt,phase,"observation",observation)
            self.write_once(attempt,phase,"issue",challenge)
            return challenge
    def consume_under_existing_lock(self,challenge,packet_sha,host_sha,*,now=None):
        """Caller MUST hold original release.lock through protected deploy."""
        now=now or datetime.now(timezone.utc)
        if self._held_fd is not None:
            need(self._held_thread == threading.get_ident(),
                 "same thread held release lock required")
        else:
            self.inherited_lease_fd()
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
        if self._held_fd is not None:
            need(self._held_thread == threading.get_ident(),
                 "same thread held release lock required")
        else:
            self.inherited_lease_fd()
        need(challenge["phase"]=="PRE_STAGE" and type(stage_sha) is str and HEX64.fullmatch(stage_sha),"stage SHA")
        self.read(challenge["attempt_id"],"PRE_STAGE","used")
        return self.write_once(challenge["attempt_id"],"PRE_STAGE","staged",
           {"source":"PROTECTED_STAGE_ENGINE","stage_sha256":stage_sha})
