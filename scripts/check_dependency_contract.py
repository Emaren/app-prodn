#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RUNTIME_PREFIXES = (
    "app/",
    "components/",
    "lib/",
)

RUNTIME_EXACT = {
    "server.js",
    "middleware.ts",
    "middleware.js",
}

SOURCE_SUFFIXES = {
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
}

FRAMEWORK_VIRTUALS = {
    "server-only",
    "client-only",
}


def package_root(
    specifier: str,
) -> str | None:
    if (
        not specifier
        or specifier.startswith(".")
        or specifier.startswith("/")
        or specifier.startswith("@/")
        or specifier.startswith("node:")
    ):
        return None

    if specifier.startswith("@"):
        pieces = specifier.split("/")

        if len(pieces) >= 2:
            return "/".join(
                pieces[:2]
            )

        return specifier

    return specifier.split(
        "/",
        1,
    )[0]


def builtin_modules() -> set[str]:
    result = subprocess.run(
        [
            "node",
            "-e",
            (
                "process.stdout.write("
                "JSON.stringify("
                "require('node:module').builtinModules"
                "))"
            ),
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "cannot resolve Node builtin module list: "
            + result.stderr[-2000:]
        )

    return set(
        json.loads(
            result.stdout
        )
    )


def tracked_runtime_sources() -> list[Path]:
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "-z",
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        check=True,
    )

    files: list[Path] = []

    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue

        rel = raw.decode(
            "utf-8",
            "surrogateescape",
        )

        selected = (
            rel in RUNTIME_EXACT
            or rel.startswith(
                RUNTIME_PREFIXES
            )
        )

        if not selected:
            continue

        file = ROOT / rel

        if (
            file.is_file()
            and file.suffix.lower()
            in SOURCE_SUFFIXES
            and not file.name.endswith(
                ".d.ts"
            )
        ):
            files.append(file)

    return sorted(files)


def scan_module_specifiers(
    files: list[Path],
) -> dict[str, set[str]]:
    if not files:
        return {}

    program = r'''
const fs = require("node:fs");
const ts = require("typescript");

const payload = JSON.parse(
  fs.readFileSync(0, "utf8")
);

const result = {};

function add(file, specifier) {
  if (
    typeof specifier !== "string" ||
    specifier.length === 0
  ) {
    return;
  }

  if (!result[specifier]) {
    result[specifier] = [];
  }

  if (!result[specifier].includes(file)) {
    result[specifier].push(file);
  }
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }

  if (file.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }

  if (
    file.endsWith(".js") ||
    file.endsWith(".mjs") ||
    file.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

for (const file of payload.files) {
  const text = fs.readFileSync(
    file,
    "utf8"
  );

  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file)
  );

  function visit(node) {
    if (
      (
        ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node)
      ) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(
        node.moduleSpecifier
      )
    ) {
      add(
        file,
        node.moduleSpecifier.text
      );
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(
        node.moduleReference
      ) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(
        node.moduleReference.expression
      )
    ) {
      add(
        file,
        node.moduleReference.expression.text
      );
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(
        node.arguments[0]
      )
    ) {
      const expression = node.expression;

      const requireCall =
        ts.isIdentifier(expression) &&
        expression.text === "require";

      const dynamicImport =
        expression.kind ===
        ts.SyntaxKind.ImportKeyword;

      const requireResolve =
        ts.isPropertyAccessExpression(
          expression
        ) &&
        ts.isIdentifier(
          expression.expression
        ) &&
        expression.expression.text ===
          "require" &&
        expression.name.text ===
          "resolve";

      if (
        requireCall ||
        dynamicImport ||
        requireResolve
      ) {
        add(
          file,
          node.arguments[0].text
        );
      }
    }

    ts.forEachChild(
      node,
      visit
    );
  }

  visit(source);
}

process.stdout.write(
  JSON.stringify(result)
);
'''

    payload = {
        "files": [
            str(file)
            for file in files
        ],
    }

    result = subprocess.run(
        [
            "node",
            "-e",
            program,
        ],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "TypeScript dependency AST scan failed: "
            + result.stderr[-4000:]
        )

    raw = json.loads(
        result.stdout
    )

    return {
        str(specifier): {
            str(file)
            for file in file_list
        }
        for specifier, file_list
        in raw.items()
    }


def main() -> int:
    package_json = json.loads(
        (
            ROOT
            / "package.json"
        ).read_text()
    )

    declared = set(
        (
            package_json.get(
                "dependencies"
            )
            or {}
        ).keys()
    )

    builtins = builtin_modules()

    imports: dict[
        str,
        set[str],
    ] = {}

    scanned = scan_module_specifiers(
        tracked_runtime_sources()
    )

    for specifier, files in scanned.items():
        package = package_root(
            specifier
        )

        if package is None:
            continue

        if (
            package in builtins
            or package
            in FRAMEWORK_VIRTUALS
        ):
            continue

        imports.setdefault(
            package,
            set(),
        ).update(files)

    missing = {
        package: sorted(files)
        for package, files
        in imports.items()
        if package not in declared
    }

    if missing:
        print(
            "DEPENDENCY CONTRACT: FAIL"
        )

        for package, files in sorted(
            missing.items()
        ):
            print(
                "undeclared runtime package: "
                + package
            )

            for file in files[:20]:
                print(
                    "  - "
                    + str(
                        Path(file).relative_to(
                            ROOT
                        )
                    )
                )

        return 1

    print(
        "DEPENDENCY CONTRACT: PASS · "
        f"{len(imports)} runtime package(s) "
        "are explicitly declared"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
