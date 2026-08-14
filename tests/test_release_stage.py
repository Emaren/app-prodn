import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_stage.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_stage", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    release = "b" * 40
    previous = "a" * 40
    data = {
        "production": {
            "active_build_id": "old-build",
            "internal_build_version": "old-version",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }
    }
    manifest = {
        "release_sha": release,
        "previous_production_sha": previous,
        "changed_files": ["yarn.lock"],
    }
    result = {
        "status": "STAGED",
        "release_sha": release,
        "previous_sha": previous,
        "source_sha": previous,
        "active_build_id": "old-build",
        "staged_build_id": "candidate-build",
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": "a" * 64,
        "candidate_node_modules_sha256": "b" * 64,
        "candidate_node_modules_kb": "123456",
        "prisma_schema_engine_commit": "c" * 40,
        "prisma_schema_engine_sha256": "d" * 64,
        "prisma_schema_engine_seeded": "1",
        "service": "active",
        "wolo8092": "1",
        "wolo8093": "1",
        "isolated_worktree": "1",
        "build_process_sandboxed": "1",
        "build_network_private": "1",
        "build_secret_paths_inaccessible": "1",
        "dependency_fetch_sandboxed": "1",
        "dependency_fetch_scripts_disabled": "1",
        "dependency_build_offline": "1",
        "dependency_contract_unchanged": "1",
        "dependency_lock_changed": "1",
        "cache_free_artifact": "1",
        "artifact_path_relocated": "1",
        "live_source_mutated": "0",
        "live_public_mutated": "0",
        "live_node_modules_mutated": "0",
        "live_build_version_mutated": "0",
        "receipt_dir": "/mnt/receipt",
    }
    return data, manifest, result


