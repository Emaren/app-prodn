import importlib.util
import base64
import copy
import hashlib
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "aoe2_release_auto.py"
)
SPEC = importlib.util.spec_from_file_location("aoe2_release_auto", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

DOCS_SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "docs_v2_check.py"
)
DOCS_SPEC = importlib.util.spec_from_file_location("docs_v2_check", DOCS_SCRIPT)
DOCS = importlib.util.module_from_spec(DOCS_SPEC)
assert DOCS_SPEC and DOCS_SPEC.loader
DOCS_SPEC.loader.exec_module(DOCS)


def sample():
    return {
        "local": {
            "branch": "main",
            "dirty_count": 0,
            "head": "a" * 40,
        },
        "documentation": {
            "baseline_is_ancestor_of_local": True,
        },
        "production": {
            "reachable": True,
            "dirty_count": 0,
            "service": "active",
            "version_parity": True,
            "staged_build_id": None,
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
            "source_sha": "b" * 40,
            "active_build_id": "old-build",
            "internal_build_version": "old-version",
        },
        "certification": {
            "status": "CERTIFIED",
            "release_sha": "b" * 40,
            "receipt_path": ".aoe2war-release/activation-receipts/old.json",
        },
    }


def hydrated_evidence():
    data = sample()
    release = data["local"]["head"]
    previous = data["production"]["source_sha"]
    staged_build = "candidate-build"
    artifact_sha = "c" * 64
    gate_rel = ".aoe2war-release/gates/aaaaaaaaaaaa-scope.json"
    gate = {
        "schema": 1,
        "kind": "gate-receipt",
        "status": "PASS",
        "target_sha": release,
        "scope_sha256": "d" * 64,
    }
    gate_bytes = (json.dumps(gate, sort_keys=True) + "\n").encode()
    gate_sha = hashlib.sha256(gate_bytes).hexdigest()
    manifest = {
        "schema": 1,
        "kind": "aoe2war-release-manifest",
        "release_sha": release,
        "previous_production_sha": previous,
        "scope_sha256": "d" * 64,
        "risk_class": "APPLICATION",
        "changed_files": ["app/page.tsx"],
        "migration_paths": [],
        "gate": {
            "status": "PASS",
            "receipt_path": gate_rel,
            "receipt_sha256": gate_sha,
        },
    }
    manifest_bytes = (json.dumps(manifest, sort_keys=True) + "\n").encode()
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    remote_dir = f"{MODULE.REMOTE_RECEIPT_ROOT}/stage-stamp-{release[:12]}"
    receipt = {
        "schema": 1,
        "kind": "aoe2war-stage-result",
        "status": "STAGED",
        "release_sha": release,
        "implementation_sha": release,
        "previous_production_sha": previous,
        "risk_class": "APPLICATION",
        "manifest_path": f".aoe2war-release/manifests/{release}.json",
        "manifest_sha256": manifest_sha,
        "gate_path": gate_rel,
        "gate_sha256": gate_sha,
        "source_sha": previous,
        "active_build_id": "old-build",
        "staged_build_id": staged_build,
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": artifact_sha,
        "service": "active",
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
        "remote_receipt_dir": remote_dir,
        "isolated_worktree": True,
        "dependency_contract_unchanged": True,
        "cache_free_artifact": True,
        "artifact_path_relocated": True,
        "live_source_mutated": False,
        "live_public_mutated": False,
        "live_node_modules_mutated": False,
        "live_build_version_mutated": False,
        "live_runtime_mutated": False,
        "wolo_mutated": False,
    }
    receipt_bytes = (json.dumps(receipt, sort_keys=True) + "\n").encode()
    result = {
        "status": "STAGED",
        "release_sha": release,
        "previous_sha": previous,
        "source_sha": previous,
        "active_build_id": "old-build",
        "staged_build_id": staged_build,
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": artifact_sha,
        "service": "active",
        "wolo8092": "1",
        "wolo8093": "1",
        "receipt_dir": remote_dir,
        "manifest_sha256": manifest_sha,
        "gate_sha256": gate_sha,
        "stage_receipt_sha256": hashlib.sha256(receipt_bytes).hexdigest(),
        "manifest_b64": base64.b64encode(manifest_bytes).decode(),
        "gate_b64": base64.b64encode(gate_bytes).decode(),
        "stage_receipt_b64": base64.b64encode(receipt_bytes).decode(),
    }
    return data, release, staged_build, result


