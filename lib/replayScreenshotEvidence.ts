import "server-only";

import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import {
  join,
  resolve,
} from "node:path";

import {
  Prisma,
  type PrismaClient,
} from "@/lib/generated/prisma";
import {
  runLatestReplayParserForGame,
} from "@/lib/replayParserOnDemand";

const MAX_SCREENSHOTS = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const EVIDENCE_ROOT =
  process.env.AOE2WAR_REPLAY_EVIDENCE_DIR ||
  "/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/review-screenshots";

const ANALYSIS_ROOT =
  process.env.AOE2WAR_REPLAY_EVIDENCE_ANALYSIS_DIR ||
  "/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/vision-analysis";

const OPENAI_KEY_FALLBACK =
  "/home/tony/.config/aoe2hdbets/openai.key";

const VISION_MODEL =
  process.env.AOE2WAR_SCREENSHOT_VISION_MODEL ||
  "gpt-5.6";

const VISION_PARSER_NAME =
  "aoe2war.screenshot_vision";

const VISION_PARSER_VERSION = "1.0.0";
const VISION_PASS_NAME = "postgame_evidence";
const VISION_PASS_VERSION = "1";
const VISION_SCHEMA_VERSION = "2026-07-22.1";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

type JsonRecord =
  Record<string, unknown>;

type AssessmentStatus =
  | "confirmed"
  | "conflict"
  | "observed"
  | "not_visible"
  | "unclear";

type Assessment = {
  status: AssessmentStatus;
  confidence: number;
  notes: string;
};

type TeamAssessment =
  Assessment & {
    teams: Array<{
      players: string[];
    }>;
  };

type WinnerAssessment =
  Assessment & {
    winningPlayerNames: string[];
    losingPlayerNames: string[];
  };

type ScreenshotFact = {
  category:
    | "team"
    | "winner"
    | "score"
    | "military"
    | "economy"
    | "technology"
    | "society"
    | "timeline";
  playerName: string;
  metric: string;
  value: string;
  confidence: number;
};

type VisionAnalysis = {
  summary: string;
  teamComposition: TeamAssessment;
  winnerLoser: WinnerAssessment;
  score: Assessment;
  military: Assessment;
  economy: Assessment;
  technology: Assessment;
  society: Assessment;
  timeline: Assessment;
  facts: ScreenshotFact[];
};

export class ReplayScreenshotEvidenceError
  extends Error
{
  status: number;
  code: string;

  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.name =
      "ReplayScreenshotEvidenceError";
    this.status = status;
    this.code = code;
  }
}

function record(
  value: unknown
): JsonRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function clampConfidence(
  value: unknown
) {
  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(numeric)
        )
      )
    : 0;
}

function stableValue(
  value: unknown
): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  const source = record(value);

  if (source) {
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [
          key,
          stableValue(source[key]),
        ])
    );
  }

  return value;
}

function stableJson(
  value: unknown
) {
  return JSON.stringify(
    stableValue(value)
  );
}

function sha256(
  value: string | Buffer
) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function evidencePurpose(
  gameStatsId: number
) {
  return `replay_review_screenshot:${gameStatsId}`;
}

function safeEvidencePath(
  storageKey: string
) {
  const root = resolve(EVIDENCE_ROOT);
  const candidate =
    resolve(storageKey);

  if (
    candidate !== root &&
    !candidate.startsWith(`${root}/`)
  ) {
    throw new ReplayScreenshotEvidenceError(
      500,
      "evidence_path_invalid",
      "Stored replay evidence escaped the private evidence root."
    );
  }

  return candidate;
}

function evidenceExtension(
  mediaType: string
) {
  return MIME_EXTENSIONS[mediaType] || "";
}

function readOriginalFilename(
  metadata: unknown,
  fallback: string
) {
  const source = record(metadata);

  return (
    text(source?.originalFilename) ||
    fallback
  );
}