class StageTests(unittest.TestCase):
    def test_stage_disk_preflight_precedes_candidate_materialization(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/stage-test",
        )

        self.assertIn(
            'root_available_kb="$(df -Pk "$LIVE_REPO"',
            script,
        )
        self.assertIn(
            'live_dependency_kb="$(du -sk "$LIVE_REPO/node_modules"',
            script,
        )
        self.assertIn(
            'root_required_kb=$((live_dependency_kb * 2 + 1048576))',
            script,
        )
        self.assertIn(
            'test "$root_available_kb" -ge "$root_required_kb"',
            script,
        )

        preflight = script.index('root_available_kb=')
        build_parent = script.index('build_parent="$(mktemp')
        dependency_fetch = script.index(
            'sudo -n /usr/bin/systemctl start --wait "$deps_unit"'
        )

        self.assertLess(preflight, build_parent)
        self.assertLess(preflight, dependency_fetch)

    def test_valid_stage_result(self):
        data, manifest, result = sample()
        self.assertEqual(
            MODULE.validate_stage_result(data, manifest, result),
            [],
        )

    def test_active_runtime_change_blocks_result(self):
        data, manifest, result = sample()
        result["active_build_id"] = "changed"
        self.assertIn(
            "active runtime BUILD_ID changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_live_version_change_blocks_result(self):
        data, manifest, result = sample()
        result["live_build_version"] = "changed"
        self.assertIn(
            "live build version changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_wolo_change_blocks_result(self):
        data, manifest, result = sample()
        result["wolo8092"] = "2"
        self.assertIn(
            "WOLO 8092 listener count changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_artifact_sha_must_be_sha256(self):
        data, manifest, result = sample()
        result["artifact_sha256"] = "not-a-sha"
        self.assertIn(
            "candidate artifact SHA-256 is invalid",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_stage_script_builds_in_disposable_worktree(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn("build_unit=", script)
        self.assertIn(
            "Environment=NEXT_DIST_DIR=.next-release",
            MODULE.BUILD_SANDBOX_UNIT_SOURCE.read_text(),
        )
        self.assertIn('git worktree add --detach "$build_worktree" "$RELEASE"', script)
        self.assertIn("/tmp/aoe2war-stage-XXXXXXXXXX", script)
        self.assertIn('${#build_worktree}', script)
        self.assertIn('${#LIVE_REPO}', script)
        self.assertNotIn(
            'cp -a node_modules "$build_worktree/node_modules"',
            script,
        )
        self.assertIn('deps_unit="aoe2war-deps@', script)
        self.assertIn('build_unit="aoe2war-build@', script)
        self.assertIn(
            'rm -rf "$build_worktree/node_modules"',
            script,
        )
        self.assertIn(
            'mv "$build_worktree/node_modules" .node_modules-release',
            script,
        )
        self.assertNotIn('cd "$build_worktree"', script)
        self.assertIn(
            "WorkingDirectory=/tmp/aoe2war-stage-%i",
            MODULE.BUILD_SANDBOX_UNIT_SOURCE.read_text(),
        )
        self.assertIn(
            "WorkingDirectory=/tmp/aoe2war-stage-%i",
            MODULE.DEPS_SANDBOX_UNIT_SOURCE.read_text(),
        )
        build_unit = MODULE.BUILD_SANDBOX_UNIT_SOURCE.read_text()
        self.assertIn(
            "Environment=NEXT_DIST_DIR=.next-release",
            build_unit,
        )
        self.assertIn(
            "ExecStart=/usr/bin/node "
            "/tmp/aoe2war-stage-%i/.yarn-runtime/bin/yarn.js build",
            build_unit,
        )
        self.assertIn('test "$(yarn --version)" = "1.22.22"', script)
        self.assertNotIn("sudo -n -u tony", script)
        self.assertIn("test ! -e .next-release", script)
        self.assertNotIn('git reset --hard "$RELEASE"', script)

    def test_build_sandbox_releases_yarn_cache_before_next_build(self):
        build_unit = MODULE.BUILD_SANDBOX_UNIT_SOURCE.read_text()

        install_marker = (
            "ExecStart=/usr/bin/node "
            "/tmp/aoe2war-stage-%i/.yarn-runtime/bin/yarn.js install "
            "--frozen-lockfile --offline --force --non-interactive "
            "--cache-folder /tmp/aoe2war-stage-%i/.yarn-cache"
        )
        cache_release_marker = (
            "ExecStart=/usr/bin/rm -rf "
            "/tmp/aoe2war-stage-%i/.yarn-cache"
        )
        build_marker = (
            "ExecStart=/usr/bin/node "
            "/tmp/aoe2war-stage-%i/.yarn-runtime/bin/yarn.js build"
        )

        self.assertIn(install_marker, build_unit)
        self.assertIn(cache_release_marker, build_unit)
        self.assertIn(build_marker, build_unit)

        self.assertEqual(
            build_unit.count(cache_release_marker),
            1,
        )

        install_pos = build_unit.index(install_marker)
        release_pos = build_unit.index(cache_release_marker)
        build_pos = build_unit.index(build_marker)

        self.assertLess(install_pos, release_pos)
        self.assertLess(release_pos, build_pos)

    def test_stage_script_persists_evidence_before_isolated_build_and_copy(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
            manifest_text="manifest-bytes\n",
            gate_text="gate-bytes\n",
        )
        manifest_write = script.index("release-manifest.json")
        gate_write = script.index("gate-receipt.json")
        worktree_build = script.index('git worktree add --detach "$build_worktree"')
        live_copy = script.index('mv "$stage_copy" .next-release')
        self.assertLess(manifest_write, worktree_build)
        self.assertLess(gate_write, worktree_build)
        self.assertLess(worktree_build, live_copy)
        self.assertIn('= "$MANIFEST_SHA"', script)
        self.assertIn('= "$GATE_SHA"', script)

    def test_stage_artifact_handoff_is_zero_copy_on_same_filesystem(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )

        self.assertIn(
            'test "$(stat -c \'%d\' "$build_worktree")" = '
            '"$(stat -c \'%d\' "$build_parent")"',
            script,
        )
        self.assertIn(
            'mv "$build_worktree/.next-release" "$stage_copy"',
            script,
        )
        self.assertIn(
            'test ! -e "$build_worktree/.next-release"',
            script,
        )

        self.assertNotIn(
            'rsync -a --delete "$build_worktree/.next-release/" '
            '"$stage_copy/"',
            script,
        )

        move_to_stage = script.index(
            'mv "$build_worktree/.next-release" "$stage_copy"'
        )
        mutation = script.index("mutation_started=1")
        move_live = script.index('mv "$stage_copy" .next-release')

        self.assertLess(move_to_stage, mutation)
        self.assertLess(mutation, move_live)


    def test_stage_receipt_uses_narrow_passwordless_install(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn(
            "sudo -n /usr/bin/install -d -o tony -g tony -m 0750",
            script,
        )
        self.assertNotIn("mkdir -p", script)

    def test_stage_recovery_trap_precedes_mutation(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        trap_pos = script.index("trap restore_stage_failure EXIT")
        mutation_pos = script.index("mutation_started=1")
        copy_pos = script.index('mv "$stage_copy" .next-release')
        self.assertLess(trap_pos, mutation_pos)
        self.assertLess(mutation_pos, copy_pos)
        self.assertIn("NOT_REQUIRED", script)
        self.assertIn("RESTORED", script)

    def test_stage_script_never_stops_or_restarts_services(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertNotIn("systemctl stop", script)
        self.assertNotIn('systemctl start "$SERVICE"', script)
        self.assertNotIn("systemctl restart", script)

    def test_stage_script_cleans_partial_artifact_without_source_mutation(self):
        previous = "a" * 40
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha=previous,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertNotIn('git reset --hard "$PREVIOUS"', script)
        self.assertNotIn('git reset --hard "$RELEASE"', script)
        self.assertIn("rm -rf .next-release", script)
        self.assertIn("cleanup_build_worktree", script)
        self.assertIn("trap restore_stage_failure EXIT", script)

    def test_stage_script_records_dependency_change_evidence_and_cache_free_artifact(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertNotIn(
            "will not reuse incompatible production node_modules",
            script,
        )
        self.assertNotIn(
            "atomic node_modules activation/rollback is required",
            script,
        )
        self.assertIn('dependency_contract "$PREVIOUS"', script)
        self.assertIn("dependency_contract_unchanged=0", script)
        self.assertIn("dependency_lock_changed=1", script)
        self.assertIn(".node_modules-release", script)
        self.assertIn(
            'rm -rf "$build_worktree/.next-release/cache"',
            script,
        )
        self.assertIn('test ! -e .next-release/cache', script)
        self.assertIn("artifact relocation paths differ in byte length", script)
        self.assertIn("embedded worktree path remains in artifact file", script)
        self.assertIn('artifact_path_relocated	1', script)
        self.assertIn('live_source_mutated	0', script)

    def test_stage_source_cleanliness_excludes_only_controlled_runtime_bundles(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn("source_status()", script)
        self.assertIn("' :(exclude).node_modules-release'".replace(" ", ""), script)
        self.assertIn("' :(exclude).node_modules-rollback*'".replace(" ", ""), script)
        self.assertIn(
            'before_dirty="$(source_status | wc -l',
            script,
        )
        self.assertIn(
            'after_dirty="$(source_status | wc -l',
            script,
        )

    def test_stage_script_builds_fresh_candidate_dependency_tree_without_live_mutation(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertNotIn(
            "will not reuse incompatible production node_modules",
            script,
        )
        self.assertNotIn(
            "atomic node_modules activation/rollback is required",
            script,
        )
        self.assertIn("yarn install --frozen-lockfile", script)
        fetch = script.index('systemctl start --wait "$deps_unit"')
        discard_fetch_tree = script.index(
            'rm -rf "$build_worktree/node_modules"',
            fetch,
        )
        build = script.index(
            'systemctl start --wait "$build_unit"',
            discard_fetch_tree,
        )
        self.assertLess(fetch, discard_fetch_tree)
        self.assertLess(discard_fetch_tree, build)
        self.assertIn(".node_modules-release", script)
        self.assertIn("candidate_node_modules_sha256", script)
        self.assertIn("live_node_modules_mutated", script)

    def test_stage_proves_prisma_engine_version_and_candidate_hash(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )

        version_proof = (
            'test "$live_prisma_engine_version" = '
            '"schema-engine-cli $candidate_prisma_engine_commit"'
        )
        hash_proof = (
            'test "$candidate_prisma_engine_sha" = '
            '"$live_prisma_engine_sha"'
        )
        discard = script.index('rm -rf "$build_worktree/node_modules"')
        build = script.index('systemctl start --wait "$build_unit"', discard)
        engine_copy = script.index(
            'install -m 0755 "$LIVE_PRISMA_SCHEMA_ENGINE" '
            '"$candidate_prisma_schema_engine"',
            build,
        )
        containment = script.index(
            'test "$(realpath -e "$candidate_prisma_engine_dir")" = '
            '"$candidate_prisma_engine_dir"',
            build,
        )
        target_unlink = script.index(
            'unlink -- "$candidate_prisma_schema_engine"',
            containment,
        )
        regular_file_proof = script.index(
            'test -f "$candidate_prisma_schema_engine"',
            engine_copy,
        )
        target_realpath_proof = script.index(
            'test "$(realpath -e "$candidate_prisma_schema_engine")" = '
            '"$candidate_prisma_schema_engine"',
            regular_file_proof,
        )
        dependency_hash = script.index('candidate_node_modules_sha="$(', engine_copy)

        self.assertIn(version_proof, script)
        self.assertIn(hash_proof, script)
        self.assertIn(
            '[[ "$candidate_prisma_engine_commit" =~ ^[0-9a-f]{40}$ ]]',
            script,
        )
        self.assertLess(script.index(version_proof), discard)
        self.assertGreater(engine_copy, build)
        self.assertLess(containment, target_unlink)
        self.assertLess(target_unlink, engine_copy)
        self.assertLess(engine_copy, regular_file_proof)
        self.assertLess(regular_file_proof, target_realpath_proof)
        self.assertLess(engine_copy, script.index(hash_proof))
        self.assertLess(script.index(hash_proof), dependency_hash)
        self.assertIn('test ! -L "$build_worktree/node_modules"', script)
        self.assertIn('test ! -L "$build_worktree/node_modules/@prisma"', script)
        self.assertIn('test ! -L "$candidate_prisma_engine_dir"', script)
        self.assertIn('test ! -L "$candidate_prisma_schema_engine"', script)
        self.assertIn("prisma_schema_engine_seeded=1", script)

    def test_prisma_engine_receipt_proof_is_required(self):
        data, manifest, result = sample()
        result["prisma_schema_engine_seeded"] = "0"
        result["prisma_schema_engine_sha256"] = "not-a-sha"

        errors = MODULE.validate_stage_result(data, manifest, result)

        self.assertIn("candidate Prisma schema-engine SHA-256 is invalid", errors)
        self.assertTrue(
            any("prisma_schema_engine_seeded" in error for error in errors)
        )

    def test_isolated_stage_invariant_is_required(self):
        data, manifest, result = sample()
        result["live_node_modules_mutated"] = "1"
        self.assertTrue(
            any(
                "live_node_modules_mutated" in error
                for error in MODULE.validate_stage_result(data, manifest, result)
            )
        )

    def test_stage_script_only_observes_wolo_ports(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn(":8092", script)
        self.assertIn(":8093", script)
        self.assertNotIn("systemctl restart wolo", script.lower())
        self.assertNotIn("kill", script.lower())

    def test_exact_local_stage_receipt_is_persisted_with_durable_hash(self):
        receipt_dir = (
            f"{MODULE.REMOTE_RECEIPT_ROOT}/stage-stamp-{'b' * 12}"
        )
        script = MODULE.durable_stage_receipt_script(
            receipt_dir=receipt_dir,
            receipt_text='{"status":"STAGED"}\n',
            receipt_sha256="c" * 64,
        )
        self.assertIn("refusing non-canonical durable stage receipt path", script)
        self.assertIn("stage-receipt.json.sha256", script)
        self.assertIn('cmp -s "$tmp_receipt" "$RECEIPT/stage-receipt.json"', script)
        self.assertIn('mv "$tmp_receipt" "$RECEIPT/stage-receipt.json"', script)
        self.assertIn("stage_receipt_sha256", script)
        self.assertNotIn("rm -rf", script)


if __name__ == "__main__":
    unittest.main()
