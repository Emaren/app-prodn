"""A05 regression: the native service must carry a real, read-only DNS stub."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import stat
from types import SimpleNamespace
from unittest import TestCase, main, mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("a05_native", ROOT / "scripts/r25_c_start_root.py")
native = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(native)
STUB = b"nameserver 127.0.0.53\n"
DIGEST = hashlib.sha256(STUB).hexdigest()
BIND = "BindReadOnlyPaths=/run/systemd/resolve/stub-resolv.conf:/run/systemd/resolve/stub-resolv.conf"

class DnsSandbox(TestCase):
    def test_canonical_unit_keeps_tight_sandbox_with_single_readonly_dns_file(self):
        unit = native.production_unit_bytes(Path("/var/lib/aoe2war-web-prod-" + "a" * 12)).decode()
        self.assertIn("TemporaryFileSystem=/run:ro\n", unit)
        self.assertEqual(unit.count(BIND), 1)
        self.assertIn("NoNewPrivileges=yes\nCapabilityBoundingSet=\n", unit)
        self.assertIn("RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX", unit)
        self.assertIn("ProtectSystem=strict", unit)
        self.assertNotIn("BindPaths=/run/systemd/resolve", unit)
        self.assertNotIn("ReadWritePaths=/run/systemd/resolve", unit)

    def test_namespace_probe_requires_real_resolver_and_restricted_dns(self):
        def response(argv, **kw):
            if "/usr/bin/sha256sum" in argv:
                return (DIGEST + "  /etc/resolv.conf\n").encode()
            if "/usr/bin/getent" in argv:
                self.assertIn("aoe2war-web-prod", argv)
                self.assertEqual(argv[-2:], ["ahostsv4", "steamcommunity.com"])
                return b"23.12.156.233 STREAM steamcommunity.com\n"
            raise AssertionError(argv)
        with mock.patch.object(native.os, "lstat", return_value=SimpleNamespace(
                st_mode=stat.S_IFREG | 0o644, st_uid=0)), \
             mock.patch.object(native, "root_file", return_value=STUB), \
             mock.patch.object(native, "run", side_effect=response):
            out=native.production_resolver_namespace_probe(4567)
            self.assertIs(out["steam_dns_resolves"], True)
            self.assertEqual(out["readonly_resolver_sha256"], DIGEST)

    def test_broken_namespace_is_fail_closed(self):
        with mock.patch.object(native.os, "lstat", return_value=SimpleNamespace(
                st_mode=stat.S_IFREG | 0o644, st_uid=0)), \
             mock.patch.object(native, "root_file", return_value=STUB), \
             mock.patch.object(native, "run", return_value=b""):
            with self.assertRaises(native.Hold):
                native.production_resolver_namespace_probe(4567)

    def test_invalid_pid_is_rejected_before_any_command(self):
        with self.assertRaises(native.Hold):
            native.production_resolver_namespace_probe(0)

if __name__ == "__main__":
    main()