async function evidenceLinks(
  prisma: PrismaClient,
  gameStatsId: number
) {
  return prisma.replayEvidenceLink.findMany({
    where: {
      gameStatsId,
      purpose:
        evidencePurpose(gameStatsId),
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    include: {
      evidenceArtifact: true,
    },
  });
}

export async function listReplayScreenshotEvidence(
  prisma: PrismaClient,
  gameStatsId: number
) {
  const links =
    await evidenceLinks(
      prisma,
      gameStatsId
    );

  return links.map(
    (link, index) => ({
      linkId: link.id,
      artifactId:
        link.evidenceArtifact.id,
      sha256:
        link.evidenceArtifact.sha256,
      mediaType:
        link.evidenceArtifact.mediaType ||
        "application/octet-stream",
      byteSize: Number(
        link.evidenceArtifact.byteSize
      ),
      originalFilename:
        readOriginalFilename(
          link.metadata,
          `Screenshot ${index + 1}`
        ),
      createdAt:
        link.createdAt.toISOString(),
    })
  );
}

async function ensureArtifact(
  prisma: PrismaClient,
  input: {
    sha: string;
    buffer: Buffer;
    mediaType: string;
    storageKey: string;
    originalFilename: string;
  }
) {
  const existing =
    await prisma.replayEvidenceArtifact.findUnique({
      where: {
        sha256: input.sha,
      },
    });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.replayEvidenceArtifact.create({
      data: {
        sha256: input.sha,
        byteSize: BigInt(
          input.buffer.byteLength
        ),
        storageProvider:
          "filesystem",
        storageKey:
          input.storageKey,
        evidenceKind:
          "postgame_screenshot",
        mediaType:
          input.mediaType,
        metadata: {
          firstOriginalFilename:
            input.originalFilename,
        },
      },
    });
  } catch (error) {
    if (
      (error as { code?: string })
        .code === "P2002"
    ) {
      const raced =
        await prisma.replayEvidenceArtifact.findUnique({
          where: {
            sha256: input.sha,
          },
        });

      if (raced) {
        return raced;
      }
    }

    throw error;
  }
}

async function ensureGameEvidenceLink(
  prisma: PrismaClient,
  input: {
    gameStatsId: number;
    artifactId: number;
    sha: string;
    originalFilename: string;
    uploadedByUid: string;
  }
) {
  const idempotencyKey =
    sha256(
      stableJson({
        version: 1,
        purpose: "replay_review_screenshot",
        gameStatsId:
          input.gameStatsId,
        evidenceSha256:
          input.sha,
      })
    );

  const existing =
    await prisma.replayEvidenceLink.findUnique({
      where: {
        idempotencyKey,
      },
    });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.replayEvidenceLink.create({
      data: {
        evidenceArtifactId:
          input.artifactId,
        gameStatsId:
          input.gameStatsId,
        idempotencyKey,
        purpose:
          evidencePurpose(
            input.gameStatsId
          ),
        metadata: {
          gameStatsId:
            input.gameStatsId,
          uploadedByUid:
            input.uploadedByUid,
          originalFilename:
            input.originalFilename,
          evidenceSha256:
            input.sha,
        },
      },
    });
  } catch (error) {
    if (
      (error as { code?: string })
        .code === "P2002"
    ) {
      const raced =
        await prisma.replayEvidenceLink.findUnique({
          where: {
            idempotencyKey,
          },
        });

      if (raced) {
        return raced;
      }
    }

    throw error;
  }
}

