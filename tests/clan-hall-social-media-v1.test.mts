import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("Clan Hall composer accepts bounded rich media through picker paste and drag drop", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  for (const mime of [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
  ]) {
    assert.ok(client.includes(`"${mime}"`));
  }

  assert.match(client, /MAX_CLAN_MEDIA_FILES = 4/);
  assert.match(client, /MAX_CLAN_MEDIA_TOTAL_BYTES = 32_000_000/);
  assert.match(client, /onPaste=\{handleComposerPaste\}/);
  assert.match(client, /onDrop=\{handleComposerDrop\}/);
  assert.match(client, /multiple/);
  assert.match(client, /formData\.append\("attachments", file\)/);
  assert.match(client, /<Paperclip/);
});

test("Clan Hall persists attachments in a dedicated child model and namespaced proven storage root", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("app/api/clans/[slug]/route.ts");
  const storage = read("lib/clanMessageAttachments.ts");
  const directStorage = read("lib/directMessageAttachments.ts");
  const migration = read(
    "prisma/migrations/20260822153500_add_clan_message_attachments/migration.sql",
  );

  assert.match(schema, /model ClanMessageAttachment/);
  assert.match(schema, /attachments ClanMessageAttachment\[\]/);
  assert.match(migration, /CREATE TABLE "clan_message_attachments"/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(route, /request\.formData\(\)/);
  assert.match(route, /persistClanMessageAttachmentFiles/);
  assert.match(storage, /namespace: "clan-hall"/);
  assert.match(storage, /CLAN_MEDIA_MIN_FREE_AFTER_WRITE_BYTES = 4 \* 1024 \* 1024 \* 1024/);
  assert.match(storage, /assertClanMediaStorageHeadroom/);
  assert.match(directStorage, /input\.namespace === "clan-hall"/);
});

test("Clan Hall media reads re-prove audience access and support seekable audio video", () => {
  const route = read(
    "app/api/clans/[slug]/attachments/[attachmentId]/route.ts",
  );

  assert.match(route, /chatAudiencePolicy/);
  assert.match(route, /clanMember\.findUnique/);
  assert.match(route, /canReadAudience\(policy/);
  assert.match(route, /canReadAudience\(messageAudience/);
  assert.match(route, /status: 206/);
  assert.match(route, /Content-Range/);
  assert.match(route, /Accept-Ranges/);
  assert.match(route, /private, no-store, max-age=0/);
});

test("Clan Hall messages render safe links media and privacy-enhanced YouTube embeds", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(client, /rel="noopener noreferrer nofollow ugc"/);
  assert.match(client, /ClanMessageMedia/);
  assert.match(client, /<video/);
  assert.match(client, /<audio/);
  assert.match(client, /youtube-nocookie\.com\/embed/);
  assert.match(client, /allowFullScreen/);
});

test("Wanna Bet is visible but has no live Wolo mutation path in Social V1", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(client, /<Coins/);
  assert.match(client, /Wanna Bet/);
  assert.match(client, /clan-message-tools__row--future/);
  assert.match(client, /title="Wanna Bet · coming soon"/);
});


test("browser-origin GIFs preserve animation by importing the remote source instead of a static drag snapshot", () => {
  const client = read("components/clans/ClanHallClient.tsx");
  const route = read("app/api/clans/[slug]/route.ts");
  const remote = read("lib/clanRemoteMedia.ts");

  assert.match(client, /remoteImageUrlFromTransfer/);
  assert.match(client, /getData\("text\/html"\)/);
  assert.match(client, /remoteGifUrlLooksAnimated/);
  assert.match(client, /formData\.append\("remoteMediaUrls", url\)/);
  assert.match(route, /importRemoteClanImageFiles/);
  assert.match(route, /remoteMediaUrls/);
  assert.match(remote, /GIF87a/);
  assert.match(remote, /GIF89a/);
  assert.match(remote, /Remote Hall media must use HTTPS/);
  assert.match(remote, /Remote Hall media host is not public/);
  assert.match(remote, /redirect: "manual"/);
  assert.match(remote, /MAX_REMOTE_IMAGE_BYTES = 10_000_000/);
});
