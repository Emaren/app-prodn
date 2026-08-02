import assert from "node:assert/strict";
import test from "node:test";

import {
  getLobbyMatchPlayedAtMs,
  pickLobbyMatchPlayedAt,
} from "../lib/lobbyMatchTime.ts";

test("lobby time prefers the absolute watcher file mtime", () => {
  const value = pickLobbyMatchPlayedAt({
    watcher_file_mtime: "2026-08-02T05:17:15.744Z",
    played_at: "2026-08-02T05:17:40.309033",
    played_at_is_absolute: false,
    created_at: "2026-08-02T05:17:41.878Z",
  });

  assert.equal(value, "2026-08-02T05:17:15.744Z");
});

test("lobby time rejects a naive source-local value instead of mislabeling it", () => {
  const value = pickLobbyMatchPlayedAt({
    played_at: "2026-08-01T22:37:20",
    played_at_is_absolute: false,
    created_at: "2026-08-02T05:17:41.878Z",
  });

  assert.equal(value, null);
  assert.equal(
    getLobbyMatchPlayedAtMs({
      played_at: "2026-08-01T22:37:20",
      played_at_is_absolute: false,
      created_at: "2026-08-02T05:17:41.878Z",
    }),
    0
  );
});

test("lobby time accepts an explicit UTC or offset-aware instant", () => {
  assert.equal(
    pickLobbyMatchPlayedAt({ played_at: "2026-08-02T05:21:00Z" }),
    "2026-08-02T05:21:00Z"
  );
  assert.equal(
    pickLobbyMatchPlayedAt({ played_on: "2026-08-01T23:21:00-06:00" }),
    "2026-08-01T23:21:00-06:00"
  );
});
