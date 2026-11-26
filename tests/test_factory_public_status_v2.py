import importlib.util
import hashlib
import tempfile
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parents[1]/"docs/release/artifacts/aoe2war_factory_public_status_v2.py"
spec=importlib.util.spec_from_file_location("factory_public_status_v2",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW="2026-11-13T23:00:00.000Z"

class FactoryPublicStatusTests(unittest.TestCase):
    def host(self,summary):
        with patch.object(m,"iso_now",return_value=NOW), \
             patch.object(m,"trusted_web_identity",return_value=(1,"f"*40,"new_build","/fixture")), \
             patch.object(m,"journal_for",return_value=({"timestamp":"2020-01-01T00:00:00Z"},Path("/fixture"))), \
             patch.object(m,"previous_from_journal",return_value=("e"*40,"old_build")), \
             patch.object(m,"public_release_summary",return_value=summary), \
             patch.object(m,"status",side_effect=lambda route,port=3032:
                503 if route=="/api/bets" else 401 if route=="/api/auth/session" else 200):
            return m.make()[0]

    def summary(self,events=()):
        return {"schema":"aoe2war.product.release-summary.v1","sourceSha":"f"*40,
            "buildId":"new_build","generatedAt":NOW,"startKind":"unknown",
            "firstVerifiedProductionMs":None,"finalAcceptedMs":None,
            "clocksUncertaintyMs":None,"provenanceUrl":None,
            "stages":[{"event":event,"state":"pass","at":NOW,
                "durationMs":10,"proofSha256":"a"*64} for event in events]}

    def test_current_host_health_never_invents_pipeline_or_security_proof(self):
        value=self.host(self.summary())
        self.assertTrue(all(state=="unknown" for state in value["pipelineStage"]["stages"].values()))
        self.assertEqual(value["liveRelease"]["buildId"],"new_build")
        self.assertEqual(value["previousRelease"]["buildId"],"old_build")
        self.assertEqual(value["recentActivity"],[])
        for group in value["testGroups"]:
            if group["id"]!="release":
                self.assertEqual(group["state"],"unknown")
                self.assertIsNone(group["passed"])
            else:
                self.assertEqual((group["passed"],group["total"]),(5,5))

    def test_full_rollback_needs_three_distinct_milestones(self):
        value=self.host(self.summary(("T8","T9")))
        self.assertEqual(value["pipelineStage"]["stages"]["rollback"],"unknown")
        value=self.host(self.summary(("T8","T9","T10")))
        self.assertEqual(value["pipelineStage"]["stages"]["rollback"],"pass")

    def test_expired_summary_or_stage_is_stale(self):
        summary=self.summary(("T4",))
        summary["generatedAt"]="2026-11-11T23:00:00.000Z"
        self.assertEqual(self.host(summary)["pipelineStage"]["stages"]["build"],"stale")
        summary=self.summary(("T4",))
        summary["stages"][0]["at"]="2026-11-11T23:00:00.000Z"
        self.assertEqual(self.host(summary)["pipelineStage"]["stages"]["approve"],"stale")

    def test_wrong_source_or_missing_receipt_fails_closed(self):
        obj=self.summary(("T4",));obj["sourceSha"]="a"*40
        class Metadata:
            st_size=1000
        with patch.object(Path,"exists",return_value=True), \
             patch.object(Path,"lstat",return_value=Metadata()), \
             patch.object(m,"root_file",return_value=json.dumps(obj).encode()):
            self.assertEqual(m.public_release_summary(Path("/fixture"),"f"*40,"new_build",NOW)["stages"],[])
        obj=self.summary(("T4",));obj["stages"][0]["proofSha256"]=None
        with patch.object(Path,"exists",return_value=True), \
             patch.object(Path,"lstat",return_value=Metadata()), \
             patch.object(m,"root_file",return_value=json.dumps(obj).encode()):
            self.assertEqual(m.public_release_summary(Path("/fixture"),"f"*40,"new_build",NOW)["stages"][0]["state"],"unknown")
    def test_t10_requires_completed_root_seal_and_exact_receipts(self):
        obj=self.summary(("T8","T9","T10"))
        obj["finalAcceptedMs"]=4000
        raw=(json.dumps(obj)+"\n").encode()
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            (directory/"release-summary-v1.json").write_bytes(raw)
            final={"event":"T10","state":"pass","sourceSha":"f"*40,
                   "eventHash":"a"*64}
            events=(json.dumps(final)+"\n").encode()
            (directory/"release-events-v1.jsonl").write_bytes(events)
            seal={"schema":"aoe2war.product.release-seal.v1",
                  "sourceSha":"f"*40,"buildId":"new_build",
                  "ledgerSha256":hashlib.sha256(events).hexdigest(),
                  "summarySha256":hashlib.sha256(raw).hexdigest(),
                  "lastEventHash":final["eventHash"],
                  "financialAuthorized":False}
            (directory/"release-seal-v1.json").write_text(json.dumps(seal))
            def read_unprivileged_fixture(path,mode=None):
                return path.read_bytes()
            with patch.object(m,"root_file",side_effect=read_unprivileged_fixture):
                # A T10 phase string in a locally generated summary is NOT
                # evidence of a root-completed acceptance receipt.
                incomplete=m.public_release_summary(directory,"f"*40,"new_build",NOW)
                self.assertEqual(incomplete["stages"][-1]["state"],"unknown")
                self.assertIsNone(incomplete["finalAcceptedMs"])
                for name in (
                    "public-evidence-T7-v1.json","public-evidence-T8-v1.json",
                    "public-evidence-T9-v1.json","source-qualification-v1.json",
                    "pr-provenance-v1.json",
                ):
                    is_rollback=name=="public-evidence-T8-v1.json"
                    data={"sourceSha":("e" if is_rollback else "f")*40}
                    if name.startswith("public-evidence"):
                        data.update({
                            "buildId":"old_build" if is_rollback else "new_build",
                            "financialHttpStatus":503,"financialAuthorized":False,
                        })
                    (directory/name).write_text(json.dumps(data))
                complete=m.public_release_summary(
                    directory,"f"*40,"new_build",NOW,"e"*40,"old_build")
                self.assertEqual(complete["stages"][-1]["state"],"pass")
                self.assertEqual(complete["finalAcceptedMs"],4000)
                (directory/"release-seal-v1.json").write_text(
                    json.dumps({**seal,"summarySha256":"0"*64}))
                tampered=m.public_release_summary(
                    directory,"f"*40,"new_build",NOW,"e"*40,"old_build")
                self.assertEqual(tampered["stages"][-1]["state"],"unknown")
                self.assertIsNone(tampered["finalAcceptedMs"])
                (directory/"release-seal-v1.json").write_text(json.dumps(seal))
                (directory/"public-evidence-T9-v1.json").unlink()
                missing=m.public_release_summary(
                    directory,"f"*40,"new_build",NOW,"e"*40,"old_build")
                self.assertEqual(missing["stages"][-1]["state"],"unknown")
                (directory/"public-evidence-T9-v1.json").write_text(json.dumps({
                    "sourceSha":"f"*40,"buildId":"new_build",
                    "financialHttpStatus":503,"financialAuthorized":False,
                }))
                # Even a valid candidate SHA cannot stand in for previous rollback.
                (directory/"public-evidence-T8-v1.json").write_text(json.dumps({
                    "sourceSha":"f"*40,"buildId":"new_build",
                    "financialHttpStatus":503,"financialAuthorized":False,
                }))
                forged=m.public_release_summary(
                    directory,"f"*40,"new_build",NOW,"e"*40,"old_build")
                self.assertEqual(forged["stages"][-1]["state"],"unknown")


if __name__=="__main__":
    unittest.main()


class FactoryF1PublicationTests(unittest.TestCase):
    def invocation_fixture(self,directory):
        start="2026-11-14T16:00:00.000Z"
        completed="2026-11-14T16:00:05.000Z"
        seal_raw=b'{"fixture":"root-seal"}\n'
        (directory/"release-seal-v1.json").write_bytes(seal_raw)
        (directory/"release-summary-v1.json").write_bytes(b'{"fixture":"summary"}\n')
        seal=hashlib.sha256(seal_raw).hexdigest()
        bindings={}
        for event in ("T7","T8","T9"):
            body={"sourceSha":("e" if event=="T8" else "f")*40,
                  "buildId":"old_build" if event=="T8" else "new_build"}
            raw=json.dumps(body).encode()
            (directory/("public-evidence-"+event+"-v1.json")).write_bytes(raw)
            bindings[event]=hashlib.sha256(raw).hexdigest()
        manifest={"schema":"aoe2war.product.web-release-manifest.v2",
                  "financial_authorized":False,"archive_bytes":615_000_000,
                  "source":"f"*40,"build":"new_build","github_run_id":1234,
                  "previous_source":"e"*40,"previous_build":"old_build","archive_sha256":"5"*64}
        (directory/("f"*12+"-run-1234.json")).write_text(json.dumps(manifest))
        obj={
            "schema":"aoe2war.product.deployment-invocation.v1","invocationId":"1"*32,
            "sourceSha":"f"*40,"buildId":"new_build","githubRunId":1234,
            "previousSourceSha":"e"*40,"previousBuildId":"old_build",
            "kind":"warm","coverage":"full","startedAt":start,"completedAt":completed,
            "clockSource":"python.time.monotonic_ns","utcClockSource":"python.datetime.now(UTC)",
            "clockPrecisionMs":1,"uncertaintyMs":None,"firstVerifiedLiveMs":2000,
            "durableAcceptanceMs":5000,"observedInvocationMs":5000,
            "monotonicOriginNs":1_000_000_000,"firstLiveMonotonicNs":3_000_000_000,
            "acceptedMonotonicNs":6_000_000_000,"monotonicResolutionNs":1,
            "artifactSha256":"5"*64,"runtimeArchiveBytes":615_000_000,"extractedBytes":1_586_000_000,
            "rootSealSha256":seal,"provenanceUrl":"https://github.com/Emaren/app-prodn/pull/1356",
            "acceptanceBoundary":"eight-root-T10-final-readbacks","metricPublicationIncluded":False,
            "financialAuthorized":False,
            "timeline":[
                {"phase":"START","state":"running","at":start,"elapsedMs":0,"proofSha256":None},
                {"phase":"LIVE HTTPS VERIFIED","state":"pass","at":"2026-11-14T16:00:02.000Z",
                 "elapsedMs":2000,"proofSha256":bindings["T7"]},
                {"phase":"ROLLBACK VERIFIED","state":"pass","at":"2026-11-14T16:00:03.000Z",
                 "elapsedMs":3000,"proofSha256":bindings["T8"]},
                {"phase":"REACTIVATED","state":"pass","at":"2026-11-14T16:00:04.000Z",
                 "elapsedMs":4000,"proofSha256":bindings["T9"]},
                {"phase":"T10 DURABLY SEALED","state":"pass","at":completed,"elapsedMs":5000,"proofSha256":seal},
            ],
        }
        return obj

    def read_invocation(self,directory,obj,now="2026-11-14T16:00:06.000Z"):
        raw=(json.dumps(obj,sort_keys=True)+"\n").encode()
        (directory/"deployment-invocation-v1.json").write_bytes(raw)
        with patch.object(m,"root_file",side_effect=lambda path,mode=None:path.read_bytes()), \
             patch.object(m,"accepted_root_seal",return_value=True), \
             patch.object(m,"MANIFEST_ROOT",directory):
            return m.public_deployment_invocation(directory,"f"*40,"new_build","e"*40,"old_build",now)

    def test_source_bound_ninth_receipt_projects_exact_digest_without_private_monotonic_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);obj=self.invocation_fixture(directory)
            result=self.read_invocation(directory,obj)
            self.assertIsNotNone(result)
            self.assertEqual(result["firstVerifiedLiveMs"],2000)
            self.assertEqual(result["durableAcceptanceMs"],5000)
            self.assertEqual(result["receiptSha256"],hashlib.sha256(
                (directory/"deployment-invocation-v1.json").read_bytes()).hexdigest())
            for key in ("monotonicOriginNs","firstLiveMonotonicNs","acceptedMonotonicNs","monotonicResolutionNs"):
                self.assertNotIn(key,result)

    def test_clock_tamper_stale_record_wrong_seal_and_wrong_rollback_are_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            for field,value in (("firstVerifiedLiveMs",3000),("rootSealSha256","0"*64),
                                ("previousSourceSha","a"*40)):
                obj=self.invocation_fixture(directory);obj[field]=value
                self.assertIsNone(self.read_invocation(directory,obj))
            obj=self.invocation_fixture(directory)
            self.assertIsNone(self.read_invocation(directory,obj,"2026-11-16T16:00:06.000Z"))

    def test_data_mount_absence_is_unknown_and_reserve_is_separate_from_available(self):
        class Fs:
            f_frsize=4096;f_blocks=1000;f_bfree=200;f_bavail=190
        with patch.object(m.os,"statvfs",return_value=Fs()), \
             patch.object(m.os.path,"ismount",return_value=False):
            result=m.public_storage("2026-11-14T16:00:06.000Z")
        self.assertIsNone(result["data"])
        self.assertEqual(result["root"]["availableBytes"],190*4096)
        self.assertEqual(result["root"]["reservedBytes"],10*4096)
        self.assertEqual(result["root"]["usedBytes"],800*4096)
        self.assertEqual(result["root"]["usedPercent"],81)

    def make_data_fixture(self,base):
        obj=self.invocation_fixture(base)
        stage_root=base/"data-stage"
        stage=stage_root/(".aoe2war-b-os-"+("f"*12)+"-run-1234")
        stage.mkdir(parents=True,mode=0o700)
        stage.chmod(0o700)
        archive=stage/"runtime.tar.gz"
        raw=(b"REVIEWED_ARCHIVE_SHA256_DATA_V3_"*8)
        archive.write_bytes(raw)
        archive.chmod(0o400)
        st=archive.stat()
        manifest_path=base/("f"*12+"-run-1234.json")
        manifest=json.loads(manifest_path.read_text())
        sha=hashlib.sha256(raw).hexdigest()
        manifest.update({
            "schema":"aoe2war.product.web-release-manifest.v3",
            "transport_mode":"data-archive-v1",
            "archive_path":str(archive),
            "archive_dev":st.st_dev,
            "archive_inode":st.st_ino,
            "archive_bytes":len(raw),
            "archive_sha256":sha
        })
        obj["runtimeArchiveBytes"]=len(raw)
        obj["artifactSha256"]=sha
        manifest_path.write_text(json.dumps(manifest))
        return obj,manifest,manifest_path,archive,stage_root

    def read_v3(self,base,obj,stage_root):
        archive=stage_root/(".aoe2war-b-os-"+("f"*12)+"-run-1234")/"runtime.tar.gz"
        with patch.object(m,"DATA_STAGE_BASE",stage_root), \
             patch.object(m,"DATA_STAGE_DEV",archive.stat().st_dev), \
             patch.object(m,"DATA_STAGE_OWNER_UID",archive.stat().st_uid):
            return self.read_invocation(base,obj)

    def test_v3_data_manifest_positive_original_clock(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            obj,manifest,mp,archive,stage_root=self.make_data_fixture(base)
            result=self.read_v3(base,obj,stage_root)
            self.assertIsNotNone(result)
            self.assertEqual(result["receiptSha256"],hashlib.sha256(
                (base/"deployment-invocation-v1.json").read_bytes()).hexdigest())
            self.assertEqual(result["kind"],"warm")
            self.assertEqual(result["coverage"],"full")
            self.assertEqual(result["firstVerifiedLiveMs"],2000)
            self.assertEqual(result["durableAcceptanceMs"],5000)
            self.assertNotIn("monotonicOriginNs",result)

    def test_v3_rejects_wrong_transport_device_inode_path_and_downgrade(self):
        for change in (
            {"transport_mode":"root-archive-v1"},
            {"archive_dev":0},
            {"archive_dev":True},
            {"archive_inode":0},
            {"archive_inode":None},
            {"archive_inode":99999999},
            {"archive_path":"/tmp/forged-runtime.tar.gz"},
            {"schema":"aoe2war.product.web-release-manifest.v2"},
        ):
            with self.subTest(change=change),tempfile.TemporaryDirectory() as tmp:
                base=Path(tmp)
                obj,manifest,mp,archive,stage_root=self.make_data_fixture(base)
                manifest.update(change)
                mp.write_text(json.dumps(manifest))
                self.assertIsNone(self.read_v3(base,obj,stage_root))

    def test_v3_rejects_content_tamper_symlink_and_unfrozen_mode(self):
        for variant in ("digest","symlink","mode","stage-mode"):
            with self.subTest(variant=variant),tempfile.TemporaryDirectory() as tmp:
                base=Path(tmp)
                obj,manifest,mp,archive,stage_root=self.make_data_fixture(base)
                if variant=="digest":
                    archive.chmod(0o600)
                    raw=archive.read_bytes()
                    archive.write_bytes(b"A"+raw[1:])
                    archive.chmod(0o400)
                elif variant=="symlink":
                    previous=archive.with_name("original.tar.gz")
                    archive.rename(previous)
                    archive.symlink_to(previous.name)
                elif variant=="mode":
                    archive.chmod(0o600)
                else:
                    archive.parent.chmod(0o750)
                self.assertIsNone(self.read_v3(base,obj,stage_root))

    def test_v3_rejects_wrong_archive_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            obj,manifest,mp,archive,stage_root=self.make_data_fixture(base)
            archive.chmod(0o400)
            with patch.object(m,"DATA_STAGE_BASE",stage_root), \
                 patch.object(m,"DATA_STAGE_DEV",archive.stat().st_dev), \
                 patch.object(m,"DATA_STAGE_OWNER_UID",-1):
                self.assertIsNone(self.read_invocation(base,obj))
