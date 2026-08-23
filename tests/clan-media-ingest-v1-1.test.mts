import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "components/clans/ClanHallClient.tsx",
  "utf8",
);
const attachments = readFileSync(
  "lib/clanMessageAttachments.ts",
  "utf8",
);
const remote = readFileSync(
  "lib/clanRemoteMedia.ts",
  "utf8",
);
const storage = readFileSync(
  "lib/directMessageAttachments.ts",
  "utf8",
);
const route = readFileSync(
  "app/api/clans/[slug]/route.ts",
  "utf8",
);

test("Hall media uses social-first ingest ceilings", () => {
  assert.match(client, /image: 96_000_000/);
  assert.match(client, /audio: 96_000_000/);
  assert.match(client, /video: 192_000_000/);
  assert.match(
    client,
    /MAX_CLAN_MEDIA_TOTAL_BYTES = 230_000_000/,
  );

  assert.match(attachments, /image: 96_000_000/);
  assert.match(attachments, /audio: 96_000_000/);
  assert.match(attachments, /video: 192_000_000/);
});

test("remote animation ingest is generous and bounded", () => {
  assert.match(
    remote,
    /MAX_REMOTE_IMAGE_BYTES = 96_000_000/,
  );
  assert.match(
    remote,
    /FETCH_TIMEOUT_MS = 15_000/,
  );
  assert.match(
    remote,
    /readResponseBufferBounded/,
  );
  assert.doesNotMatch(
    remote,
    /must be 10 MB or smaller/,
  );
  assert.doesNotMatch(
    remote,
    /await response\.arrayBuffer\(\)/,
  );
});

test("new chat attachments prefer mounted managed media while legacy root remains readable", () => {
  assert.match(
    storage,
    /MANAGED_MEDIA_UPLOAD_DIR/,
  );
  assert.match(
    storage,
    /aoe-managed-assets/,
  );
  assert.match(
    storage,
    /getAttachmentReadRootDirs/,
  );
  assert.match(
    storage,
    /DEFAULT_ATTACHMENT_DIR/,
  );
});

test("large GIFs may become animated WebP when storage savings are material", () => {
  assert.match(
    attachments,
    /CLAN_GIF_OPTIMIZE_THRESHOLD_BYTES = 12_000_000/,
  );
  assert.match(
    attachments,
    /animated: true/,
  );
  assert.match(
    attachments,
    /\.webp\(\{/,
  );
  assert.match(
    attachments,
    /output\.length < input\.length \* 0\.9/,
  );
});

test("Hall body ceiling remains below nginx 250m", () => {
  assert.match(
    route,
    /contentLength > 240_000_000/,
  );
});
