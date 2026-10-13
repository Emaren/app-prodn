import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");
const root = path.resolve(import.meta.dirname, "..");

const visualPaths = [
  "/kingdom-forge/construction.jpg",
  "/kingdom-forge/battle-cam.jpg",
  "/kingdom-forge/academy-intelligence.jpg",
  "/kingdom-forge/council-chamber.jpg",
  "/kingdom-forge/forge-vision.jpg",
  "/kingdom-forge/round-chamber.jpg",
  "/kingdom-forge/tournament-engine.jpg",
  "/market/agora-marketplace.webp",
] as const;

test("visual estates are allowed by the actual Next image optimizer config", () => {
  const patterns = nextConfig.images.localPatterns.map((item: { pathname: string }) => item.pathname);
  for (const src of visualPaths) {
    assert.ok(
      patterns.some((pattern: string) => {
        if (pattern.endsWith("/**")) return src.startsWith(pattern.slice(0, -3) + "/");
        return src === pattern;
      }),
      `next/image localPatterns rejects ${src}; the browser would show broken artwork`,
    );
  }
  assert.ok(!patterns.includes("/**"), "do not fix image permissions by allowing every local route");
});

test("all Marketplace and Kingdom Forge referenced hero/project images are real tracked bytes", () => {
  for (const src of visualPaths) {
    const fullPath = path.join(root, "public", src.slice(1));
    const data = fs.readFileSync(fullPath);
    assert.ok(data.length > 10_000, `missing or suspiciously empty artwork: ${src}`);
    if (src.endsWith(".jpg")) {
      assert.equal(data.subarray(0, 3).toString("hex"), "ffd8ff", `invalid JPEG image: ${src}`);
    } else {
      assert.equal(data.subarray(0, 4).toString(), "RIFF", `invalid WebP RIFF container: ${src}`);
      assert.equal(data.subarray(8, 12).toString(), "WEBP", `invalid WebP bytes: ${src}`);
    }
  }
});

test("Next advertises cache headers for static Forge and Marketplace art", async () => {
  const headers = await nextConfig.headers();
  for (const prefix of ["market", "kingdom-forge"]) {
    const item = headers.find((rule: { source: string }) => rule.source.startsWith(`/${prefix}/`));
    assert.ok(item, `missing cache rule for /${prefix}`);
    assert.ok(item.headers.some((header: { key: string }) => header.key === "Cache-Control"));
  }
});
