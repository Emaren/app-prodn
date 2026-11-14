import contextlib
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "product_release_recovery", Path(__file__).parents[1] / "scripts/aoe2_product_release.py"
)
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def accepted_fixture(parent, approval, module=R):
    work = parent / "release"
    work.mkdir(mode=0o700)
    log = work / "release-events-v1.jsonl"
    source, build = approval["sourceSha"], approval["buildId"]
    bodies = {
        "T2": {
            "schema":"aoe2war.product.pr-provenance.v1",
            "sourceSha":source, "pr":approval["pr"],
        },
        "T3": {
            "schema":"aoe2war.product.github-qualification.v1",
            "sourceSha":source, "buildId":build,
            "pr":approval["pr"], "runId":approval["runId"],
        },
    }
    for event_id in ("T7", "T8", "T9"):
        bodies[event_id] = {
            "schema":"aoe2war.product.public-identity-witness.v1",
            "sourceSha": "9"*40 if event_id == "T8" else source,
            "buildId": "previousBuild123" if event_id == "T8" else build,
            "observedAt":"2026-11-14T01:29:00.000Z",
            "financialAuthorized":False, "financialHttpStatus":503,
            "activeWeb":True, "restarts":0,
        }
    names = {
        "T2":"pr-provenance-v1.json",
        "T3":"source-qualification-v1.json",
        "T7":"public-evidence-T7-v1.json",
        "T8":"public-evidence-T8-v1.json",
        "T9":"public-evidence-T9-v1.json",
    }
    for event_id, body in bodies.items():
        raw = (json.dumps(body,sort_keys=True,indent=2)+"\n").encode()
        module.seal_once(work / names[event_id],raw)
        module.event(log,approval,event_id,extra={"proofSha256":hashlib.sha256(raw).hexdigest()})
    module.event(log,approval,"T10",extra={
        "proofSha256":hashlib.sha256(log.read_bytes()).hexdigest()
    })
    return work,log


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.parent=Path(self.temp.name)
        self.approval={
            "sourceSha":"1"*40, "buildId":"candidateBuild123", "pr":1356,
            "runId":1234, "proofSha256":"4"*64,
            "expiresAt":(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)
                         ).isoformat().replace("+00:00","Z"),
        }

    def test_prepared_restart_activates_without_second_stage(self):
        work=self.parent/"run";work.mkdir(mode=0o700)
        log=work/"release-events-v1.jsonl"
        R.event(log,self.approval,"T3")
        remote="/home/tony/.aoe2war-b-os-"+self.approval["sourceSha"][:12]+"-run-1234"
        selected={
            "source":self.approval["sourceSha"],"build":self.approval["buildId"],
            "github_run_id":1234,"archive_path":remote+"/runtime.tar.gz",
            "archive_sha256":"5"*64,"independent_proof_sha256":"4"*64,
            "financial_authorized":False,
            "previous_source":"9"*40,"previous_build":"previousBuild123",
        }
        def ssh(command,**kwargs):
            if "product-release-manifests/" in command:
                return json.dumps(selected)
            if "state.json" in command:
                return json.dumps({"phase":"prepared"})
            return ""
        actions=[]
        with patch.object(R,"ssh",side_effect=ssh), \
             patch.object(R,"root_pins"), \
             patch.object(R,"canonical_main_ancestry",return_value={}), \
             patch.object(R,"controller",side_effect=lambda action,manifest:actions.append(action)), \
             patch.object(R,"stage_witness",return_value="6"*64), \
             patch.object(R,"seal_acceptance") as seal:
            R.release(self.approval,remote,{"runtime_archive_sha256":"5"*64},log,work)
        self.assertEqual(actions,["activate","rollback","reactivate","status"])
        self.assertEqual(seal.call_count,1)

    def test_new_source_behind_main_is_hold(self):
        main="e"*40
        calls=[]
        def fetch(endpoint):
            calls.append(endpoint)
            if endpoint.endswith("branches/main"):
                return {"commit":{"sha":main}}
            return {"status":"behind","behind_by":1,
                    "merge_base_commit":{"sha":self.approval["sourceSha"]}}
        with self.assertRaisesRegex(RuntimeError,"CURRENT_CANONICAL_MAIN"):
            R.canonical_main_ancestry(self.approval["sourceSha"],fetch)
        self.assertEqual(len(calls),2)

    def test_main_movement_during_qualification_is_hold(self):
        main="e"*40;count=0
        def fetch(endpoint):
            nonlocal count
            if endpoint.endswith("branches/main"):
                count+=1
                return {"commit":{"sha":main if count==1 else "f"*40}}
            return {"status":"ahead","behind_by":0,"merge_base_commit":{"sha":main}}
        with self.assertRaisesRegex(RuntimeError,"MAIN_MOVED"):
            R.canonical_main_ancestry(self.approval["sourceSha"],fetch)

    def test_transport_local_t10_cannot_skip_root_verification(self):
        work,log=accepted_fixture(self.parent,self.approval)
        with patch.object(R,"root_receipt"):
            R.seal_acceptance(self.approval,log,work,"/fixture/journal")
        def missing(path,raw,verify_only=False):
            self.assertTrue(verify_only)
            raise RuntimeError("HOLD_PRODUCT_RECEIPT_MISSING")
        with patch.object(R,"root_receipt",side_effect=missing):
            with self.assertRaisesRegex(RuntimeError,"RECEIPT_MISSING"):
                R.verify_root_acceptance(self.approval,log,work,"/fixture/journal")

    def test_sealed_resume_bypasses_new_release_qualification_and_controller(self):
        work,log=accepted_fixture(self.parent,self.approval)
        with patch.object(R,"root_receipt"):
            R.seal_acceptance(self.approval,log,work,"/fixture/journal")
        args=types.SimpleNamespace(
            approval="/private/approval", phase="transport",work_dir=str(self.parent)
        )
        with patch.object(R.argparse.ArgumentParser,"parse_args",return_value=args), \
             patch.object(R.sys,"platform","darwin"),patch.object(R.os,"getuid",return_value=501), \
             patch.object(R,"load_approval",return_value=self.approval), \
             patch.object(R.transport,"private_dir",side_effect=[self.parent,work]), \
             patch.object(R,"qualify",side_effect=AssertionError("must not requalify accepted SHA")), \
             patch.object(R,"public_and_root"),patch.object(R,"root_pins"), \
             patch.object(R,"controller",side_effect=AssertionError("must not switch service")), \
             patch.object(R,"verify_root_acceptance") as verify:
            R.main()
        self.assertEqual(verify.call_count,1)

    def test_witness_body_tamper_cannot_be_resealed(self):
        work,log=accepted_fixture(self.parent,self.approval)
        with patch.object(R,"root_receipt"):
            R.seal_acceptance(self.approval,log,work,"/fixture/journal")
        target=work/"public-evidence-T8-v1.json"
        body=json.loads(target.read_bytes());body["sourceSha"]="f"*40
        target.write_text(json.dumps(body));target.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError,"WITNESS_DIGEST"):
            R.acceptance_payloads(self.approval,log,work)

    def root_fixture(self):
        base=self.parent/"root-journals";base.mkdir(mode=0o700)
        journal=base/self.approval["sourceSha"][:12];journal.mkdir(mode=0o700)
        unit=self.parent/"unit.service";unit.write_bytes(b"trusted-unit");unit.chmod(0o644)
        lock=self.parent/"release.lock";lock.write_bytes(b"");lock.chmod(0o600)
        runtime="/var/lib/aoe2war-web-prod-"+self.approval["sourceSha"][:12]
        state={
            "phase":"live","source":self.approval["sourceSha"],
            "build":self.approval["buildId"],"active_runtime":runtime,
            "active_unit_sha256":hashlib.sha256(unit.read_bytes()).hexdigest(),
        }
        statefile=journal/"state.json";statefile.write_text(json.dumps(state));statefile.chmod(0o600)
        code=R.ROOT_RECEIPT_CODE
        code=code.replace("OWNER_UID = 0","OWNER_UID = "+str(os.geteuid()))
        code=code.replace('BASE = Path("/var/lib/aoe2war-product-release-v1")',
                          "BASE = Path("+repr(str(base))+")")
        code=code.replace('UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")',
                          "UNIT = Path("+repr(str(unit))+")")
        code=code.replace('LOCK = Path("/run/lock/aoe2war-product-release-v1.lock")',
                          "LOCK = Path("+repr(str(lock))+")")
        return code,journal,runtime

    def run_root_fixture(self,code,runtime,mode,name,raw):
        output=io.StringIO()
        digest=hashlib.sha256(raw).hexdigest()
        arguments=["root-writer",mode,self.approval["sourceSha"][:12],name,digest]
        with patch.object(sys,"argv",arguments), \
             patch.object(sys,"stdin",types.SimpleNamespace(buffer=io.BytesIO(raw))), \
             patch("subprocess.check_output",return_value=runtime.encode()), \
             contextlib.redirect_stdout(output):
            exec(compile(code,"<isolated-root-receipt-fixture>","exec"),{})
        return json.loads(output.getvalue())

    def test_atomic_writer_fsyncs_and_verifies_existing_exact_bytes(self):
        code,journal,runtime=self.root_fixture()
        raw=json.dumps({"sourceSha":self.approval["sourceSha"],"pr":1356}).encode()
        real_fsync=os.fsync
        with patch("os.fsync",wraps=real_fsync) as sync:
            result=self.run_root_fixture(code,runtime,"write","pr-provenance-v1.json",raw)
        self.assertGreaterEqual(sync.call_count,2)
        target=journal/"pr-provenance-v1.json"
        self.assertEqual(target.read_bytes(),raw)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o600)
        self.assertEqual(target.stat().st_nlink,1)
        before=target.stat().st_mtime_ns
        result2=self.run_root_fixture(code,runtime,"verify","pr-provenance-v1.json",raw)
        self.assertEqual(result["sha256"],result2["sha256"])
        self.assertEqual(before,target.stat().st_mtime_ns)

    def test_atomic_writer_interrupted_before_link_resumes_complete_temp(self):
        code,journal,runtime=self.root_fixture()
        raw=json.dumps({"sourceSha":self.approval["sourceSha"],"pr":1356}).encode()
        with patch("os.link",side_effect=OSError("fixture interruption")):
            with self.assertRaises(SystemExit):
                self.run_root_fixture(code,runtime,"write","pr-provenance-v1.json",raw)
        self.assertFalse((journal/"pr-provenance-v1.json").exists())
        self.assertEqual(len(list(journal.glob(".receipt-*"))),1)
        self.run_root_fixture(code,runtime,"write","pr-provenance-v1.json",raw)
        self.assertEqual((journal/"pr-provenance-v1.json").read_bytes(),raw)
        self.assertEqual(list(journal.glob(".receipt-*")),[])

    def test_atomic_writer_preserves_partial_temp_and_final_collision(self):
        code,journal,runtime=self.root_fixture()
        raw=json.dumps({"sourceSha":self.approval["sourceSha"],"pr":1356}).encode()
        digest=hashlib.sha256(raw).hexdigest()
        temporary=journal/(".receipt-pr-provenance-v1.json-"+digest+".tmp")
        temporary.write_bytes(b"incomplete");temporary.chmod(0o600)
        with self.assertRaises(SystemExit):
            self.run_root_fixture(code,runtime,"write","pr-provenance-v1.json",raw)
        self.assertEqual(temporary.read_bytes(),b"incomplete")
        self.assertFalse((journal/"pr-provenance-v1.json").exists())
        # Use a different exact receipt name to test immutable final collision.
        collision=journal/"source-qualification-v1.json"
        collision.write_bytes(b"prior-evidence");collision.chmod(0o600)
        body=json.dumps({"sourceSha":self.approval["sourceSha"],
                         "buildId":self.approval["buildId"]}).encode()
        with self.assertRaises(SystemExit):
            self.run_root_fixture(code,runtime,"write","source-qualification-v1.json",body)
        self.assertEqual(collision.read_bytes(),b"prior-evidence")