export async function storeReplayScreenshotEvidence(
  prisma: PrismaClient,
  gameStatsId: number,
  uploadedByUid: string,
  files: File[]
) {
  if (
    files.length < 1 ||
    files.length > MAX_SCREENSHOTS
  ) {
    throw new ReplayScreenshotEvidenceError(
      400,
      "invalid_screenshot_count",
      "Upload between 1 and 6 screenshots."
    );
  }

  const existing =
    await evidenceLinks(
      prisma,
      gameStatsId
    );

  const existingHashes =
    new Set(
      existing.map(
        (link) =>
          link.evidenceArtifact.sha256
      )
    );

  const prepared: Array<{
    file: File;
    buffer: Buffer;
    sha: string;
    extension: string;
  }> = [];

  let totalBytes = 0;

  for (const file of files) {
    const extension =
      evidenceExtension(file.type);

    if (!extension) {
      throw new ReplayScreenshotEvidenceError(
        415,
        "unsupported_screenshot_type",
        "Use PNG, JPEG, or WebP screenshots."
      );
    }

    if (
      file.size <= 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      throw new ReplayScreenshotEvidenceError(
        413,
        "screenshot_too_large",
        `${file.name} must be 8 MB or smaller.`
      );
    }

    totalBytes += file.size;

    if (
      totalBytes >
      MAX_TOTAL_BYTES
    ) {
      throw new ReplayScreenshotEvidenceError(
        413,
        "screenshot_batch_too_large",
        "The screenshot batch must be 30 MB or smaller."
      );
    }

    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const sha =
      sha256(buffer);

    if (
      existingHashes.has(sha) ||
      prepared.some(
        (entry) =>
          entry.sha === sha
      )
    ) {
      continue;
    }

    prepared.push({
      file,
      buffer,
      sha,
      extension,
    });
  }

  if (
    existing.length +
      prepared.length >
    MAX_SCREENSHOTS
  ) {
    throw new ReplayScreenshotEvidenceError(
      409,
      "screenshot_limit_reached",
      `This battle can hold at most ${MAX_SCREENSHOTS} review screenshots.`
    );
  }

  await mkdir(
    EVIDENCE_ROOT,
    {
      recursive: true,
      mode: 0o700,
    }
  );

  await chmod(
    EVIDENCE_ROOT,
    0o700
  );

  for (const item of prepared) {
    const directory =
      join(
        EVIDENCE_ROOT,
        item.sha.slice(0, 2),
        item.sha.slice(2, 4)
      );

    await mkdir(directory, {
      recursive: true,
      mode: 0o700,
    });

    await chmod(
      directory,
      0o700
    );

    const storageKey =
      join(
        directory,
        `${item.sha}${item.extension}`
      );

    try {
      await writeFile(
        storageKey,
        item.buffer,
        {
          flag: "wx",
          mode: 0o600,
        }
      );
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException)
          .code !== "EEXIST"
      ) {
        throw error;
      }

      const existingBytes =
        await readFile(storageKey);

      if (
        sha256(existingBytes) !==
        item.sha
      ) {
        throw new ReplayScreenshotEvidenceError(
          500,
          "evidence_hash_conflict",
          "Existing screenshot evidence failed its content hash check."
        );
      }
    }

    await chmod(
      storageKey,
      0o600
    );

    const artifact =
      await ensureArtifact(
        prisma,
        {
          sha: item.sha,
          buffer: item.buffer,
          mediaType:
            item.file.type,
          storageKey,
          originalFilename:
            item.file.name,
        }
      );

    await ensureGameEvidenceLink(
      prisma,
      {
        gameStatsId,
        artifactId:
          artifact.id,
        sha: item.sha,
        originalFilename:
          item.file.name,
        uploadedByUid,
      }
    );
  }

  return listReplayScreenshotEvidence(
    prisma,
    gameStatsId
  );
}

export async function getReplayScreenshotEvidenceFile(
  prisma: PrismaClient,
  gameStatsId: number,
  artifactId: number
) {
  const link =
    await prisma.replayEvidenceLink.findFirst({
      where: {
        gameStatsId,
        purpose:
          evidencePurpose(
            gameStatsId
          ),
        evidenceArtifactId:
          artifactId,
      },
      include: {
        evidenceArtifact: true,
      },
    });

  if (!link) {
    throw new ReplayScreenshotEvidenceError(
      404,
      "screenshot_not_found",
      "Screenshot evidence not found."
    );
  }

  const storageKey =
    safeEvidencePath(
      link.evidenceArtifact.storageKey
    );

  return {
    bytes:
      await readFile(storageKey),
    mediaType:
      link.evidenceArtifact.mediaType ||
      "application/octet-stream",
  };
}

async function openAIKey() {
  const direct =
    process.env.OPENAI_API_KEY?.trim();

  if (direct) {
    return direct;
  }

  const keyFile =
    process.env.OPENAI_API_KEY_FILE ||
    OPENAI_KEY_FALLBACK;

  try {
    const value =
      (
        await readFile(
          keyFile,
          "utf8"
        )
      ).trim();

    if (value) {
      return value;
    }
  } catch {
    // handled below
  }

  throw new ReplayScreenshotEvidenceError(
    503,
    "vision_key_unavailable",
    "Screenshot analysis is not configured on this server."
  );
}

function openAIOutputText(
  payload: unknown
) {
  const source = record(payload);

  const direct =
    text(source?.output_text);

  if (direct) {
    return direct;
  }

  const output =
    Array.isArray(source?.output)
      ? source.output
      : [];

  for (const item of output) {
    const message = record(item);

    if (
      !Array.isArray(
        message?.content
      )
    ) {
      continue;
    }

    for (
      const content of
      message.content
    ) {
      const part =
        record(content);

      if (
        part?.type ===
          "output_text" &&
        typeof part.text ===
          "string"
      ) {
        return part.text;
      }
    }
  }

  return "";
}

