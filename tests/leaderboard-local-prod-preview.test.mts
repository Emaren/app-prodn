import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

import {
  buildPreviewDataUrl,
  getPreviewDataOrigin,
} from "../lib/previewDataSource.ts";

const root =
  process.cwd();

function source(
  path: string,
) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("preview source is development-only and allow-listed", () => {
  const oldNodeEnv =
    process.env.NODE_ENV;

  const oldPreview =
    process.env
      .AOE2WAR_PREVIEW_DATA_BASE;

  try {
    process.env.NODE_ENV =
      "development";

    process.env
      .AOE2WAR_PREVIEW_DATA_BASE =
      "https://aoe2war.com";

    assert.equal(
      getPreviewDataOrigin(),
      "https://aoe2war.com",
    );

    const url =
      buildPreviewDataUrl(
        "/api/lobby/leaderboard",
        new URLSearchParams({
          lane: "rm",
          limit: "3",
        }),
      );

    assert.equal(
      url?.toString(),
      "https://aoe2war.com/api/lobby/leaderboard?lane=rm&limit=3",
    );

    process.env.NODE_ENV =
      "production";

    assert.equal(
      getPreviewDataOrigin(),
      null,
    );
  } finally {
    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        oldNodeEnv;
    }

    if (oldPreview === undefined) {
      delete process.env
        .AOE2WAR_PREVIEW_DATA_BASE;
    } else {
      process.env
        .AOE2WAR_PREVIEW_DATA_BASE =
        oldPreview;
    }
  }
});

test("preview source refuses arbitrary origins", () => {
  const oldNodeEnv =
    process.env.NODE_ENV;

  const oldPreview =
    process.env
      .AOE2WAR_PREVIEW_DATA_BASE;

  try {
    process.env.NODE_ENV =
      "development";

    process.env
      .AOE2WAR_PREVIEW_DATA_BASE =
      "https://example.com";

    assert.throws(
      () =>
        getPreviewDataOrigin(),
      /may only use https:\/\/aoe2war\.com/,
    );
  } finally {
    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        oldNodeEnv;
    }

    if (oldPreview === undefined) {
      delete process.env
        .AOE2WAR_PREVIEW_DATA_BASE;
    } else {
      process.env
        .AOE2WAR_PREVIEW_DATA_BASE =
        oldPreview;
    }
  }
});

test("leaderboard preview replaces only GET read paths", () => {
  const page =
    source(
      "app/leaderboard/page.tsx",
    );

  const route =
    source(
      "app/api/lobby/leaderboard/route.ts",
    );

  const header =
    source(
      "app/api/header-summary/route.ts",
    );

  assert.match(
    page,
    /buildPreviewDataUrl/,
  );

  assert.match(
    route,
    /production-read-through/,
  );

  assert.match(
    header,
    /production-read-through/,
  );

  assert.doesNotMatch(
    route,
    /export async function POST/,
  );
});
