import importlib.util
import hashlib
import json
import os
import pathlib
import shlex
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_ship.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_ship", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    release = "b" * 40
    previous = "a" * 40
    data = {
        "local": {
            "head": release,
            "dirty_count": 0,
        },
        "github": {
            "main_sha": release,
        },
        "documentation": {
            "implementation_baseline": "c" * 40,
            "baseline_is_ancestor_of_local": True,
        },
        "production": {
            "reachable": True,
            "dirty_count": 0,
            "source_sha": previous,
            "service": "active",
            "active_build_id": "old-build",
            "staged_build_id": None,
            "internal_build_version": "old-version",
            "public_build_version": "old-version",
            "version_parity": True,
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        },
    }
    manifest = {
        "release_sha": release,
        "implementation_sha": "c" * 40,
        "documentation_baseline": "c" * 40,
        "previous_production_sha": previous,
        "risk_class": "INFRASTRUCTURE",
        "changed_files": ["scripts/example.py"],
        "migration_paths": [],
        "scope_sha256": "scope",
    }
    transport = {
        "origin": MODULE.EXPECTED_ORIGIN,
        "protocol": MODULE.EXPECTED_PROTOCOL,
        "executor": MODULE.EXPECTED_PROD_USER,
        "git_foreign_entries": "0",
        "git_unwritable_dirs": "0",
        "deploy_key_readable": "1",
        "deploy_key_owner": (
            f"{MODULE.EXPECTED_PROD_USER}:{MODULE.EXPECTED_PROD_USER}"
        ),
        "deploy_key_mode": "600",
        "deploy_key_fingerprint": MODULE.EXPECTED_DEPLOY_KEY_FINGERPRINT,
        "sshcmd": (
            f"ssh -F /dev/null -i {MODULE.EXPECTED_DEPLOY_KEY} "
            "-o IdentitiesOnly=yes -o BatchMode=yes "
            "-o StrictHostKeyChecking=yes "
            f"-o UserKnownHostsFile={MODULE.EXPECTED_KNOWN_HOSTS}"
        ),
        "remote_main": release,
    }
    return data, manifest, transport


def activation_sample():
    data, manifest, transport = sample()
    release = manifest["release_sha"]
    data["local"]["head"] = "d" * 40
    data["github"]["main_sha"] = "d" * 40
    data["production"]["source_sha"] = manifest["previous_production_sha"]
    data["production"]["staged_build_id"] = "candidate-build"
    receipt = {
        "release_sha": release,
        "previous_production_sha": manifest["previous_production_sha"],
        "active_build_id": "old-build",
        "staged_build_id": "candidate-build",
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": "e" * 64,
        "candidate_node_modules_sha256": "f" * 64,
        "candidate_node_modules_kb": 123456,
        "prisma_schema_engine_commit": "c" * 40,
        "prisma_schema_engine_sha256": "d" * 64,
        "prisma_schema_engine_seeded": True,
        "dependency_contract_unchanged": True,
        "dependency_lock_changed": False,
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
    }
    transport["remote_main"] = data["github"]["main_sha"]
    return data, receipt, transport


def render_activation_script():
    _, receipt, _ = activation_sample()
    receipt = {
        **receipt,
        "manifest_sha256": "1" * 64,
        "gate_sha256": "2" * 64,
        "remote_receipt_dir": (
            "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/stage-test"
        ),
    }
    return MODULE.remote_activation_script(
        receipt,
        stage_receipt_sha="3" * 64,
        stage_receipt_text="{}",
        dry_run=False,
        receipt_dir="/mnt/activation",
        rollback_dir="/mnt/rollback",
    )


def source_guard_shell():
    script = render_activation_script()
    start = script.index("release_path_is_reserved()")
    end = script.index("critical_get()", start)
    return script[start:end]


def source_proof_shell():
    script = render_activation_script()
    start = script.index("source_status()")
    end = script.index("release_path_is_reserved()", start)
    return script[start:end]


def git(repo, *args, check=True):
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=check,
        capture_output=True,
        text=False,
    )


def initialize_release_repo(repo, release_paths, *, ignored=""):
    git(repo, "init", "-q")
    git(repo, "config", "user.name", "Release Test")
    git(repo, "config", "user.email", "release@example.invalid")
    (repo / ".gitignore").write_text(ignored, encoding="utf-8")
    (repo / "base.txt").write_text("previous\n", encoding="utf-8")
    git(repo, "add", ".gitignore", "base.txt")
    git(repo, "commit", "-qm", "previous")
    previous = git(repo, "rev-parse", "HEAD").stdout.decode().strip()

    for relative in release_paths:
        target = repo / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"release: {relative!r}\n", encoding="utf-8")
        git(repo, "add", "-f", "--", f":(top,literal){relative}")
    git(repo, "commit", "-qm", "release")
    release = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
    git(repo, "checkout", "-q", previous)
    return previous, release


def write_release_only_list(repo, receipt, previous, release):
    receipt.mkdir()
    paths_file = receipt / "release-only-paths.nul.test"
    paths_file.write_bytes(
        git(
            repo,
            "diff",
            "--no-renames",
            "--name-only",
            "--diff-filter=A",
            "-z",
            previous,
            release,
        ).stdout
    )
    paths_file.chmod(0o600)
    digest = hashlib.sha256(paths_file.read_bytes()).hexdigest()
    return paths_file, digest


def run_source_guard(repo, paths_file, digest, previous, release, command):
    darwin_stat = """
if [ "$(uname -s)" = "Darwin" ]; then
  stat() {
    if [ "$1" = "-c" ] && [ "$2" = "%a" ]; then
      command stat -f '%Lp' "$3"
    else
      command stat "$@"
    fi
  }
fi
"""
    harness = "\n".join(
        (
            "set -uo pipefail",
            f"PREVIOUS={previous}",
            f"RELEASE={release}",
            f"RELEASE_ONLY_PATHS={str(paths_file)!r}",
            f"release_only_paths_sha={digest}",
            source_guard_shell(),
            darwin_stat,
            command,
        )
    )
    return subprocess.run(
        ["bash", "-c", harness],
        cwd=repo,
        capture_output=True,
        text=True,
    )