function rosterContext(
  players: unknown
) {
  if (!Array.isArray(players)) {
    return [];
  }

  return players
    .map((entry) => {
      const player =
        record(entry);

      if (!player) {
        return null;
      }

      const name =
        text(
          player.name ??
          player.player_name
        );

      if (!name) {
        return null;
      }

      return {
        name,
        teamId:
          player.team_id ??
          player.teamId ??
          null,
        civilization:
          player.civilization_name ??
          player.civilization ??
          player.civ ??
          null,
      };
    })
    .filter(Boolean);
}

function playerIdentityMap(
  players: unknown
) {
  const map =
    new Map<string, string>();

  if (!Array.isArray(players)) {
    return map;
  }

  for (const entry of players) {
    const player =
      record(entry);

    if (!player) {
      continue;
    }

    const name =
      text(
        player.name ??
        player.player_name
      );

    if (!name) {
      continue;
    }

    let stableKey =
      text(
        player.stable_player_key ??
        player.stablePlayerKey ??
        player.player_key ??
        player.playerKey
      );

    if (!stableKey) {
      const steamId =
        text(
          player.steam_id ??
          player.steamId
        );

      if (steamId) {
        stableKey =
          `steam:${steamId}`;
      }
    }

    if (stableKey) {
      map.set(
        name.toLowerCase(),
        stableKey
      );
    }
  }

  return map;
}

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: [
        "confirmed",
        "conflict",
        "observed",
        "not_visible",
        "unclear",
      ],
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    notes: {
      type: "string",
    },
  },
  required: [
    "status",
    "confidence",
    "notes",
  ],
} as const;

const visionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
    },
    teamComposition: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...assessmentSchema.properties,
        teams: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              players: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: [
              "players",
            ],
          },
        },
      },
      required: [
        ...assessmentSchema.required,
        "teams",
      ],
    },
    winnerLoser: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...assessmentSchema.properties,
        winningPlayerNames: {
          type: "array",
          items: {
            type: "string",
          },
        },
        losingPlayerNames: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: [
        ...assessmentSchema.required,
        "winningPlayerNames",
        "losingPlayerNames",
      ],
    },
    score:
      assessmentSchema,
    military:
      assessmentSchema,
    economy:
      assessmentSchema,
    technology:
      assessmentSchema,
    society:
      assessmentSchema,
    timeline:
      assessmentSchema,
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "team",
              "winner",
              "score",
              "military",
              "economy",
              "technology",
              "society",
              "timeline",
            ],
          },
          playerName: {
            type: "string",
          },
          metric: {
            type: "string",
          },
          value: {
            type: "string",
          },
          confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
          },
        },
        required: [
          "category",
          "playerName",
          "metric",
          "value",
          "confidence",
        ],
      },
    },
  },
  required: [
    "summary",
    "teamComposition",
    "winnerLoser",
    "score",
    "military",
    "economy",
    "technology",
    "society",
    "timeline",
    "facts",
  ],
} as const;

