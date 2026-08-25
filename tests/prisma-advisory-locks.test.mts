import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SOURCE_ROOTS = [
  "app",
  "lib",
];

const SOURCE_EXTENSIONS =
  new Set([
    ".ts",
    ".tsx",
    ".mts",
    ".js",
    ".mjs",
  ]);

async function sourceFiles(
  root: string
): Promise<string[]> {
  const entries =
    await readdir(
      root,
      {
        withFileTypes: true,
      }
    );

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath =
      path.join(
        root,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      if (
        entry.name ===
        "generated"
      ) {
        continue;
      }

      files.push(
        ...await sourceFiles(
          fullPath
        )
      );

      continue;
    }

    if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(
        path.extname(
          entry.name
        )
      )
    ) {
      files.push(
        fullPath
      );
    }
  }

  return files;
}

test(
  "advisory lock regression matcher recognizes every supported unsafe queryRaw form",
  () => {
    const examples = [
      "await tx.$queryRaw`SELECT pg_advisory_xact_lock(1)`;",
      "await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(1)`);",
      "await tx.$queryRaw<Array<{ ok: number }>>(Prisma.sql`SELECT pg_advisory_xact_lock(1)`);",
    ];

    const pattern =
      /\$queryRaw(?:<[\s\S]*?>)?\s*(?:\(\s*Prisma\.sql\s*)?`([\s\S]*?)`/g;

    for (const source of examples) {
      const matches =
        [...source.matchAll(
          new RegExp(
            pattern.source,
            "g"
          )
        )];

      assert.equal(
        matches.length,
        1,
        `Regression matcher failed to recognize: ${source}`
      );

      assert.match(
        matches[0]?.[1] ?? "",
        /\bSELECT\s+pg_advisory_xact_lock\s*\(/i
      );
    }
  }
);

test(
  "runtime advisory locks never deserialize PostgreSQL void through queryRaw",
  async () => {
    const unsafe:
      Array<{
        file: string;
        line: number;
        sql: string;
      }> = [];

    for (
      const root of
      SOURCE_ROOTS
    ) {
      for (
        const file of
        await sourceFiles(root)
      ) {
        const source =
          await readFile(
            file,
            "utf8"
          );

        const pattern =
          /\$queryRaw(?:<[\s\S]*?>)?\s*(?:\(\s*Prisma\.sql\s*)?`([\s\S]*?)`/g;

        for (
          const match of
          source.matchAll(pattern)
        ) {
          const sql =
            match[1] ?? "";

          if (
            !/\bSELECT\s+pg_advisory_xact_lock\s*\(/i.test(
              sql
            )
          ) {
            continue;
          }

          const offset =
            match.index ?? 0;

          unsafe.push({
            file,
            line:
              source
                .slice(
                  0,
                  offset
                )
                .split("\n")
                .length,
            sql:
              sql
                .trim()
                .replace(
                  /\s+/g,
                  " "
                ),
          });
        }
      }
    }

    assert.deepEqual(
      unsafe,
      [],
      `Direct void advisory locks must use $executeRaw: ${JSON.stringify(unsafe)}`
    );
  }
);
