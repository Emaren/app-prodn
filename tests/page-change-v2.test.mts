import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notices = fs.readFileSync("lib/pageChangeNotices.ts", "utf8");
const manifest = fs.readFileSync("lib/pageChangeManifest.generated.ts", "utf8");
const server = fs.readFileSync("lib/pageChangeServer.ts", "utf8");
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const adminTypes = fs.readFileSync("components/admin/command-tower/types.ts", "utf8");
const adminCard = fs.readFileSync("components/admin/command-tower/AdminUserCard.tsx", "utf8");
const adminUsers = fs.readFileSync("app/api/admin/users/route.ts", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");

const hrefs = [
  "/kingdom", "/oracle", "/leaderboard", "/champions", "/national-champions",
  "/clans", "/academy", "/market", "/ai", "/bounties", "/forum", "/radio",
  "/workshop", "/game-stats", "/traffic", "/kingdom-forge", "/round-chamber",
  "/statistics", "/speed", "/kingdom-intelligence",
];

test("all 20 Kingdom-menu pages have generated source editions", () => {
  for (const href of hrefs) assert.ok(manifest.includes(`href: "${href}"`));
  assert.equal((manifest.match(/href: "\//g) ?? []).length, 20);
  assert.match(manifest, /version: "src-[a-f0-9]{20}"/);
  assert.match(notices, /PAGE_CHANGE_MANIFEST/);
});

test("gray-dot authority is durable per user with anonymous localStorage fallback", () => {
  assert.match(schema, /model PageChangeRevision/);
  assert.match(schema, /model UserPageChangeSeen/);
  assert.match(schema, /@@unique\(\[userId, href\]/);
  assert.match(server, /userPageChangeSeen/);
  assert.match(server, /sourceVersion !== revision\.sourceVersion/);
  assert.match(server, /contentRevision !== revision\.contentRevision/);
  assert.match(shell, /fetch\("\/api\/page-change-notices"/);
  assert.match(shell, /PAGE_CHANGE_NOTICE_STORAGE_KEY/);
});

test("visiting a changed page clears only that current page edition", () => {
  assert.match(shell, /pageChangeNoticeForPathname/);
  assert.match(shell, /method: "POST"/);
  assert.match(shell, /href: visitedNotice\.href/);
  assert.match(server, /markUserPageChangeSeen/);
});

test("the existing tiny castle and menu gray-dot visuals remain exact", () => {
  assert.match(shell, /ml-\[5px\] -mt-\[8px\] h-\[4px\] w-\[4px\] rounded-full bg-slate-300\/85/);
  assert.match(shell, /absolute right-3 top-3 h-2 w-2 rounded-full bg-slate-400\/75/);
});

test("release source changes are automatic and semantic content has a revision rail", () => {
  assert.match(server, /syncPageChangeReleaseManifest/);
  assert.match(server, /Release source changed/);
  assert.match(server, /bumpPageChangeContentRevision/);
  assert.match(fs.readFileSync("app/api/page-change-notices/content/route.ts", "utf8"), /bumpPageChangeContentRevision/);
  assert.match(packageJson, /generate_page_change_manifest\.py/);
});

test("Command Tower receives unseen count, destinations, and clear history per user", () => {
  assert.match(adminTypes, /pageChangeState: PageChangeAdminState/);
  assert.match(adminUsers, /loadAdminPageChangeStateMap/);
  assert.match(adminUsers, /pageChangeState:/);
  assert.match(adminCard, /Gray-dot sightline/);
  assert.match(adminCard, /Unseen now/);
  assert.match(adminCard, /Recently cleared/);
});
