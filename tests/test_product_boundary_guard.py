"""Adversarial PRODUCT boundary checks. Every forbidden operation is policy-only."""
import importlib.util
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest import mock

GUARD = Path(__file__).resolve().parents[1] / "scripts" / "product_boundary_guard.py"
spec = importlib.util.spec_from_file_location("product_boundary_guard", GUARD)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class BoundaryTests(unittest.TestCase):
    def denied_source(self, value):
        with self.assertRaises(policy.BoundaryHold, msg=value):
            policy.authorize_source(value)

    def test_allow_reviewed_files(self):
        for value in ("scripts/product_boundary_guard.py",
                      "tests/test_product_boundary_guard.py",
                      ".github/workflows/product-boundary.yml",
                      "src/paper/price.ts", "docs/product-report.md",
                      "tests/test_player_profile.py"):
            with self.subTest(value=value):
                self.assertEqual(policy.authorize_source(value), value)

    def test_we2_factory_exact_protected_controller_source_admission(self):
        import hashlib
        source=GUARD.parent.parent
        self.assertEqual(policy.EXACT_WE2_FACTORY_BRANCH,
                         "we2/factory-v3-incident-recovery-20261119")
        self.assertEqual(policy.EXACT_WE2_FACTORY_BASE,
                         "6da478878478d2f32ceb2efba06c8a6a2c043301")
        self.assertIsNotNone(policy.BRANCH.fullmatch(policy.EXACT_WE2_FACTORY_BRANCH))
        self.assertIsNone(policy.BRANCH.fullmatch("we2/arbitrary-future-root"))
        names=set(policy.EXACT_WE2_FACTORY_SHA256)
        self.assertEqual(names,{
          "docs/release/artifacts/aoe2war_product_release_controller_v3.py",
          "scripts/aoe2_product_release.py",
          "tests/test_product_controller_recovery.py"})
        doc_paths=policy.EXACT_WE2_FACTORY_DOCS_REVIEW
        self.assertEqual(set(doc_paths),{
          "docs/DOCUMENTATION_CONTROL_PLANE.md",
          "docs/document-registry.json"})
        self.assertEqual(set(policy.EXACT_WE2_FACTORY_CHANGED),names|{
          "scripts/product_boundary_guard.py",
          "tests/test_product_boundary_guard.py"}|set(doc_paths))
        for path in doc_paths:
            self.assertTrue(path.startswith("docs/"))
            self.assertIn(path,
                {"docs/DOCUMENTATION_CONTROL_PLANE.md",
                 "docs/document-registry.json"} |
                {x for x in doc_paths if x.endswith(".md")})
        # Preserve the old v3 runner pin even though THIS PR legitimately
        # updates the live source under a distinct, reviewed branch/base/pin.
        self.assertEqual(policy.EXACT_WE2_FACTORY_SHA256["scripts/aoe2_product_release.py"],
                         "84d9a0e277595b1492d88f19e7c9829dc2896929738328ec37419c792f1f23f5")
        for relative,expected in policy.EXACT_WE2_FACTORY_SHA256.items():
            if relative != "scripts/aoe2_product_release.py":
                self.assertEqual(hashlib.sha256((source/relative).read_bytes()).hexdigest(),
                                 expected)
        # The old guard's negative-contract fixtures must use a temporary
        # matching runner blob, never update the real legacy policy pin.
        temporary_runner_sha = hashlib.sha256(
            (source/"scripts/aoe2_product_release.py").read_bytes()).hexdigest()
        legacy_test_patch = mock.patch.dict(policy.EXACT_WE2_FACTORY_SHA256, {
            "scripts/aoe2_product_release.py": temporary_runner_sha
        })
        legacy_test_patch.start()
        self.addCleanup(legacy_test_patch.stop)
        # The existing runner's SINGLE pinned root hash follows this exact
        # source controller, never a wildcard or runtime-discovered SHA.
        import ast
        runner_ast=ast.parse((source/"scripts/aoe2_product_release.py").read_text())
        pin=[ast.literal_eval(n.value) for n in runner_ast.body
             if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name)
             and t.id=="CONTROLLER_SHA" for t in n.targets)]
        self.assertEqual(pin,[hashlib.sha256((source/
            "docs/release/artifacts/aoe2war_product_release_controller_v3.py").read_bytes()).hexdigest()])
        ordered=sorted(policy.EXACT_WE2_FACTORY_CHANGED)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for relative in policy.EXACT_WE2_FACTORY_SHA256:
                out=root/relative
                out.parent.mkdir(parents=True,exist_ok=True)
                out.write_bytes((source/relative).read_bytes())
            def check(repo="Emaren/app-prodn",
                      branch=policy.EXACT_WE2_FACTORY_BRANCH,
                      base=policy.EXACT_WE2_FACTORY_BASE,changes=ordered):
                return policy.check_exact_we2_factory_source(
                    root,repo,branch,base,changes)
            self.assertIsNone(check())
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":policy.EXACT_WE2_FACTORY_BRANCH}):
                self.assertEqual(policy.authorize_changed_source(root,
                  policy.EXACT_WE2_FACTORY_BASE,
                  "scripts/aoe2_product_release.py"),"scripts/aoe2_product_release.py")
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":"main"}):
                with self.assertRaisesRegex(policy.BoundaryHold,"WE2_FACTORY_RUNNER_BRANCH"):
                    policy.authorize_changed_source(root,
                      policy.EXACT_WE2_FACTORY_BASE,
                      "scripts/aoe2_product_release.py")
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_BASE_OR_REPO"):
                check(repo="Emaren/kingdom-traders")
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_BASE_OR_REPO"):
                check(base="0"*40)
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_SOURCE_SCOPE"):
                check(changes=ordered[:-1])
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_SOURCE_SCOPE"):
                check(changes=ordered+["scripts/another_controller.py"])
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_SOURCE_SCOPE"):
                check(changes=ordered+[ordered[0]])
            path=root/"tests/test_product_controller_recovery.py"
            original=path.read_bytes()
            path.write_bytes(original+b"\n# unreviewed future change\n")
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_EXACT_SOURCE_SHA256_DRIFT"):
                check()
            path.write_bytes(original)
            alias=root/"hardlink"
            os.link(path,alias)
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_PROTECTED_SOURCE_CUSTODY"):
                check()
            alias.unlink()
            path.unlink()
            path.symlink_to(source/"tests/test_product_controller_recovery.py")
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_FACTORY_SYMLINK_ANCESTOR"):
                check()
            path.unlink()
            path.write_bytes(original)
            # Do not allow non-exact branch fallback to an arbitrary Factory
            # source: the generic branch grammar remains closed.
            self.assertIsNone(policy.BRANCH.fullmatch("we2/factory-v4-future"))

    def test_we2_factory_retention_new_exact_bae_source_admission(self):
        import hashlib
        source=GUARD.parent.parent
        branch=policy.EXACT_WE2_FACTORY_RETENTION_BRANCH
        base=policy.EXACT_WE2_FACTORY_RETENTION_BASE
        pins=policy.EXACT_WE2_FACTORY_RETENTION_PINS
        expected={
            "scripts/aoe2_product_release.py":
                "db53626c6b42944c47bffd7c6a2474a4355d8f6f5a28775c98e4214e6b689015",
            "scripts/aoe2_factory_retention_post_t10.py":
                "81eeea068721bf751d11366b13d6c75f876bce72d3629e58cde6b3f31151ca12",
            "tests/test_factory_retention_post_t10.py":
                "723b42341d91ff63201c723b1f4f3f132efa9c864ac602414e31b4a11e652b11",
        }
        self.assertEqual(branch,"we2/factory-post-t10-retention-20261122")
        self.assertEqual(base,"5ead114347294b345a34700dffdc456c2bcc86ba")
        self.assertEqual(pins,expected)
        self.assertIsNotNone(policy.BRANCH.fullmatch(branch))
        self.assertIsNone(policy.BRANCH.fullmatch("we2/arbitrary-new-controller"))
        expected_changes=set(expected)|{
            "scripts/product_boundary_guard.py",
            "tests/test_product_boundary_guard.py",
            "docs/DOCUMENTATION_CONTROL_PLANE.md",
            "docs/document-registry.json"}
        self.assertEqual(set(policy.EXACT_WE2_FACTORY_RETENTION_CHANGED),expected_changes)
        def reviewed_preimage(relative):
            if relative in ("scripts/aoe2_product_release.py",
                            "scripts/aoe2_factory_retention_post_t10.py"):
                # Freeze the original F1/post-T10 bytes under the exact
                # pre-birth canonical Git commit. Never change old SHA pins.
                result=subprocess.run(
                    ["git","-C",str(source),"show",
                     "f833d7e633cee4b36f1427fa45d76081fa0796ef:"+relative],
                    capture_output=True,check=True,timeout=25)
                return result.stdout
            return (source/relative).read_bytes()
        for relative,digest in pins.items():
            self.assertEqual(hashlib.sha256(reviewed_preimage(relative)).hexdigest(),digest)
        changed=sorted(expected_changes)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for relative in pins:
                p=root/relative
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_bytes(reviewed_preimage(relative))
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":branch}):
                for relative in pins:
                    self.assertEqual(policy.authorize_changed_source(root,base,relative),relative)
                self.assertIsNone(policy.check_exact_we2_factory_retention_source(
                    root,"Emaren/app-prodn",branch,base,changed))
            for candidate_base,candidate_repo,candidate_changes in (
                ("0"*40,"Emaren/app-prodn",changed),
                (base,"Emaren/kingdom-traders",changed),
                (base,"Emaren/app-prodn",changed[:-1]),
                (base,"Emaren/app-prodn",changed+["scripts/another_controller.py"]),
                (base,"Emaren/app-prodn",changed+[changed[0]]),
            ):
                with self.assertRaises(policy.BoundaryHold):
                    policy.check_exact_we2_factory_retention_source(
                        root,candidate_repo,branch,candidate_base,candidate_changes)
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":"main"}):
                with self.assertRaises(policy.BoundaryHold):
                    policy.authorize_changed_source(
                        root,base,"scripts/aoe2_product_release.py")
            candidate=root/"scripts/aoe2_factory_retention_post_t10.py"
            raw=candidate.read_bytes()
            candidate.write_bytes(raw+b"\n# unauthorized future mutation\n")
            with self.assertRaisesRegex(policy.BoundaryHold,
                                        "WE2_RETENTION_SOURCE_HASH_DRIFT"):
                policy.exact_we2_factory_retention_blob(
                    root,"scripts/aoe2_factory_retention_post_t10.py")
            candidate.write_bytes(raw)
            link=root/"extra-hardlink"
            os.link(candidate,link)
            with self.assertRaisesRegex(policy.BoundaryHold,"WE2_RETENTION_SOURCE_CUSTODY"):
                policy.exact_we2_factory_retention_blob(
                    root,"scripts/aoe2_factory_retention_post_t10.py")
            link.unlink()
            candidate.unlink()
            candidate.symlink_to(source/"scripts/aoe2_factory_retention_post_t10.py")
            with self.assertRaisesRegex(policy.BoundaryHold,"WE2_RETENTION_SOURCE_SYMLINK"):
                policy.exact_we2_factory_retention_blob(
                    root,"scripts/aoe2_factory_retention_post_t10.py")

    def test_we2_storage_exact_root_source_admission_and_negative_cases(self):
        import hashlib
        root = GUARD.parent.parent
        p = policy
        self.assertEqual(p.EXACT_WE2_STORAGE_BRANCH,
                         "we2/storage-protected-ingress-20261120")
        self.assertEqual(p.EXACT_WE2_STORAGE_BASE,
                         "815d66ef94900d29bb50b7241dc47927a4343955")
        self.assertIsNotNone(p.BRANCH.fullmatch(p.EXACT_WE2_STORAGE_BRANCH))
        self.assertIsNone(p.BRANCH.fullmatch("we2/unsafe-root-wildcard"))
        self.assertEqual(len(p.EXACT_WE2_STORAGE_CHANGED), 10)
        self.assertEqual(set(p.EXACT_WE2_STORAGE_CHANGED),
                         set(p.EXACT_WE2_STORAGE_PINS) |
                         {"scripts/product_boundary_guard.py",
                          "tests/test_product_boundary_guard.py",
                          "docs/DOCUMENTATION_CONTROL_PLANE.md",
                          "docs/document-registry.json"})
        name = "scripts/r25_b_guard_production_v1.cjs"
        # The historical protected ingress's pin must stay immutable even
        # after the new branch changes the guard. Prove the OLD blob from
        # that exact prior source, not the new branch's current blob.
        historical = subprocess.check_output([
            "git", "-C", str(root), "show",
            p.EXACT_WE2_BRIDGE_BASE + ":" + name], timeout=15)
        self.assertEqual(hashlib.sha256(historical).hexdigest(),
                         p.EXACT_WE2_STORAGE_PINS[name])
        for item, digest in p.EXACT_WE2_STORAGE_PINS.items():
            if item == name:
                self.assertNotEqual(
                    hashlib.sha256((root / item).read_bytes()).hexdigest(),
                    digest, "new guard must not masquerade as old-reviewed source")
            else:
                self.assertEqual(hashlib.sha256((root / item).read_bytes()).hexdigest(),
                                 digest, item)
        with self.assertRaisesRegex(p.BoundaryHold, "WE2_STORAGE_EXACT_SHA_MISMATCH"):
            p.check_exact_we2_storage_source(
                root, "Emaren/app-prodn", p.EXACT_WE2_STORAGE_BRANCH,
                p.EXACT_WE2_STORAGE_BASE, sorted(p.EXACT_WE2_STORAGE_CHANGED))
        cases = [
            ("Emaren/other-repo", p.EXACT_WE2_STORAGE_BASE,
             sorted(p.EXACT_WE2_STORAGE_CHANGED)),
            ("Emaren/app-prodn", "f" * 40,
             sorted(p.EXACT_WE2_STORAGE_CHANGED)),
            ("Emaren/app-prodn", p.EXACT_WE2_STORAGE_BASE,
             sorted(set(p.EXACT_WE2_STORAGE_CHANGED) -
                    {"docs/release/artifacts/aoe2war_storage_visual_exact_ingress_v1.conf"})),
            ("Emaren/app-prodn", p.EXACT_WE2_STORAGE_BASE,
             sorted(set(p.EXACT_WE2_STORAGE_CHANGED) | {"scripts/unreviewed-root.py"})),
        ]
        for repo, base, changes in cases:
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_STORAGE_"):
                p.check_exact_we2_storage_source(
                    root, repo, p.EXACT_WE2_STORAGE_BRANCH, base, changes)
        with mock.patch.dict(os.environ, {"BOUNDARY_BRANCH": p.EXACT_WE2_STORAGE_BRANCH}):
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_STORAGE_EXACT_SHA_MISMATCH"):
                p.authorize_changed_source(root, p.EXACT_WE2_STORAGE_BASE, name)
            with self.assertRaisesRegex(p.BoundaryHold, "WRONG_BASE"):
                p.authorize_changed_source(root, "e" * 40, name)
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            (scratch / "scripts").mkdir()
            target = scratch / name
            target.write_bytes(historical)
            self.assertEqual(p.exact_we2_storage_blob(scratch, name), name)
            target.write_bytes(historical + b"malicious")
            with self.assertRaisesRegex(p.BoundaryHold, "EXACT_SHA_MISMATCH"):
                p.exact_we2_storage_blob(scratch, name)
            target.unlink()
            target.symlink_to(root / name)
            with self.assertRaisesRegex(p.BoundaryHold, "SYMLINK_ANCESTOR"):
                p.exact_we2_storage_blob(scratch, name)
            target.unlink()
            target.write_bytes(historical)
            alias = scratch / "hardlink"
            os.link(target, alias)
            with self.assertRaisesRegex(p.BoundaryHold, "SINGLE_REGULAR_FILE"):
                p.exact_we2_storage_blob(scratch, name)

    def test_we2_bridge_dual_path_exact_source_and_hostile_cases(self):
        import hashlib
        p = policy
        root = GUARD.parent.parent
        self.assertEqual(p.EXACT_WE2_BRIDGE_BRANCH,
                         "we2/bridge-dual-path-20261121")
        self.assertEqual(p.EXACT_WE2_BRIDGE_BASE,
                         "1bb42c53ebd44bc22b07a3b64862d39f457fb529")
        self.assertTrue(p.BRANCH.fullmatch(p.EXACT_WE2_BRIDGE_BRANCH))
        self.assertFalse(p.BRANCH.fullmatch("we2/unreviewed-post"))
        self.assertEqual(set(p.EXACT_WE2_BRIDGE_CHANGED),
                         set(p.EXACT_WE2_BRIDGE_PINS) |
                         {"scripts/product_boundary_guard.py",
                          "tests/test_product_boundary_guard.py",
                          "docs/DOCUMENTATION_CONTROL_PLANE.md",
                          "docs/document-registry.json"})
        for name, digest in p.EXACT_WE2_BRIDGE_PINS.items():
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(),
                             digest, name)
        p.check_exact_we2_bridge_source(
            root, "Emaren/app-prodn", p.EXACT_WE2_BRIDGE_BRANCH,
            p.EXACT_WE2_BRIDGE_BASE, sorted(p.EXACT_WE2_BRIDGE_CHANGED))
        for repo, base, changes in [
            ("Emaren/unsafe", p.EXACT_WE2_BRIDGE_BASE,
             sorted(p.EXACT_WE2_BRIDGE_CHANGED)),
            ("Emaren/app-prodn", "f" * 40,
             sorted(p.EXACT_WE2_BRIDGE_CHANGED)),
            ("Emaren/app-prodn", p.EXACT_WE2_BRIDGE_BASE,
             sorted(set(p.EXACT_WE2_BRIDGE_CHANGED) -
                    {"deploy/aoe2war-bridge-dual-path.nginx.inc"})),
            ("Emaren/app-prodn", p.EXACT_WE2_BRIDGE_BASE,
             sorted(set(p.EXACT_WE2_BRIDGE_CHANGED) | {"scripts/unreviewed-post.cjs"})),
        ]:
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_BRIDGE_"):
                p.check_exact_we2_bridge_source(
                    root, repo, p.EXACT_WE2_BRIDGE_BRANCH, base, changes)
        guard = "scripts/r25_b_guard_production_v1.cjs"
        with mock.patch.dict(os.environ, {"BOUNDARY_BRANCH": p.EXACT_WE2_BRIDGE_BRANCH}):
            self.assertEqual(p.authorize_changed_source(
                root, p.EXACT_WE2_BRIDGE_BASE, guard), guard)
            with self.assertRaisesRegex(p.BoundaryHold, "(WRONG_BASE|WE2_)"):
                p.authorize_changed_source(root, "e" * 40, guard)
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            (scratch / "scripts").mkdir()
            target = scratch / guard
            original = (root / guard).read_bytes()
            target.write_bytes(original)
            self.assertEqual(p.exact_we2_bridge_blob(scratch, guard), guard)
            target.write_bytes(original + b"// forbidden addition")
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_BRIDGE_EXACT_SHA_MISMATCH"):
                p.exact_we2_bridge_blob(scratch, guard)
            target.unlink()
            target.symlink_to(root / guard)
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_BRIDGE_SYMLINK_ANCESTOR"):
                p.exact_we2_bridge_blob(scratch, guard)
            target.unlink()
            target.write_bytes(original)
            alias = scratch / "hardlink"
            os.link(target, alias)
            with self.assertRaisesRegex(p.BoundaryHold, "WE2_BRIDGE_SOURCE_CUSTODY"):
                p.exact_we2_bridge_blob(scratch, guard)

    def test_owner_b_ember_guard_exact_branch_base_hash_and_no_wildcard(self):
        name = policy.EXACT_REVIEWED_B_EMBER_GUARD
        source = GUARD.parent / "r25_b_guard_production_v1.cjs"
        import hashlib
        # Historical Ember source is verified at the *immutable prior main*
        # commit, not silently rebound to the newly reviewed WE2 guard bytes.
        historical = subprocess.check_output([
            "git", "-C", str(GUARD.parent.parent), "show",
            policy.EXACT_WE2_STORAGE_BASE + ":scripts/r25_b_guard_production_v1.cjs",
        ], timeout=15)
        self.assertEqual(policy.EXACT_REVIEWED_B_EMBER_BRANCH,
                         "session-b/ember-november-polish-20261116")
        self.assertIsNotNone(policy.BRANCH.fullmatch(policy.EXACT_REVIEWED_B_EMBER_BRANCH))
        self.assertIsNone(policy.BRANCH.fullmatch("session-b/another-os-release"))
        self.assertEqual(hashlib.sha256(historical).hexdigest(),
                         policy.EXACT_REVIEWED_B_EMBER_SHA256)
        self.denied_source(name)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            p = root / name
            blob = historical
            p.write_bytes(blob)
            self.assertEqual(policy.authorize_changed_source(
                root, policy.EXACT_REVIEWED_B_EMBER_BASE, name), name)
            with self.assertRaisesRegex(policy.BoundaryHold, "WRONG_BASE"):
                policy.authorize_changed_source(root, "a"*40, name)
            with self.assertRaisesRegex(policy.BoundaryHold, "UNREVIEWED_EXECUTABLE"):
                policy.authorize_changed_source(root,
                    policy.EXACT_REVIEWED_B_EMBER_BASE, "scripts/other_guard.cjs")
            p.write_bytes(blob + b"\n//malicious modification\n")
            with self.assertRaisesRegex(policy.BoundaryHold, "EXACT_SHA_MISMATCH"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_EMBER_BASE, name)
            p.write_bytes(blob)
            hardlink = root / "otherlink"
            os.link(p, hardlink)
            with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_EMBER_BASE, name)
            hardlink.unlink()
            p.unlink()
            p.symlink_to(source)
            with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_EMBER_BASE, name)
            p.unlink()
            (root / "scripts").rmdir()
            (root / "scripts").symlink_to(source.parent, target_is_directory=True)
            with self.assertRaisesRegex(policy.BoundaryHold, "SYMLINK_ANCESTOR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_EMBER_BASE, name)

    def test_exact_reviewed_audit_script_is_sha_and_base_pinned(self):
        source = GUARD.parent / "kingdom_index_source_audit.mjs"
        self.assertEqual(
            policy.EXACT_REVIEWED_SHA256,
            "185defe7f93ea39bf1829b7a8eaf4a48f050b50d40ad1438c9be9ca468326a01",
        )
        self.assertEqual(
            policy.EXACT_REVIEWED_FACTORY_SHA256,
            "bb613ddbd9203f5ad5f2f19be8521db2dc64e03e36e7e4872da0f2b01c1beab8",
        )
        # Ordinary source policy continues to DENY executable scripts.
        self.denied_source(policy.EXACT_REVIEWED_SCRIPT)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            candidate = scripts / "kingdom_index_source_audit.mjs"
            candidate.write_bytes(source.read_bytes())
            self.assertEqual(
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_FACTORY_BASE, policy.EXACT_REVIEWED_SCRIPT
                ), policy.EXACT_REVIEWED_SCRIPT,
            )
            # Former source pin is still stored, but new audit source bytes
            # cannot masquerade as the 3933... historical approved script.
            with self.assertRaisesRegex(policy.BoundaryHold, "SHA_MISMATCH"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_BASE, policy.EXACT_REVIEWED_SCRIPT
                )
            with self.assertRaisesRegex(policy.BoundaryHold, "WRONG_BASE"):
                policy.authorize_changed_source(
                    root, "b" * 40, policy.EXACT_REVIEWED_SCRIPT
                )
            candidate.write_bytes(candidate.read_bytes() + b"\n// forbidden drift\n")
            with self.assertRaisesRegex(policy.BoundaryHold, "SHA_MISMATCH"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_FACTORY_BASE, policy.EXACT_REVIEWED_SCRIPT
                )
            candidate.unlink()
            candidate.symlink_to(source)
            with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_FACTORY_BASE, policy.EXACT_REVIEWED_SCRIPT
                )
            with self.assertRaisesRegex(policy.BoundaryHold, "UNREVIEWED_EXECUTABLE"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_FACTORY_BASE, "scripts/another_script.mjs"
                )

    def test_exact_reviewed_dynamic_media_route_is_base_sha_and_inode_pinned(self):
        source = GUARD.parent.parent / policy.EXACT_REVIEWED_DYNAMIC_ROUTE
        self.assertEqual(
            policy.EXACT_REVIEWED_DYNAMIC_SHA256,
            "bb1433119e955fd4e7bf9c6d2ecdcb64b0566ed01eef203d9fc224e1b5ba7243",
        )
        self.denied_source(policy.EXACT_REVIEWED_DYNAMIC_ROUTE)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / policy.EXACT_REVIEWED_DYNAMIC_ROUTE
            target.parent.mkdir(parents=True)
            target.write_bytes(source.read_bytes())
            self.assertEqual(
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                ),
                policy.EXACT_REVIEWED_DYNAMIC_ROUTE,
            )
            with self.assertRaisesRegex(policy.BoundaryHold, "WRONG_BASE"):
                policy.authorize_changed_source(
                    root, "a" * 40, policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                )
            with self.assertRaisesRegex(policy.BoundaryHold, "TRAVERSAL_OR_UNSAFE_COMPONENT"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    "app/api/media-assets/[other]/[target]/route.ts"
                )
            target.write_bytes(target.read_bytes() + b"tamper")
            with self.assertRaisesRegex(policy.BoundaryHold, "SHA_MISMATCH"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                )
            target.unlink()
            target.symlink_to(source)
            with self.assertRaisesRegex(policy.BoundaryHold, "REGULAR_FILE_REQUIRED"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                )
            target.unlink()
            target.write_bytes(source.read_bytes())
            alias = root / "hardlink-to-source-route"
            os.link(target, alias)
            with self.assertRaisesRegex(policy.BoundaryHold, "REGULAR_FILE_REQUIRED"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                )
            alias.unlink()
            target.unlink()
            target.parent.rmdir()
            target.parent.symlink_to(source.parent, target_is_directory=True)
            with self.assertRaisesRegex(policy.BoundaryHold, "SYMLINK_ANCESTOR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_DYNAMIC_BASE,
                    policy.EXACT_REVIEWED_DYNAMIC_ROUTE
                )

    def test_b_browser_umbrella_exact_script_base_sha_and_no_wildcard(self):
        name = "scripts/aoe2_r25_g_browser_acceptance.py"
        actual = GUARD.parent / "aoe2_r25_g_browser_acceptance.py"
        import hashlib
        self.assertEqual(
            policy.EXACT_REVIEWED_B_BROWSER_BASE,
            "f436d6f3c1a04308e33b17db4a69c25a2d925fcf")
        self.assertEqual(policy.EXACT_REVIEWED_B_BROWSER_SCRIPT, name)
        self.assertEqual(
            hashlib.sha256(actual.read_bytes()).hexdigest(),
            policy.EXACT_REVIEWED_B_BROWSER_SHA256)
        self.denied_source(name)  # Cannot introduce any generic scripts/ allowance.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            p = root / name
            original = actual.read_bytes()
            p.write_bytes(original)
            self.assertEqual(
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE, name), name)
            with self.assertRaisesRegex(policy.BoundaryHold, "WRONG_BASE"):
                policy.authorize_changed_source(root, "a"*40, name)
            p.write_bytes(original + b" ")
            with self.assertRaisesRegex(policy.BoundaryHold, "EXACT_SHA_MISMATCH"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE, name)
            p.write_bytes(original)
            extra = root / "same-inode"
            os.link(p, extra)
            with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR_FILE"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE, name)
            extra.unlink()
            p.unlink()
            p.symlink_to(actual)
            with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR_FILE"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE, name)
            p.unlink()
            scripts.rmdir()
            scripts.symlink_to(actual.parent, target_is_directory=True)
            with self.assertRaisesRegex(policy.BoundaryHold, "SYMLINK_ANCESTOR"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE, name)
            with self.assertRaisesRegex(policy.BoundaryHold, "UNREVIEWED_EXECUTABLE"):
                policy.authorize_changed_source(
                    root, policy.EXACT_REVIEWED_B_BROWSER_BASE,
                    "scripts/aoe2_r25_g_browser_future_unreviewed.py")

    def test_four_deployment_os_scripts_exact_base_hash_and_no_wildcard(self):
        # New F1 bytes are approved only for the F1 parent source base.
        # Keep the historical R1 pins unchanged for restoration/review.
        self.assertEqual(policy.EXACT_REVIEWED_DEPLOYMENT_OS_BASE,
                         "6f413a39864c7f54f3e3574150ca396819702416")
        self.assertEqual(
            policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE["scripts/aoe2_product_release.py"],
            "7b772e89781b1d09879866bf375e51ba873af22c579dfb73f6f45795379bf218")
        approved = policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_SOURCE
        self.assertEqual(len(policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE), 4)
        self.assertEqual(len(approved), 6)
        self.assertEqual(set(approved) - set(policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE),
                         {"scripts/run_python_contract.py",
                          "scripts/run_test_contract.py"})
        self.assertEqual(policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE,
                         "1b6e36e2bf4b823b9192488f12074798232c22ab")
        with tempfile.TemporaryDirectory() as tmp:
            checkout = Path(tmp)
            (checkout / "scripts").mkdir()
            for name, digest in approved.items():
                with self.subTest(name=name):
                    self.denied_source(name)  # no ordinary scripts/ wildcard
                    reviewed = GUARD.parent.parent / name
                    # The current HEAD intentionally changes the Factory's
                    # root SHA pin; test F1 historical bytes from canonical
                    # pre-change Git base, not the changed working file.
                    original_fixture = reviewed.read_bytes()
                    if name == "scripts/aoe2_product_release.py":
                        result = subprocess.run(
                            ["git","-C",str(GUARD.parent.parent),"show",
                             policy.EXACT_WE2_FACTORY_BASE+":"+name],
                            capture_output=True,check=True,timeout=25)
                        original_fixture=result.stdout
                    target = checkout / name
                    target.write_bytes(original_fixture)
                    self.assertEqual(
                        __import__("hashlib").sha256(target.read_bytes()).hexdigest(),
                        digest)
                    self.assertEqual(
                        policy.authorize_changed_source(
                            checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE, name),
                        name)
                    with self.assertRaisesRegex(policy.BoundaryHold, "WRONG_BASE"):
                        policy.authorize_changed_source(checkout, "a"*40, name)
                    if (name in policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE and
                            digest != policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE[name]):
                        # Only the two F1 modified executables reject R1.
                        with self.assertRaisesRegex(policy.BoundaryHold, "EXACT_SHA_MISMATCH"):
                            policy.authorize_changed_source(
                                checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_BASE, name)
                    elif name not in policy.EXACT_REVIEWED_DEPLOYMENT_OS_SOURCE:
                        with self.assertRaisesRegex(policy.BoundaryHold, "UNREVIEWED_FOR_BASE"):
                            policy.authorize_changed_source(
                                checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_BASE, name)
                    else:
                        # The two unchanged historical executable blobs remain
                        # valid for either exact base and neither is wildcarded.
                        self.assertEqual(policy.authorize_changed_source(
                            checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_BASE, name), name)
                    target.write_bytes(target.read_bytes() + b"\x00")
                    with self.assertRaisesRegex(policy.BoundaryHold, "EXACT_SHA_MISMATCH"):
                        policy.authorize_changed_source(
                            checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE, name)
                    target.unlink()
                    target.symlink_to(reviewed)
                    with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR"):
                        policy.authorize_changed_source(
                            checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE, name)
                    target.unlink()
                    target.write_bytes(original_fixture)
                    alias = checkout / ("alias-" + target.name)
                    os.link(target, alias)
                    with self.assertRaisesRegex(policy.BoundaryHold, "SINGLE_REGULAR"):
                        policy.authorize_changed_source(
                            checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_F1_BASE, name)
                    alias.unlink()
                    target.unlink()
            with self.assertRaisesRegex(policy.BoundaryHold, "UNREVIEWED_EXECUTABLE"):
                policy.authorize_changed_source(
                    checkout, policy.EXACT_REVIEWED_DEPLOYMENT_OS_BASE,
                    "scripts/aoe2_product_unreviewed_future.py")

    def test_prior_nine_negative_cases(self):
        values = (
            "../FINANCIAL/never_write.txt",
            "/Users/owner/projects/AoE2WAR-LANES/FINANCIAL/never_write.txt",
            "../../owner-private-recovery/backup.age",
            "db/raw_ledger_financial.sql",
            "src/run-arbitrary-command.ts",
            "db/wolo_financial.sql",
            "systemd/wolo-native-8094.service",
            "src/execute-shell.py",
            "reports/product-boundary/../../custody.txt",
        )
        for value in values:
            with self.subTest(value=value):
                self.denied_source(value)

    def test_recovery_and_native_aliases(self):
        for value in ("owner-private-recovery/old.age", "src/CUSTODY/api.ts",
                      "src/wallet_signing/secret.ts", "new-8095-reviewer.ts",
                      "scripts/payout_sync.py", "src/finance/claim.ts",
                      "infra/nginx.conf", ".github/workflows/stealth.yml",
                      "scripts/unaudited.py", "src/code.sh",
                      "src/run-arbitrary-command.ts"):
            with self.subTest(value=value):
                self.denied_source(value)

    def test_traversal_and_unicode_bypass(self):
        for value in ("a/../b", "./file", "a//b", "~/.ssh/id_rsa", "$HOME/key",
                      "C:/escape", "\\\\server\\share", "a\\..\\b",
                      "a/\x00/b", "a/\nname", "a/.git/config", "a/./file"):
            with self.subTest(value=repr(value)):
                with self.assertRaises(policy.BoundaryHold):
                    policy.relative_path(value)

    def test_bounded_authorized_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            checkout = root / "PRODUCT" / "repo"
            checkout.mkdir(parents=True)
            target = policy.authorize_output("artifacts/product-boundary/receipt.json",
                                             checkout, root / "PRODUCT")
            self.assertEqual(target, checkout.resolve(strict=True) / "artifacts/product-boundary/receipt.json")
            self.assertFalse(target.exists(), "policy must not write any artifact")

    def test_reject_external_and_disguised_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "PRODUCT"
            checkout = root / "repo"
            checkout.mkdir(parents=True)
            for value in ("../FINANCIAL/out", "/tmp/out", "../../recovery/private",
                          "public/index.html", "reports/product-boundary/../../secret",
                          "artifacts/product-boundary/./receipt.json"):
                with self.subTest(value=value), self.assertRaises(policy.BoundaryHold):
                    policy.authorize_output(value, checkout, root)

    def test_reject_symlinked_output_ancestor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "PRODUCT"
            checkout = root / "repo"
            checkout.mkdir(parents=True)
            (checkout / "artifacts").symlink_to(Path(tmp) / "outside", target_is_directory=True)
            with self.assertRaisesRegex(policy.BoundaryHold, "SYMLINK"):
                policy.authorize_output("artifacts/product-boundary/receipt.json",
                                         checkout, root)

    def test_no_implicit_command_permission(self):
        good = {"argv": ["python3", "-I", "-B",
                         "scripts/product_boundary_guard.py", "--check"],
                "cwd": ".", "output": None}
        self.assertEqual(policy.authorize_task(good), tuple(good["argv"]))
        for arg in (
            {"argv": ["sh", "-c", "echo harmless"], "cwd": ".", "output": None},
            {"argv": ["python3", "scripts/run_anything.py"], "cwd": ".", "output": None},
            {"argv": ["python3", "-I", "-B", "scripts/product_boundary_guard.py",
                      "--check"], "cwd": "..", "output": None},
            dict(good, shell=True),
            dict(good, output="artifacts/product-boundary/output.json"),
            {"argv": "python3 -I -B scripts/product_boundary_guard.py --check",
             "cwd": ".", "output": None},
        ):
            with self.subTest(payload=arg), self.assertRaises(policy.BoundaryHold):
                policy.authorize_task(arg)

    def test_git_pointer_reject_external(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "PRODUCT"
            checkout = root / "app-prodn"
            checkout.mkdir(parents=True)
            (checkout / ".git").write_text("gitdir: /private/elsewhere/.git/worktrees/escape\n")
            with self.assertRaises(policy.BoundaryHold):
                policy.validate_git_pointer(checkout, root, "Emaren/app-prodn")

    def test_git_pointer_reject_relative(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "PRODUCT"
            checkout = root / "app-prodn"
            checkout.mkdir(parents=True)
            (checkout / ".git").write_text("gitdir: ../../FINANCIAL/secret\n")
            with self.assertRaises(policy.BoundaryHold):
                policy.validate_git_pointer(checkout, root, "Emaren/app-prodn")

    def test_strict_origin_branch_head_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "PRODUCT"
            checkout = root / "app-prodn"
            (checkout / ".git").mkdir(parents=True)
            sha = "a" * 40
            branch = "session-c/guard-test"
            answers = {
                ("rev-parse", "--show-toplevel"): str(checkout),
                ("remote", "get-url", "origin"): "https://github.com/Emaren/app-prodn",
                ("rev-parse", "HEAD"): sha,
                ("branch", "--show-current"): branch,
                ("status", "--porcelain=v1", "--untracked-files=normal"): "",
            }
            def fake_git(p, *args):
                return answers[args]
            with mock.patch.object(policy, "git", side_effect=fake_git):
                receipt = policy.check_checkout(checkout, "Emaren/app-prodn", sha,
                                               branch, root, ci=False)
                self.assertEqual(receipt["sha"], sha)
                answers[("remote", "get-url", "origin")] = \
                    "https://github.com/Emaren/app-prodn.attacker.invalid"
                with self.assertRaisesRegex(policy.BoundaryHold, "ORIGIN"):
                    policy.check_checkout(checkout, "Emaren/app-prodn", sha,
                                          branch, root, ci=False)
                answers[("remote", "get-url", "origin")] = \
                    "https://github.com/Emaren/app-prodn"
                with self.assertRaisesRegex(policy.BoundaryHold, "SHA"):
                    policy.check_checkout(checkout, "Emaren/app-prodn", "b" * 40,
                                          branch, root, ci=False)
                with self.assertRaisesRegex(policy.BoundaryHold, "BRANCH"):
                    policy.check_checkout(checkout, "Emaren/app-prodn", sha,
                                          "session-b/admin", root, ci=False)

    def test_reject_source_symlink_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "repo").symlink_to(root / "missing", target_is_directory=True)
            with self.assertRaises((policy.BoundaryHold, OSError)):
                policy.authorize_output("reports/product-boundary/receipt.json",
                                         root / "repo", root)


    def test_we1_factory_birth_exact_review_no_previous_f1_pin_drift(self):
        import hashlib
        root=GUARD.parent.parent
        bp=policy.EXACT_WE1_BIRTH_BRANCH
        base=policy.EXACT_WE1_BIRTH_BASE
        pins=policy.EXACT_WE1_BIRTH_PINS
        self.assertEqual(bp,"we1/factory-birth-after-atlas-20261122")
        self.assertEqual(base,"f833d7e633cee4b36f1427fa45d76081fa0796ef")
        self.assertEqual(set(pins),{
            "scripts/aoe2_product_release.py",
            "scripts/aoe2_factory_retention_post_t10.py",
            "tests/test_factory_birth_original.py",
            "tests/test_product_boundary_guard.py",
        })
        self.assertIsNotNone(policy.BRANCH.fullmatch(bp))
        self.assertIsNone(policy.BRANCH.fullmatch("we1/factory-birth-arbitrary"))
        self.assertEqual(policy.EXACT_WE2_FACTORY_RETENTION_PINS[
                         "scripts/aoe2_factory_retention_post_t10.py"],
                         "81eeea068721bf751d11366b13d6c75f876bce72d3629e58cde6b3f31151ca12")
        for name,h in pins.items():
            self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(),h)
        with tempfile.TemporaryDirectory() as td:
            q=Path(td)
            for name in pins:
                p=q/name
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_bytes((root/name).read_bytes())
            changes=sorted(policy.EXACT_WE1_BIRTH_CHANGED)
            self.assertIsNone(policy.check_exact_we1_factory_birth_source(
                q,"Emaren/app-prodn",bp,base,changes))
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":bp}):
                for name in ("scripts/aoe2_product_release.py",
                             "scripts/aoe2_factory_retention_post_t10.py"):
                    self.assertEqual(policy.authorize_changed_source(q,base,name),name)
            with mock.patch.dict(os.environ,{"BOUNDARY_BRANCH":"main"}):
                with self.assertRaises(policy.BoundaryHold):
                    policy.authorize_changed_source(
                        q,base,"scripts/aoe2_product_release.py")
            for changes_bad in (changes[:-1],
                                changes+["scripts/arbitrary-executor.py"],
                                changes+[changes[0]]):
                with self.assertRaisesRegex(policy.BoundaryHold,
                                            "WE1_BIRTH_CHANGED_FILE_SET"):
                    policy.check_exact_we1_factory_birth_source(
                        q,"Emaren/app-prodn",bp,base,changes_bad)
            with self.assertRaisesRegex(policy.BoundaryHold,"WE1_BIRTH_SOURCE_BASE"):
                policy.check_exact_we1_factory_birth_source(
                    q,"Emaren/app-prodn",bp,"a"*40,changes)
            p=q/"scripts/aoe2_product_release.py"
            p.write_bytes(p.read_bytes()+b"\\n# unauthorized change\\n")
            with self.assertRaisesRegex(policy.BoundaryHold,"WE1_BIRTH_SHA256"):
                policy.check_exact_we1_factory_birth_source(
                    q,"Emaren/app-prodn",bp,base,changes)


if __name__ == "__main__":
    unittest.main()
