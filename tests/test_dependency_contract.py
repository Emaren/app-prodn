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
