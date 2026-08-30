import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  isRadioWoloOperatorUid,
  radioWoloOperatorUids,
} from "../lib/radioWoloOperatorPolicy.ts";

function read(path: string) {
  return readFileSync(
    new URL(`../${path}`, import.meta.url),
    "utf8",
  );
}

test(
  "Radio WOLO station domain is separate from creator submissions",
  () => {
    const schema =
      read("prisma/schema.prisma");

    assert.match(
      schema,
      /model RadioSubmission \{/,
    );

    assert.match(
      schema,
      /model RadioAsset \{/,
    );

    assert.match(
      schema,
      /model RadioProgram \{/,
    );

    assert.match(
      schema,
      /model RadioProgramItem \{/,
    );

    assert.match(
      schema,
      /model RadioStationState \{/,
    );

    assert.match(
      schema,
      /kind\s+String/,
    );

    assert.match(
      schema,
      /tags\s+String\[\]/,
    );
  },
);

test(
  "Radio WOLO station state is a singleton",
  () => {
    const migration =
      read(
        "prisma/migrations/20260830030000_add_radio_wolo_station_foundation/migration.sql",
      );

    assert.match(
      migration,
      /CHECK \("id" = 1\)/,
    );

    assert.match(
      migration,
      /INSERT INTO "radio_station_state"/,
    );

    assert.match(
      migration,
      /'off_air'/,
    );
  },
);

test(
  "Radio WOLO programming preserves deterministic ordering",
  () => {
    const migration =
      read(
        "prisma/migrations/20260830030000_add_radio_wolo_station_foundation/migration.sql",
      );

    assert.match(
      migration,
      /"position" INTEGER NOT NULL/,
    );

    assert.match(
      migration,
      /"uq_radio_program_items_program_position"/,
    );

    assert.match(
      migration,
      /CHECK \("position" >= 0\)/,
    );
  },
);

test(
  "Radio WOLO operator allowlist is explicit and closed",
  () => {
    const previous =
      process.env.RADIO_WOLO_OPERATOR_UIDS;

    try {
      process.env.RADIO_WOLO_OPERATOR_UIDS =
        "operator-a, operator-b";

      assert.deepEqual(
        [...radioWoloOperatorUids()],
        [
          "operator-a",
          "operator-b",
        ],
      );

      assert.equal(
        isRadioWoloOperatorUid(
          "operator-a",
        ),
        true,
      );

      assert.equal(
        isRadioWoloOperatorUid(
          "someone-else",
        ),
        false,
      );

      assert.equal(
        isRadioWoloOperatorUid(null),
        false,
      );
    } finally {
      if (previous === undefined) {
        delete process.env
          .RADIO_WOLO_OPERATOR_UIDS;
      } else {
        process.env
          .RADIO_WOLO_OPERATOR_UIDS =
          previous;
      }
    }
  },
);

test(
  "Radio WOLO media remains private application storage",
  () => {
    const radio =
      read("lib/radioWolo.ts");

    assert.match(
      radio,
      /aoe2-radio-wolo/,
    );

    assert.match(
      radio,
      /Invalid Radio WOLO storage key/,
    );
  },
);

test(
  "Radio WOLO normalizes open-ended kinds and tags",
  async () => {
    const {
      normalizeRadioAssetKind,
      normalizeRadioAssetTags,
      normalizeRadioAssetTitle,
      normalizeRadioDurationMs,
    } = await import(
      "../lib/radioWoloAssets.ts"
    );

    assert.equal(
      normalizeRadioAssetKind(
        " Wolomania Stinger! ",
      ),
      "wolomania-stinger",
    );

    assert.deepEqual(
      normalizeRadioAssetTags(
        [
          " Jim ",
          "battle night",
          "jim",
          " FUNNY ",
        ],
      ),
      [
        "jim",
        "battle night",
        "funny",
      ],
    );

    assert.equal(
      normalizeRadioAssetTitle(
        "",
        "Love_Gonna_Live_Here.mp3",
      ),
      "Love Gonna Live Here",
    );

    assert.equal(
      normalizeRadioDurationMs(
        "123456",
      ),
      123456,
    );

    assert.equal(
      normalizeRadioDurationMs(
        "-1",
      ),
      null,
    );
  },
);

test(
  "Radio WOLO byte range parsing supports radio seeking",
  async () => {
    const {
      parseRadioByteRange,
    } = await import(
      "../lib/radioWoloAssets.ts"
    );

    assert.deepEqual(
      parseRadioByteRange(
        "bytes=100-199",
        1000,
      ),
      {
        start: 100,
        end: 199,
        length: 100,
      },
    );

    assert.deepEqual(
      parseRadioByteRange(
        "bytes=900-",
        1000,
      ),
      {
        start: 900,
        end: 999,
        length: 100,
      },
    );

    assert.deepEqual(
      parseRadioByteRange(
        "bytes=-50",
        1000,
      ),
      {
        start: 950,
        end: 999,
        length: 50,
      },
    );

    assert.equal(
      parseRadioByteRange(
        "bytes=1000-",
        1000,
      ),
      "invalid",
    );

    assert.equal(
      parseRadioByteRange(
        "bytes=0-1,4-5",
        1000,
      ),
      "invalid",
    );
  },
);

test(
  "Radio WOLO Vault endpoints are operator-only and seekable",
  () => {
    const assets =
      read(
        "app/api/admin/radio/assets/route.ts",
      );

    const audio =
      read(
        "app/api/admin/radio/assets/[id]/audio/route.ts",
      );

    const shadow =
      read(
        "scripts/dev-shadow.py",
      );

    assert.match(
      assets,
      /requireRadioWoloOperator/,
    );

    assert.match(
      audio,
      /requireRadioWoloOperator/,
    );

    assert.match(
      audio,
      /Accept-Ranges/,
    );

    assert.match(
      audio,
      /Content-Range/,
    );

    assert.match(
      audio,
      /createRadioFileStream/,
    );

    assert.doesNotMatch(
      audio,
      /Readable\.toWeb/,
    );

    assert.doesNotMatch(
      audio,
      /readFile\(/,
    );

    const fileStream =
      read(
        "lib/radioWoloFileStream.ts",
      );

    assert.match(
      fileStream,
      /async cancel\(\)/,
    );

    assert.match(
      fileStream,
      /cancelled = true/,
    );

    assert.match(
      shadow,
      /RADIO_WOLO_OPERATOR_UIDS/,
    );
  },
);

test(
  "Radio WOLO Vault storage writes validated private audio and cleans it up",
  async () => {
    const {
      mkdtemp,
      readFile,
      rm,
    } = await import(
      "node:fs/promises"
    );

    const {
      tmpdir,
    } = await import(
      "node:os"
    );

    const path =
      await import(
        "node:path"
      );

    const {
      persistRadioVaultAudio,
      removeRadioVaultFile,
    } = await import(
      "../lib/radioWoloAssetStorage.ts"
    );

    const previous =
      process.env.RADIO_WOLO_MEDIA_DIR;

    const root =
      await mkdtemp(
        path.join(
          tmpdir(),
          "radio-wolo-vault-",
        ),
      );

    process.env.RADIO_WOLO_MEDIA_DIR =
      root;

    try {
      const bytes =
        new Uint8Array(
          Buffer.from(
            "ID3radio-wolo-test",
          ),
        );

      const stored =
        await persistRadioVaultAudio(
          bytes,
        );

      assert.match(
        stored.storageKey,
        /^assets\/audio\//,
      );

      assert.equal(
        stored.mediaType,
        "audio/mpeg",
      );

      assert.equal(
        stored.sha256.length,
        64,
      );

      assert.deepEqual(
        new Uint8Array(
          await readFile(
            stored.target,
          ),
        ),
        bytes,
      );

      await removeRadioVaultFile(
        stored.target,
      );

      await assert.rejects(
        readFile(
          stored.target,
        ),
      );

      await assert.rejects(
        persistRadioVaultAudio(
          new Uint8Array(
            Buffer.from(
              "not-audio",
            ),
          ),
        ),
        /Unsupported Radio WOLO audio bytes/,
      );
    } finally {
      if (
        previous === undefined
      ) {
        delete process.env
          .RADIO_WOLO_MEDIA_DIR;
      } else {
        process.env
          .RADIO_WOLO_MEDIA_DIR =
          previous;
      }

      await rm(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

test(
  "Radio WOLO control room preserves Inbox and makes Vault primary",
  () => {
    const desk =
      read(
        "components/admin/radio/RadioWoloDesk.tsx",
      );

    const inbox =
      read(
        "components/admin/radio/RadioSubmissionInbox.tsx",
      );

    const vault =
      read(
        "components/admin/radio/RadioWoloVault.tsx",
      );

    assert.match(
      desk,
      /"vault"/,
    );

    assert.match(
      desk,
      /"build"/,
    );

    assert.match(
      desk,
      /"on-air"/,
    );

    assert.match(
      desk,
      /"inbox"/,
    );

    assert.match(
      desk,
      /The Kingdom Never/,
    );

    assert.match(
      inbox,
      /Private Review Rail/,
    );

    assert.match(
      vault,
      /Drop audio into/,
    );

    assert.match(
      vault,
      /multiple/,
    );

    assert.match(
      vault,
      /audioDurationMs/,
    );

    assert.match(
      vault,
      /\/api\/admin\/radio\/assets/,
    );

    assert.match(
      vault,
      /datalist/,
    );

    assert.match(
      vault,
      /Archive/,
    );
  },
);

test(
  "all Radio WOLO admin surfaces require the dedicated operator capability",
  () => {
    const page =
      read(
        "app/admin/radio/page.tsx",
      );

    const inboxApi =
      read(
        "app/api/admin/radio-submissions/route.ts",
      );

    const inboxMedia =
      read(
        "app/api/admin/radio-submissions/[id]/[asset]/route.ts",
      );

    assert.match(
      page,
      /requireServerRadioWoloOperator/,
    );

    assert.match(
      inboxApi,
      /requireRadioWoloOperator/,
    );

    assert.match(
      inboxMedia,
      /requireRadioWoloOperator/,
    );

    assert.doesNotMatch(
      inboxApi,
      /requireAdmin\(/,
    );

    assert.doesNotMatch(
      inboxMedia,
      /requireAdmin\(/,
    );
  },
);

test(
  "Radio WOLO shadow uses an explicitly isolated local media root",
  () => {
    const shadow =
      read(
        "scripts/dev-shadow.py",
      );

    assert.match(
      shadow,
      /RADIO_WOLO_MEDIA_DIR/,
    );

    assert.match(
      shadow,
      /radio-wolo-shadow/,
    );

    assert.match(
      shadow,
      /RADIO_WOLO_OPERATOR_UIDS/,
    );
  },
);

test(
  "Radio WOLO program rules normalize metadata, transitions, and duration",
  async () => {
    const {
      calculateRadioProgramDurationMs,
      normalizeRadioProgramItems,
      normalizeRadioProgramName,
      normalizeRadioProgramTargetDurationMs,
    } = await import(
      "../lib/radioWoloPrograms.ts"
    );

    assert.equal(
      normalizeRadioProgramName(
        "  Wolomania   Hour  ",
      ),
      "Wolomania Hour",
    );

    assert.equal(
      normalizeRadioProgramTargetDurationMs(
        3_600_000,
      ),
      3_600_000,
    );

    assert.equal(
      normalizeRadioProgramTargetDurationMs(
        -1,
      ),
      null,
    );

    assert.deepEqual(
      normalizeRadioProgramItems(
        [
          {
            assetId: 7,
            transition:
              "cut",
            crossfadeMs:
              5000,
          },
          {
            assetId: 7,
            transition:
              "CROSSFADE",
            crossfadeMs:
              3000,
          },
          {
            assetId: 9,
            transition:
              "bumper",
          },
        ],
      ),
      [
        {
          assetId: 7,
          transition:
            "cut",
          crossfadeMs: 0,
        },
        {
          assetId: 7,
          transition:
            "crossfade",
          crossfadeMs:
            3000,
        },
        {
          assetId: 9,
          transition:
            "bumper",
          crossfadeMs: 0,
        },
      ],
    );

    assert.equal(
      calculateRadioProgramDurationMs(
        [
          {
            durationMs:
              180_000,
            transition:
              "cut",
            crossfadeMs:
              0,
          },
          {
            durationMs:
              120_000,
            transition:
              "crossfade",
            crossfadeMs:
              3000,
          },
        ],
      ),
      297_000,
    );
  },
);

test(
  "Radio WOLO program APIs are operator-only",
  () => {
    const programs =
      read(
        "app/api/admin/radio/programs/route.ts",
      );

    const program =
      read(
        "app/api/admin/radio/programs/[id]/route.ts",
      );

    const items =
      read(
        "app/api/admin/radio/programs/[id]/items/route.ts",
      );

    for (
      const source of [
        programs,
        program,
        items,
      ]
    ) {
      assert.match(
        source,
        /requireRadioWoloOperator/,
      );

      assert.doesNotMatch(
        source,
        /requireAdmin\(/,
      );
    }
  },
);

test(
  "Radio WOLO chain saves canonical deterministic positions transactionally",
  () => {
    const items =
      read(
        "app/api/admin/radio/programs/[id]/items/route.ts",
      );

    assert.match(
      items,
      /prisma\.\$transaction/,
    );

    assert.match(
      items,
      /radioProgramItem\.deleteMany/,
    );

    assert.match(
      items,
      /radioProgramItem\.createMany/,
    );

    assert.match(
      items,
      /position:\s*index/,
    );

    assert.match(
      items,
      /status:\s*"ready"/,
    );

    assert.match(
      items,
      /status:\s*"draft"/,
    );
  },
);

test(
  "Radio WOLO program detail is always returned in broadcast order",
  () => {
    const program =
      read(
        "app/api/admin/radio/programs/[id]/route.ts",
      );

    assert.match(
      program,
      /position:\s*"asc"/,
    );

    assert.match(
      program,
      /builtDurationMs/,
    );

    assert.match(
      program,
      /calculateRadioProgramDurationMs/,
    );
  },
);

test(
  "Radio WOLO BUILD is a real programming board",
  () => {
    const desk =
      read(
        "components/admin/radio/RadioWoloDesk.tsx",
      );

    const builder =
      read(
        "components/admin/radio/RadioWoloBuilder.tsx",
      );

    assert.match(
      desk,
      /RadioWoloBuilder/,
    );

    assert.match(
      desk,
      /mode ===\s*"build"/,
    );

    assert.doesNotMatch(
      desk,
      /Build comes next/,
    );

    assert.match(
      builder,
      /Target/,
    );

    assert.match(
      builder,
      /Built/,
    );

    assert.match(
      builder,
      /Left/,
    );

    assert.match(
      builder,
      /draggable/,
    );

    assert.match(
      builder,
      /ArrowUp/,
    );

    assert.match(
      builder,
      /ArrowDown/,
    );

    assert.match(
      builder,
      /crossfade/,
    );

    assert.match(
      builder,
      /\/api\/admin\/radio\/programs/,
    );

    assert.match(
      builder,
      /Mark ready/,
    );

    assert.match(
      builder,
      /calculateRadioProgramDurationMs/,
    );
  },
);

test(
  "Radio WOLO BUILD permits repeated Vault assets in one chain",
  () => {
    const builder =
      read(
        "components/admin/radio/RadioWoloBuilder.tsx",
      );

    assert.match(
      builder,
      /addAsset/,
    );

    assert.match(
      builder,
      /chainKey/,
    );

    assert.doesNotMatch(
      builder,
      /some\([^)]*asset\\.id/,
    );
  },
);

test(
  "Radio WOLO station clock resolves deterministic crossfade timing",
  async () => {
    const {
      buildRadioProgramTimeline,
      resolveRadioStationPosition,
    } = await import(
      "../lib/radioWoloStation.ts"
    );

    const items = [
      {
        value: "one",
        durationMs:
          10_000,
        transition:
          "cut",
        crossfadeMs: 0,
      },
      {
        value: "two",
        durationMs:
          10_000,
        transition:
          "crossfade",
        crossfadeMs:
          2000,
      },
      {
        value: "three",
        durationMs:
          5000,
        transition:
          "cut",
        crossfadeMs: 0,
      },
    ];

    const timeline =
      buildRadioProgramTimeline(
        items,
      );

    assert.equal(
      timeline.durationMs,
      23_000,
    );

    assert.deepEqual(
      timeline.segments.map(
        (item) => [
          item.startMs,
          item.endMs,
        ],
      ),
      [
        [0, 10_000],
        [8000, 18_000],
        [18_000, 23_000],
      ],
    );

    const duringCrossfade =
      resolveRadioStationPosition(
        items,
        8500,
      );

    assert.equal(
      duringCrossfade.ended,
      false,
    );

    assert.equal(
      duringCrossfade.current?.value,
      "two",
    );

    assert.equal(
      duringCrossfade.current?.offsetMs,
      500,
    );

    assert.equal(
      duringCrossfade.next?.value,
      "three",
    );

    const ended =
      resolveRadioStationPosition(
        items,
        23_000,
      );

    assert.equal(
      ended.ended,
      true,
    );
  },
);

test(
  "Radio WOLO transmitter APIs are dedicated-operator only",
  () => {
    for (
      const file of [
        "app/api/admin/radio/station/route.ts",
        "app/api/admin/radio/station/start/route.ts",
        "app/api/admin/radio/station/stop/route.ts",
      ]
    ) {
      const source =
        read(file);

      assert.match(
        source,
        /requireRadioWoloOperator/,
      );

      assert.doesNotMatch(
        source,
        /requireAdmin\(/,
      );
    }
  },
);

test(
  "Radio WOLO launch requires a ready non-empty program and singleton authority",
  () => {
    const start =
      read(
        "app/api/admin/radio/station/start/route.ts",
      );

    const station =
      read(
        "app/api/admin/radio/station/route.ts",
      );

    assert.match(
      start,
      /program\.status !==\s*"ready"/,
    );

    assert.match(
      start,
      /program\.items\.length ===\s*0/,
    );

    assert.match(
      start,
      /asset\.status !==\s*"ready"/,
    );

    assert.match(
      start,
      /radioStationState\.updateMany/,
    );

    assert.match(
      start,
      /state:\s*"on_air"/,
    );

    assert.match(
      station,
      /radioStationState\.upsert/,
    );

    assert.match(
      station,
      /endedNaturally/,
    );
  },
);

test(
  "Radio WOLO freezes an active program under the station clock",
  () => {
    const metadata =
      read(
        "app/api/admin/radio/programs/[id]/route.ts",
      );

    const chain =
      read(
        "app/api/admin/radio/programs/[id]/items/route.ts",
      );

    for (
      const source of [
        metadata,
        chain,
      ]
    ) {
      assert.match(
        source,
        /radioStationState\.findUnique/,
      );

      assert.match(
        source,
        /state === "on_air"/,
      );

      assert.match(
        source,
        /currently on air/,
      );

      assert.match(
        source,
        /status:\s*409/,
      );
    }
  },
);


test(
  "Radio WOLO ON AIR is a real transmitter console",
  () => {
    const desk =
      read(
        "components/admin/radio/RadioWoloDesk.tsx",
      );

    const onAir =
      read(
        "components/admin/radio/RadioWoloOnAir.tsx",
      );

    assert.match(
      desk,
      /RadioWoloOnAir/,
    );

    assert.match(
      desk,
      /mode ===\s*"on-air"/,
    );

    assert.doesNotMatch(
      desk,
      /On Air comes after the chain/,
    );

    assert.match(
      onAir,
      /Go On Air/i,
    );

    assert.match(
      onAir,
      /Stop Transmission/i,
    );

    assert.match(
      onAir,
      /Transmission Clock/,
    );

    assert.match(
      onAir,
      /\bNow\b/,
    );

    assert.match(
      onAir,
      /\bNext\b/,
    );

    assert.match(
      onAir,
      /\/api\/admin\/radio\/station\/start/,
    );

    assert.match(
      onAir,
      /\/api\/admin\/radio\/station\/stop/,
    );

    assert.match(
      onAir,
      /\/api\/admin\/radio\/station/,
    );
  },
);

test(
  "Radio WOLO distinguishes automated ON AIR from future GO LIVE",
  () => {
    const onAir =
      read(
        "components/admin/radio/RadioWoloOnAir.tsx",
      );

    assert.match(
      onAir,
      /GO LIVE · future/,
    );

    assert.match(
      onAir,
      /automated Radio WOLO broadcast/,
    );

    assert.match(
      onAir,
      /program\.status ===\s*"ready"/,
    );

    assert.match(
      onAir,
      /program\.itemCount\s*>/,
    );
  },
);
