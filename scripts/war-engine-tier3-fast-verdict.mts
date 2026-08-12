#!/usr/bin/env -S node --experimental-strip-types

import {
  readFile,
} from "node:fs/promises";

import {
  gunzipSync,
} from "node:zlib";

import {
  classifyWarEngineTier3Candidate,
} from "../lib/warEngineTier3.ts";

const paths =
  process.argv.slice(2);

if (
  paths.length === 0
) {
  console.error(
    "usage: node --experimental-strip-types scripts/war-engine-tier3-fast-verdict.mts <candidate.json.gz> [...]"
  );

  process.exit(2);
}

async function readCandidate(
  path: string
) {
  const raw =
    await readFile(path);

  const decoded =
    raw[0] === 0x1f &&
    raw[1] === 0x8b
      ? gunzipSync(raw)
      : raw;

  return JSON.parse(
    decoded.toString(
      "utf8"
    )
  ) as unknown;
}

for (
  const path
  of paths
) {
  const candidate =
    await readCandidate(
      path
    );

  console.log(
    JSON.stringify(
      {
        candidatePath:
          path,

        verdict:
          classifyWarEngineTier3Candidate(
            candidate
          ),
      },
      null,
      2
    )
  );
}
