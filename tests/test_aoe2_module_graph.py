from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_module_graph.py"
SPEC = importlib.util.spec_from_file_location("aoe2_module_graph", MODULE)
assert SPEC and SPEC.loader
graph = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(graph)


def write(root: Path, path: str, source: str) -> None:
    location = root / path
    location.parent.mkdir(parents=True, exist_ok=True)
    location.write_text(source, encoding="utf-8")


class ModuleGraphTests(unittest.TestCase):
    def test_multiline_import_alias_relative_and_literal_calls(self):
        source = '''import type {
            Person,
            Group
        } from "@/lib/shared";
        export { thing } from "./other";
        const x = require("./literal");
        const y = import("@/lib/lazy");
        import "./Card.module.css";
        const nonliteral = import(variable);
        '''
        self.assertEqual(
            graph.extract_imports(source),
            {"@/lib/shared", "./other", "./literal", "@/lib/lazy",
             "./Card.module.css"},
        )

    def test_resolution_is_source_bound_and_cannot_traverse_outside_root(self):
        known = {"lib/a.ts", "components/widget/index.tsx", "lib/b.mts"}
        self.assertEqual(graph.resolve_import("lib/a.ts", "@/lib/a", known), "lib/a.ts")
        self.assertEqual(
            graph.resolve_import("components/view.tsx", "./widget", known),
            "components/widget/index.tsx",
        )
        self.assertEqual(graph.resolve_import("lib/a.ts", "./b", known), "lib/b.mts")
        self.assertIsNone(graph.resolve_import("lib/a.ts", "../../outside", known))
        self.assertIsNone(graph.resolve_import("lib/a.ts", "node:fs", known))
        self.assertIsNone(graph.resolve_import("lib/a.ts", "@/lib/missing", known))

    def test_cycle_and_server_only_client_reachability_are_distinct(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "components/Viewer.tsx",
                  '"use client";\nimport { a } from "@/lib/a";\n')
            write(root, "lib/a.ts", 'import { b } from "./b";\nexport const a = b;\n')
            write(root, "lib/b.ts", 'import { c } from "./c";\nexport const b = c;\n')
            write(root, "lib/c.ts",
                  'import "server-only";\nimport { a } from "./a";\nexport const c = a;\n')
            write(root, "lib/island.ts", 'import { remote } from "./unknown";\n')
            write(root, "lib/asset.ts", 'import "./panel.module.css";\n')
            first = graph.inspect(root)
            second = graph.inspect(root)
        self.assertEqual(first, second)
        self.assertEqual(first["module_count"], 6)
        self.assertEqual(first["resolved_edges"], 4)
        self.assertEqual(first["cycle_group_count"], 1)
        self.assertEqual(first["cycle_groups"], [["lib/a.ts", "lib/b.ts", "lib/c.ts"]])
        self.assertEqual(first["unresolved_local_count"], 1)
        self.assertEqual(first["unresolved_local_sample"], [
            {"importer": "lib/island.ts", "specifier": "./unknown"}
        ])
        self.assertEqual(first["client_entry_count"], 1)
        self.assertEqual(first["client_reachable_server_imports"], ["lib/c.ts"])
        self.assertEqual(first["most_imported"][0], {"path": "lib/a.ts", "count": 2})

    def test_type_only_lobby_ticker_cycle_is_not_a_runtime_cycle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "lib/lobby.ts",
                  'import type { LiveTickerSnapshot } from "@/lib/liveTicker";\n'
                  'export type LobbySnapshot = { ticker: LiveTickerSnapshot };\n')
            write(root, "lib/liveTicker.ts",
                  'import type { LobbyTournament, LobbyMatchRow } from "@/lib/lobby";\n'
                  'export type LiveTickerSnapshot = { tournament: LobbyTournament; '
                  'matches: LobbyMatchRow[] };\n')
            write(root, "components/Widget.tsx",
                  '"use client";\nimport type { LiveTickerSnapshot } '
                  'from "@/lib/liveTicker";\n')
            readout = graph.inspect(root)

        self.assertEqual(readout["resolved_edges"], 3)
        self.assertEqual(readout["resolved_runtime_edges"], 0)
        self.assertEqual(readout["resolved_type_only_edges"], 3)
        self.assertEqual(readout["cycle_group_count"], 0)
        self.assertEqual(readout["type_augmented_cycle_group_count"], 1)
        self.assertEqual(readout["type_augmented_cycle_groups"], [
            ["lib/liveTicker.ts", "lib/lobby.ts"]
        ])
        self.assertEqual(readout["client_reachable_server_imports"], [])

    def test_lexical_import_kinds_distinguish_types_from_values_and_side_effects(self):
        imports = graph.extract_import_references(
            'import type { A, B } from "./types";\n'
            'export type { C } from "./export";\n'
            'import { type X, type Y as Z } from "./named";\n'
            'export { type T } from "./reexport";\n'
            'import { type Q, usable } from "./mixed";\n'
            'export { live, type Another } from "./mixed-export";\n'
            'import Thing from "./value";\n'
            'import "./side-effect";\n'
            'const lazy = import("./lazy");\n'
            'const cjs = require("./cjs");\n'
        )
        self.assertEqual(dict(imports), {
            "./types": "type_only",
            "./export": "type_only",
            "./named": "type_only",
            "./reexport": "type_only",
            "./mixed": "runtime",
            "./mixed-export": "runtime",
            "./value": "runtime",
            "./side-effect": "runtime",
            "./lazy": "runtime",
            "./cjs": "runtime",
        })

    def test_type_only_edges_do_not_spuriously_reach_server_module(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "components/Widget.tsx",
                  '"use client";\nimport type { ServerShape } '
                  'from "@/lib/private";\n')
            write(root, "lib/private.ts",
                  'import "server-only";\nexport type ServerShape = { ok: true };\n')
            readout = graph.inspect(root)
            self.assertEqual(readout["server_only_import_count"], 1)
            self.assertEqual(readout["client_reachable_server_imports"], [])
            write(root, "components/Widget.tsx",
                  '"use client";\nimport { runtime } from "@/lib/private";\n')
            runtime_readout = graph.inspect(root)
            self.assertEqual(
                runtime_readout["client_reachable_server_imports"], ["lib/private.ts"]
            )

    def test_runtime_import_takes_precedence_over_type_only_of_same_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "lib/a.ts",
                  'import type { A } from "./b";\n'
                  'import { value } from "./b";\n')
            write(root, "lib/b.ts", "export const value = 1;\n")
            readout = graph.inspect(root)
        self.assertEqual(readout["resolved_edges"], 1)
        self.assertEqual(readout["resolved_runtime_edges"], 1)
        self.assertEqual(readout["resolved_type_only_edges"], 0)

    def test_empty_tree_and_independent_server_import_have_no_false_alarm(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(graph.inspect(root)["module_count"], 0)
            write(root, "app/api/test/route.ts", 'import "server-only";\n')
            write(root, "components/Card.tsx", '"use client";\n')
            census = graph.inspect(root)
        self.assertEqual(census["cycle_group_count"], 0)
        self.assertEqual(census["client_reachable_server_imports"], [])
        self.assertEqual(census["server_only_import_count"], 1)

    def test_symlinks_are_not_followed_and_observed_sources_remain_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "lib/auth.ts", "export const k = 1;\n")
            original = (root / "lib/auth.ts").read_bytes()
            (root / "lib/faux.ts").symlink_to(root / "lib/auth.ts")
            rows = graph.find_modules(root)
            self.assertEqual(list(rows), ["lib/auth.ts"])
            self.assertEqual((root / "lib/auth.ts").read_bytes(), original)

    def test_large_cycle_has_no_recursion_failure(self):
        modules = {
            f"lib/n{i}.ts": {f"lib/n{i + 1}.ts"} if i < 1199 else {"lib/n0.ts"}
            for i in range(1200)
        }
        groups = graph.strongly_connected(modules)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 1200)

    def test_client_directive_is_first_significant_statement(self):
        self.assertTrue(graph.client_directive('// comment\n\n"use client";\nimport "x";'))
        self.assertFalse(graph.client_directive('import "x";\n"use client";'))
        self.assertFalse(graph.client_directive('// no directive\n'))


if __name__ == "__main__":
    unittest.main()
