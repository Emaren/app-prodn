"""Synthetic nonfinancial tests: never inspect real FINANCIAL or recovery paths."""
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "product_owner_private_denial_attestation.py"
spec = importlib.util.spec_from_file_location("owner_private_denial_attestation", SOURCE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateAttestationTests(unittest.TestCase):
    def test_real_owner_uid_501_is_unmodified_by_portable_fixtures(self):
        self.assertEqual(module.EXPECTED_OWNER_UID, 501)

    def setUp(self):
        # Private synthetic owner-controlled fixture, deleted before return.
        self.tmp = tempfile.TemporaryDirectory(prefix="aoe2war-product-denial-fixture-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.private = self.root / "selected-owner-private"
        self.private.mkdir(mode=0o700)

    def test_positive_metadata_only_without_content_reads(self):
        # Synthetic fixture UID follows CI's unprivileged runner; production
        # remains pinned to actual owner UID501, tested independently below.
        with mock.patch.object(module, "EXPECTED_OWNER_UID", os.geteuid()):
            with mock.patch.object(module, "_owner_home", return_value="/Users/fictional-owner"):
                with mock.patch("subprocess.run") as runner:
                    runner.return_value.returncode = 0
                    runner.return_value.stdout = b"mock-private-metadata-without-content"
                    value = module._inspect(str(self.private), module._owner_home())
        self.assertEqual(value["private_path"], str(self.private))
        self.assertEqual(value["mode"], 0o700)
        self.assertEqual(len(value["acl_sha256"]), 64)
        self.assertEqual(runner.call_args.args[0], ["/bin/ls", "-lde", "."])
        self.assertEqual(runner.call_args.kwargs["cwd"], str(self.private))

    def test_missing_parent_fails_closed(self):
        with self.assertRaises(FileNotFoundError):
            module._inspect(str(self.root / "missing"), "/Users/fictional-owner")

    def test_symlink_alias_fails_closed(self):
        alias = self.root / "alias"
        alias.symlink_to(self.private, target_is_directory=True)
        with self.assertRaisesRegex(module.Hold, "SYMLINK"):
            module._inspect(str(alias), "/Users/fictional-owner")

    def test_public_or_shared_directory_fails_closed(self):
        self.private.chmod(0o755)
        with mock.patch.object(module, "EXPECTED_OWNER_UID", os.geteuid()):
            with self.assertRaisesRegex(module.Hold, "PERMISSIONS"):
                module._inspect(str(self.private), "/Users/fictional-owner")

    def test_product_and_financial_roots_are_not_denial_target(self):
        owner = "/Users/fictional-owner"
        prefix = owner + "/projects/AoE2WAR-LANES"
        for value in (prefix + "/PRODUCT", prefix + "/FINANCIAL",
                      prefix + "/FINANCIAL/not-a-real-dir", owner,
                      owner + "/Downloads", "/"):
            with self.subTest(scope=value):
                with self.assertRaisesRegex(module.Hold, "FORBIDDEN"):
                    module._inspect(value, owner)

    def test_no_relative_or_parent_segments(self):
        for value in ("relative", str(self.root) + "/../escape",
                      str(self.private) + "/", ""):
            with self.subTest(value=value):
                with self.assertRaises(module.Hold):
                    module._inspect(value, "/Users/fictional-owner")

    def test_owner_sudo_and_tty_requirements(self):
        with mock.patch("os.geteuid", return_value=501):
            with self.assertRaisesRegex(module.Hold, "ROOT_VIA_OWNER"):
                module._require_physical_owner_terminal()
        with mock.patch("os.geteuid", return_value=0):
            with mock.patch.dict(os.environ, {"SUDO_UID": "650", "SUDO_USER": "runner"}):
                with self.assertRaisesRegex(module.Hold, "ROOT_VIA_OWNER"):
                    module._require_physical_owner_terminal()

    def test_failure_output_does_not_expose_sensitive_input(self):
        import contextlib
        from io import StringIO
        log = StringIO()
        with mock.patch.object(module, "_require_physical_owner_terminal",
                               side_effect=module.Hold("BLOCKED")):
            with contextlib.redirect_stdout(log):
                self.assertEqual(module.main(["attest"]), 3)
        self.assertNotIn(str(self.private), log.getvalue())
        self.assertIn("NO RUNNER/ACL MUTATION", log.getvalue())

    def test_real_command_does_not_change_files_when_denied(self):
        with mock.patch.object(module, "_require_physical_owner_terminal",
                               side_effect=module.Hold("BLOCKED")):
            with mock.patch.object(module, "_store_attestation") as store:
                self.assertEqual(module.main(["verify"]), 3)
                store.assert_not_called()


if __name__ == "__main__":
    unittest.main()


class ReceiptOnlyTests(unittest.TestCase):
    def test_private_receipt_atomic_exact_once_and_no_execution_claim(self):
        import json
        with tempfile.TemporaryDirectory(prefix="aoe2war-receipt-fixture-") as tmp:
            out = Path(tmp) / "owner-receipt.json"
            with mock.patch.object(module, "RECEIPT", out):
                with mock.patch.object(module, "_receipt_preflight"):
                    fake = {"private_path": "/synthetic/not-a-real-target",
                            "device": 1, "inode": 2, "owner_uid": 501,
                            "group_gid": 650, "mode": 0o700,
                            "link_count": 1, "acl_sha256": "a" * 64}
                    module._store_attestation(fake)
                    self.assertEqual(out.stat().st_mode & 0o777, 0o600)
                    value = json.loads(out.read_text())
                    self.assertEqual(value["scope"],
                        "OWNER_SELECTS_EXISTING_REAL_DIRECTORY_DENIAL_ONLY")
                    for name in ("uid650_installed", "kernel_denial_proven",
                                 "runner_execution_isolated",
                                 "pilot_install_authorized"):
                        self.assertIs(value[name], False)
                    with self.assertRaises(FileExistsError):
                        module._store_attestation(fake)

    def test_unapproved_owner_phrase_cannot_write_receipt(self):
        with mock.patch.object(module, "_require_physical_owner_terminal"):
            with mock.patch("getpass.getpass", side_effect=[
                    "/synthetic/not-a-real-target", "NOT APPROVED"]):
                with mock.patch.object(module, "_inspect",
                        return_value={"private_path": "/synthetic/not-a-real-target"}):
                    with mock.patch.object(module, "_store_attestation") as store:
                        self.assertEqual(module.main(["attest"]), 3)
                        store.assert_not_called()
