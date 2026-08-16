import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

import {
  getPreviewIdentity,
} from "../lib/previewDataSource.ts";

const root =
  process.cwd();

function source(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("preview identity exists only in development preview mode", () => {
  const oldNodeEnv =
    process.env.NODE_ENV;

  const oldBase =
    process.env
      .AOE2WAR_PREVIEW_DATA_BASE;

  const oldName =
    process.env
      .AOE2WAR_PREVIEW_USER_NAME;

  try {
    process.env.NODE_ENV =
      "development";

    process.env
      .AOE2WAR_PREVIEW_DATA_BASE =
      "https://aoe2war.com";

    process.env
      .AOE2WAR_PREVIEW_USER_NAME =
      "Emaren";

    assert.deepEqual(
      getPreviewIdentity(),
      {
        uid: "preview:emaren",
        name: "Emaren",
      },
    );

    process.env.NODE_ENV =
      "production";

    assert.equal(
      getPreviewIdentity(),
      null,
    );
  } finally {
    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        oldNodeEnv;
    }

    if (oldBase === undefined) {
      delete process.env
        .AOE2WAR_PREVIEW_DATA_BASE;
    } else {
      process.env
        .AOE2WAR_PREVIEW_DATA_BASE =
        oldBase;
    }

    if (oldName === undefined) {
      delete process.env
        .AOE2WAR_PREVIEW_USER_NAME;
    } else {
      process.env
        .AOE2WAR_PREVIEW_USER_NAME =
        oldName;
    }
  }
});

test("preview auth avoids Steam/database mutation paths", () => {
  const session =
    source(
      "app/api/auth/session/route.ts",
    );

  const locate =
    source(
      "app/api/lobby/leaderboard/locate/route.ts",
    );

  const preferences =
    source(
      "app/api/user/leaderboard-preferences/route.ts",
    );

  const auth =
    source(
      "context/UserAuthContext.tsx",
    );

  assert.match(
    session,
    /getPreviewIdentity/,
  );

  assert.match(
    locate,
    /previewIdentity/,
  );

  assert.match(
    preferences,
    /preview:\s*true/,
  );

  assert.match(
    auth,
    /uid\.startsWith\(\s*"preview:"/,
  );
});
