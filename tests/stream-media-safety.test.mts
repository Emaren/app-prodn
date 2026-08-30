import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStreamMediaMimeType,
  normalizeStreamThumbnailUrl,
  streamMediaResponseHeaders,
} from "../lib/streamMedia.ts";

test("stream MIME normalization admits WebM codecs and rejects active content", () => {
  assert.equal(normalizeStreamMediaMimeType("video/webm; codecs=vp8,opus"), "video/webm;codecs=vp8,opus");
  assert.equal(normalizeStreamMediaMimeType("application/octet-stream"), "video/webm");
  assert.equal(normalizeStreamMediaMimeType("text/html"), null);
  assert.equal(normalizeStreamMediaMimeType("image/svg+xml"), null);
  assert.equal(normalizeStreamMediaMimeType("video/webm;codecs=javascript"), null);
});

test("stream thumbnails admit only bounded inert image sources", () => {
  assert.equal(
    normalizeStreamThumbnailUrl("data:image/jpeg;base64,YWJjZA=="),
    "data:image/jpeg;base64,YWJjZA==",
  );
  assert.equal(normalizeStreamThumbnailUrl("https://cdn.example.test/frame.jpg"), "https://cdn.example.test/frame.jpg");
  assert.equal(normalizeStreamThumbnailUrl("http://cdn.example.test/frame.jpg"), null);
  assert.equal(normalizeStreamThumbnailUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(normalizeStreamThumbnailUrl("javascript:alert(1)"), null);
});

test("stream responses are fixed WebM and cannot be content-sniffed", () => {
  assert.deepEqual(streamMediaResponseHeaders(123), {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "video/webm",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": "123",
  });
});
