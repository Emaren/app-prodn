import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storage = fs.readFileSync("lib/profileDocuments.ts", "utf8");
const api = fs.readFileSync("app/api/profile-documents/route.ts", "utf8");
const itemApi = fs.readFileSync("app/api/profile-documents/[id]/route.ts", "utf8");
const vault = fs.readFileSync("components/profile/ProfileDocumentVault.tsx", "utf8");
const publicShelf = fs.readFileSync("components/players/PlayerProfileDocumentShelf.tsx", "utf8");
const profilePage = fs.readFileSync("app/profile/page.tsx", "utf8");
const playerPage = fs.readFileSync("components/players/PlayerProfilePage.tsx", "utf8");

test("profile documents are private and migration-free", () => {
  assert.match(storage, /PROFILE_DOCUMENT_REFERENCE_PREFIX = "profile-document:v1:"/);
  assert.match(storage, /managedMediaAsset\.create/);
  assert.match(storage, /MAX_PROFILE_DOCUMENT_BYTES = 25 \* 1024 \* 1024/);
  assert.match(api, /requestedUid !== gate\.user\.uid && !gate\.user\.isAdmin/);
  assert.match(itemApi, /ownerUid !== viewer\.uid && !viewer\.isAdmin/);
  assert.match(itemApi, /Cache-Control": "private, no-store/);
});

test("self profile has premium drag-drop War Archive in every profile mode", () => {
  assert.match(vault, /War Archive/);
  assert.match(vault, /onDrop=/);
  assert.match(vault, /Private to you and AoE2WAR admins/);
  assert.equal((profilePage.match(/<ProfileDocumentVault \/>/g) || []).length, 3);
});

test("claimed public player pages expose private admin-owner shelf across modes", () => {
  assert.match(publicShelf, /Owner \+ AoE2WAR admin access/);
  assert.equal((playerPage.match(/<PlayerProfileDocumentShelf uid=\{profile\.identity\.uid\} \/>/g) || []).length, 3);
});
