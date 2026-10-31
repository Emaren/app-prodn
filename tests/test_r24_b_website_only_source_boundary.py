#!/usr/bin/env python3
"""Source-only R24 B adversarial isolation contract tests; no HEL1/DB contact."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / "scripts" / "r24_b_website_only_source_boundary.py"
spec = importlib.util.spec_from_file_location("r24_b_source_boundary", PATH)
assert spec and spec.loader
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def row(path: str, mode: str = "100644") -> bytes:
    return f"{mode} blob {'0' * 40}\t{path}".encode() + b"\0"


class R24BIsolationContractTests(unittest.TestCase):
    def test_route_tree_parses_exact_git_nul(self):
        routes = b.route_paths(
            row("app/api/bets/wager/route.ts")
            + row("app/api/lobby/route.ts")
            + row("app/api/ignored.ts")
        )
        self.assertEqual(routes, ["app/api/bets/wager/route.ts", "app/api/lobby/route.ts"])

    def test_missing_or_truncated_tree_fails(self):
        for raw in (b"", row("app/api/lobby/route.ts")[:-1]):
            with self.subTest(raw=raw):
                with self.assertRaisesRegex(ValueError, "ROUTE_TREE_TRUNCATED"):
                    b.route_paths(raw)

    def test_duplicate_route_holds(self):
        raw = row("app/api/a/route.ts")
        with self.assertRaisesRegex(ValueError, "DUPLICATE"):
            b.route_paths(raw + raw)

    def test_symlink_is_not_trusted_route_source(self):
        with self.assertRaisesRegex(ValueError, "NONREGULAR"):
            b.route_paths(row("app/api/a/route.ts", "120000"))

    def test_traversal_unusual_route_holds(self):
        with self.assertRaisesRegex(ValueError, "UNSAFE_PATH"):
            b.route_paths(row("app/api/../a/route.ts"))

    def test_mutation_methods_are_not_mislabeled_as_safe(self):
        src = b"\n".join([
            b"export async function GET(request) {}",
            b"export async function POST(request) {}",
            b"export function DELETE(request) {}",
            b"export const PATCH = async () => {}",
        ])
        self.assertEqual(b.classify_methods(src), ["DELETE", "GET", "PATCH", "POST"])

    def test_nonstandard_or_reexported_method_is_unknown(self):
        self.assertEqual(b.classify_methods(b"export { POST } from './writer';"), [])
        self.assertEqual(b.classify_methods(b"export default function handler(){}"), [])

    def test_binary_method_source_fails(self):
        with self.assertRaisesRegex(ValueError, "UTF8"):
            b.classify_methods(b"\xff")

    def test_source_commit_is_exact_sha_not_branch(self):
        calls = []
        def fake_git(_repo, *args):
            calls.append(args)
            if args[:1] == ("rev-parse",):
                return b"0" * 40 + b"\n"
            self.fail("unexpected git call")
        with patch.object(b, "git", side_effect=fake_git):
            with self.assertRaisesRegex(ValueError, "CANDIDATE_COMMIT_DRIFT"):
                b.source_blobs(Path("."))
        self.assertEqual(calls[0], ("rev-parse", b.WEBSITE + "^{commit}"))

    def test_source_blob_mismatch_holds_before_read(self):
        def fake_git(_repo, *args):
            if args == ("rev-parse", b.WEBSITE + "^{commit}"):
                return b.WEBSITE.encode() + b"\n"
            if args[:1] == ("rev-parse",):
                return b"1" * 40 + b"\n"
            self.fail("attempt to read unpinned blob")
        with patch.object(b, "git", side_effect=fake_git):
            with self.assertRaisesRegex(ValueError, "CRITICAL_BLOB_DRIFT"):
                b.source_blobs(Path("."))

    def test_source_conditions_never_claim_host_isolation(self):
        # The analyzer reports only source hooks and always requires host proof.
        self.assertEqual(b.WEBSITE, "0cee3c836c4b0760478280c145e02e81e470ce0e")
        self.assertIn("lib/wargraph/runtime.ts", b.BLOBS)
        self.assertIn("lib/prisma.ts", b.BLOBS)
        self.assertIn("app/api/challenges/reconcile/route.ts", b.BLOBS)
        self.assertNotIn("release_authorized", b.source_conditions.__annotations__)

    def test_fail_closed_if_core_runtime_disabled_source_token_missing(self):
        files = {p: b"" for p in b.BLOBS}
        # No source flags are inferred from a plausible file name.
        source = b.source_conditions(files)
        self.assertFalse(source["wargraph_launch_explicit_disable_supported"])
        self.assertFalse(source["db_preview_transaction_read_only_flag_supported"])

    def test_no_runtime_file_access_or_security_state_changes(self):
        import inspect
        raw = inspect.getsource(b)
        self.assertNotIn("subprocess.run(['systemctl',", raw)
        self.assertNotIn("pg_dump", raw)
        self.assertNotIn("mkdir(", raw)
        self.assertNotIn("os.chmod(", raw)


if __name__ == "__main__":
    unittest.main()
