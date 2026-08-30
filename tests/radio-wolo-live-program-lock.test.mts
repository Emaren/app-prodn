import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "components/admin/radio/RadioWoloBuilder.tsx",
  "utf8",
);

test(
  "Builder resolves the authoritative on-air program",
  () => {
    assert.match(
      source,
      /\/api\/admin\/radio\/station/,
    );

    assert.match(
      source,
      /selectedProgramIsOnAir/,
    );

    assert.match(
      source,
      /ON AIR — broadcast chain locked/,
    );
  },
);

test(
  "Builder duplicates a live program into a draft",
  () => {
    assert.match(
      source,
      /duplicateProgramToDraft/,
    );

    assert.match(
      source,
      /Duplicate to Draft/,
    );

    assert.match(
      source,
      /created\.id\}\/items/,
    );

    assert.match(
      source,
      /created as an editable draft/,
    );
  },
);

test(
  "live Builder mutations are visibly locked",
  () => {
    assert.match(
      source,
      /Duplicate the live program to a draft before adding audio/,
    );

    assert.match(
      source,
      /draggable=\{\s*!selectedProgramIsOnAir\s*\}/,
    );

    assert.match(
      source,
      /pointer-events-none opacity-60/,
    );

    assert.match(
      source,
      /!metadataDirty \|\|\s*selectedProgramIsOnAir/,
    );

    assert.match(
      source,
      /!chainDirty \|\|\s*selectedProgramIsOnAir/,
    );
  },
);

test(
  "station singleton survives concurrent first-read creation",
  () => {
    const stationRoute = fs.readFileSync(
      "app/api/admin/radio/station/route.ts",
      "utf8",
    );

    assert.match(
      stationRoute,
      /cause\.code ===\s*"P2002"/,
    );

    assert.match(
      stationRoute,
      /radioStationState\.findUnique/,
    );

    assert.match(
      stationRoute,
      /if \(!racedStation\) \{\s*throw cause;/,
    );
  },
);