class ShipTests(unittest.TestCase):
    def test_production_migration_verifier_renders_nested_python(self):
        manifest = {
            "release_sha": "e" * 40,
            "risk_class": "DATABASE",
            "migration_paths": [
                "prisma/migrations/20260101000000_create_widget/migration.sql"
            ],
        }
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="migration_receipt\\t/mnt/receipt\\n",
            stderr="",
        )

        with mock.patch.object(MODULE, "run", return_value=completed) as runner:
            MODULE.verify_production_migration_receipt(manifest)

        command = runner.call_args.args[0][-1]
        shell_argv = shlex.split(command)
        self.assertEqual(shell_argv[:2], ["bash", "-lc"])
        script = shell_argv[2]

        self.assertIn('in {chr(34), chr(39)}:', script)
        self.assertIn('not in {"postgresql", "postgres"}:', script)
        self.assertIn('for key, value in {\n    "PGHOST":', script)
        self.assertIn(
            'print(f"export {key}={shlex.quote(value)}")',
            script,
        )

        marker = "<<'PY'\n"
        self.assertIn(marker, script)
        nested = script.split(marker, 1)[1].split("\nPY\n", 1)[0]
        compile(nested, "<migration-activation-db-verifier>", "exec")

        shell = subprocess.run(
            ["bash", "-n"],
            input=script,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(shell.returncode, 0, shell.stderr)

    def test_valid_preflight(self):
        data, manifest, transport = sample()
        self.assertEqual(
            MODULE.validation_errors(data, manifest, transport),
            [],
        )

    def test_previous_production_drift_blocks(self):
        data, manifest, transport = sample()
        data["production"]["source_sha"] = "d" * 40
        self.assertIn(
            "production source no longer equals manifest previous production",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_staged_build_blocks(self):
        data, manifest, transport = sample()
        data["production"]["staged_build_id"] = "candidate"
        self.assertIn(
            "a staged .next-release build already exists",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_wolo_missing_blocks(self):
        data, manifest, transport = sample()
        data["production"]["wolo_8093_count"] = 0
        self.assertIn(
            "protected WOLO listener 8093 count must be exactly 1",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_duplicate_wolo_listener_blocks(self):
        data, manifest, transport = sample()
        data["production"]["wolo_8092_count"] = 2
        self.assertIn(
            "protected WOLO listener 8092 count must be exactly 1",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_dependency_lock_change_is_supported_by_fresh_candidate_lane(self):
        data, manifest, transport = sample()
        manifest["changed_files"].append("yarn.lock")
        errors = MODULE.validation_errors(data, manifest, transport)
        self.assertFalse(
            any(
                "yarn.lock" in error
                or "dependency lock" in error
                or "node_modules" in error
                for error in errors
            )
        )

    def test_migrations_require_database_or_financial_gate(self):
        data, manifest, transport = sample()
        manifest["migration_paths"] = ["prisma/migrations/x/migration.sql"]
        errors = MODULE.validation_errors(data, manifest, transport)
        self.assertTrue(any("DATABASE/FINANCIAL" in e for e in errors))

        for risk in ("FINANCIAL", "DATABASE"):
            manifest["risk_class"] = risk
            errors = MODULE.validation_errors(data, manifest, transport)
            self.assertFalse(any("migration" in e.lower() for e in errors))

    def test_transport_origin_blocks(self):
        data, manifest, transport = sample()
        transport["origin"] = "git@example.invalid:wrong/repo.git"
        self.assertIn(
            "production Git origin does not match canonical origin",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_foreign_git_ownership_blocks(self):
        data, manifest, transport = sample()
        transport["git_foreign_entries"] = "1"
        self.assertIn(
            "production .git contains entries not owned by the deploy user",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_unwritable_git_directory_blocks(self):
        data, manifest, transport = sample()
        transport["git_unwritable_dirs"] = "1"
        self.assertIn(
            "production .git contains directories not writable by the deploy user",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_unreadable_or_wrong_deploy_key_blocks(self):
        data, manifest, transport = sample()
        transport["deploy_key_readable"] = "0"
        transport["deploy_key_fingerprint"] = "SHA256:wrong"
        errors = MODULE.validation_errors(data, manifest, transport)
        self.assertIn(
            "production dedicated deploy key is not readable by the deploy user",
            errors,
        )
        self.assertIn(
            "production dedicated deploy key fingerprint does not match",
            errors,
        )

    def test_ssh_config_fallback_blocks(self):
        data, manifest, transport = sample()
        transport["sshcmd"] = transport["sshcmd"].replace("-F /dev/null ", "")
        self.assertIn(
            "production core.sshCommand does not disable SSH config fallback",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_plan_never_allows_wolo_mutation(self):
        data, manifest, _ = sample()
        gate_path = MODULE.ROOT / ".aoe2war-release" / "gates" / "gate.json"
        plan = MODULE.build_plan(
            data,
            manifest,
            "manifest-sha",
            gate_path,
            "gate-sha",
        )
        self.assertFalse(
            plan["protected_services"]["wolo_8092_mutation_allowed"]
        )
        self.assertFalse(
            plan["protected_services"]["wolo_8093_mutation_allowed"]
        )


    def test_activation_valid_preflight_allows_tooling_head_after_candidate(self):
        data, receipt, transport = activation_sample()
        self.assertEqual(MODULE.activation_validation_errors(data, receipt, transport), [])

    def test_stage_receipt_requires_prisma_engine_provenance(self):
        _, manifest, _ = sample()
        release = manifest["release_sha"]
        artifact = "e" * 64
        manifest_path = MODULE.ROOT / ".aoe2war-release/manifests/test.json"
        gate_path = MODULE.ROOT / ".aoe2war-release/gates/test.json"
        receipt = {
            "schema": 1,
            "kind": "aoe2war-stage-result",
            "status": "STAGED",
            "release_sha": release,
            "previous_production_sha": manifest["previous_production_sha"],
            "source_sha": manifest["previous_production_sha"],
            "risk_class": manifest["risk_class"],
            "active_build_id": "old-build",
            "staged_build_id": "candidate-build",
            "live_build_version": "old-version",
            "candidate_build_version": "candidate-version",
            "artifact_sha256": artifact,
            "candidate_node_modules_sha256": "f" * 64,
            "candidate_node_modules_kb": 123456,
            "prisma_schema_engine_commit": "c" * 40,
            "prisma_schema_engine_sha256": "d" * 64,
            "prisma_schema_engine_seeded": True,
            "dependency_contract_unchanged": True,
            "dependency_lock_changed": False,
            "manifest_path": str(manifest_path.relative_to(MODULE.ROOT)),
            "manifest_sha256": "1" * 64,
            "gate_path": str(gate_path.relative_to(MODULE.ROOT)),
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
            "live_runtime_mutated": False,
            "wolo_mutated": False,
            "isolated_worktree": True,
            "build_process_sandboxed": True,
            "build_network_private": True,
            "build_secret_paths_inaccessible": True,
            "dependency_fetch_sandboxed": True,
            "dependency_fetch_scripts_disabled": True,
            "dependency_build_offline": True,
            "cache_free_artifact": True,
            "artifact_path_relocated": True,
            "live_source_mutated": False,
            "live_public_mutated": False,
            "live_node_modules_mutated": False,
            "live_build_version_mutated": False,
        }

        with tempfile.TemporaryDirectory() as tmp:
            receipt_root = pathlib.Path(tmp)
            receipt_path = receipt_root / f"{release}-{artifact[:12]}.json"
            with (
                mock.patch.object(MODULE, "STAGE_RECEIPT_DIR", receipt_root),
                mock.patch.object(
                    MODULE,
                    "load_manifest",
                    return_value=(manifest_path, manifest, "1" * 64),
                ),
                mock.patch.object(
                    MODULE,
                    "gate_integrity",
                    return_value=(gate_path, "2" * 64),
                ),
            ):
                for missing in (
                    "prisma_schema_engine_commit",
                    "prisma_schema_engine_sha256",
                    "prisma_schema_engine_seeded",
                ):
                    invalid = {key: value for key, value in receipt.items() if key != missing}
                    receipt_path.write_text(json.dumps(invalid), encoding="utf-8")
                    with self.assertRaises(MODULE.ShipError):
                        MODULE.load_stage_receipt(str(receipt_path))

    def test_activation_source_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["source_sha"] = "f" * 40
        self.assertIn(
            "production source does not equal the stage receipt previous SHA",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_staged_build_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["staged_build_id"] = "wrong-candidate"
        self.assertIn(
            "staged BUILD_ID drifted from stage receipt",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_tooling_remote_main_must_match_current_github(self):
        data, receipt, transport = activation_sample()
        transport["remote_main"] = "0" * 40
        self.assertIn(
            "production origin main does not equal current GitHub main",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_wolo_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["wolo_8092_count"] = 0
        self.assertIn(
            "protected WOLO listener 8092 drifted from stage receipt",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_prewarms_statistics_before_health_soak(self):
        script = render_activation_script()

        prewarm = script.index('STATISTICS_PREWARM="FAIL"')
        soak = script.index(
            "# BOUNDED POST-ACTIVATION HEALTH SOAK",
            prewarm,
        )

        self.assertLess(prewarm, soak)

        prewarm_block = script[prewarm:soak]

        self.assertIn(
            "http://127.0.0.1:3030/api/statistics",
            prewarm_block,
        )
        self.assertIn(
            "--connect-timeout 3",
            prewarm_block,
        )
        self.assertIn(
            "--max-time 20",
            prewarm_block,
        )
        self.assertIn(
            "-w '%{time_total}'",
            prewarm_block,
        )

        self.assertIn(
            "statistics_prewarm=$STATISTICS_PREWARM",
            script,
        )
        self.assertIn(
            "statistics_warm_seconds=$STATISTICS_WARM_SECONDS",
            script,
        )

    def test_activation_prewarms_common_leaderboards_before_health_soak(self):
        script = render_activation_script()

        prewarm = script.index('LEADERBOARD_PREWARM="PASS"')
        soak = script.index(
            "# BOUNDED POST-ACTIVATION HEALTH SOAK",
            prewarm,
        )

        self.assertLess(prewarm, soak)

        block = script[prewarm:soak]

        for lane, scope in (
            ("rm", "all"),
            ("rm", "claimed"),
            ("dm", "all"),
            ("dm", "claimed"),
        ):
            self.assertIn(
                f'"{lane} {scope}"',
                block,
            )

        self.assertIn(
            "/api/lobby/leaderboard?lane=$lane&scope=$scope&offset=0&limit=50",
            block,
        )
        self.assertIn(
            "-w '%{time_total}'",
            block,
        )

        self.assertIn(
            "leaderboard_prewarm=$LEADERBOARD_PREWARM",
            script,
        )
        self.assertIn(
            "leaderboard_warm_seconds=$LEADERBOARD_WARM_SECONDS",
            script,
        )

    def test_activation_uses_root_name_independent_content_hash(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "previous_production_sha": "a" * 40,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        self.assertIn("content_hash()", script)
        self.assertIn(
            'candidate_content_sha="$(content_hash .next-release)"',
            script,
        )
        self.assertIn(
            'after_content_sha="$(content_hash .next)"',
            script,
        )
        self.assertIn(
            'test "$after_content_sha" = "$candidate_content_sha"',
            script,
        )
        self.assertIn(
            'artifact_sha256=$ARTIFACT',
            script,
        )
        self.assertIn('-C "$1" -cf - .', script)
        self.assertIn("--exclude='./cache' --exclude='./cache/*'", script)
        self.assertNotIn("active_artifact_hash()", script)

    def test_activation_advances_source_version_and_runtime_only_while_stopped(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        armed = script.index("trap rollback_activation EXIT")
        stopped = script.index(
            'sudo -n /usr/bin/systemctl stop "$SERVICE"\n', armed
        )
        runtime_swap = script.index('mv .next-release .next', stopped)
        source_advance = script.index('git reset --hard "$RELEASE"', runtime_swap)
        version_advance = script.index(
            'printf \'%s\\n\' "$CANDIDATE_VERSION" > .aoe2war-build-version',
            source_advance,
        )
        started = script.index(
            'sudo -n /usr/bin/systemctl start "$SERVICE"\n', version_advance
        )
        self.assertLess(armed, stopped)
        self.assertLess(stopped, runtime_swap)
        self.assertLess(runtime_swap, source_advance)
        self.assertLess(source_advance, version_advance)
        self.assertLess(version_advance, started)
        self.assertNotIn('systemctl restart "$SERVICE"', script)


    def test_activation_binds_staged_dependency_identity(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }

        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )

        self.assertIn(
            'candidate_dependency_artifact="$(artifact_hash .node_modules-release)"',
            script,
        )
        self.assertIn(
            'test "$candidate_dependency_artifact" = "$DEPENDENCY_ARTIFACT"',
            script,
        )
        self.assertIn(
            'dependency_fetch_scripts_disabled=1',
            script,
        )
        self.assertIn(
            'dependency_build_offline=1',
            script,
        )
        self.assertIn(
            'grep -Fx "prisma_schema_engine_commit=$PRISMA_ENGINE_COMMIT"',
            script,
        )
        self.assertIn(
            'grep -Fx "prisma_schema_engine_sha256=$PRISMA_ENGINE_SHA"',
            script,
        )
        self.assertIn(
            'grep -Fx "prisma_schema_engine_seeded=1"',
            script,
        )
        self.assertIn(
            'test "$(sha256sum "$candidate_prisma_engine" | '
            'awk \'{print $1}\')" = "$PRISMA_ENGINE_SHA"',
            script,
        )
        self.assertIn(
            'test "$("$candidate_prisma_engine" --version)" = '
            '"schema-engine-cli $PRISMA_ENGINE_COMMIT"',
            script,
        )
        self.assertIn(
            'candidate_dependency_identity="$(stat -Lc \'%d:%i\' .node_modules-release)"',
            script,
        )
        self.assertIn(
            'test "$(stat -Lc \'%d:%i\' node_modules)" = "$candidate_dependency_identity"',
            script,
        )

    def test_activation_atomically_swaps_and_rolls_back_dependency_tree(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )

        armed = script.index("trap rollback_activation EXIT")
        stopped = script.index(
            'sudo -n /usr/bin/systemctl stop "$SERVICE"\n',
            armed,
        )
        old_runtime = script.index('mv .next "$FAST_OLD"', stopped)
        old_modules = script.index(
            'mv node_modules "$FAST_OLD_MODULES"',
            old_runtime,
        )
        new_modules = script.index(
            'mv .node_modules-release node_modules',
            old_modules,
        )
        new_runtime = script.index(
            'mv .next-release .next',
            new_modules,
        )
        started = script.index(
            'sudo -n /usr/bin/systemctl start "$SERVICE"\n',
            new_runtime,
        )

        self.assertLess(stopped, old_runtime)
        self.assertLess(old_runtime, old_modules)
        self.assertLess(old_modules, new_modules)
        self.assertLess(new_modules, new_runtime)
        self.assertLess(new_runtime, started)

        self.assertIn(
            'mv node_modules .node_modules-release',
            script,
        )
        self.assertIn(
            'mv "$FAST_OLD_MODULES" node_modules',
            script,
        )

    def test_activation_failure_restores_full_bundle_and_preserves_stage(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        self.assertIn('git reset --hard "$PREVIOUS"', script)
        self.assertIn(
            'printf \'%s\\n\' "$LIVE_VERSION" > .aoe2war-build-version',
            script,
        )
        self.assertIn('mv .next .next-release', script)
        self.assertIn('rb_staged_artifact="$(artifact_hash .next-release', script)
        self.assertIn('&& [ "$rb_head" = "$PREVIOUS" ]', script)
        self.assertIn(
            '&& [ "$rb_source_state" = "$before_source_state" ]',
            script,
        )
        self.assertIn('&& [ "$rb_build_version_file" = "$LIVE_VERSION" ]', script)

    def test_activation_partial_source_reset_is_restored_without_head_gate(self):
        script = render_activation_script()

        rollback_start = script.index('if [ "$MUTATED" = "1" ]; then')
        rollback_end = script.index(
            'elif [ "$SERVICE_STOPPED" = "1" ]; then'
        )
        rollback = script[rollback_start:rollback_end]
        self.assertIn('git reset --hard "$PREVIOUS"', rollback)
        self.assertNotIn(
            '[ "$rollback_pre_head" = "$RELEASE" ]',
            rollback,
        )
        self.assertNotIn(
            '[ "$rollback_pre_dirty" = "0" ]',
            rollback,
        )
        self.assertIn('source_reset_exit_code=$rollback_source_reset_rc', rollback)
        self.assertIn(
            'release_only_cleanup_exit_code=$rollback_release_only_cleanup_rc',
            rollback,
        )

        marker = script.index("SOURCE_MUTATION_STARTED=1")
        forward_reset = script.index('git reset --hard "$RELEASE"', marker)
        self.assertLess(marker, forward_reset)
        self.assertIn(
            'git diff --no-renames --name-only --diff-filter=A -z '
            '"$PREVIOUS" "$RELEASE"',
            script,
        )
        self.assertIn(
            'RELEASE_ONLY_PATHS="$(mktemp '
            '"$ACT_RECEIPT/release-only-paths.nul.XXXXXX")"',
            script,
        )
        self.assertIn('done < "$RELEASE_ONLY_PATHS"', script)
        self.assertIn(
            'release_only_paths_sha256=$release_only_paths_sha',
            script,
        )
        self.assertIn(
            'git clean -f -x -- "$release_only_literal"',
            script,
        )
        self.assertNotIn("git clean -fd", script)
        self.assertIn(':(top,literal)$1', script)
        self.assertIn(
            '&& [ "$rollback_source_reset_rc" = "0" ]',
            rollback,
        )
        self.assertIn(
            '&& [ "$rollback_release_only_cleanup_rc" = "0" ]',
            rollback,
        )

    def test_activation_preactivation_drift_is_never_reset(self):
        script = render_activation_script()

        final_clean_proof = script.index(
            'test "$final_pre_mutation_source_state" = "$before_source_state"'
        )
        mutation_marker = script.index("MUTATED=1", final_clean_proof)
        self.assertLess(final_clean_proof, mutation_marker)

        drift_start = script.index('elif [ "$SERVICE_STOPPED" = "1" ]; then')
        drift_end = script.index("fi\n  return", drift_start)
        drift_branch = script[drift_start:drift_end]
        self.assertIn('systemctl start "$SERVICE"', drift_branch)
        self.assertNotIn("git reset", drift_branch)
        self.assertNotIn("git clean", drift_branch)

    def test_release_only_cleanup_is_literal_nul_safe_and_stage_safe(self):
        release_paths = (
            "wild*card.txt",
            "question?.txt",
            "bracket[abc].txt",
            ":(glob)magic.txt",
            "-leading.txt",
            "line\nbreak.txt",
            "tab\tname.txt",
            "ignored/target*.txt",
        )
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            previous, release = initialize_release_repo(
                repo,
                release_paths,
                ignored=(
                    "ignored/\n.next/\n.next-release/\n"
                    ".node_modules-release/\n"
                ),
            )
            receipt = repo / "receipt"
            paths_file, digest = write_release_only_list(
                repo, receipt, previous, release
            )

            ignored_sibling = repo / "ignored/sibling.keep"
            ignored_sibling.parent.mkdir(parents=True, exist_ok=True)
            ignored_sibling.write_text("preserve\n", encoding="utf-8")
            staged_artifact = repo / ".next-release/artifact.bin"
            staged_artifact.parent.mkdir()
            staged_artifact.write_bytes(b"candidate-artifact")
            staged_digest = hashlib.sha256(staged_artifact.read_bytes()).hexdigest()

            validation = run_source_guard(
                repo,
                paths_file,
                digest,
                previous,
                release,
                "validate_release_only_paths",
            )
            self.assertEqual(validation.returncode, 0, validation.stderr)

            listed_paths = tuple(
                item.decode("utf-8")
                for item in paths_file.read_bytes().split(b"\0")
                if item
            )
            self.assertEqual(set(listed_paths), set(release_paths))
            for relative in listed_paths:
                target = repo / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("partial reset\n", encoding="utf-8")

            decoys = (
                repo / "wildZZcard.txt",
                repo / "questionX.txt",
                repo / "bracketa.txt",
                repo / ":(glob)other.txt",
            )
            for decoy in decoys:
                decoy.write_text("preserve\n", encoding="utf-8")

            cleanup = run_source_guard(
                repo,
                paths_file,
                digest,
                previous,
                release,
                "cleanup_release_only_paths",
            )
            self.assertEqual(cleanup.returncode, 0, cleanup.stderr)
            for relative in listed_paths:
                target = repo / relative
                self.assertFalse(target.exists() or target.is_symlink())
            self.assertEqual(ignored_sibling.read_text(), "preserve\n")
            self.assertTrue(all(decoy.exists() for decoy in decoys))
            self.assertEqual(
                hashlib.sha256(staged_artifact.read_bytes()).hexdigest(),
                staged_digest,
            )

    def test_release_only_preflight_rejects_ignored_exact_collision(self):
        for collision_kind in ("file", "directory", "broken_symlink"):
            with self.subTest(kind=collision_kind), tempfile.TemporaryDirectory() as tmp:
                repo = pathlib.Path(tmp)
                target = "ignored/collision?.txt"
                previous, release = initialize_release_repo(
                    repo,
                    (target,),
                    ignored="ignored/\n",
                )
                receipt = repo / "receipt"
                paths_file, digest = write_release_only_list(
                    repo, receipt, previous, release
                )
                collision = repo / target
                collision.parent.mkdir(parents=True, exist_ok=True)
                if collision_kind == "file":
                    collision.write_text(
                        "preexisting ignored data\n", encoding="utf-8"
                    )
                elif collision_kind == "directory":
                    collision.mkdir()
                else:
                    os.symlink("missing-target", collision)

                validation = run_source_guard(
                    repo,
                    paths_file,
                    digest,
                    previous,
                    release,
                    "validate_release_only_paths",
                )
                self.assertNotEqual(validation.returncode, 0)
                self.assertTrue(collision.exists() or collision.is_symlink())
                if collision_kind == "file":
                    self.assertEqual(
                        collision.read_text(encoding="utf-8"),
                        "preexisting ignored data\n",
                    )

        script = render_activation_script()
        final_validation = script.index(
            "validate_release_only_paths",
            script.index("final_release_only_paths_sha="),
        )
        self.assertLess(final_validation, script.index("MUTATED=1"))

    def test_release_only_preflight_rejects_ancestor_obstructions(self):
        for obstruction in ("symlink", "file"):
            with self.subTest(obstruction=obstruction), tempfile.TemporaryDirectory() as tmp:
                repo = pathlib.Path(tmp)
                target = "parent/child[1].txt"
                previous, release = initialize_release_repo(repo, (target,))
                receipt = repo / "receipt"
                paths_file, digest = write_release_only_list(
                    repo, receipt, previous, release
                )
                parent = repo / "parent"
                if obstruction == "symlink":
                    external = repo / "external"
                    external.mkdir()
                    (external / "sentinel").write_text("safe\n", encoding="utf-8")
                    os.symlink(external, parent)
                else:
                    parent.write_text("not a directory\n", encoding="utf-8")

                validation = run_source_guard(
                    repo,
                    paths_file,
                    digest,
                    previous,
                    release,
                    "validate_release_only_paths",
                )
                self.assertNotEqual(validation.returncode, 0)
                if obstruction == "symlink":
                    self.assertEqual(
                        (external / "sentinel").read_text(encoding="utf-8"),
                        "safe\n",
                    )

    def test_release_only_preflight_rejects_reserved_runtime_paths(self):
        reserved_paths = (
            ".next/evil",
            "node_modules/evil",
            ".next-release/evil",
            ".node_modules-release/evil",
            ".next-rollback-test/evil",
            ".node_modules-rollback-test/evil",
            ".aoe2war-build-version",
            ".aoe2war-release/evil",
        )
        for target in reserved_paths:
            with self.subTest(target=target), tempfile.TemporaryDirectory() as tmp:
                repo = pathlib.Path(tmp)
                previous, release = initialize_release_repo(
                    repo,
                    (target,),
                    ignored=(
                        ".next*\nnode_modules/\n.node_modules-*\n"
                        ".aoe2war-build-version\n.aoe2war-release/\n"
                    ),
                )
                receipt = repo / "receipt"
                paths_file, digest = write_release_only_list(
                    repo, receipt, previous, release
                )
                validation = run_source_guard(
                    repo,
                    paths_file,
                    digest,
                    previous,
                    release,
                    "validate_release_only_paths",
                )
                self.assertNotEqual(validation.returncode, 0)

    def test_release_only_manifest_decomposes_renames(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            git(repo, "init", "-q")
            git(repo, "config", "user.name", "Release Test")
            git(repo, "config", "user.email", "release@example.invalid")
            old_path = "old-name.txt"
            new_path = "renamed*target?.txt"
            (repo / old_path).write_text("same content\n", encoding="utf-8")
            git(repo, "add", old_path)
            git(repo, "commit", "-qm", "previous")
            previous = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            os.rename(repo / old_path, repo / new_path)
            git(repo, "add", "-A")
            git(repo, "commit", "-qm", "release")
            release = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            git(repo, "checkout", "-q", previous)

            paths_file, _ = write_release_only_list(
                repo, repo / "receipt", previous, release
            )
            listed = tuple(
                item.decode("utf-8")
                for item in paths_file.read_bytes().split(b"\0")
                if item
            )
            self.assertEqual(listed, (new_path,))

    def test_release_only_preflight_rejects_gitlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            git(repo, "init", "-q")
            git(repo, "config", "user.name", "Release Test")
            git(repo, "config", "user.email", "release@example.invalid")
            (repo / "base.txt").write_text("previous\n", encoding="utf-8")
            git(repo, "add", "base.txt")
            git(repo, "commit", "-qm", "previous")
            previous = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            git(
                repo,
                "update-index",
                "--add",
                "--cacheinfo",
                f"160000,{previous},gitlink-target",
            )
            git(repo, "commit", "-qm", "release gitlink")
            release = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            git(repo, "checkout", "-q", previous)
            paths_file, digest = write_release_only_list(
                repo, repo / "receipt", previous, release
            )

            validation = run_source_guard(
                repo,
                paths_file,
                digest,
                previous,
                release,
                "validate_release_only_paths",
            )
            self.assertNotEqual(validation.returncode, 0)

    def test_release_only_cleanup_fails_closed_on_corrupt_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            target = "new-file.txt"
            previous, release = initialize_release_repo(repo, (target,))
            receipt = repo / "receipt"
            paths_file, digest = write_release_only_list(
                repo, receipt, previous, release
            )
            materialized = repo / target
            materialized.write_text("partial reset\n", encoding="utf-8")
            paths_file.write_bytes(paths_file.read_bytes() + b"tampered\0")

            cleanup = run_source_guard(
                repo,
                paths_file,
                digest,
                previous,
                release,
                "cleanup_release_only_paths",
            )
            self.assertNotEqual(cleanup.returncode, 0)
            self.assertTrue(materialized.exists())

            script = render_activation_script()
            rollback_start = script.index('rollback_status="ROLLBACK_FAILED"')
            rollback_certify = script.index(
                'rollback_status="ROLLED_BACK"', rollback_start
            )
            reset_rc_proof = script.index(
                '[ "$rollback_source_reset_rc" = "0" ]', rollback_start
            )
            cleanup_rc_proof = script.index(
                '[ "$rollback_release_only_cleanup_rc" = "0" ]',
                rollback_start,
            )
            self.assertLess(reset_rc_proof, rollback_certify)
            self.assertLess(cleanup_rc_proof, rollback_certify)

    def test_release_path_absence_fails_closed_on_git_index_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            target = "new-file.txt"
            previous, release = initialize_release_repo(repo, (target,))
            paths_file, digest = write_release_only_list(
                repo, repo / "receipt", previous, release
            )
            (repo / ".git/index").write_bytes(b"corrupt index")

            absence = run_source_guard(
                repo,
                paths_file,
                digest,
                previous,
                release,
                "release_path_absent new-file.txt",
            )
            self.assertNotEqual(absence.returncode, 0)

    def test_empty_release_only_list_cannot_mask_git_probe_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp)
            git(repo, "init", "-q")
            git(repo, "config", "user.name", "Release Test")
            git(repo, "config", "user.email", "release@example.invalid")
            tracked = repo / "tracked.txt"
            tracked.write_text("previous\n", encoding="utf-8")
            git(repo, "add", "tracked.txt")
            git(repo, "commit", "-qm", "previous")
            previous = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            tracked.write_text("release\n", encoding="utf-8")
            git(repo, "commit", "-qam", "release")
            release = git(repo, "rev-parse", "HEAD").stdout.decode().strip()
            git(repo, "checkout", "-q", previous)
            paths_file, _ = write_release_only_list(
                repo, repo / "receipt", previous, release
            )
            self.assertEqual(paths_file.read_bytes(), b"")
            (repo / ".git/index").write_bytes(b"corrupt index")

            harness = "\n".join(
                (
                    "set -uo pipefail",
                    source_proof_shell(),
                    "set +e",
                    'rb_dirty="$(source_status 2>/dev/null | wc -l | tr -d \' \')"',
                    "rb_dirty_rc=$?",
                    'rb_source_state="$(source_state_hash 2>/dev/null)"',
                    "rb_source_state_rc=$?",
                    'printf \'dirty_rc=%s\\nstate_rc=%s\\n\' '
                    '"$rb_dirty_rc" "$rb_source_state_rc"',
                )
            )
            proof = subprocess.run(
                ["bash", "-c", harness],
                cwd=repo,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proof.returncode, 0, proof.stderr)
            fields = dict(
                line.split("=", 1)
                for line in proof.stdout.splitlines()
                if "=" in line
            )
            self.assertNotEqual(fields["dirty_rc"], "0")
            self.assertNotEqual(fields["state_rc"], "0")

            script = render_activation_script()
            rollback_start = script.index('rollback_status="ROLLBACK_FAILED"')
            rollback_certify = script.index(
                'rollback_status="ROLLED_BACK"', rollback_start
            )
            for required_probe in (
                '[ "$rb_dirty_rc" = "0" ]',
                '[ "$rb_source_state_rc" = "0" ]',
            ):
                self.assertLess(
                    script.index(required_probe, rollback_start),
                    rollback_certify,
                )

    def test_durable_rollback_copy_is_cache_free(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        self.assertIn(
            'rsync -a --exclude \'/cache/\' .next/ "$ROLLBACK/next/"',
            script,
        )
        self.assertIn('test ! -e "$ROLLBACK/next/cache"', script)
        self.assertNotIn('cp -a .next "$ROLLBACK/next"', script)

    def test_activation_result_requires_exact_candidate_identity(self):
        _, receipt, _ = activation_sample()
        result = {
            "status": "CERTIFIED",
            "release_sha": receipt["release_sha"],
            "source_sha": receipt["release_sha"],
            "previous_build_id": receipt["active_build_id"],
            "active_build_id": receipt["staged_build_id"],
            "candidate_build_version": receipt["candidate_build_version"],
            "artifact_sha256": receipt["artifact_sha256"],
            "candidate_node_modules_sha256": (
                receipt["candidate_node_modules_sha256"]
            ),
            "previous_node_modules_sha256": "9" * 64,
            "durable_cache_free": "1",
            "activation_bundle_while_stopped": "1",
            "wolo8092": "1",
            "wolo8093": "1",
            "soak_seconds": str(MODULE.ACTIVATION_SOAK_SECONDS),
            "soak_samples": "6",
            "retention_status": "PASS",
            "retention_keep": str(MODULE.FAST_ROLLBACK_KEEP),
            "retention_pruned": "1",
            "retention_reclaimed_kb": "800000",
            "retention_unmatched_kept": "4",
            "receipt_dir": "/mnt/receipt",
            "fast_rollback": (
                ".next-rollback-activate-20260811T120000Z"
            ),
            "fast_rollback_modules": (
                ".node_modules-rollback-activate-20260811T120000Z"
            ),
            "durable_rollback": "/mnt/rollback",
        }
        self.assertEqual(MODULE.validate_activation_result(result, receipt), [])
        result["artifact_sha256"] = "0" * 64
        self.assertIn(
            "active artifact SHA-256 does not equal staged artifact",
            MODULE.validate_activation_result(result, receipt),
        )


    def test_activation_result_requires_paired_dependency_provenance(self):
        _, receipt, _ = activation_sample()

        result = {
            "status": "CERTIFIED",
            "release_sha": receipt["release_sha"],
            "source_sha": receipt["release_sha"],
            "previous_build_id": receipt["active_build_id"],
            "active_build_id": receipt["staged_build_id"],
            "candidate_build_version": receipt["candidate_build_version"],
            "artifact_sha256": receipt["artifact_sha256"],
            "durable_cache_free": "1",
            "activation_bundle_while_stopped": "1",
            "wolo8092": "1",
            "wolo8093": "1",
            "soak_seconds": str(MODULE.ACTIVATION_SOAK_SECONDS),
            "soak_samples": "6",
            "retention_status": "PASS",
            "retention_keep": str(MODULE.FAST_ROLLBACK_KEEP),
            "receipt_dir": "/mnt/receipt",
            "durable_rollback": "/mnt/rollback",
            "fast_rollback": ".next-rollback-activate-20260811T120000Z",
        }

        errors = MODULE.validate_activation_result(result, receipt)

        self.assertTrue(
            any("candidate node_modules" in error for error in errors)
        )
        self.assertTrue(
            any("previous node_modules" in error for error in errors)
        )
        self.assertTrue(
            any("paired fast rollback" in error for error in errors)
        )

        result["candidate_node_modules_sha256"] = (
            receipt["candidate_node_modules_sha256"]
        )
        result["previous_node_modules_sha256"] = "9" * 64
        result["fast_rollback_modules"] = (
            ".node_modules-rollback-activate-20260811T120000Z"
        )

        errors = MODULE.validate_activation_result(result, receipt)

        self.assertFalse(
            any("candidate node_modules" in error for error in errors)
        )
        self.assertFalse(
            any("previous node_modules" in error for error in errors)
        )
        self.assertFalse(
            any("paired fast rollback" in error for error in errors)
        )

    def test_activation_disk_preflight_precedes_durable_rollback_copy(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "previous_production_sha": "a" * 40,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }

        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir=(
                "/mnt/HC_Volume_105319120/aoe2war/rollbacks/"
                "activate-test"
            ),
        )

        self.assertIn(
            'live_dependency_kb="$(du -sk node_modules',
            script,
        )
        self.assertIn(
            'live_next_kb="$(du -sk .next',
            script,
        )
        self.assertIn(
            'evidence_available_kb="$(df -Pk "$rollback_parent"',
            script,
        )
        self.assertIn(
            'evidence_required_kb=$((live_dependency_kb + live_next_kb + 1048576))',
            script,
        )
        self.assertIn(
            'test "$evidence_available_kb" -ge "$evidence_required_kb"',
            script,
        )

        preflight = script.index("evidence_available_kb=")
        durable_next = script.index('mkdir "$ROLLBACK/next"')
        durable_modules = script.index('mkdir "$ROLLBACK/node_modules"')

        self.assertLess(preflight, durable_next)
        self.assertLess(preflight, durable_modules)

    def test_activation_script_soaks_before_certification_commit(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "previous_production_sha": "a" * 40,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        self.assertIn("BOUNDED POST-ACTIVATION HEALTH SOAK", script)
        self.assertIn('test "$soak_build" = "$STAGED_BUILD"', script)
        self.assertIn('test "$soak_wolo8092" = "$before_wolo8092"', script)
        self.assertIn('critical_get "$PUBLIC/api/deployment-version"', script)

        # Soak source-cleanliness must use the same controlled runtime-bundle
        # exclusions as every other activation cleanliness check.
        self.assertIn(
            'soak_dirty="$(source_status | wc -l | tr -d \' \')"',
            script,
        )
        self.assertNotIn(
            'soak_dirty="$(git status --porcelain --untracked-files=all',
            script,
        )

        self.assertLess(script.index("SOAK_SAMPLES=0"), script.index("COMMITTED=1"))

    def test_activation_script_retention_is_verified_and_unmatched_safe(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "previous_production_sha": "a" * 40,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }
        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )
        self.assertIn("VERIFIED FAST-ROLLBACK RETENTION", script)
        self.assertIn("UNMATCHED_KEEP", script)
        self.assertIn("DURABLE_ROLLBACK", script)
        self.assertIn("DURABLE_RESCUE", script)
        self.assertIn(".next-rollback-activate-*|.next-rollback-manual-*", script)
        self.assertGreater(
            script.index("VERIFIED FAST-ROLLBACK RETENTION"),
            script.index("COMMITTED=1"),
        )

    def test_activation_retention_prunes_only_complete_runtime_pairs(self):
        _, receipt, _ = activation_sample()
        receipt = {
            **receipt,
            "previous_production_sha": "a" * 40,
            "manifest_sha256": "1" * 64,
            "gate_sha256": "2" * 64,
            "remote_receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/"
                "stage-test"
            ),
        }

        script = MODULE.remote_activation_script(
            receipt,
            stage_receipt_sha="3" * 64,
            stage_receipt_text="{}",
            dry_run=False,
            receipt_dir="/mnt/activation",
            rollback_dir="/mnt/rollback",
        )

        # Every fast .next candidate must derive and require its paired
        # dependency directory before it can become prune-eligible.
        self.assertIn(
            'modules="${d/.next-/.node_modules-}"',
            script,
        )
        self.assertIn(
            '[ -d "$modules" ] ||',
            script,
        )

        # Deletion must first move both halves out of the live rollback
        # namespace. If the second move fails, the first half is restored.
        self.assertIn(
            'mv "$path" "$prune_next_tmp"',
            script,
        )
        self.assertIn(
            'mv "$modules" "$prune_modules_tmp"',
            script,
        )
        self.assertIn(
            'mv "$prune_next_tmp" "$path"',
            script,
        )

        # Only after both moves succeed may both temporary halves be removed.
        self.assertIn(
            'rm -rf -- "$prune_next_tmp" "$prune_modules_tmp"',
            script,
        )

    def test_activation_result_rejects_missing_health_soak(self):
        _, receipt, _ = activation_sample()
        result = {
            "status": "CERTIFIED",
            "release_sha": receipt["release_sha"],
            "source_sha": receipt["release_sha"],
            "previous_build_id": receipt["active_build_id"],
            "active_build_id": receipt["staged_build_id"],
            "candidate_build_version": receipt["candidate_build_version"],
            "artifact_sha256": receipt["artifact_sha256"],
            "durable_cache_free": "1",
            "activation_bundle_while_stopped": "1",
            "wolo8092": "1",
            "wolo8093": "1",
            "retention_status": "PASS",
            "retention_keep": str(MODULE.FAST_ROLLBACK_KEEP),
            "receipt_dir": "/mnt/receipt",
            "durable_rollback": "/mnt/rollback",
        }
        errors = MODULE.validate_activation_result(result, receipt)
        self.assertTrue(
            any("health-soak" in error or "health soak" in error for error in errors)
        )


    def test_activation_receipt_is_valid_json_with_real_newline(self):
        payload = {
            "release_sha": "b" * 40,
            "artifact_sha256": "e" * 64,
        }
        original = MODULE.ACTIVATION_RECEIPT_DIR
        with tempfile.TemporaryDirectory() as tmp:
            MODULE.ACTIVATION_RECEIPT_DIR = pathlib.Path(tmp)
            try:
                path = MODULE.write_activation_receipt(payload)
                raw = path.read_bytes()
            finally:
                MODULE.ACTIVATION_RECEIPT_DIR = original

        self.assertTrue(raw.endswith(b"\n"))
        self.assertFalse(raw.endswith(b"\\n"))
        self.assertEqual(json.loads(raw.decode("utf-8")), payload)

if __name__ == "__main__":
    unittest.main()