async function analyzeImages(
  input: {
    images: Array<{
      mediaType: string;
      bytes: Buffer;
    }>;
    gameContext: unknown;
  }
): Promise<VisionAnalysis> {
  const apiKey =
    await openAIKey();

  const content: Array<
    Record<string, unknown>
  > = [
    {
      type: "input_text",
      text: [
        "You are the private AoE2WAR postgame evidence parser.",
        "",
        "Analyze only what is visibly supported by the supplied Age of Empires II HD postgame screenshots.",
        "Typical tabs are Score, Military Stats, Economy Stats, Technology Stats, Society Stats, and Timeline.",
        "",
        "Rules:",
        "- Do not invent values that are not visible.",
        "- Do not infer a winner merely from score unless the screenshot explicitly supports the result.",
        "- If text is illegible, mark the field unclear.",
        "- If a category is not shown, mark it not_visible with confidence 0.",
        "- Human adjudication results are intentionally NOT provided.",
        "- The replay roster below is supplied only to help normalize player-name spelling.",
        "- Confidence means confidence in the screenshot evidence itself, not replay-parser confidence.",
        "- Extract every clearly visible player/stat fact you can into facts.",
        "",
        `Replay context: ${JSON.stringify(
          input.gameContext
        )}`,
      ].join("\n"),
    },
  ];

  for (
    const image of
    input.images
  ) {
    content.push({
      type: "input_image",
      image_url:
        `data:${image.mediaType};base64,${image.bytes.toString(
          "base64"
        )}`,
      detail: "high",
    });
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      180_000
    );

  try {
    const response =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            model:
              VISION_MODEL,
            input: [
              {
                role: "user",
                content,
              },
            ],
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "aoe2_postgame_evidence",
                strict: true,
                schema:
                  visionSchema,
              },
            },
            max_output_tokens:
              12000,
          }),
          signal:
            controller.signal,
        }
      );

    const payload =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      const source =
        record(payload);

      const error =
        record(source?.error);

      throw new ReplayScreenshotEvidenceError(
        502,
        "vision_analysis_failed",
        text(error?.message) ||
          "The screenshot evidence model could not complete."
      );
    }

    const output =
      openAIOutputText(
        payload
      );

    if (!output) {
      throw new ReplayScreenshotEvidenceError(
        502,
        "vision_output_missing",
        "The screenshot evidence model returned no structured result."
      );
    }

    return JSON.parse(
      output
    ) as VisionAnalysis;
  } catch (error) {
    if (
      error instanceof
      ReplayScreenshotEvidenceError
    ) {
      throw error;
    }

    throw new ReplayScreenshotEvidenceError(
      502,
      "vision_analysis_failed",
      error instanceof Error
        ? error.message
        : "Screenshot evidence analysis failed."
    );
  } finally {
    clearTimeout(timeout);
  }
}

type ObservationInput = {
  observationKey: string;
  observationKind: string;
  fieldPath: string;
  value: Prisma.InputJsonValue;
  valueHash: string;
  confidenceBps: number | null;
  provenance: Prisma.InputJsonValue;
};

