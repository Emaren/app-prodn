import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page =
  fs.readFileSync(
    "app/leaderboard/page.tsx",
    "utf8",
  );

const image =
  "public/social/aoe2war-leaderboard-social-v1.png";

test(
  "Leaderboard owns a dedicated large social preview",
  () => {
    assert.match(
      page,
      /AoE2WAR HD Leaderboard/,
    );

    assert.match(
      page,
      /https:\/\/aoe2war\.com\/leaderboard/,
    );

    assert.match(
      page,
      /\/social\/aoe2war-leaderboard-social-v1\.png/,
    );

    assert.match(
      page,
      /summary_large_image/,
    );

    assert.match(
      page,
      /width:\s*1731/,
    );

    assert.match(
      page,
      /height:\s*909/,
    );

    assert.ok(
      fs.existsSync(image),
      "Leaderboard social artwork must exist",
    );

    assert.ok(
      fs.statSync(image).size > 100_000,
      "Leaderboard social artwork must not be empty",
    );
  },
);
