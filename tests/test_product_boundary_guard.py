"""Adversarial PRODUCT boundary checks. Every forbidden operation is policy-only."""
import importlib.util
import os
from pathlib import Path
import tempfile
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


if __name__ == "__main__":
    unittest.main()