function analysisObservations(
  analysis: VisionAnalysis,
  input: {
    runIdentityHash: string;
    evidenceHashes: string[];
    evidenceArtifactIds: number[];
    baseParseRunId: number;
    players: unknown;
  }
): ObservationInput[] {
  const observations:
    ObservationInput[] = [];

  const summaries: Array<{
    key: string;
    fieldPath: string;
    value: Assessment;
  }> = [
    {
      key: "team",
      fieldPath:
        "evidence.team_composition",
      value:
        analysis.teamComposition,
    },
    {
      key: "winner",
      fieldPath:
        "evidence.winner_loser",
      value:
        analysis.winnerLoser,
    },
    {
      key: "score",
      fieldPath:
        "evidence.postgame.score",
      value:
        analysis.score,
    },
    {
      key: "military",
      fieldPath:
        "evidence.postgame.military",
      value:
        analysis.military,
    },
    {
      key: "economy",
      fieldPath:
        "evidence.postgame.economy",
      value:
        analysis.economy,
    },
    {
      key: "technology",
      fieldPath:
        "evidence.postgame.technology",
      value:
        analysis.technology,
    },
    {
      key: "society",
      fieldPath:
        "evidence.postgame.society",
      value:
        analysis.society,
    },
    {
      key: "timeline",
      fieldPath:
        "evidence.postgame.timeline",
      value:
        analysis.timeline,
    },
  ];

  const provenance = {
    subject:
      "postgame_screenshot_evidence",
    class:
      "evidence_assisted",
    evidence_source:
      "review_screenshot",
    exact: false,
    base_parse_run_id:
      input.baseParseRunId,
    evidence_artifact_ids:
      input.evidenceArtifactIds,
    evidence_sha256s:
      input.evidenceHashes,
    human_ground_truth_used:
      false,
  };

  for (
    const summary of
    summaries
  ) {
    if (
      summary.value.status ===
      "not_visible"
    ) {
      continue;
    }

    const value =
      summary.value as unknown as
        Prisma.InputJsonValue;

    observations.push({
      observationKey:
        `evidence:${summary.key}`,
      observationKind:
        "screenshot_evidence",
      fieldPath:
        summary.fieldPath,
      value,
      valueHash:
        sha256(
          stableJson(value)
        ),
      confidenceBps:
        clampConfidence(
          summary.value.confidence
        ) * 100,
      provenance:
        provenance as Prisma.InputJsonValue,
    });
  }

  analysis.facts.forEach(
    (fact, index) => {
      const value = {
        playerName:
          fact.playerName,
        metric:
          fact.metric,
        value:
          fact.value,
      };

      observations.push({
        observationKey:
          `fact:${index}:${sha256(
            stableJson(value)
          ).slice(0, 20)}`,
        observationKind:
          "screenshot_fact",
        fieldPath:
          `evidence.postgame.${fact.category}.fact`,
        value:
          value as Prisma.InputJsonValue,
        valueHash:
          sha256(
            stableJson(value)
          ),
        confidenceBps:
          clampConfidence(
            fact.confidence
          ) * 100,
        provenance:
          provenance as Prisma.InputJsonValue,
      });
    }
  );

  const identityMap =
    playerIdentityMap(
      input.players
    );

  const winningKeys =
    analysis.winnerLoser
      .winningPlayerNames
      .map((name) =>
        identityMap.get(
          name
            .trim()
            .toLowerCase()
        )
      )
      .filter(
        (value): value is string =>
          Boolean(value)
      );

  if (
    winningKeys.length > 0 &&
    winningKeys.length ===
      analysis.winnerLoser
        .winningPlayerNames.length
  ) {
    const value =
      winningKeys as unknown as
        Prisma.InputJsonValue;

    observations.push({
      observationKey:
        "evidence:winning_player_keys",
      observationKind:
        "screenshot_evidence",
      fieldPath:
        "result.winning_player_keys",
      value,
      valueHash:
        sha256(
          stableJson(value)
        ),
      confidenceBps:
        clampConfidence(
          analysis.winnerLoser
            .confidence
        ) * 100,
      provenance:
        provenance as Prisma.InputJsonValue,
    });
  }

  const mappedTeams =
    analysis.teamComposition
      .teams.map((team) =>
        team.players
          .map((name) =>
            identityMap.get(
              name
                .trim()
                .toLowerCase()
            )
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      )
      .filter(
        (team) =>
          team.length > 0
      );

  if (
    mappedTeams.length >= 2 &&
    mappedTeams.length ===
      analysis.teamComposition
        .teams.length
  ) {
    const value = {
      teams:
        mappedTeams.map(
          (
            playerKeys,
            index
          ) => ({
            team_id:
              `screenshot:${index + 1}`,
            player_keys:
              playerKeys,
          })
        ),
    };

    observations.push({
      observationKey:
        "evidence:teams_resolution",
      observationKind:
        "screenshot_evidence",
      fieldPath:
        "teams.resolution",
      value:
        value as Prisma.InputJsonValue,
      valueHash:
        sha256(
          stableJson(value)
        ),
      confidenceBps:
        clampConfidence(
          analysis.teamComposition
            .confidence
        ) * 100,
      provenance:
        provenance as Prisma.InputJsonValue,
    });
  }

  return observations;
}

async function writeImmutableAnalysis(
  runIdentityHash: string,
  analysis: VisionAnalysis
) {
  await mkdir(
    ANALYSIS_ROOT,
    {
      recursive: true,
      mode: 0o700,
    }
  );

  await chmod(
    ANALYSIS_ROOT,
    0o700
  );

  const body =
    Buffer.from(
      `${JSON.stringify(
        analysis,
        null,
        2
      )}\n`
    );

  const outputHash =
    sha256(body);

  const storageKey =
    join(
      ANALYSIS_ROOT,
      `${runIdentityHash}.json`
    );

  try {
    await writeFile(
      storageKey,
      body,
      {
        flag: "wx",
        mode: 0o600,
      }
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException)
        .code !== "EEXIST"
    ) {
      throw error;
    }

    const existing =
      await readFile(
        storageKey
      );

    if (
      sha256(existing) !==
      outputHash
    ) {
      throw new ReplayScreenshotEvidenceError(
        500,
        "vision_output_conflict",
        "An immutable evidence-analysis object already exists with different bytes."
      );
    }
  }

  await chmod(
    storageKey,
    0o600
  );

  return {
    body,
    outputHash,
    storageKey,
  };
}

function serializedRun(
  run: {
    id: number;
    parserName: string;
    parserVersion: string;
    parserBuild: string | null;
    passName: string;
    passVersion: string;
    schemaVersion: string;
    status: string;
    observationCount: number;
    createdAt: Date;
  }
) {
  return {
    id: run.id,
    parserName:
      run.parserName,
    parserVersion:
      run.parserVersion,
    parserBuild:
      run.parserBuild,
    passName:
      run.passName,
    passVersion:
      run.passVersion,
    schemaVersion:
      run.schemaVersion,
    status:
      run.status,
    observationCount:
      run.observationCount,
    createdAt:
      run.createdAt.toISOString(),
  };
}

