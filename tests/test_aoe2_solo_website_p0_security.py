"""P0 release-admission adversarial tests; localhost temp only, no HEL1 writes."""
from __future__ import annotations
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from datetime import datetime,timedelta,timezone

SCRIPT_DIR=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(SCRIPT_DIR))
import aoe2_solo_website_command_channel as channel
import aoe2_solo_website_forced_ssh as forced
import aoe2_solo_website_hel1_observer as observer
import aoe2_solo_website_native_audit_adapter as auditor
import aoe2_solo_website_root_phase as root

class FrozenReleaseP0Tests(unittest.TestCase):
    def test_actual_rendered_stage_guard_uses_numeric_parent(self):
        # Extract+COMPILE the real remote_stage_script function, not string
        # matching a comment in code. Supply harmless globals for constants.
        text=(SCRIPT_DIR/"aoe2_solo_website_stage_engine.py").read_text()
        tree=ast.parse(text)
        func=next(n for n in tree.body if isinstance(n,ast.FunctionDef)
                  and n.name=="remote_stage_script")
        class Vars(dict):
            def __missing__(self,key):return "fixture"
        ns=Vars(shlex=shlex,sha256_file=lambda p:"a"*64,
                __builtins__=__builtins__)
        exec(compile(ast.Module(body=[func],type_ignores=[]),
                     "rendered-stage","exec"),ns)
        with patch.dict(sys.modules,{"aoe2_solo_website_command_channel":channel}):
            script=ns["remote_stage_script"](
                release_sha="a"*40,previous_sha="b"*40,
                manifest_sha="c"*64,gate_sha="d"*64,
                receipt_dir="/tmp/nonexistent-stage-receipt",
                lease_guard=True)
        guardian=next(line for line in script.splitlines()
                      if "lease-guardian.pid" in line)
        self.assertIn('"$$" "$build_instance"',guardian)
        self.assertNotIn('"$" "$build_instance"',guardian)
        # Prove actual bash expansion, not assumed Python formatting.
        proc=subprocess.run(["bash","-c",'printf "%s\\n" "$$"'],
                            capture_output=True,text=True,timeout=5)
        self.assertEqual(proc.returncode,0)
        self.assertRegex(proc.stdout.strip(),r"^[0-9]+$")

    def test_ssh_orphan_guardian_retains_same_fd200_while_unit_active(self):
        if sys.platform!="linux":
            self.skipTest("Linux stage guardian uses systemctl")
        with tempfile.TemporaryDirectory(prefix="aoe2-lease-guardian-") as t:
            p=Path(t);locked=p/"release.lock";locked.touch()
            state=p/"quiescent"
            systemctl=p/"systemctl"
            systemctl.write_text("#!/usr/bin/env python3\n"
                "import os,sys\n"
                "quiet=os.path.exists(os.environ['GUARD_QUIET_FILE'])\n"
                "print('ActiveState='+('inactive' if quiet else 'active'))\n"
                "print('MainPID='+('0' if quiet else '2333'))\n"
                "print('ControlPID=0')\n")
            systemctl.chmod(0o700)
            sleeper=subprocess.Popen(["sleep","30"])
            fd=os.open(locked,os.O_RDWR)
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            os.dup2(fd,200,inheritable=True)
            if fd!=200:os.close(fd)
            env=dict(os.environ,PATH=str(p)+os.pathsep+os.environ["PATH"],
                     GUARD_QUIET_FILE=str(state))
            try:
                guard=subprocess.Popen([sys.executable,"-c",channel.STAGE_GUARD,
                    str(sleeper.pid),"ABCDEF1234"],pass_fds=(200,),
                    stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,text=True,env=env)
                name,errors=guard.communicate(timeout=8)
                self.assertEqual(guard.returncode,0,errors)
                self.assertTrue(name.strip().isdigit())
                child=int(name.strip())
                os.close(200)
                sleeper.terminate();sleeper.wait(timeout=5)
                def can_relock():
                    candidate=os.open(locked,os.O_RDWR)
                    try:
                        try:fcntl.flock(candidate,fcntl.LOCK_EX|fcntl.LOCK_NB)
                        except BlockingIOError:return False
                        else:
                            fcntl.flock(candidate,fcntl.LOCK_UN)
                            return True
                    finally:os.close(candidate)
                time.sleep(1.4)
                self.assertFalse(can_relock(),
                    "SSH/shell death must not drop original FD200 lease")
                state.touch()
                deadline=time.monotonic()+8
                while time.monotonic()<deadline and not can_relock():
                    time.sleep(.2)
                self.assertTrue(can_relock(),
                    "guardian must release ONLY after original units quiesce")
            finally:
                if sleeper.poll() is None:sleeper.kill();sleeper.wait()
                try:os.close(200)
                except OSError:pass
                if "child" in locals():
                    try:os.kill(child,signal.SIGKILL)
                    except ProcessLookupError:pass

    def test_writable_ancestor_two_flops_demonstrate_exploit_and_guard(self):
        with tempfile.TemporaryDirectory(prefix="aoe2-two-inodes-") as t:
            rootdir=Path(t);lock=rootdir/"release.lock";lock.touch(mode=0o600)
            one=os.open(lock,os.O_RDWR)
            fcntl.flock(one,fcntl.LOCK_EX|fcntl.LOCK_NB)
            try:
                original=os.fstat(one).st_ino
                lock.rename(rootdir/"archived.lock")
                lock.touch(mode=0o600)
                two=os.open(lock,os.O_RDWR)
                try:
                    fcntl.flock(two,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    self.assertNotEqual(original,os.fstat(two).st_ino)
                    # This is why the native lock ancestor MUST be root-owned
                    # and not writable by the authenticated UID1000 principal.
                finally:os.close(two)
            finally:os.close(one)
        remote=channel.REMOTE
        self.assertIn("release lock ancestor can be replaced by UID1000",remote)
        self.assertIn("canonical release.lock inode changed before dispatch",remote)
        self.assertIn("canonical release.lock inode changed after dispatch",remote)

    def test_uid1000_remote_requires_single_consumed_owner_phase(self):
        remote=channel.REMOTE
        self.assertIn("signed single-use website phase not armed",remote)
        self.assertIn("website_dispatched=True",remote)
        self.assertIn("root phase not actually consumed",remote)
        self.assertIn("wrong owner nonce proof",remote)
        self.assertIn("phase completion without website mutation",remote)
        self.assertIn("if phase is None or not phase_verified",remote)
        # Merely authenticating the SSH key is NOT authorization to spawn
        # arbitrary stage, shell, finance or migration commands as UID1000.
        self.assertIn("unallowlisted",(
            SCRIPT_DIR/"aoe2_solo_website_forced_ssh.py").read_text())

    def test_server_rejects_arbitrary_root_requests_even_with_root_key(self):
        with patch.object(forced.os,"geteuid",return_value=0),\
             patch.object(forced.socket,"gethostname",return_value=forced.HOST),\
             patch.object(forced,"verify_forced_authorized_keys",return_value=True):
            for request,role in [
                ("bash -lc id","command"),
                ("python3 -c 'import os;os.system(\"id\")'","command"),
                ("aoe2war-solo-channel THIS_IS_NOT_BASE64","observer"),
                ("aoe2war-solo-issue PRE_STAGE "+"a"*40,"observer"),
                ("aoe2war-solo-observe","command"),
            ]:
                with self.subTest(request=request,role=role):
                    with self.assertRaises(forced.Hold):
                        forced.main(role,request)
        self.assertIn("SSH_ORIGINAL_COMMAND",
                      (SCRIPT_DIR/"aoe2_solo_website_forced_ssh.py").read_text())

    def test_unenrolled_ssh_keys_can_never_be_assumed_forced(self):
        with patch.object(forced,"trusted_bytes",
                          side_effect=forced.Hold("UNENROLLED")):
            with self.assertRaises(forced.Hold):
                forced.verify_forced_authorized_keys()
        source=(SCRIPT_DIR/"aoe2_solo_website_forced_ssh.py").read_text()
        self.assertIn("restrict,command=",source)
        self.assertIn("authorized_keys",source)
        self.assertIn("verify_forced_authorized_keys()",source)

    def test_issued_challenge_excludes_consumed_pre_stage_and_old_history(self):
        with tempfile.TemporaryDirectory(prefix="aoe2-phase-select-") as t:
            directory=Path(t);now=datetime.now(timezone.utc)
            def make(phase,attempt,when,consumed=False):
                rec={"schema":1,"policy":observer.POLICY,"phase":phase,
                     "candidate_sha":"b"*40,"attempt_id":attempt,
                     "nonce":"e"*64,"lease_id":"f"*64,
                     "expires_at":when.isoformat()}
                issued=directory/(attempt+"-"+phase+"-issue.json")
                issued.write_text(json.dumps(rec))
                issued.chmod(0o600)  # real root journal is O_EXCL mode 0600
                if consumed:
                    used=directory/(attempt+"-"+phase+"-used.json")
                    used.write_text("{}")
                    used.chmod(0o600)
            for i in range(45):
                make("PRE_STAGE",f"{i:064x}",now-timedelta(minutes=15))
            active="f"*64
            make("PRE_STAGE",active,now+timedelta(minutes=4),consumed=True)
            make("PRE_ACTIVATE",active,now+timedelta(minutes=4))
            with patch.object(observer,"STATE",directory):
                found=observer.fresh_challenge(test_expected_uid=os.getuid())
            self.assertEqual(found.get("phase"),"PRE_ACTIVATE")
            self.assertEqual(found.get("attempt_id"),active)

    def test_audit_fails_before_nonce_is_issued(self):
        good={"mounted":True,"source_sha":"c"*40,"build_id":"good-build",
              "free_bytes":35*2**30,"web_service":"active",
              "effective_used_pct":85.0,"finish_used_pct":89.0}
        with patch.object(root,"native",return_value=good),\
             patch.object(root,"gate_native",return_value=None),\
             patch.object(auditor,"audit",side_effect=root.Hold("AUDIT_UNAVAILABLE")) as audit,\
             patch.object(root,"Journal") as ledger:
            with self.assertRaises(root.Hold):
                root.issue(["PRE_STAGE",root.TRAINS["W1"][0]])
            audit.assert_called_once()
            ledger.assert_not_called()

    def test_partial_finance_writers_and_unsigned_reports_refused(self):
        with self.assertRaises(root.Hold):
            auditor.verify_financial_identity({
                "protected":{"8092":{"pid":1001},"8093":{"pid":1002},
                             "writers":{}},
                "financial_movement_authorized":False,
                "wolo_finance_p1":"HOLD",
                "native_receipt_sha256":"a"*64})
        from aoe2_solo_website_producer_receipts import verify_all
        with self.assertRaises((root.Hold,OSError)):
            verify_all({"receipt_provenance":{},"candidate_sha":"b"*40})

    def test_real_ed25519_signed_native_receipts_and_financial_tamper(self):
        from aoe2_solo_website_producer_receipts import (
            verify_all,DOMAIN,CLASSES
        )
        if not Path("/usr/bin/openssl").is_file():
            self.skipTest("OpenSSL unavailable")
        with tempfile.TemporaryDirectory(prefix="aoe2-real-native-signed-") as tmp:
            directory=Path(tmp)
            private=directory/"machine-private.pem"
            public=directory/"machine-public.pem"
            p=subprocess.run(["/usr/bin/openssl","genpkey","-algorithm",
                              "ED25519","-out",str(private)],
                             capture_output=True,timeout=10)
            self.assertEqual(p.returncode,0,p.stderr)
            p=subprocess.run(["/usr/bin/openssl","pkey","-in",str(private),
                              "-pubout","-out",str(public)],
                             capture_output=True,timeout=10)
            self.assertEqual(p.returncode,0,p.stderr)
            der=subprocess.run(["/usr/bin/openssl","pkey","-pubin",
                                "-in",str(public),"-outform","DER"],
                               capture_output=True,timeout=10)
            self.assertEqual(der.returncode,0)
            key={"public_key_path":str(public),
                 "public_spki_sha256":hashlib.sha256(der.stdout).hexdigest()}
            trust={name:key for name in CLASSES}
            trust_path=directory/"enrolled.json"
            trust_path.write_text(json.dumps(trust))
            now=datetime.now(timezone.utc).isoformat()
            report={
                "candidate_sha":"b"*40,"attempt_id":"a"*64,"phase":"PRE_STAGE",
                "doctor":{"status":"PASS"},
                "recovery":{"status":"PHYSICALLY_ACCEPTED"},
                "finance":{"exposure":{"pending_transactions_sha256":"c"*64}},
                "mount":{"mount":"/mnt/HC_Volume_105319120"},
                "source_scope":{"status":"INDEPENDENTLY_REVIEWED"},
                "stage":{"status":"NOT_STAGED"},
                "receipt_provenance":{"signed_producers":{}},
            }
            mapping={"doctor":"doctor","recovery":"recovery","finance":"finance",
                     "host":"mount","source":"source_scope","stage":"stage"}
            for producer in CLASSES:
                blob=json.dumps(report[mapping[producer]],sort_keys=True,
                                separators=(",",":"),ensure_ascii=True).encode()
                body={"producer":producer,"candidate_sha":report["candidate_sha"],
                      "attempt_id":report["attempt_id"],"phase":"PRE_STAGE",
                      "host":"ubuntu-4gb-hel1-11","observed_at":now,
                      "content_sha256":hashlib.sha256(blob).hexdigest()}
                data=directory/("data-"+producer)
                sig=directory/("sig-"+producer)
                data.write_bytes(DOMAIN+json.dumps(body,sort_keys=True,
                    separators=(",",":"),ensure_ascii=True).encode())
                r=subprocess.run(["/usr/bin/openssl","pkeyutl","-sign",
                    "-inkey",str(private),"-rawin","-in",str(data),
                    "-out",str(sig)],capture_output=True,timeout=10)
                self.assertEqual(r.returncode,0,r.stderr)
                import base64
                report["receipt_provenance"]["signed_producers"][producer]={
                    "payload":body,
                    "signature_base64":base64.b64encode(sig.read_bytes()).decode()}
            import aoe2_solo_website_producer_receipts as receipts
            def fixture_bytes(path,limit=262144):return Path(path).read_bytes()
            with patch.object(receipts,"TRUST",trust_path),\
                 patch.object(receipts,"safe_bytes",side_effect=fixture_bytes):
                self.assertTrue(verify_all(report))
                report["finance"]["exposure"]["pending_transactions_sha256"]="f"*64
                with self.assertRaises(root.Hold):
                    verify_all(report)
                report["finance"]["exposure"]["pending_transactions_sha256"]="c"*64
                report["stage"]["status"]="STAGED"
                with self.assertRaises(root.Hold):
                    verify_all(report)  # unsigned stage mutation is never evidence

    def test_original_receipt_inode_is_read_nofollow(self):
        with tempfile.TemporaryDirectory(prefix="aoe2-stage-raw-") as t:
            folder=Path(t)
            original=folder/"stage-receipt.json"
            raw=b'{ "status" : "STAGED" }\n'
            original.write_bytes(raw)
            self.assertEqual(root.read_original_stage_bytes(original),raw)
            linked=folder/"linked-stage.json"
            linked.symlink_to(original)
            with self.assertRaises(root.Hold):
                root.read_original_stage_bytes(linked)

    def test_raw_stage_digest_and_build_artifacts_are_bound(self):
        receipt={"status":"STAGED","artifact_sha256":"a"*64,
                 "candidate_node_modules_sha256":"b"*64,
                 "staged_build_id":"realbuild"}
        raw=json.dumps(receipt,indent=2).encode()+b"\n"
        proof={"status":"STAGED","origin":"HEL1_DURABLE_PROTECTED_STORE",
               "receipt_sha256":hashlib.sha256(raw).hexdigest(),
               "receipt":receipt,"artifact_sha256":"a"*64,
               "node_modules_sha256":"b"*64,
               "staged_build_id":"realbuild"}
        self.assertTrue(root.assert_native_stage_bytes(raw,receipt,proof))
        for key,value in [("receipt_sha256","0"*64),
                          ("artifact_sha256","c"*64),
                          ("node_modules_sha256","d"*64),
                          ("staged_build_id","wrongbuild")]:
            altered=dict(proof);altered[key]=value
            with self.subTest(field=key),self.assertRaises(root.Hold):
                root.assert_native_stage_bytes(raw,receipt,altered)
        with self.assertRaises(root.Hold):
            root.assert_native_stage_bytes(json.dumps(receipt).encode(),
                                           receipt,proof)

if __name__=="__main__":unittest.main()
