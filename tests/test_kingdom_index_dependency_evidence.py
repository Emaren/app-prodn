"""Regression tests: dependency closure is an observation, not certification."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import kingdom_index_dependency_evidence as deps


class SourceClosureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, content):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return p

    def test_transitive_alias_import_changes_fingerprint(self):
        self.write("app/leaderboard/page.tsx", 'import View from "@/components/leaderboard/View"; export default View;')
        self.write("components/leaderboard/View.tsx", 'import { rank } from "@/lib/lobbyLeaderboard"; export default function V(){return rank}')
        lib = self.write("lib/lobbyLeaderboard.ts", 'export const rank=1')
        first = deps.route_evidence(self.root, "/leaderboard")
        self.assertIn("lib/lobbyLeaderboard.ts", first["files"])
        lib.write_text("export const rank=2")
        second = deps.route_evidence(self.root, "/leaderboard")
        self.assertNotEqual(first["source_closure"], second["source_closure"])
        self.assertFalse(second["dependency_completeness_certified"])

    def test_global_release_config_binds_every_route(self):
        self.write("app/about/page.tsx", "export default function P(){}")
        package = self.write("package.json", '{"dependencies":{"next":"15"}}')
        first = deps.route_evidence(self.root, "/about")
        self.assertIn("package.json", first["files"])
        package.write_text('{"dependencies":{"next":"16"}}')
        self.assertNotEqual(first["source_closure"], deps.route_evidence(self.root, "/about")["source_closure"])

    def test_literal_api_dependency_and_config(self):
        self.write("app/leaderboard/page.tsx", 'fetch("/api/lobby/leaderboard?lane=dm"); import "@/config/arena.json";')
        self.write("app/api/lobby/leaderboard/route.ts", 'import {x} from "@/lib/ranking"; export async function GET(){return x}')
        self.write("lib/ranking.ts", "export const x=1")
        self.write("config/arena.json", '{"mode":"rm"}')
        row = deps.route_evidence(self.root, "/leaderboard")
        self.assertIn("app/api/lobby/leaderboard/route.ts", row["referenced_api_routes"])
        self.assertIn("lib/ranking.ts", row["files"])
        self.assertIn("config/arena.json", row["files"])

    def test_unknown_imports_are_never_green(self):
        self.write("app/about/page.tsx", 'import "@/lib/missing"; const helper=import(name);')
        row = deps.route_evidence(self.root, "/about")
        self.assertEqual(row["status"], "LEXICAL_GAPS_REVIEW")
        self.assertTrue(row["unresolved_local_imports"])
        self.assertTrue(row["nonliteral_import_modules"])
        self.assertFalse(row["dependency_completeness_certified"])

    def test_nonliteral_and_invalid_paths_not_trusted(self):
        self.write("app/about/page.tsx", "export default function P(){}")
        for href in ("/../etc", "x", "/about?hack"):
            with self.subTest(href=href), self.assertRaises(ValueError):
                deps.route_evidence(self.root, href)

    def test_symlink_module_is_not_followed(self):
        self.write("app/about/page.tsx", 'import "@/lib/private";')
        outside = self.write("secrets/private.ts", "export const privateKey='no'")
        link = self.root / "lib/private.ts"
        link.parent.mkdir(parents=True)
        link.symlink_to(outside)
        row = deps.route_evidence(self.root, "/about")
        self.assertTrue(row["unresolved_local_imports"])
        self.assertNotIn("lib/private.ts", row["files"])

    def test_snapshot_is_never_financial_authority(self):
        self.write("app/about/page.tsx", "export default function P(){}")
        result = deps.snapshot(self.root, ["/about"])
        self.assertFalse(result["page_quality_certified"])
        self.assertFalse(result["financial_release_authorized"])
        self.assertFalse(result["git_exact_candidate_proven"])

    def test_excessive_source_refused(self):
        self.write("app/about/page.tsx", "x"*(deps.MAX_SOURCE_BYTES+1))
        with self.assertRaisesRegex(deps.DependencyEvidenceError, "bounded"):
            deps.route_evidence(self.root, "/about")


if __name__ == "__main__":
    unittest.main()
