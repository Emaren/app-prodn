import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "product_release", Path(__file__).parents[1] / "scripts/aoe2_product_release.py"
)
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "approval.json"
        self.now = dt.datetime(2026, 11, 13, 22, 0, tzinfo=dt.timezone.utc)
        self.approval = {
            "schema": "aoe2war.product.owner-approval.v1",
            "sourceSha": "1" * 40, "pr": 1351, "runId": 4351,
            "artifactId": 11, "artifactBytes": 100,
            "artifactSha256": "2" * 64,
            "proofArtifactId": 12, "proofArtifactBytes": 50,
            "proofArtifactSha256": "3" * 64, "proofSha256": "4" * 64,
            "buildId": "exampleBuild123", "expiresAt": "2026-11-13T23:00:00Z",
            "approvedBy": "Emaren", "permittedPhases": ["plan", "transport"],
            "requiredChecks": ["CI"], "financialAuthorized": False,
            "requestStartedAt": None, "requestClockSource": "unknown",
            "requestPrecisionMs": 1000, "requestUncertaintyMs": None,
            "startKind": "unknown",
        }

    def write(self):
        self.path.write_text(json.dumps(self.approval))
        self.path.chmod(0o600)

    def test_transport_permission_does_not_authorize_activation(self):
        self.write()
        self.assertEqual(R.load_approval(self.path, "transport", self.now)["pr"], 1351)
        with self.assertRaisesRegex(RuntimeError, "PHASE_NOT_APPROVED"):
            R.load_approval(self.path, "release", self.now)

    def test_expired_approval_is_hold(self):
        self.approval["expiresAt"] = "2026-11-13T21:59:59Z"
        self.write()
        with self.assertRaisesRegex(RuntimeError, "EXPIRED"):
            R.load_approval(self.path, "plan", self.now)

    def test_financial_or_unknown_field_is_denied(self):
        self.approval["financialAuthorized"] = True
        self.write()
        with self.assertRaisesRegex(RuntimeError, "FIELDS"):
            R.load_approval(self.path, "plan", self.now)
        self.approval["financialAuthorized"] = False
        self.approval["command"] = "arbitrary"
        self.write()
        with self.assertRaisesRegex(RuntimeError, "FIELDS"):
            R.load_approval(self.path, "plan", self.now)

    def test_wrong_pr_source_fails_before_artifact_lookup(self):
        def fetch(endpoint):
            self.assertIn("/pulls/", endpoint)
            return {
                "head": {"sha": "f" * 40, "repo": {"full_name": "Emaren/app-prodn"}},
                "base": {"ref": "main", "repo": {"full_name": "Emaren/app-prodn"}},
            }
        with self.assertRaisesRegex(RuntimeError, "PR_SOURCE"):
            R.qualify(self.approval, fetch)


    def test_public_proof_requires_expected_build_and_source_headers(self):
        source = "f" * 40
        build = "verifiedBuild123"
        runtime = "/var/lib/aoe2war-web-prod-" + source[:12]
        def fake_ssh(*args, **kwargs):
            command=args[0]
            self.assertEqual(command.count("printf '%s\\n' $(cat "),2)
            self.assertIn("/.aoe2war-source-sha)",command)
            self.assertIn("/.next/BUILD_ID)",command)
            return "\n".join([runtime, source, build, "active", "0"])
        # The public proxy's identity headers are part of the proof, not merely
        # Next.js HTML text or an HTTP 200. The browser-compatible UA is required.
        class Response:
            def __init__(self, body, headers):
                self.status = 200
                self.body = body
                self.headers = headers
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, n): return self.body[:n]
        seen = []
        def serve(request, timeout):
            self.assertEqual(request.get_header("User-agent"), R.PUBLIC_OBSERVER_UA)
            seen.append(request.full_url)
            if request.full_url.endswith("/api/bets"):
                raise urllib.error.HTTPError(request.full_url, 503, "Hold", {}, None)
            return Response(build.encode(), {"X-AoE2WAR-Source": source,
                                             "X-AoE2WAR-Build-ID": build})
        with patch.object(R, "ssh", side_effect=fake_ssh), \
             patch.object(R.urllib.request, "urlopen", side_effect=serve):
            R.public_and_root(source, build)
        self.assertEqual(len(seen), 3)

        def foreign(request, timeout):
            if "/api/bets" in request.full_url:
                raise urllib.error.HTTPError(request.full_url, 503, "Hold", {}, None)
            return Response(build.encode(), {"X-AoE2WAR-Source": "e" * 40,
                                             "X-AoE2WAR-Build-ID": build})
        with patch.object(R, "ssh", side_effect=fake_ssh), \
             patch.object(R.urllib.request, "urlopen", side_effect=foreign):
            with self.assertRaisesRegex(RuntimeError, "PUBLIC_HTTPS_SOURCE_AND_BUILD"):
                R.public_and_root(source, build)


    def test_root_final_receipt_interruption_resumes_without_rewriting(self):
        work = Path(self.temp.name) / "release"
        work.mkdir(mode=0o700)
        source = self.approval["sourceSha"]
        log = work / "release-events-v1.jsonl"
        R.ledger.append(log, source, "T10", "pass", {"proofSha256": "a" * 64})
        for name in ("public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
                     "public-evidence-T9-v1.json", "source-qualification-v1.json",
                     "pr-provenance-v1.json"):
            path = work / name
            path.write_bytes(json.dumps({"schema":"fixture"}).encode() + bytes([10]))
            path.chmod(0o600)
        first = []
        def fails_partway(path, raw):
            first.append((path, raw))
            if len(first) == 4:
                raise RuntimeError("simulated root receipt interruption")
        with patch.object(R, "root_receipt", side_effect=fails_partway):
            with self.assertRaisesRegex(RuntimeError, "root receipt interruption"):
                R.seal_acceptance(self.approval, log, work, "/fixture/journal")
        before = {x.name: x.read_bytes() for x in work.iterdir()}
        resumed = []
        with patch.object(R, "root_receipt", side_effect=lambda path,raw: resumed.append((path,raw))):
            R.seal_acceptance(self.approval, log, work, "/fixture/journal")
        self.assertEqual(len(resumed), 8)
        self.assertEqual(before, {x.name:x.read_bytes() for x in work.iterdir()})
        self.assertTrue(any(x[0].endswith("release-seal-v1.json") for x in resumed))

    def test_public_witness_rechecks_and_preserves_first_timestamp(self):
        work = Path(self.temp.name) / "release"
        work.mkdir(mode=0o700)
        source = self.approval["sourceSha"]
        build = self.approval["buildId"]
        template = {
            "schema": "aoe2war.product.public-identity-witness.v1",
            "sourceSha": source, "buildId": build,
            "observedAt": "2026-11-13T21:35:18Z",
            "financialHttpStatus": 503, "financialAuthorized": False,
        }
        later = {**template, "observedAt": "2026-11-13T21:41:20Z"}
        with patch.object(R, "public_and_root", side_effect=[template,later]) as probe:
            first = R.stage_witness(work, "T7", source, build)
            second = R.stage_witness(work, "T7", source, build)
        self.assertEqual(probe.call_count, 2)
        self.assertEqual(first, second)
        saved = json.loads((work / "public-evidence-T7-v1.json").read_text())
        self.assertEqual(saved["observedAt"], template["observedAt"])
        with patch.object(R, "public_and_root", return_value={
            **template, "sourceSha": "f" * 40
        }):
            with self.assertRaisesRegex(RuntimeError, "WITNESS_RESUME_IDENTITY"):
                R.stage_witness(work, "T7", source, build)


    def test_exact_github_qualification_receipt_and_failed_check(self):
        source = self.approval["sourceSha"]
        api_root = "repos/Emaren/app-prodn/"
        def fake(endpoint, failure=False, optional=False, duplicate=False,
                 skipped_required=False, optional_name=None):
            if endpoint == api_root + "pulls/1351":
                return {"head": {"sha": source, "repo": {"full_name": "Emaren/app-prodn"}},
                        "base": {"ref": "main", "repo": {"full_name": "Emaren/app-prodn"}},
                        "html_url": "https://github.com/Emaren/app-prodn/pull/1351",
                        "created_at": "2026-11-13T21:00:00Z"}
            if endpoint == api_root + "actions/runs/4351":
                return {"id":4351, "head_sha":source, "status":"completed",
                        "conclusion":"success",
                        "path":".github/workflows/r25-b-source-pinned-linux-release-build-v2.yml"}
            if endpoint.startswith(api_root + "commits/"):
                checks = [{"id":777, "name":"CI", "status":"completed",
                           "conclusion":"failure" if failure else "success"}]
                if optional or optional_name is not None:
                    checks.append({"id":778,
                        "name":optional_name or "Nightly/manual source-bound Next census",
                        "status":"completed", "conclusion":"skipped"})
                if duplicate:
                    checks.append({"id":779, "name":"CI",
                                   "status":"completed", "conclusion":"failure"})
                    checks.append({"id":780, "name":"CI",
                                   "status":"completed", "conclusion":"success"})
                if skipped_required:
                    checks[0]["conclusion"]="skipped"
                return {"total_count":len(checks), "check_runs":checks}
            if endpoint in (api_root + "actions/artifacts/11", api_root + "actions/artifacts/12"):
                art_id=int(endpoint.split("/")[-1]); prefix="artifact" if art_id==11 else "proofArtifact"
                return {"id":art_id,"expired":False,
                        "size_in_bytes":self.approval[prefix+"Bytes"],
                        "digest":"sha256:"+self.approval[prefix+"Sha256"],
                        "workflow_run":{"id":4351,"head_sha":source}}
            self.fail("Unexpected API lookup: "+endpoint)
        pr, run, receipt = R.qualify(self.approval, lambda endpoint: fake(endpoint))
        self.assertEqual(receipt["schema"],"aoe2war.product.github-qualification.v1")
        self.assertEqual((receipt["sourceSha"],receipt["runId"]),(source,4351))
        self.assertEqual(receipt["latestChecks"][0]["name"],"CI")
        with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
            R.qualify(self.approval, lambda endpoint: fake(endpoint, failure=True))
        _, _, optional_receipt = R.qualify(
            self.approval, lambda endpoint: fake(endpoint, optional=True))
        self.assertEqual(len(optional_receipt["allChecks"]),2)
        self.assertEqual(optional_receipt["allChecks"][1]["conclusion"],"skipped")
        preview_optional = (
            "Chromium — six Kingdom instrument pages, isolated exact source",
            "Chromium — exact candidate, no production data or operator mutations",
        )
        for name in preview_optional:
            _, _, preview = R.qualify(
                self.approval, lambda endpoint: fake(endpoint, optional_name=name))
            self.assertEqual(preview["allChecks"][1]["conclusion"], "skipped")
            # Optional conditional jobs never become optional when an owner
            # explicitly requires their success.
            required={**self.approval, "requiredChecks":["CI", name]}
            with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
                R.qualify(required, lambda endpoint: fake(endpoint, optional_name=name))
        for forged_skip in ("GitGuardian Security Checks", "product-boundary",
                            "Unknown preview", "chrome"):
            with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
                R.qualify(self.approval,
                          lambda endpoint: fake(endpoint, optional_name=forged_skip))
        with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
            R.qualify(self.approval, lambda endpoint: fake(endpoint, duplicate=True))
        with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
            R.qualify(self.approval, lambda endpoint: fake(endpoint, skipped_required=True))
        required_optional={**self.approval,
            "requiredChecks":["CI","Nightly/manual source-bound Next census"]}
        with self.assertRaisesRegex(RuntimeError, "CI_OR_SECURITY_NOT_COMPLETE"):
            R.qualify(required_optional, lambda endpoint: fake(endpoint, optional=True))
        def partial_check_count(endpoint):
            result=fake(endpoint,optional=True)
            if endpoint.startswith(api_root + "commits/"):
                result["total_count"]+=1
            return result
        with self.assertRaisesRegex(RuntimeError, "CHECK_CENSUS_UNBOUNDED_OR_INCOMPLETE"):
            R.qualify(self.approval,partial_check_count)

    def test_macos_openrsync_portability_exact_remote_member_and_host_key(self):
        import hashlib
        import io
        import tarfile
        import types
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            archive = stage / "runtime.tar.gz"
            with tarfile.open(archive, "w:gz") as bundle:
                data = b"test-nonfinancial-runtime-content"
                info = tarfile.TarInfo("app/README")
                info.size = len(data)
                bundle.addfile(info, io.BytesIO(data))
            proof_file = stage / "b-linux-independent-review-v2.json"
            proof_file.write_bytes(b'{"status":"verified"}\\n')
            archive_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
            proof_sha = hashlib.sha256(proof_file.read_bytes()).hexdigest()
            self.approval["proofSha256"] = proof_sha
            proof = {"runtime_archive_bytes": archive.stat().st_size,
                     "runtime_archive_sha256": archive_sha}
            calls = []
            def fake_ssh(cmd, **kwargs):
                calls.append(("ssh", cmd))
                if cmd.startswith("df -B1 "):
                    return str(9 * 1024**3)
                if cmd.startswith("if test -f ") or cmd.startswith("if test -e "):
                    return ""
                if cmd.startswith("umask 077; mkdir "):
                    return "1000:1000:700"
                if cmd.startswith("set -e; test ! -L "):
                    self.assertIn("chmod 600 ", cmd)
                    self.assertIn("stat -c '%u:%h'", cmd)
                    self.assertIn("sha256sum ",cmd)
                    self.assertNotIn("sudo",cmd)
                    digest = archive_sha if "runtime.tar.gz" in cmd else proof_sha
                    self.assertIn(digest, cmd)
                    return "1000:600:1\n"+digest+"  /remote/member"
                self.fail("Unexpected SSH command: "+cmd[:70])
            def fake_run(args, **kwargs):
                calls.append(("rsync", args, kwargs))
                self.assertEqual(args[0:2], ["/usr/bin/rsync","-t"])
                self.assertIn("--partial-dir=.rsync-partial",args)
                self.assertIn("--progress",args)
                self.assertFalse(any(x.startswith("--chmod=") for x in args))
                self.assertIn("StrictHostKeyChecking=yes"," ".join(args))
                self.assertEqual(kwargs.get("timeout"),1800)
                return types.SimpleNamespace(returncode=0)
            with patch.object(R,"ssh",side_effect=fake_ssh), \
                 patch.object(R.subprocess,"run",side_effect=fake_run), \
                 patch.object(R,"event",return_value=None):
                remote = R.deliver(self.approval,stage,proof,stage/"ledger.jsonl")
            self.assertTrue(remote.endswith("-run-4351"))
            self.assertEqual(len([x for x in calls if x[0]=="rsync"]),2)
            self.assertEqual(len([x for x in calls if x[0]=="ssh" and
                                  x[1].startswith("set -e; test ! -L ")]),2)


if __name__ == "__main__":
    unittest.main()