class AutoShipTests(unittest.TestCase):
    def test_preflight_accepts_clean_healthy_release(self):
        self.assertEqual(MODULE.preflight_errors(sample()), [])

    def test_preflight_blocks_dirty_worktree(self):
        data = sample()
        data["local"]["dirty_count"] = 2
        self.assertTrue(
            any("worktree" in item for item in MODULE.preflight_errors(data))
        )

    def test_preflight_allows_existing_stage_for_exact_resume(self):
        data = sample()
        data["production"]["staged_build_id"] = "candidate"
        self.assertEqual(MODULE.preflight_errors(data), [])

    def test_preflight_blocks_noop_release(self):
        data = sample()
        data["production"]["source_sha"] = data["local"]["head"]
        self.assertTrue(
            any("nothing new" in item for item in MODULE.preflight_errors(data))
        )

    def test_preflight_allows_noop_source_when_exact_stage_exists(self):
        data = sample()
        data["production"]["source_sha"] = data["local"]["head"]
        data["production"]["staged_build_id"] = "candidate"
        self.assertEqual(MODULE.preflight_errors(data), [])

    def test_preflight_requires_exactly_one_wolo_listener(self):
        data = sample()
        data["production"]["wolo_8092_count"] = 2
        self.assertTrue(
            any("exactly 1" in item for item in MODULE.preflight_errors(data))
        )

    def test_latest_stage_receipt_matches_candidate_build_id(self):
        release = "a" * 40
        original = MODULE.STAGE_RECEIPT_DIR
        with tempfile.TemporaryDirectory() as temp:
            MODULE.STAGE_RECEIPT_DIR = pathlib.Path(temp)
            try:
                wrong = MODULE.STAGE_RECEIPT_DIR / f"{release}-wrong.json"
                right = MODULE.STAGE_RECEIPT_DIR / f"{release}-right.json"
                wrong.write_text(
                    json.dumps(
                        {
                            "status": "STAGED",
                            "release_sha": release,
                            "staged_build_id": "wrong-build",
                        }
                    ),
                    encoding="utf-8",
                )
                right.write_text(
                    json.dumps(
                        {
                            "status": "STAGED",
                            "release_sha": release,
                            "staged_build_id": "candidate-build",
                        }
                    ),
                    encoding="utf-8",
                )
                self.assertEqual(
                    MODULE.latest_stage_receipt(release, "candidate-build"),
                    right,
                )
            finally:
                MODULE.STAGE_RECEIPT_DIR = original

    def test_remote_hydration_requires_one_exact_hash_bound_receipt(self):
        script = MODULE.remote_stage_hydration_script(
            release_sha="a" * 40,
            staged_build_id="candidate-build",
            previous_sha="b" * 40,
            active_build_id="old-build",
            live_build_version="old-version",
        )
        self.assertIn("printf 'match_count\t%s\n'", script)
        self.assertIn("expected exactly one durable receipt", script)
        self.assertIn("stage-receipt.json.sha256", script)
        self.assertIn('artifact_sha="$(artifact_hash .next-release)"', script)
        self.assertIn('assert_eq "production source"', script)
        self.assertIn('assert_eq "staged BUILD_ID"', script)
        self.assertIn('assert_eq "status artifact digest"', script)
        self.assertIn("manifest_b64", script)
        self.assertIn("stage_receipt_b64", script)

    def test_hydrated_evidence_accepts_exact_source_build_and_digests(self):
        data, release, staged_build, result = hydrated_evidence()
        evidence = MODULE.validate_hydrated_stage_evidence(
            result,
            release_sha=release,
            staged_build_id=staged_build,
            production=data["production"],
        )
        self.assertEqual(evidence[-1]["artifact_sha256"], "c" * 64)

    def test_hydrated_evidence_rejects_source_build_or_digest_mismatch(self):
        data, release, staged_build, result = hydrated_evidence()
        for key, value in (
            ("source_sha", "e" * 40),
            ("staged_build_id", "different-build"),
            ("manifest_sha256", "f" * 64),
        ):
            with self.subTest(key=key):
                changed = dict(result)
                changed[key] = value
                with self.assertRaises(MODULE.AutoShipError):
                    MODULE.validate_hydrated_stage_evidence(
                        changed,
                        release_sha=release,
                        staged_build_id=staged_build,
                        production=data["production"],
                    )

    def test_hydration_fails_closed_on_ambiguous_durable_receipts(self):
        data = sample()
        data["production"]["staged_build_id"] = "candidate-build"
        response = subprocess.CompletedProcess(
            ["ssh"],
            42,
            stdout="match_count\t2\n",
            stderr="expected exactly one durable receipt",
        )
        with mock.patch.object(MODULE, "run", return_value=response):
            with self.assertRaisesRegex(MODULE.AutoShipError, "found 2"):
                MODULE.hydrate_stage_receipt(
                    data["local"]["head"],
                    "candidate-build",
                    data["production"],
                )

    def test_hydration_fails_closed_when_durable_evidence_is_missing(self):
        data = sample()
        data["production"]["staged_build_id"] = "candidate-build"
        response = subprocess.CompletedProcess(
            ["ssh"],
            43,
            stdout="match_count\t1\n",
            stderr="missing durable stage evidence: stage-receipt.json",
        )
        with mock.patch.object(MODULE, "run", return_value=response):
            with self.assertRaisesRegex(MODULE.AutoShipError, "missing durable"):
                MODULE.hydrate_stage_receipt(
                    data["local"]["head"],
                    "candidate-build",
                    data["production"],
                )

    def test_hydration_installs_exact_verified_evidence_before_resume(self):
        data, release, staged_build, result = hydrated_evidence()
        result["match_count"] = "1"
        stdout = "".join(f"{key}\t{value}\n" for key, value in result.items())
        response = subprocess.CompletedProcess(
            ["ssh"],
            0,
            stdout=stdout,
            stderr="",
        )
        with (
            mock.patch.object(MODULE, "run", return_value=response),
            mock.patch.object(MODULE, "_install_exact_bytes") as install,
            mock.patch.object(MODULE, "load_stage_receipt") as load,
        ):
            path = MODULE.hydrate_stage_receipt(
                release,
                staged_build,
                data["production"],
            )

        expected = MODULE.STAGE_RECEIPT_DIR / f"{release}-{'c' * 12}.json"
        self.assertEqual(path, expected)
        self.assertEqual(install.call_count, 4)
        self.assertEqual(
            install.call_args_list[-1].args,
            (expected, base64.b64decode(result["stage_receipt_b64"])),
        )
        load.assert_called_once_with(str(expected))

    def test_resolve_stage_receipt_hydrates_only_when_local_exact_is_absent(self):
        data = sample()
        hydrated = MODULE.ROOT / ".aoe2war-release/stage-receipts/hydrated.json"
        with (
            mock.patch.object(
                MODULE,
                "latest_stage_receipt",
                side_effect=MODULE.AutoShipError("absent"),
            ),
            mock.patch.object(
                MODULE,
                "hydrate_stage_receipt",
                return_value=hydrated,
            ) as hydrate,
        ):
            self.assertEqual(
                MODULE.resolve_stage_receipt(
                    data["local"]["head"],
                    "candidate-build",
                    data["production"],
                ),
                (hydrated, True),
            )
        hydrate.assert_called_once_with(
            data["local"]["head"],
            "candidate-build",
            data["production"],
        )

    def test_plain_ship_resumes_exact_stage_without_rebuild_or_publish(self):
        initial = sample()
        initial["production"]["staged_build_id"] = "candidate-build"
        final = copy.deepcopy(initial)
        final["production"]["source_sha"] = initial["local"]["head"]
        final["production"]["staged_build_id"] = None
        final["production"]["active_build_id"] = "candidate-build"
        final["production"]["internal_build_version"] = "candidate-version"
        final["certification"]["release_sha"] = initial["local"]["head"]
        final["certification"]["receipt_path"] = (
            ".aoe2war-release/activation-receipts/candidate.json"
        )
        receipt = (
            MODULE.ROOT
            / ".aoe2war-release"
            / "stage-receipts"
            / "candidate.json"
        )
        collect = mock.Mock(return_value=final)

        with (
            mock.patch.object(
                MODULE,
                "resolve_stage_receipt",
                return_value=(receipt, False),
            ) as resolve,
            mock.patch.object(MODULE, "activate_release", return_value=0) as activate,
            mock.patch.object(
                MODULE, "apply_production_migrations_if_needed", return_value=None
            ) as migrate,
            mock.patch.object(MODULE, "route_proof") as route,
            mock.patch.object(MODULE, "gate_release") as gate,
            mock.patch.object(MODULE, "manifest_release") as manifest,
            mock.patch.object(MODULE, "stage_release") as stage,
        ):
            self.assertEqual(
                MODULE.ship_all(collect=collect, initial=initial),
                0,
            )

        resolve.assert_called_once_with(
            initial["local"]["head"],
            "candidate-build",
            initial["production"],
        )
        migrate.assert_called_once_with(initial["local"]["head"])
        self.assertEqual(activate.call_count, 2)
        self.assertTrue(activate.call_args_list[0].kwargs["dry_run"])
        self.assertFalse(activate.call_args_list[1].kwargs["dry_run"])
        route.assert_called_once()
        gate.assert_not_called()
        manifest.assert_not_called()
        stage.assert_not_called()

    def test_route_proof_uses_curl_for_public_routes(self):
        calls = []

        def fake_run(args, *, timeout=300):
            calls.append(args)

            if args[0] == "curl":
                return subprocess.CompletedProcess(
                    args,
                    0,
                    stdout="200",
                    stderr="",
                )

            if args[0] == "ssh":
                return subprocess.CompletedProcess(
                    args,
                    0,
                    stdout="",
                    stderr="",
                )

            raise AssertionError(
                f"unexpected command: {args}"
            )

        with mock.patch.object(
            MODULE,
            "run",
            side_effect=fake_run,
        ):
            MODULE.route_proof()

        public_calls = [
            args
            for args in calls
            if args and args[0] == "curl"
        ]

        self.assertEqual(len(public_calls), 4)

        for args in public_calls:
            self.assertIn("-fsS", args)
            self.assertIn("--connect-timeout", args)
            self.assertIn("--max-time", args)
            self.assertEqual(args[-2], "%{http_code}")

        self.assertTrue(
            any(args[0] == "ssh" for args in calls)
        )

    def test_route_proof_fails_closed_on_public_curl_failure(self):
        failed = subprocess.CompletedProcess(
            ["curl"],
            22,
            stdout="403",
            stderr="curl: (22) HTTP 403",
        )

        with mock.patch.object(
            MODULE,
            "run",
            return_value=failed,
        ):
            with self.assertRaisesRegex(
                MODULE.AutoShipError,
                "public route failed",
            ):
                MODULE.route_proof()

    def test_release_auto_no_longer_uses_urllib_for_public_proof(self):
        source = SCRIPT.read_text(encoding="utf-8")

        self.assertNotIn(
            "urllib.request",
            source,
        )
        self.assertNotIn(
            "urllib.error",
            source,
        )

    def test_documentation_only(self):
        self.assertTrue(
            MODULE.documentation_only(
                [
                    "docs/DOCUMENTATION_CONTROL_PLANE.md",
                    "docs/document-registry.json",
                ]
            )
        )
        self.assertFalse(MODULE.documentation_only(["app/page.tsx"]))
        self.assertFalse(MODULE.documentation_only([]))

    def test_porcelain_paths_handles_rename(self):
        self.assertEqual(
            MODULE.porcelain_paths(
                " M app/a.ts\nR  old.ts -> new.ts\n"
            ),
            {"app/a.ts", "new.ts"},
        )

    def test_final_errors_require_certification(self):
        data = sample()
        release = data["production"]["source_sha"]
        self.assertEqual(MODULE.final_errors(data, release), [])

        data["certification"]["status"] = "legacy-unmanifested"
        self.assertTrue(
            any(
                "certified provenance" in item
                for item in MODULE.final_errors(data, release)
            )
        )

    def test_final_errors_require_wolo_continuity(self):
        data = sample()
        release = data["production"]["source_sha"]
        data["production"]["wolo_8093_count"] = 0
        self.assertTrue(
            any("8093" in item for item in MODULE.final_errors(data, release))
        )


    def test_git_preserves_leading_porcelain_status_space(self):
        original = MODULE.run

        def fake_run(args, *, timeout=300):
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=" M docs/DOCUMENTATION_CONTROL_PLANE.md\n",
                stderr="",
            )

        MODULE.run = fake_run
        try:
            output = MODULE.git(
                "status",
                "--porcelain",
                "--untracked-files=all",
            )
        finally:
            MODULE.run = original

        self.assertTrue(output.startswith(" M "))
        self.assertEqual(
            MODULE.porcelain_paths(output),
            {"docs/DOCUMENTATION_CONTROL_PLANE.md"},
        )

    def test_docs_scanner_excludes_release_operational_state(self):
        operational = pathlib.PurePosixPath(
            ".aoe2war-release/patch-backups/example/docs/"
            "DOCUMENTATION_CONTROL_PLANE.md"
        )
        canonical = pathlib.PurePosixPath(
            "docs/DOCUMENTATION_CONTROL_PLANE.md"
        )

        self.assertTrue(DOCS.is_excluded(operational))
        self.assertFalse(DOCS.is_excluded(canonical))


