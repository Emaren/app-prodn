import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Prisma production preview defaults every connection read-only", () => {
  const prisma = source("lib/prisma.ts");

  assert.match(prisma, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(prisma, /default_transaction_read_only=on/);
  assert.match(prisma, /statement_timeout=20000/);
  assert.match(prisma, /lock_timeout=2000/);
});

test("preview identity can resolve the real production user UID", () => {
  const preview = source("lib/previewDataSource.ts");
  const session = source("lib/session.ts");

  assert.match(preview, /AOE2WAR_PREVIEW_USER_UID/);
  assert.match(session, /getPreviewIdentity/);
  assert.match(session, /return \{ uid: previewIdentity\.uid \}/);
});

test("launcher tunnels production DB and proves read-only before Next starts", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(launcher, /ExitOnForwardFailure=yes/);
  assert.match(launcher, /transaction_read_only/);
  assert.match(launcher, /default_transaction_read_only=on/);
  assert.match(launcher, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(launcher, /AOE2_BACKEND_UPSTREAM/);
  assert.match(launcher, /env\.pop\("INTERNAL_API_KEY"/);
  assert.match(launcher, /env\.pop\("ADMIN_TOKEN"/);
  assert.doesNotMatch(launcher, /write_text\(prod_database_url/);
});

test("missing local managed media falls through to public production", () => {
  const route = source(
    "app/uploads/managed-assets/[kind]/[file]/route.ts",
  );

  assert.match(route, /getPreviewDataOrigin/);
  assert.match(route, /production-managed-media/);
  assert.match(route, /cache: "no-store"/);
});

test("dev:prod is the read-only production parity launcher", () => {
  const pkg = JSON.parse(source("package.json")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    pkg.scripts?.["dev:prod"],
    "npm run kill-ports && npm run cert && python3 scripts/dev-prod-readonly.py",
  );
});

test("live production preview exposes an explicit non-production read-only mode", () => {
  const preview = source("lib/previewDataSource.ts");

  assert.match(
    preview,
    /isLiveProductionReadOnlyPreview/,
  );
  assert.match(
    preview,
    /AOE2WAR_PROD_DB_PREVIEW/,
  );
  assert.match(
    preview,
    /NODE_ENV === "production"/,
  );
});

test("Bounty Hall uses public production leaderboard truth in dev:prod", () => {
  const bounties = source("lib/bounties.ts");

  assert.match(
    bounties,
    /buildPreviewDataUrl/,
  );
  assert.match(
    bounties,
    /\/api\/lobby\/leaderboard/,
  );
  assert.match(
    bounties,
    /scope,[\s\S]*limit: "600"/,
  );
  assert.match(
    bounties,
    /loadBountyDirectory\(prisma\)/,
  );
  assert.match(
    bounties,
    /return loadPublicPlayerDirectory\([\s\S]*prisma/,
  );
});

test("dev:prod acknowledges local side effects without production writes", () => {
  const appearance = source("app/api/user/appearance/route.ts");
  const experience = source("app/api/user/experience/route.ts");
  const ping = source("app/api/user/ping/route.ts");
  const events = source("app/api/contact-emaren/events/route.ts");

  for (const route of [
    appearance,
    experience,
    ping,
    events,
  ]) {
    assert.match(
      route,
      /isLiveProductionReadOnlyPreview/,
    );
  }

  assert.match(
    appearance,
    /previewReadOnly: true/,
  );
  assert.match(
    experience,
    /eventId: null[\s\S]*previewReadOnly: true/,
  );
  assert.match(
    ping,
    /status: "ok"[\s\S]*previewReadOnly: true/,
  );
  assert.match(
    events,
    /!isLiveProductionReadOnlyPreview\(\)[\s\S]*conversationIds\.length > 0/,
  );
});

test("dev:prod raises only the local preview Node heap ceiling above the default 4 GiB", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(launcher, /--max-old-space-size=6144/);
  assert.match(launcher, /local preview Node heap ceiling = 6144 MiB/);
  assert.match(launcher, /if "--max-old-space-size" not in node_options/);
  assert.match(launcher, /env\["NODE_OPTIONS"\] = node_options/);
});

test("dev:prod reports signal exits without wrapping them into opaque shell status 250", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(launcher, /node_returncode = node\.wait\(\)/);
  assert.match(launcher, /if node_returncode < 0:/);
  assert.match(launcher, /Signals\(signal_number\)\.name/);
  assert.match(launcher, /return 128 \+ signal_number/);
  assert.match(launcher, /SIGABRT becomes 134/);
});

test("radio fire-and-forget presence never becomes an unhandled preview rejection", () => {
  const hook = source("hooks/useRadioWoloFeedback.ts");

  assert.match(
    hook,
    /return postFeedback\(\{[\s\S]*?listenerId,[\s\S]*?event,[\s\S]*?\}\)\.then\([\s\S]*?\)\.catch\([\s\S]*?=> undefined/,
  );
  assert.match(
    hook,
    /event: "off",[\s\S]*?\}\)\.catch\([\s\S]*?=> undefined/,
  );
});

test("dev:prod launcher remains compatible with the preview shell Python", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(launcher, /from typing import Optional/);
  assert.match(
    launcher,
    /def canonical_os_store_for_preview\(\) -> Optional\[Path\]:/,
  );
  assert.doesNotMatch(launcher, /-> Path \| None/);
});

test("local preview reads canonical AoE2WAR OS state without allowing OS mutations", () => {
  const launcher = source("scripts/dev-prod-readonly.py");
  const route = source("app/api/admin/aoe2war-os/route.ts");

  assert.match(launcher, /canonical_os_store_for_preview/);
  assert.match(launcher, /AOE2WAR_OS_STORE_DIR/);
  assert.match(launcher, /storage" \/ "aoe2war-os"/);

  assert.match(route, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(route, /Local production-data preview is read-only/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
});

test("dev:prod opens the page inferred from the active work lane", () => {
  const launcher = source("scripts/dev-prod-readonly.py");

  assert.match(
    launcher,
    /AOE2WAR_PREVIEW_PATH/,
  );

  assert.match(
    launcher,
    /infer_preview_path/,
  );

  assert.match(
    launcher,
    /git", "branch", "--show-current/,
  );

  assert.match(
    launcher,
    /Path\.cwd\(\) \/ "app"/,
  );

  assert.match(
    launcher,
    /preview_url/,
  );

  assert.doesNotMatch(
    launcher,
    /https:\/\/localhost:3000\/clans\/aoe2war/,
  );
});
