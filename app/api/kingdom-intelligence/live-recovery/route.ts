import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
};

const CHUNK_PLAINTEXT_LIMIT = 256 * 1024 * 1024;

function canonicalRoot() {
  const explicit = process.env.AOE2WAR_CANONICAL_APP_ROOT?.trim();
  if (explicit) return path.resolve(explicit);

  const cwd = process.cwd();
  return path.basename(cwd) === "app-prodn"
    ? cwd
    : path.join(path.dirname(cwd), "app-prodn");
}

function safeRecoveryBundle(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const resolved = path.resolve(value);
  const vault = path.resolve(os.homedir(), "aoe2war-recovery");

  return resolved === vault || resolved.startsWith(vault + path.sep)
    ? resolved
    : null;
}

function isoSeconds(value: unknown) {
  if (typeof value !== "string") return null;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis / 1000 : null;
}

async function latestRunningCampaign(root: string) {
  const dir = path.join(root, ".aoe2war-release", "recovery-campaigns");

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return null;
  }

  const candidates = names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();

  for (const name of candidates) {
    try {
      const raw = JSON.parse(
        await fs.readFile(path.join(dir, name), "utf8"),
      ) as Record<string, unknown>;

      const status = String(raw.status ?? "").toUpperCase();
      if (
        status === "RUNNING" ||
        status === "RUNNING_CAPTURE" ||
        status === "RESUME_REQUESTED"
      ) {
        return raw;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function observedChunkBytes(
  bundleRoot: string,
  className: string,
) {
  const root = path.join(bundleRoot, `${className}.cms.chunks`);

  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return {
      sealedChunks: 0,
      sealedBytes: 0,
      partialBytes: 0,
      firstChunkCreatedAt: null as string | null,
    };
  }

  let sealedChunks = 0;
  let sealedBytes = 0;
  let partialBytes = 0;
  let firstChunkCreatedAt: string | null = null;

  for (const name of names) {
    if (/^chunk-\d{6}$/.test(name)) {
      try {
        const proof = JSON.parse(
          await fs.readFile(path.join(root, name, "proof.json"), "utf8"),
        ) as { plaintext_bytes?: number; created_at?: string };

        if (typeof proof.created_at === "string") {
          if (
            firstChunkCreatedAt === null ||
            new Date(proof.created_at).getTime() <
              new Date(firstChunkCreatedAt).getTime()
          ) {
            firstChunkCreatedAt = proof.created_at;
          }
        }

        const bytes = Number(proof.plaintext_bytes);
        if (Number.isFinite(bytes) && bytes > 0) {
          sealedChunks += 1;
          sealedBytes += bytes;
        }
      } catch {
        continue;
      }
      continue;
    }

    if (/^\.chunk-\d{6}\.partial$/.test(name)) {
      try {
        const stat = await fs.stat(path.join(root, name, "payload.cms"));
        partialBytes = Math.max(
          partialBytes,
          Math.min(stat.size, CHUNK_PLAINTEXT_LIMIT),
        );
      } catch {
        continue;
      }
    }
  }

  return {
    sealedChunks,
    sealedBytes,
    partialBytes,
    firstChunkCreatedAt,
  };
}

export async function GET() {
  if (process.env.AOE2WAR_PROD_DB_PREVIEW !== "true") {
    return NextResponse.json(
      { available: false, reason: "operator_preview_only" },
      { headers: NO_STORE },
    );
  }

  try {
    const root = canonicalRoot();
    const campaign = await latestRunningCampaign(root);

    if (!campaign) {
      return NextResponse.json(
        { available: false, reason: "no_running_recovery_campaign" },
        { headers: NO_STORE },
      );
    }

    const className =
      typeof campaign.current_class === "string"
        ? campaign.current_class
        : null;
    const bundleRoot = safeRecoveryBundle(campaign.bundle_root);

    if (!className || !bundleRoot) {
      return NextResponse.json(
        { available: false, reason: "recovery_class_not_observable" },
        { headers: NO_STORE },
      );
    }

    const observed = await observedChunkBytes(bundleRoot, className);

    const stageEstimates =
      campaign.ordinary_stage_estimates &&
      typeof campaign.ordinary_stage_estimates === "object"
        ? (campaign.ordinary_stage_estimates as Record<string, unknown>)
        : {};
    const expectedBytes = Number(stageEstimates[className] ?? 0);

    const observedBytes = observed.sealedBytes + observed.partialBytes;
    const classFraction =
      expectedBytes > 0
        ? Math.max(0, Math.min(1, observedBytes / expectedBytes))
        : null;

    const completed = Array.isArray(campaign.completed_classes)
      ? campaign.completed_classes.length
      : 0;
    const total = Array.isArray(campaign.ordinary_classes)
      ? campaign.ordinary_classes.length
      : 0;

    const overallPercent =
      total > 0 && classFraction !== null
        ? ((completed + classFraction) / total) * 100
        : total > 0
          ? (completed / total) * 100
          : null;

    const campaignStepStarted = isoSeconds(
      campaign.current_class_started_at,
    );
    const firstChunkStarted = isoSeconds(observed.firstChunkCreatedAt);
    const startedSeconds =
      campaignStepStarted !== null && firstChunkStarted !== null
        ? Math.min(campaignStepStarted, firstChunkStarted)
        : campaignStepStarted ?? firstChunkStarted;

    const nowSeconds = Date.now() / 1000;
    const elapsedSeconds =
      startedSeconds !== null
        ? Math.max(0, nowSeconds - startedSeconds)
        : null;

    const throughputBytesPerSecond =
      elapsedSeconds && elapsedSeconds > 30 && observedBytes > 0
        ? observedBytes / elapsedSeconds
        : null;

    const etaSeconds =
      throughputBytesPerSecond &&
      throughputBytesPerSecond > 0 &&
      expectedBytes > observedBytes
        ? (expectedBytes - observedBytes) / throughputBytesPerSecond
        : expectedBytes > 0 && observedBytes >= expectedBytes
          ? 0
          : null;

    return NextResponse.json(
      {
        available: true,
        status: String(campaign.status ?? "UNKNOWN"),
        currentClass: className.replaceAll("_", " "),
        completedClasses: completed,
        totalClasses: total,
        sealedChunks: observed.sealedChunks,
        observedBytes,
        expectedBytes: expectedBytes > 0 ? expectedBytes : null,
        classPercent:
          classFraction === null
            ? null
            : Math.round(classFraction * 1000) / 10,
        overallPercent:
          overallPercent === null
            ? null
            : Math.round(overallPercent * 10) / 10,
        elapsedSeconds,
        etaSeconds:
          etaSeconds === null
            ? null
            : Math.max(0, Math.round(etaSeconds)),
        throughputBytesPerSecond,
        progressBasis:
          expectedBytes > 0
            ? "sealed + active encrypted chunk bytes"
            : "live chunk bytes; stage denominator unavailable for this legacy campaign",
        sampledAt: new Date().toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      {
        available: false,
        reason: "live_recovery_progress_unavailable",
      },
      { headers: NO_STORE },
    );
  }
}
