import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const SCHEMA =
  "prisma/schema.prisma";

const MIGRATION =
  "prisma/migrations/20260824050000_add_wargraph_foundation/migration.sql";

test(
  "WarGraphPresence Prisma unique selectors exist in foundation SQL",
  async () => {
    const [
      schema,
      migration,
    ] =
      await Promise.all([
        readFile(
          SCHEMA,
          "utf8",
        ),
        readFile(
          MIGRATION,
          "utf8",
        ),
      ]);

    assert.match(
      schema,
      /model WarGraphPresence\s*\{[\s\S]*?membershipId\s+Int\s+@unique\(map:\s*"uq_war_graph_presences_membership"\)/,
    );

    assert.match(
      schema,
      /@@unique\(\[membershipId,\s*graphId\],\s*map:\s*"uq_war_graph_presences_member_graph"\)/,
    );

    assert.match(
      migration,
      /CONSTRAINT "uq_war_graph_presences_membership"\s+UNIQUE\s*\("membership_id"\)/,
    );

    assert.match(
      migration,
      /CONSTRAINT "uq_war_graph_presences_member_graph"\s+UNIQUE\s*\("membership_id",\s*"graph_id"\)/,
    );
  },
);
