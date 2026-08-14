import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_CHANGE_NOTICES,
  getUnseenPageChangeHrefs,
  isPageChangeNoticeRoute,
  markPageChangeNoticeSeen,
  parseSeenPageChangeVersions,
} from "../lib/pageChangeNotices.ts";

test("a changed Kingdom page stays marked until that version is visited", () => {
  const chamberNotice = PAGE_CHANGE_NOTICES.find(
    (notice) => notice.href === "/round-chamber"
  );

  assert.ok(chamberNotice);

  const unseen = getUnseenPageChangeHrefs({});
  assert.ok(unseen.includes("/round-chamber"));

  const seen = markPageChangeNoticeSeen(
    {},
    chamberNotice.href,
    chamberNotice.version
  );

  assert.equal(
    getUnseenPageChangeHrefs(seen).includes("/round-chamber"),
    false
  );
});

test("route matching clears only the actual page family", () => {
  assert.equal(
    isPageChangeNoticeRoute("/round-chamber", "/round-chamber"),
    true
  );

  assert.equal(
    isPageChangeNoticeRoute("/round-chamber/archive", "/round-chamber"),
    true
  );

  assert.equal(
    isPageChangeNoticeRoute("/kingdom-forge", "/kingdom"),
    false
  );
});

test("corrupt or unrelated persisted page state is bounded safely", () => {
  assert.deepEqual(parseSeenPageChangeVersions("not-json"), {});

  assert.deepEqual(
    parseSeenPageChangeVersions(
      JSON.stringify({
        "/round-chamber": "2026-08-14-senate-v2",
        garbage: 7,
      })
    ),
    {
      "/round-chamber": "2026-08-14-senate-v2",
    }
  );
});
