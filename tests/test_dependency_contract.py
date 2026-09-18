import subprocess
import tempfile
import unittest
from pathlib import Path

import scripts.check_dependency_contract as deps


class DependencyContractTests(
    unittest.TestCase
):
    def test_package_roots(self):
        self.assertEqual(
            deps.package_root(
                "sharp"
            ),
            "sharp",
        )

        self.assertEqual(
            deps.package_root(
                "@prisma/client/runtime/library"
            ),
            "@prisma/client",
        )

        self.assertEqual(
            deps.package_root(
                "next/server"
            ),
            "next",
        )

        self.assertIsNone(
            deps.package_root(
                "@/lib/example"
            )
        )

        self.assertIsNone(
            deps.package_root(
                "./local"
            )
        )

        self.assertIsNone(
            deps.package_root(
                "node:fs"
            )
        )

    def test_runtime_source_inventory_includes_all_application_roots(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(
                ["git", "init", "-q", "-b", "main", str(root)],
                check=True,
            )
            fixtures = {
                "app/page.tsx": "export default function Page() { return null }\n",
                "components/Card.tsx": "export const Card = () => null\n",
                "lib/runtime.ts": "export const value = 1\n",
                "hooks/useThing.ts": "export const useThing = () => 1\n",
                "context/AuthContext.tsx": "export const AuthContext = null\n",
                "config/runtime.ts": "export const config = {}\n",
                "instrumentation.ts": "export function register() {}\n",
                "instrumentation.node.ts": "export const nodeOnly = true\n",
                "scripts/tool.ts": "export const tool = true\n",
                "tests/tool.test.ts": "export const test = true\n",
            }
            for rel, content in fixtures.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
            subprocess.run(
                ["git", "-C", str(root), "add", "."],
                check=True,
            )

            selected = {
                path.relative_to(root).as_posix()
                for path in deps.tracked_runtime_sources(root)
            }

            for rel in (
                "app/page.tsx",
                "components/Card.tsx",
                "lib/runtime.ts",
                "hooks/useThing.ts",
                "context/AuthContext.tsx",
                "config/runtime.ts",
                "instrumentation.ts",
                "instrumentation.node.ts",
            ):
                self.assertIn(rel, selected)

            self.assertNotIn("scripts/tool.ts", selected)
            self.assertNotIn("tests/tool.test.ts", selected)

    def test_ast_scanner_ignores_strings_comments_and_jsx(self):
        with tempfile.TemporaryDirectory() as temp:
            file = (
                Path(temp)
                / "sample.tsx"
            )

            file.write_text(
                '''
import sharp from "sharp";
import type {
  PrismaClient,
} from "@prisma/client";

const fake =
  "import 'totally-fake-package'";

const alsoFake =
  "from 'another-fake-package'";

// import "comment-fake-package";

export function Example() {
  return (
    <input
      value={"from not-a-package"}
      onChange={() => {}}
    />
  );
}

const fs = require("node:fs");

async function load() {
  return import("next/server");
}
'''
            )

            scanned = (
                deps.scan_module_specifiers(
                    [file]
                )
            )

            self.assertIn(
                "sharp",
                scanned,
            )

            self.assertIn(
                "@prisma/client",
                scanned,
            )

            self.assertIn(
                "node:fs",
                scanned,
            )

            self.assertIn(
                "next/server",
                scanned,
            )

            self.assertNotIn(
                "totally-fake-package",
                scanned,
            )

            self.assertNotIn(
                "another-fake-package",
                scanned,
            )

            self.assertNotIn(
                "comment-fake-package",
                scanned,
            )

            self.assertNotIn(
                "not-a-package",
                scanned,
            )


if __name__ == "__main__":
    unittest.main()
