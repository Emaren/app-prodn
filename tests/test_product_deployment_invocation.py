import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "product_invocation", Path(__file__).parents[1] / "scripts/aoe2_product_release.py")
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class InvocationClockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name).resolve()
        self.approval = {"sourceSha": "1" * 40, "buildId": "candidateBuild123",
                         "pr": 1356, "runId": 1234}

    def clock(self, readings=None):
        readings = iter(readings or [100, 1000100, 2000100, 3000100, 4000100,
                                     5000100, 6000100, 7000100, 8000100, 9000100])
        clock = R.DeploymentInvocation(
            monotonic=lambda: next(readings),
            utc=lambda: "2026-11-14T10:00:00.000Z",
            invocation_id="12345678-1234-4234-8234-123456789abc")
        clock.source, clock.build = self.approval["sourceSha"], self.approval["buildId"]
        clock.provenance = "https://github.com/Emaren/app-prodn/pull/1356"
        clock.previous_source, clock.previous_build = "9" * 40, "previousBuild123"
        clock.artifact_sha, clock.runtime_bytes, clock.extracted_bytes = "a" * 64, 2000000, 4000000
        clock.github_run_id = self.approval["runId"]
        clock.bind(self.work)
        return clock

    def test_injected_monotonic_metrics_and_private_append_only_timeline(self):
        start, live, accepted = 500, 1234500, 9876500
        clock = self.clock([start, live, accepted])
        clock.classify([], warm=True)
        before = clock.path.read_bytes()
        clock.first_live()
        clock.accepted("b" * 64)
        body = clock.payload("b" * 64)
        self.assertEqual(body["firstVerifiedLiveMs"], (live - start) / 1e6)
        self.assertEqual(body["durableAcceptanceMs"], (accepted - start) / 1e6)
        self.assertEqual((body["kind"], body["coverage"]), ("warm", "full"))
        self.assertTrue(clock.path.read_bytes().startswith(before))
        self.assertEqual(clock.path.stat().st_mode & 0o777, 0o600)
        lines = [json.loads(x) for x in clock.path.read_bytes().splitlines()]
        self.assertEqual(lines[1]["previousHash"], lines[0]["eventHash"])
        self.assertEqual(body["timeline"][-1]["phase"], "T10 DURABLY SEALED")

    def test_transport_history_can_still_be_full_warm_invocation(self):
        clock = self.clock()
        clock.classify([{"event": "T5", "state": "pass"}], warm=True)
        self.assertEqual((clock.kind, clock.coverage), ("warm", "full"))

    def test_prior_stage_or_root_prepared_phase_is_partial_unknown(self):
        clock = self.clock()
        clock.classify([{"event": "T6", "state": "pass"}], warm=True)
        clock.first_live()
        clock.accepted("b" * 64)
        self.assertEqual(clock.headlines(),
                         {"firstVerifiedLiveMs": None, "durableAcceptanceMs": None})
        self.assertEqual((clock.kind, clock.coverage), ("resume", "partial"))
        clock.classify([], warm=False)
        clock.manifest({"previous_source": "9" * 40, "previous_build": "previousBuild123",
                        "archive_sha256": "a" * 64, "archive_bytes": 2000000}, "prepared")
        self.assertEqual((clock.kind, clock.coverage), ("resume", "partial"))

    def test_noop_has_null_durations_and_cannot_create_new_accepted_clock(self):
        clock = self.clock()
        clock.classify([{"event": "T10", "state": "pass"}])
        clock.first_live()
        clock.accepted("b" * 64)
        self.assertEqual(clock.headlines(),
                         {"firstVerifiedLiveMs": None, "durableAcceptanceMs": None})
        with self.assertRaisesRegex(RuntimeError, "NOT_DURABLY_ACCEPTED"):
            clock.payload("b" * 64)

    def test_failed_or_timed_out_operation_never_marks_acceptance(self):
        clock = self.clock()
        with patch.object(R, "DeploymentInvocation", return_value=clock), \
             patch.object(R, "run_main",
                          side_effect=RuntimeError("HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH")):
            with self.assertRaisesRegex(RuntimeError, "COMMAND_TIMEOUT_SSH"):
                R.main()
        self.assertIsNone(clock.accepted_ms)
        self.assertEqual(clock.rows[-1]["state"], "hold")
        with self.assertRaisesRegex(RuntimeError, "NOT_DURABLY_ACCEPTED"):
            clock.payload("b" * 64)

    def test_s0_is_created_before_argument_or_permit_work(self):
        order = []
        sentinel = object()
        with patch.object(R, "DeploymentInvocation",
                          side_effect=lambda: order.append("S0") or sentinel), \
             patch.object(R, "run_main",
                          side_effect=lambda clock: order.append("parse-permit-and-work")):
            R.main()
        self.assertEqual(order, ["S0", "parse-permit-and-work"])

    def test_live_callback_stops_after_factory_and_before_second_route(self):
        source, build = self.approval["sourceSha"], self.approval["buildId"]
        runtime = "/var/lib/aoe2war-web-prod-" + source[:12]
        seen = []
        class Response:
            status = 200
            headers = {"X-AoE2WAR-Source": source, "X-AoE2WAR-Build-ID": build}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, size): return build.encode()
        def serve(request, timeout):
            seen.append(request.full_url)
            if "/wolo" in request.full_url:
                raise RuntimeError("fixture later route failure")
            return Response()
        with patch.object(R, "ssh", return_value="\n".join(
                [runtime, source, build, "active", "0"])), \
             patch.object(R.urllib.request, "urlopen", side_effect=serve):
            with self.assertRaisesRegex(RuntimeError, "later route failure"):
                R.public_and_root(source, build,
                                  first_verified=lambda: seen.append("LIVE-STOP"))
        self.assertIn("/factory?", seen[0])
        self.assertEqual(seen[1], "LIVE-STOP")
        self.assertIn("/wolo?", seen[2])

    def test_seal_samples_stop_only_after_all_eight_final_readbacks(self):
        spec = importlib.util.spec_from_file_location(
            "invocation_recovery_fixture", Path(__file__).with_name("test_product_release_recovery.py"))
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        work, log = fixture.accepted_fixture(self.work, self.approval, R)
        observed = []
        class Clock:
            def accepted(self, sha):
                self.sha = sha
                self.readbacks_at_stop = len(observed)
        clock = Clock()
        with patch.object(R, "root_receipt",
                          side_effect=lambda *args, **kwargs: observed.append(args[0])):
            R.seal_acceptance(self.approval, log, work, "/fixture/journal",
                              invocation=clock)
        self.assertEqual(clock.readbacks_at_stop, 8)
        self.assertEqual(clock.sha,
                         hashlib.sha256((work / "release-seal-v1.json").read_bytes()).hexdigest())
        self.assertEqual(len(R.RECEIPT_NAMES), 8)
        self.assertNotIn(R.INVOCATION_RECEIPT_NAME, R.RECEIPT_NAMES)

    def test_publication_failure_never_prints_final_pass(self):
        clock = self.clock()
        clock.classify([], warm=False)
        clock.first_live()
        clock.accepted("b" * 64)
        (self.work / "release-seal-v1.json").write_bytes(b"accepted-eight-receipt-seal")
        (self.work / "release-seal-v1.json").chmod(0o600)
        output = io.StringIO()
        with patch.object(R, "root_receipt",
                          side_effect=RuntimeError("HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH")), \
             contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError, "COMMAND_TIMEOUT"):
                R.publish_invocation(clock, self.approval, self.work, "/fixture/journal")
        self.assertNotIn('"phase": "FINAL RESULT"', output.getvalue())
        self.assertTrue((self.work / R.INVOCATION_RECEIPT_NAME).exists())

    def test_missing_historical_invocation_stays_unknown_without_root_write(self):
        clock = self.clock()
        with patch.object(R, "ssh", return_value=""), patch.object(R, "root_receipt") as root:
            R.reconcile_invocation(clock, self.approval, self.work, "/fixture/journal")
        root.assert_not_called()
        self.assertFalse((self.work / R.INVOCATION_RECEIPT_NAME).exists())
        self.assertEqual(clock.kind, "no-op")
        self.assertEqual(clock.headlines(),
                         {"firstVerifiedLiveMs": None, "durableAcceptanceMs": None})

    def test_receipt_scope_adds_only_the_fixed_ninth_name(self):
        prefix = "/var/lib/aoe2war-product-release-v1/" + "1" * 12 + "/"
        self.assertEqual(R.receipt_location(prefix + R.INVOCATION_RECEIPT_NAME),
                         ("1" * 12, R.INVOCATION_RECEIPT_NAME))
        for wrong in ("deployment-invocation-other.json", "../deployment-invocation-v1.json"):
            with self.assertRaisesRegex(RuntimeError, "PATH_SCOPE"):
                R.receipt_location(prefix + wrong)

    def root_body_fixture(self, body, v3=False):
        journal = self.work / "journal"
        journal.mkdir(mode=0o700)
        state = {"source": self.approval["sourceSha"], "build": self.approval["buildId"]}
        seal = {"schema": "aoe2war.product.release-seal.v1",
                "sourceSha": state["source"], "buildId": state["build"],
                "financialAuthorized": False}
        seal_raw = (json.dumps(seal) + "\n").encode()
        for name in R.RECEIPT_NAMES:
            data = seal_raw if name == "release-seal-v1.json" else b"{}\n"
            if name == "public-evidence-T8-v1.json":
                data = json.dumps({"sourceSha": "9" * 40,
                                   "buildId": "previousBuild123"}).encode()
            path = journal / name
            path.write_bytes(data)
            path.chmod(0o600)
        body["rootSealSha256"] = hashlib.sha256(seal_raw).hexdigest()
        body["timeline"][-1]["proofSha256"] = body["rootSealSha256"]
        for row in body["timeline"]:
            if row["phase"] in ("ROLLBACK VERIFIED", "ROLLBACK PRIOR EVIDENCE"):
                row["proofSha256"] = hashlib.sha256(
                    (journal / "public-evidence-T8-v1.json").read_bytes()).hexdigest()
            elif row["phase"] == "REACTIVATED":
                row["proofSha256"] = hashlib.sha256(
                    (journal / "public-evidence-T9-v1.json").read_bytes()).hexdigest()
        manifest_base = self.work / "root-manifests"
        manifest_base.mkdir(mode=0o700)
        data_base = self.work / "data-stage"
        if v3:
            data_base.mkdir(mode=0o700, exist_ok=True)
            stage = data_base / (".aoe2war-b-os-" + state["source"][:12]
                                 + "-run-" + str(body["githubRunId"]))
            stage.mkdir(mode=0o700, exist_ok=True)
            archive = stage / "runtime.tar.gz"
            archive.unlink(missing_ok=True)
            archive.write_bytes(b"z" * body["runtimeArchiveBytes"])
            archive.chmod(0o400)
            body["artifactSha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        manifest = {
            "schema": "aoe2war.product.web-release-manifest.v2",
            "source": state["source"], "build": state["build"],
            "github_run_id": body["githubRunId"],
            "archive_sha256": body["artifactSha256"],
            "archive_bytes": body["runtimeArchiveBytes"],
            "previous_source": body["previousSourceSha"],
            "previous_build": body["previousBuildId"], "financial_authorized": False,
        }
        if v3:
            st = archive.stat()
            manifest.update({
                "schema": "aoe2war.product.web-release-manifest.v3",
                "transport_mode": "data-archive-v1",
                "archive_path": str(archive),
                "archive_dev": st.st_dev,
                "archive_inode": st.st_ino,
            })
        manifest_path = manifest_base / (
            state["source"][:12] + "-run-" + str(body["githubRunId"]) + ".json")
        manifest_path.write_text(json.dumps(manifest))
        manifest_path.chmod(0o600)
        namespace = {}
        code = R.ROOT_RECEIPT_CODE.split("lock_fd = directory_fd = None")[0]
        code = code.replace("OWNER_UID = 0", "OWNER_UID = " + str(os.geteuid()))
        exec(compile(code, "<root-invocation-schema-fixture>", "exec"), namespace)
        namespace["MANIFEST_BASE"] = manifest_base
        if v3:
            namespace["DATA_STAGE_BASE"] = data_base
            namespace["DATA_STAGE_DEV"] = archive.stat().st_dev
        return namespace["bound_body"], state, journal

    def test_root_body_binds_actual_accepted_seal_and_rejects_mismatch(self):
        clock = self.clock()
        clock.classify([], warm=True)
        clock.first_live()
        clock.record("ROLLBACK VERIFIED", proof="c" * 64)
        clock.record("REACTIVATED", proof="d" * 64)
        clock.accepted("b" * 64)
        body = clock.payload("b" * 64)
        bound, state, journal = self.root_body_fixture(body)
        bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)
        body["rootSealSha256"] = "0" * 64
        body["timeline"][-1]["proofSha256"] = body["rootSealSha256"]
        with self.assertRaisesRegex(RuntimeError, "IMMUTABLE_DIGEST_COLLISION"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_body_rejects_fabricated_full_coverage_null_duration(self):
        clock = self.clock()
        clock.classify([], warm=False)
        clock.first_live()
        clock.record("ROLLBACK VERIFIED", proof="c" * 64)
        clock.record("REACTIVATED", proof="d" * 64)
        clock.accepted("b" * 64)
        body = clock.payload("b" * 64)
        bound, state, journal = self.root_body_fixture(body)
        body["durableAcceptanceMs"] = None
        with self.assertRaisesRegex(RuntimeError, "DURATION_COVERAGE"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)


    def complete_body_fixture(self, v3=False):
        # Each adversarial case needs its own append-only invocation journal.
        self.work = Path(tempfile.mkdtemp(prefix="case-", dir=self.temp.name)).resolve()
        clock = self.clock()
        clock.classify([], warm=False)
        clock.first_live()
        clock.record("ROLLBACK VERIFIED", proof="c" * 64)
        clock.record("REACTIVATED", proof="d" * 64)
        clock.accepted("b" * 64)
        body = clock.payload("b" * 64)
        bound, state, journal = self.root_body_fixture(body, v3=v3)
        return body, bound, state, journal

    def data_manifest(self, body):
        path = self.work / "root-manifests" / (
            body["sourceSha"][:12] + "-run-" + str(body["githubRunId"]) + ".json")
        return path, json.loads(path.read_text())

    def update_data_manifest(self, body, **changes):
        path, manifest = self.data_manifest(body)
        manifest.update(changes)
        path.write_text(json.dumps(manifest))
        path.chmod(0o600)

    def test_root_v3_positive_frozen_data_identity(self):
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_v3_denies_wrong_transport_and_device(self):
        for bad in ({"transport_mode": "root-archive-v1"},
                    {"archive_dev": 0}, {"archive_dev": True}):
            with self.subTest(bad=bad):
                body, bound, state, journal = self.complete_body_fixture(v3=True)
                self.update_data_manifest(body, **bad)
                with self.assertRaisesRegex(RuntimeError, "DATA_IDENTITY"):
                    bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_v3_denies_inode_and_path_substitutions(self):
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        self.update_data_manifest(body, archive_inode=987654321)
        with self.assertRaisesRegex(RuntimeError, "DATA_INODE"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        self.update_data_manifest(body, archive_path="/tmp/runtime.tar.gz")
        with self.assertRaisesRegex(RuntimeError, "DATA_PATH"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_v3_rejects_schema_downgrade_and_missing_data_identity(self):
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        self.update_data_manifest(body, schema="aoe2war.product.web-release-manifest.v2")
        with self.assertRaisesRegex(RuntimeError, "ROOT_MANIFEST_IDENTITY"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        self.update_data_manifest(body, archive_inode=None)
        with self.assertRaisesRegex(RuntimeError, "DATA_IDENTITY"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_v3_rejects_archive_content_drift(self):
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        _, manifest = self.data_manifest(body)
        archive = Path(manifest["archive_path"])
        archive.chmod(0o600)
        with archive.open("r+b") as handle:
            handle.seek(0)
            handle.write(b"ADVERSARIAL")
        archive.chmod(0o400)
        with self.assertRaisesRegex(RuntimeError, "DATA_DIGEST_OR_RACE"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_v3_rejects_symlinked_archive(self):
        body, bound, state, journal = self.complete_body_fixture(v3=True)
        _, manifest = self.data_manifest(body)
        archive = Path(manifest["archive_path"])
        original = archive.with_name("original.tar.gz")
        archive.rename(original)
        archive.symlink_to(original.name)
        with self.assertRaisesRegex(RuntimeError, "OWNER_OR_SYMLINK"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_historical_v2_still_accepts_unmodified_identity(self):
        body, bound, state, journal = self.complete_body_fixture()
        bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_forged_live_metric_without_matching_row(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["firstVerifiedLiveMs"] += 0.25
        with self.assertRaisesRegex(RuntimeError, "FIRST_LIVE_TIMELINE"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_missing_rollback_proof_row(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["timeline"] = [row for row in body["timeline"]
                            if row["phase"] != "ROLLBACK VERIFIED"]
        with self.assertRaisesRegex(RuntimeError, "ROLLBACK_REACTIVATION_TIMELINE"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_wrong_reactivation_proof(self):
        body, bound, state, journal = self.complete_body_fixture()
        for row in body["timeline"]:
            if row["phase"] == "REACTIVATED":
                row["proofSha256"] = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "IMMUTABLE_DIGEST_COLLISION"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_runtime_artifact_different_from_source_manifest(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["artifactSha256"] = "f" * 64
        with self.assertRaisesRegex(RuntimeError, "ROOT_MANIFEST_IDENTITY"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_start_and_stop_utc_detached_from_timeline(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["startedAt"] = "2026-11-14T09:00:00.000Z"
        with self.assertRaisesRegex(RuntimeError, "START_STOP_TIES"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_root_rejects_acceptance_duration_before_final_stop(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["durableAcceptanceMs"] -= 0.25
        with self.assertRaisesRegex(RuntimeError, "ACCEPTED_STOP"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)

    def test_help_exit_zero_does_not_print_hold(self):
        clock = self.clock()
        output = io.StringIO()
        with patch.object(R, "DeploymentInvocation", return_value=clock), \
             patch.object(R, "run_main", side_effect=SystemExit(0)), \
             contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as result:
                R.main()
        self.assertEqual(result.exception.code, 0)
        self.assertNotIn('"state": "hold"', output.getvalue())

    def test_constructor_does_not_print_or_persist_unidentified_start(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            clock = R.DeploymentInvocation(
                monotonic=lambda: 100,
                utc=lambda: "2026-11-14T10:00:00.000Z")
        self.assertEqual(output.getvalue(), "")
        self.assertIsNone(clock.path)
        with self.assertRaisesRegex(RuntimeError, "IDENTITY_BEFORE_PERSIST"):
            clock.bind(self.work)

    def test_successful_persisted_start_is_source_linked(self):
        clock = self.clock()
        first = json.loads(clock.path.read_bytes().splitlines()[0])
        self.assertEqual(first["sourceSha"], self.approval["sourceSha"])
        self.assertEqual(first["buildId"], self.approval["buildId"])
        self.assertEqual(first["entry"]["elapsedMs"], 0)

    def test_noop_and_plan_headers_are_not_deployment_started(self):
        clock = self.clock()
        clock.classify([{"event": "T10", "state": "pass"}])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            clock.announce("release")
            clock.announce("plan")
            clock.announce("transport")
        self.assertNotIn("DEPLOYMENT STARTED", output.getvalue())
        self.assertIn('"phase": "NO-OP"', output.getvalue())
        self.assertIn('"phase": "READ-ONLY PLAN"', output.getvalue())

    def test_failure_json_contains_only_bounded_hold_reason(self):
        clock = self.clock()
        output = io.StringIO()
        with patch.object(R, "DeploymentInvocation", return_value=clock), \
             patch.object(R, "run_main", side_effect=RuntimeError(
                 "HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH private secret text")), \
             contextlib.redirect_stdout(output):
            with self.assertRaises(RuntimeError):
                R.main()
        final = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(final["reason"], "HOLD_PRODUCT_RELEASE_COMMAND_TIMEOUT_SSH")
        self.assertNotIn("private secret text", output.getvalue())


    def test_raw_monotonic_samples_and_provenance_are_persisted(self):
        start, live, stop = 500, 1234500, 9876500
        clock = self.clock([start, live, stop])
        clock.classify([], warm=True)
        clock.first_live()
        clock.accepted("b" * 64)
        body = clock.payload("b" * 64)
        self.assertEqual((body["monotonicOriginNs"], body["firstLiveMonotonicNs"],
                          body["acceptedMonotonicNs"]), (start, live, stop))
        first = json.loads(clock.path.read_bytes().splitlines()[0])
        self.assertEqual(first["clock"]["source"], "python.time.monotonic_ns")
        self.assertEqual(first["clock"]["originNs"], start)
        self.assertIsNone(first["clock"]["uncertaintyMs"])

    def test_root_rejects_raw_sample_different_from_the_claimed_headline(self):
        body, bound, state, journal = self.complete_body_fixture()
        body["firstLiveMonotonicNs"] += 250000
        with self.assertRaisesRegex(RuntimeError, "MONOTONIC_HEADLINES"):
            bound(R.INVOCATION_RECEIPT_NAME, json.dumps(body).encode(), state, journal)


    def test_clock_cannot_reverse_after_a_later_same_process_observation(self):
        clock = self.clock([10, 40, 30])
        clock.classify([], warm=True)
        clock.first_live()
        with self.assertRaisesRegex(RuntimeError, "MONOTONIC_REVERSAL"):
            clock.accepted("b" * 64)
        self.assertIsNone(clock.accepted_ms)


    def test_script_entry_origin_includes_work_before_clock_object_construction(self):
        clock = R.DeploymentInvocation(
            monotonic=lambda: 9000100,
            utc=lambda: "2026-11-14T10:00:01.000Z",
            script_start=(100, "2026-11-14T10:00:00.000Z"))
        clock.source, clock.build = self.approval["sourceSha"], self.approval["buildId"]
        clock.classify([], warm=False)
        clock.first_live()
        self.assertEqual(clock.live_ms, 9.0)
        self.assertEqual(clock.started_at, "2026-11-14T10:00:00.000Z")
        self.assertEqual(clock.start_boundary, "script-entry-before-coordinator-imports")


if __name__ == "__main__":
    unittest.main()
