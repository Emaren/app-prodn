import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicPlayerSearchIndex,
  matchesPublicPlayerSearch,
  matchesPublicPlayerSearchTerms,
} from "../lib/publicPlayerSearch.ts";

test("standalone historical aliases remain substring searchable", () => {
  const identity = {
    name: "Zodiac",
    aliases: [
      "[Thee]Zodiac",
      "TheZodiac",
    ],
  };

  assert.equal(
    matchesPublicPlayerSearch(identity, "Thee"),
    true,
  );

  assert.equal(
    matchesPublicPlayerSearch(identity, "Zodiac"),
    true,
  );
});

test("historical composite aliases do not leak component names into another account", () => {
  const brian = {
    name: "Brian_de_Bois",
    aliases: [
      "Brian_de_Bois",
      "mYsTikaL_TrUnKs",
      "Zodiac, Brian_de_Bois",
    ],
  };

  assert.equal(
    matchesPublicPlayerSearch(brian, "Zodiac"),
    false,
  );

  assert.equal(
    matchesPublicPlayerSearch(brian, "Brian"),
    true,
  );

  assert.equal(
    matchesPublicPlayerSearch(
      brian,
      "Zodiac, Brian_de_Bois",
    ),
    true,
  );
});

test("a composite current canonical name is exact-only and never leaks components", () => {
  const identity = {
    name: "[Thee]Zodiac, 20geraudm",
    inGameName: null,
    steamPersonaName: null,
    aliases: ["[Thee]Zodiac, 20geraudm"],
  };

  assert.equal(matchesPublicPlayerSearch(identity, "Zodiac"), false);
  assert.equal(matchesPublicPlayerSearch(identity, "20geraudm"), false);
  assert.equal(
    matchesPublicPlayerSearch(identity, "[Thee]Zodiac, 20geraudm"),
    true,
  );
});

test("pair-focused KKR semantics match either named player while preserving composite isolation", () => {
  const zodiac = {
    name: "Zodiac",
    aliases: [
      "[Thee]Zodiac",
    ],
  };

  const somniosator = {
    name: "somniosator",
    aliases: [
      "somniosator",
    ],
  };

  const brian = {
    name: "Brian_de_Bois",
    aliases: [
      "Zodiac, Brian_de_Bois",
    ],
  };

  const terms = [
    "zodiac",
    "somniosator",
  ];

  assert.equal(
    matchesPublicPlayerSearchTerms(
      zodiac,
      terms,
    ),
    true,
  );

  assert.equal(
    matchesPublicPlayerSearchTerms(
      somniosator,
      terms,
    ),
    true,
  );

  assert.equal(
    matchesPublicPlayerSearchTerms(
      brian,
      terms,
    ),
    false,
  );
});

test("search index preserves historical composites as exact-only evidence", () => {
  const index =
    buildPublicPlayerSearchIndex({
      name: "Brian_de_Bois",
      aliases: [
        "Brian_de_Bois",
        "Zodiac, Brian_de_Bois",
      ],
    });

  assert.equal(
    index.substringKeys.has(
      "brian_de_bois",
    ),
    true,
  );

  assert.equal(
    index.substringKeys.has(
      "zodiac, brian_de_bois",
    ),
    false,
  );

  assert.equal(
    index.exactHistoricalCompositeKeys.has(
      "zodiac, brian_de_bois",
    ),
    true,
  );
});