if __name__=="__main__":
    unittest.main()


class PrivateFailureLogTests(unittest.TestCase):
    def failure(self, directory, stdout, stderr=b""):
        result=types.SimpleNamespace(returncode=3,stdout=stdout,stderr=stderr)
        with patch.object(R,"DIAGNOSTIC_DIR",directory), \
             patch.object(R.subprocess,"run",return_value=result):
            with self.assertRaises(RuntimeError) as raised:
                R.command(["/usr/bin/ssh","hel1","argument-must-not-be-recorded"])
        message=str(raised.exception)
        self.assertIn("DIAGNOSTIC=",message)
        name=message.split("DIAGNOSTIC=",1)[1]
        self.assertEqual(Path(name).name,name)
        self.assertNotIn(stdout.decode(errors="replace"),message)
        return json.loads((directory/name).read_bytes())

    def test_private_logs_are_bounded_and_full_capture_hash_is_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            raw=b"x"*(R.FAILURE_LOG_LIMIT+123)
            report=self.failure(directory,raw)
            self.assertEqual(report["stdoutBytes"],len(raw))
            self.assertEqual(report["stdoutSha256"],hashlib.sha256(raw).hexdigest())
            self.assertEqual(report["stdoutCapture"]["captureState"],"truncated")
            stored=directory/report["stdoutLog"]
            self.assertEqual(len(stored.read_bytes()),R.FAILURE_LOG_LIMIT)
            self.assertEqual(stat.S_IMODE(stored.stat().st_mode),0o600)
            self.assertEqual(report["stdoutCapture"]["storedSha256"],
                             hashlib.sha256(stored.read_bytes()).hexdigest())
            self.assertNotIn("argument-must-not-be-recorded",json.dumps(report))
            self.assertEqual(report["custody"],"restricted-B-owner-private-not-public")

    def test_credentials_and_urls_do_not_enter_stored_failure_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            raw=(b"ordinary diagnostic\nAuthorization: Bearer private-value\n"
                 b'{"session_secret":"private-session"}\n'
                 b"fetch https://example.invalid/file?signature=private-query\n")
            report=self.failure(directory,raw,b"Cookie: private-cookie\n")
            stored=(directory/report["stdoutLog"]).read_bytes()
            errors=(directory/report["stderrLog"]).read_bytes()
            for forbidden in (b"private-value",b"private-session",b"private-query",
                              b"https://",b"private-cookie"):
                self.assertNotIn(forbidden,stored+errors)
            self.assertIn(b"ordinary diagnostic",stored)
            self.assertEqual(report["stdoutCapture"]["captureState"],"full")
            self.assertEqual(report["stdoutCapture"]["contentState"],"redacted")
            self.assertEqual(report["stdoutSha256"],hashlib.sha256(raw).hexdigest())

    def test_protected_receipts_are_referenced_by_digest_not_copied_into_logs(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            raw=json.dumps({"schema":"aoe2war.product.release-seal.v1",
                            "protectedFixture":"must-remain-in-original-custody"}).encode()
            report=self.failure(directory,raw)
            stored=(directory/report["stdoutLog"]).read_bytes()
            self.assertEqual(report["stdoutCapture"]["contentState"],"receipt-omitted")
            self.assertNotIn(b"must-remain-in-original-custody",stored)
            self.assertEqual(report["stdoutSha256"],hashlib.sha256(raw).hexdigest())
