import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../app/workshop/page.tsx", import.meta.url),
  "utf8",
);

const centering = readFileSync(
  new URL(
    "../app/workshop/workshop-chronicle-gap-fill.css",
    import.meta.url,
  ),
  "utf8",
);

const publication = readFileSync(
  new URL(
    "../scripts/publish-workshop-2026-08-06-gap-fill.mts",
    import.meta.url,
  ),
  "utf8",
);

test("Basic alone centers the complete Chronicle heading block", () => {
  assert.match(page, /import "\.\/workshop-chronicle-gap-fill\.css"/);
  assert.match(
    centering,
    /main\[data-workshop-view="basic"\] #chronicle > div > header/,
  );
  assert.match(centering, /header > div:first-child/);
  assert.match(centering, /margin-inline: auto/);
  assert.match(centering, /justify-content: center/);
  assert.doesNotMatch(centering, /data-workshop-view="advanced"/);
  assert.doesNotMatch(centering, /data-workshop-view="extreme"/);
});

test("the Chronicle backfill covers August 1 through August 5", () => {
  const publicIds = publication.match(
    /publicId:\s*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g,
  );

  assert.equal(publicIds?.length, 12);

  for (const date of [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
  ]) {
    assert.match(publication, new RegExp(date));
  }

  assert.doesNotMatch(publication, /occurredAt:\s*"2026-07-31/);
  assert.doesNotMatch(publication, /occurredAt:\s*"2026-08-06/);
});

test("the missing Workshop history reflects the audited campaign", () => {
  for (const marker of [
    "Team endings become replay truth.",
    "Payout recovery follows the bettor's entitlement.",
    "Silent 1v1 endings become decidable.",
    "The source of truth is fully re-audited.",
    "The homepage learns sixteen languages.",
    "Bounty Hall is rebuilt on verified payout truth.",
    "The War Engine opens a reconstruction queue.",
    "Accepted adjudications enter public replay truth.",
    "Replay recovery becomes exact-hash and disconnect-aware.",
    "Automatic replay truth gains evidence fences.",
    "Betting Hall is rebuilt and wager rails harden.",
    "Watcher 1.5.7 ships.",
  ]) {
    assert.match(
      publication,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  for (const commit of [
    "9d8e586adae6a98557c5f5487070d5450baea110",
    "48a1f152d56968b5fefb45473e89c20bb97b381a",
    "ea28fcbe378bb37fb78f5347734fef8a4768f453",
    "e31876f01cbe9f7cba97e3ab76924076115397e4",
    "1a8fa8981eb23307fe1bbc7620c942fba6566a3b",
    "0db6fbfbd01c6f609ce42380cfcb16f78d08681e",
    "3714d265fcb48cdc393834c648c01e6b5943f924",
    "d2bbd84d3cc96e380b41f8c597265ead22ceb089",
    "7023e43af24fd7c9fbf5ff45f2a77b978814c712",
    "5ebca4add4991e72f5136cea9d372624d5effc18",
    "45f93f8f7b5e0c4180785ab4c16776239fc4936c",
    "fd7db8ba04bb155ac8d727af4bc97b2951a4ada2",
  ]) {
    assert.match(publication, new RegExp(commit));
  }
});

test("publication is idempotent and explicitly confirmed", () => {
  assert.match(
    publication,
    /PUBLISH-WORKSHOP-GAP-FILL-2026-08-06/,
  );
  assert.match(publication, /findUnique\(\{[\s\S]*publicId/);
  assert.match(publication, /publishedAt: existing\.publishedAt \?\? publishedAt/);
  assert.match(publication, /PASS: WORKSHOP AUGUST GAP FILLED/);
});
