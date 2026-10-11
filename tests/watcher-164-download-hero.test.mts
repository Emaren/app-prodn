import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pagePath = new URL("../app/download/page.tsx", import.meta.url);

async function readImage(name: string, expectedWidth: number, expectedHeight: number) {
  const bytes = await readFile(new URL(`../public/watcher/${name}`, import.meta.url));
  assert.ok(bytes.length > 150_000 && bytes.length < 600_000, "optimized but substantial artwork");
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8 ");
  const sync = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 16);
  assert.ok(sync >= 0 && sync < 100, "VP8 frame size marker exists");
  const width = bytes.readUInt16LE(sync + 3) & 0x3fff;
  const height = bytes.readUInt16LE(sync + 5) & 0x3fff;
  assert.equal(width, expectedWidth);
  assert.equal(height, expectedHeight);
}

test("Watcher 1.6.4 desktop and portrait hero images exist with correct aspect ratio", async () => {
  await readImage("watcher-v164-desktop.webp", 1672, 941);
  await readImage("watcher-v164-mobile.webp", 1024, 1536);
});

test("versioned image replaces old 1.5.10 hero without changing binary download authority", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /srcSet="\/watcher\/watcher-v164-mobile\.webp"/);
  assert.match(page, /src="\/watcher\/watcher-v164-desktop\.webp"/);
  assert.match(page, /media="\(max-width: 767px\)"/);
  assert.match(page, /width="1024"\s+height="1536"/);
  assert.match(page, /width="1672"\s+height="941"/);
  assert.doesNotMatch(page, /watcher-v1510-(?:mobile|desktop)\.png/);
  assert.match(page, /Download it\. Pair once\. Stay ready\./);
  assert.equal((page.match(/href=\{primaryArtifact\.trackedHref\}/g) || []).length, 3);
  assert.equal((page.match(/href="\/profile\?watcher_pair=1"/g) || []).length, 3);
});

test("real transparent hotspots line up with new desktop and mobile CTA artwork", async () => {
  const page = await readFile(pagePath, "utf8");
  const region = page.split("Artwork interactive regions.")[1]?.split("</section>")[0] || "";
  const ids = [
    "windows-installer",
    "profile-pairing",
    "mobile-windows-installer",
    "mobile-profile-pairing",
  ];
  for (const id of ids) {
    assert.match(region, new RegExp(`data-watcher-hero-hotspot="${id}"`));
  }
  assert.match(region, /left-\[2\.1%\] top-\[35\.45%\]/);
  assert.match(region, /left-\[21\.55%\] top-\[35\.45%\]/);
  assert.match(region, /left-\[4\.1%\] top-\[41\.15%\]/);
  assert.match(region, /left-\[4\.1%\] top-\[46\.1%\]/);
  assert.equal((region.match(/aria-label="Download Windows Installer"/g) || []).length, 2);
  assert.equal((region.match(/aria-label="Open Profile Pairing"/g) || []).length, 2);
  assert.match(region, /focus-visible:ring-amber-300/);
  assert.match(region, /md:hidden/);
  assert.match(region, /md:block/);
});