export async function analyzeReplayScreenshotEvidence(
  prisma: PrismaClient,
  gameStatsId: number,
  requestedByUid: string
) {
  const links =
    await evidenceLinks(
      prisma,
      gameStatsId
    );

  if (
    links.length < 1
  ) {
    throw new ReplayScreenshotEvidenceError(
      400,
      "screenshots_required",
      "Add at least one postgame screenshot before running an evidence pass."
    );
  }

  if (
    links.length >
    MAX_SCREENSHOTS
  ) {
    throw new ReplayScreenshotEvidenceError(
      409,
      "screenshot_limit_exceeded",
      "This battle has more than six screenshot evidence objects."
    );
  }

  const game =
    await prisma.gameStats.findUnique({
      where: {
        id: gameStatsId,
      },
      select: {
        id: true,
        replayHash: true,
        players: true,
        map: true,
        winner: true,
        parse_source: true,
        parse_reason: true,
      },
    });

  if (!game) {
    throw new ReplayScreenshotEvidenceError(
      404,
      "game_not_found",
      "Replay game not found."
    );
  }

  let baseRun =
    await prisma.replayParseRun.findFirst({
      where: {
        gameStatsId,
        NOT: {
          parserName:
            VISION_PARSER_NAME,
        },
      },
      orderBy: [
        {
          createdAt:
            "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        id: true,
        artifactId: true,
        runIdentityHash: true,
      },
    });

  if (!baseRun) {
    await runLatestReplayParserForGame(
      prisma,
      gameStatsId,
      requestedByUid
    );

    baseRun =
      await prisma.replayParseRun.findFirst({
        where: {
          gameStatsId,
          NOT: {
            parserName:
              VISION_PARSER_NAME,
          },
        },
        orderBy: [
          {
            createdAt:
              "desc",
          },
          {
            id: "desc",
          },
        ],
        select: {
          id: true,
          artifactId: true,
          runIdentityHash: true,
        },
      });
  }

  if (!baseRun) {
    throw new ReplayScreenshotEvidenceError(
      503,
      "base_parser_run_missing",
      "A replay-only parser pass could not be established for this battle."
    );
  }

  const evidenceHashes =
    links
      .map(
        (link) =>
          link.evidenceArtifact.sha256
      )
      .sort();

  const inputHash =
    sha256(
      stableJson({
        replayHash:
          game.replayHash,
        baseRunIdentityHash:
          baseRun.runIdentityHash,
        evidenceHashes,
      })
    );

  const parserConfigHash =
    sha256(
      stableJson({
        model:
          VISION_MODEL,
        detail:
          "high",
        schemaVersion:
          VISION_SCHEMA_VERSION,
      })
    );

  const runIdentityHash =
    sha256(
      stableJson({
        parserName:
          VISION_PARSER_NAME,
        parserVersion:
          VISION_PARSER_VERSION,
        parserBuild:
          VISION_MODEL,
        passName:
          VISION_PASS_NAME,
        passVersion:
          VISION_PASS_VERSION,
        schemaVersion:
          VISION_SCHEMA_VERSION,
        inputHash,
        parserConfigHash,
      })
    );

  const existing =
    await prisma.replayParseRun.findFirst({
      where: {
        artifactId:
          baseRun.artifactId,
        runIdentityHash,
      },
      select: {
        id: true,
        parserName: true,
        parserVersion: true,
        parserBuild: true,
        passName: true,
        passVersion: true,
        schemaVersion: true,
        status: true,
        observationCount: true,
        createdAt: true,
      },
    });

  if (existing) {
    return {
      outcome:
        "already_latest" as const,
      run:
        serializedRun(existing),
    };
  }

  const images =
    await Promise.all(
      links.map(
        async (link) => ({
          mediaType:
            link.evidenceArtifact.mediaType ||
            "image/png",
          bytes:
            await readFile(
              safeEvidencePath(
                link.evidenceArtifact.storageKey
              )
            ),
        })
      )
    );

  const analysis =
    await analyzeImages({
      images,
      gameContext: {
        gameStatsId:
          game.id,
        map:
          game.map,
        replayWinnerCandidate:
          game.winner,
        parseSource:
          game.parse_source,
        parseReason:
          game.parse_reason,
        roster:
          rosterContext(
            game.players
          ),
      },
    });

  const observations =
    analysisObservations(
      analysis,
      {
        runIdentityHash,
        evidenceHashes,
        evidenceArtifactIds:
          links.map(
            (link) =>
              link.evidenceArtifactId
          ),
        baseParseRunId:
          baseRun.id,
        players:
          game.players,
      }
    );

  const output =
    await writeImmutableAnalysis(
      runIdentityHash,
      analysis
    );

  const now =
    new Date();

  try {
    const run =
      await prisma.$transaction(
        async (tx) => {
          const created =
            await tx.replayParseRun.create({
              data: {
                artifactId:
                  baseRun.artifactId,
                gameStatsId,
                idempotencyKey:
                  `vision:${runIdentityHash}`,
                runIdentityHash,
                parserName:
                  VISION_PARSER_NAME,
                parserVersion:
                  VISION_PARSER_VERSION,
                parserBuild:
                  VISION_MODEL,
                passName:
                  VISION_PASS_NAME,
                passVersion:
                  VISION_PASS_VERSION,
                schemaVersion:
                  VISION_SCHEMA_VERSION,
                inputHash,
                parserConfigHash,
                status:
                  "completed",
                candidateOutputHash:
                  output.outputHash,
                candidateOutputStorageProvider:
                  "filesystem",
                candidateOutputStorageKey:
                  output.storageKey,
                candidateOutputByteSize:
                  BigInt(
                    output.body.byteLength
                  ),
                observationCount:
                  observations.length,
                actionCount:
                  0,
                metrics: {
                  evidenceAssisted:
                    true,
                  humanGroundTruthUsed:
                    false,
                  baseParseRunId:
                    baseRun.id,
                  evidenceCount:
                    links.length,
                  model:
                    VISION_MODEL,
                  summary:
                    analysis.summary,
                },
                candidateOnly:
                  true,
                affectsPublicAggregates:
                  false,
                startedAt:
                  now,
                completedAt:
                  new Date(),
              },
            });

          if (
            observations.length >
            0
          ) {
            await tx.replayObservation.createMany({
              data:
                observations.map(
                  (
                    observation
                  ) => ({
                    parseRunId:
                      created.id,
                    idempotencyKey:
                      sha256(
                        stableJson({
                          runIdentityHash,
                          observationKey:
                            observation.observationKey,
                        })
                      ),
                    observationKey:
                      observation.observationKey,
                    observationKind:
                      observation.observationKind,
                    fieldPath:
                      observation.fieldPath,
                    value:
                      observation.value,
                    valueHash:
                      observation.valueHash,
                    confidenceBps:
                      observation.confidenceBps,
                    provenance:
                      observation.provenance,
                    candidateOnly:
                      true,
                    affectsPublicAggregates:
                      false,
                  })
                ),
            });
          }

          await tx.replayEvidenceLink.createMany({
            data:
              links.map(
                (link) => ({
                  evidenceArtifactId:
                    link.evidenceArtifactId,
                  gameStatsId,
                  parseRunId:
                    created.id,
                  idempotencyKey:
                    sha256(
                      stableJson({
                        version: 1,
                        purpose:
                          "screenshot_analysis_input",
                        parseRunId:
                          created.id,
                        evidenceArtifactId:
                          link.evidenceArtifactId,
                      })
                    ),
                  purpose:
                    "screenshot_analysis_input",
                  metadata: {
                    gameStatsId,
                    evidenceAssisted:
                      true,
                  },
                })
              ),
            skipDuplicates:
              true,
          });

          return created;
        }
      );

    return {
      outcome:
        "created" as const,
      run:
        serializedRun(run),
    };
  } catch (error) {
    if (
      (error as {
        code?: string;
      }).code === "P2002"
    ) {
      const raced =
        await prisma.replayParseRun.findFirst({
          where: {
            artifactId:
              baseRun.artifactId,
            runIdentityHash,
          },
          select: {
            id: true,
            parserName: true,
            parserVersion: true,
            parserBuild: true,
            passName: true,
            passVersion: true,
            schemaVersion: true,
            status: true,
            observationCount: true,
            createdAt: true,
          },
        });

      if (raced) {
        return {
          outcome:
            "already_latest" as const,
          run:
            serializedRun(raced),
        };
      }
    }

    throw error;
  }
}