class LearnedSupersededStageRecoveryTests(unittest.TestCase):
    def production(self):
        return {
            "source_sha": "a" * 40,
            "active_build_id": "active-build",
            "internal_build_version": "20260824000000-test",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }

    def test_retirement_script_requires_exact_provenance_and_zero_runtime_refs(self):
        script = MODULE.remote_superseded_stage_retirement_script(
            current_release_sha="b" * 40,
            staged_build_id="staged-build",
            production=self.production(),
        )

        self.assertIn('MATCHES=()', script)
        self.assertIn(r"classification\tAMBIGUOUS_STAGE", script)
        self.assertIn(r"classification\tCURRENT_STAGE", script)
        self.assertIn('OPEN_REFS=0', script)
        self.assertIn(r"classification\tACTIVE_REFERENCE", script)
        self.assertIn('.next-release', script)
        self.assertIn('.node_modules-release', script)
        self.assertIn('stale-stage-retirements', script)
        self.assertIn('original-stage-status.txt', script)
        self.assertIn('RETIREMENT_SHA256', script)
        self.assertIn('http://127.0.0.1:3030/api/bets', script)
        self.assertIn(':8092', script)
        self.assertIn(':8093', script)

    def test_retirement_accepts_only_superseded_release(self):
        stdout = "\n".join(
            [
                "match_count\t1",
                "found_release_sha\t" + ("c" * 40),
                "open_references\t0",
                "status\tRETIRED",
                "classification\tSUPERSEDED_STAGE",
                "retired_release_sha\t" + ("c" * 40),
                "retired_staged_build_id\tstaged-build",
                "receipt_dir\t/mnt/HC_Volume_105319120/aoe2war/"
                "stale-stage-retirements/test",
                "root_reclaimed_kb\t123",
                "wolo_8092_count\t1",
                "wolo_8093_count\t1",
            ]
        )

        result = type(
            "Result",
            (),
            {
                "returncode": 0,
                "stdout": stdout,
                "stderr": "",
            },
        )()

        with mock.patch.object(
            MODULE,
            "run",
            return_value=result,
        ):
            recovered = MODULE.retire_superseded_stage(
                current_release_sha="b" * 40,
                staged_build_id="staged-build",
                production=self.production(),
            )

        self.assertEqual(
            recovered["classification"],
            "SUPERSEDED_STAGE",
        )
        self.assertEqual(
            recovered["retired_release_sha"],
            "c" * 40,
        )

    def test_current_release_stage_is_never_auto_retired(self):
        result = type(
            "Result",
            (),
            {
                "returncode": 42,
                "stdout": (
                    "match_count\t1\n"
                    "classification\tCURRENT_STAGE\n"
                ),
                "stderr": "",
            },
        )()

        with mock.patch.object(
            MODULE,
            "run",
            return_value=result,
        ):
            with self.assertRaisesRegex(
                MODULE.AutoShipError,
                "belongs to the current release",
            ):
                MODULE.retire_superseded_stage(
                    current_release_sha="b" * 40,
                    staged_build_id="staged-build",
                    production=self.production(),
                )

    def test_ship_wires_exact_resume_before_superseded_retirement(self):
        import inspect

        source = inspect.getsource(MODULE.ship_all)

        self.assertIn(
            "resolve_stage_receipt",
            source,
        )
        self.assertIn(
            "retire_superseded_stage",
            source,
        )
        self.assertLess(
            source.index("resolve_stage_receipt"),
            source.index("retire_superseded_stage"),
        )
        self.assertIn(
            "post-retirement release preflight",
            source,
        )


if __name__ == "__main__":
    unittest.main()
