#!/usr/bin/env node

/**
 * Local-only fanout/load probe for Living Kingdom presence.
 *
 * This harness deliberately refuses every non-loopback target. It opens public
 * fetch-based SSE viewers and, when local test-session cookies are supplied,
 * sends authenticated publisher samples at a bounded cadence. It neither
 * discovers nor prints cookie values.
 *
 * Examples:
 *   node scripts/living-kingdom-load.mjs --viewers 20 --duration-seconds 30
 *   AOE2WAR_PRESENCE_TEST_COOKIES='aoe2hdbets_session=local-test-value' \
 *     node scripts/living-kingdom-load.mjs --viewers 20 --publishers 5
 *
 * A canary proof also supplies the local listener PID and reviewed RSS, FD,
 * event-loop-generator, and loopback first-byte ceilings with --proof.
 */

import { execFile } from "node:child_process";
import { readdir, readFile, readlink } from "node:fs/promises";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import process from "node:process";
import { promisify } from "node:util";

const DEFAULT_BASE_URL = "http://127.0.0.1:3030";
const EVENTS_PATH = "/api/kingdom-presence/events";
const STATE_PATH = "/api/kingdom-presence/state";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_PER_IP_STREAM_CAP = 20;
const execFileAsync = promisify(execFile);

function fail(message) {
  console.error(`living-kingdom-load: ${message}`);
  process.exitCode = 2;
  return null;
}

function parsePositiveInteger(raw, flag, { minimum = 0, maximum } = {}) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${flag} must be an integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    viewers: DEFAULT_PER_IP_STREAM_CAP,
    publishers: 0,
    durationSeconds: 30,
    publishIntervalMs: 1_000,
    realm: "home",
    reconnects: 1,
    reconnectGapMs: 750,
    perIpCap: DEFAULT_PER_IP_STREAM_CAP,
    targetPid: process.env.AOE2WAR_PRESENCE_TARGET_PID
      ? parsePositiveInteger(
          process.env.AOE2WAR_PRESENCE_TARGET_PID,
          "AOE2WAR_PRESENCE_TARGET_PID",
          { minimum: 1, maximum: 2_147_483_647 },
        )
      : null,
    sampleIntervalMs: 500,
    rssLimitMiB: null,
    fdLimit: null,
    eventLoopLimitMs: null,
    ttfbLimitMs: null,
    fdRecoveryTolerance: 8,
    fdRecoveryWaitMs: 6_000,
    proof: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${flag} requires a value`);
      return argv[index];
    };

    switch (flag) {
      case "--base-url":
        options.baseUrl = next();
        break;
      case "--viewers":
        options.viewers = parsePositiveInteger(next(), flag, {
          maximum: 250,
        });
        break;
      case "--publishers":
        options.publishers = parsePositiveInteger(next(), flag, {
          maximum: 100,
        });
        break;
      case "--duration-seconds":
        options.durationSeconds = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 300,
        });
        break;
      case "--publish-interval-ms":
        options.publishIntervalMs = parsePositiveInteger(next(), flag, {
          minimum: 500,
          maximum: 60_000,
        });
        break;
      case "--realm":
        options.realm = next();
        break;
      case "--reconnects":
        options.reconnects = parsePositiveInteger(next(), flag, {
          maximum: 5,
        });
        break;
      case "--reconnect-gap-ms":
        options.reconnectGapMs = parsePositiveInteger(next(), flag, {
          minimum: 100,
          maximum: 10_000,
        });
        break;
      case "--per-ip-cap":
        options.perIpCap = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 250,
        });
        break;
      case "--target-pid":
        options.targetPid = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 2_147_483_647,
        });
        break;
      case "--sample-interval-ms":
        options.sampleIntervalMs = parsePositiveInteger(next(), flag, {
          minimum: 100,
          maximum: 5_000,
        });
        break;
      case "--rss-limit-mib":
        options.rssLimitMiB = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 1_048_576,
        });
        break;
      case "--fd-limit":
        options.fdLimit = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 1_048_576,
        });
        break;
      case "--event-loop-limit-ms":
        options.eventLoopLimitMs = parsePositiveInteger(next(), flag, {
          minimum: 20,
          maximum: 60_000,
        });
        break;
      case "--ttfb-limit-ms":
        options.ttfbLimitMs = parsePositiveInteger(next(), flag, {
          minimum: 1,
          maximum: 60_000,
        });
        break;
      case "--fd-recovery-tolerance":
        options.fdRecoveryTolerance = parsePositiveInteger(next(), flag, {
          maximum: 1_000,
        });
        break;
      case "--fd-recovery-wait-ms":
        options.fdRecoveryWaitMs = parsePositiveInteger(next(), flag, {
          minimum: 100,
          maximum: 30_000,
        });
        break;
      case "--proof":
        options.proof = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }

  return options;
}

function usage() {
  console.log(`Usage: node scripts/living-kingdom-load.mjs [options]

Options:
  --base-url URL             Loopback app URL (default ${DEFAULT_BASE_URL})
  --viewers N                Public SSE viewers, 0-250 (default 20)
  --publishers N             Authenticated publishers, 0-100 (default 0)
  --duration-seconds N       Run time, 1-300 (default 30)
  --publish-interval-ms N    Publisher cadence, 500-60000 (default 1000)
  --realm KEY                Allowlisted realm key (default home)
  --reconnects N             Full viewer reconnect waves, 0-5 (default 1)
  --reconnect-gap-ms N       Cleanup gap between waves (default 750)
  --per-ip-cap N             App stream cap represented by this run (default 20)
  --target-pid PID           Local web listener PID; env AOE2WAR_PRESENCE_TARGET_PID
  --sample-interval-ms N     Target RSS/FD sampling cadence (default 500)
  --rss-limit-mib N          Reviewed target-process RSS ceiling
  --fd-limit N               Reviewed target-process open-FD ceiling
  --event-loop-limit-ms N    Load-generator p99 event-loop delay ceiling
  --ttfb-limit-ms N          Loopback SSE/control-request p95 ceiling
  --fd-recovery-tolerance N  Allowed final FD delta from baseline (default 8)
  --fd-recovery-wait-ms N    Final HTTP/socket cooldown (default 6000)
  --proof                     Require telemetry budgets and enforce every gate
  --help                     Show this text

Publisher sessions are read only from AOE2WAR_PRESENCE_TEST_COOKIES. Supply
one complete Cookie header per line. Values are never printed. One cookie may
be reused for an ingress-rate probe; distinct local accounts exercise actor
fanout. The script always refuses non-loopback hosts.`);
}

function validateRunContract(options) {
  if (options.viewers > options.perIpCap) {
    throw new Error(
      `--viewers ${options.viewers} exceeds --per-ip-cap ${options.perIpCap}; ` +
        "raise the app's local LIVING_KINGDOM_MAX_SUBSCRIBERS_PER_IP and pass its reviewed value",
    );
  }
  const reconnectBudgetMs = options.reconnects * options.reconnectGapMs;
  if (reconnectBudgetMs >= options.durationSeconds * 1_000) {
    throw new Error("reconnect gaps must leave positive active viewer time");
  }
  if (!options.proof) return;
  if (options.viewers < 1 || options.reconnects < 1) {
    throw new Error("--proof requires at least one viewer and one reconnect wave");
  }
  if (options.viewers !== options.perIpCap) {
    throw new Error("--proof requires --viewers to equal --per-ip-cap");
  }
  for (const [flag, value] of [
    ["--target-pid", options.targetPid],
    ["--rss-limit-mib", options.rssLimitMiB],
    ["--fd-limit", options.fdLimit],
    ["--event-loop-limit-ms", options.eventLoopLimitMs],
    ["--ttfb-limit-ms", options.ttfbLimitMs],
  ]) {
    if (value === null) throw new Error(`--proof requires ${flag}`);
  }
}

function validateLocalBaseUrl(raw) {
  const url = new URL(raw);
  const normalizedHostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(normalizedHostname)) {
    throw new Error(
      `refusing non-loopback target ${url.hostname}; this harness is local-only`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("base URL must use http or https");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function loadCookies() {
  return (process.env.AOE2WAR_PRESENCE_TEST_COOKIES ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function countSseFrames(buffer, metrics, outcome, markSnapshotReady) {
  let boundary;
  while ((boundary = buffer.indexOf("\n\n")) >= 0) {
    const frame = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    if (frame.trim() && !frame.startsWith(":")) {
      metrics.events += 1;
      const eventLine = frame
        .split("\n")
        .find((line) => line.startsWith("event:"));
      const eventName = eventLine?.slice("event:".length).trim() || "message";
      metrics.eventTypes[eventName] = (metrics.eventTypes[eventName] ?? 0) + 1;
      outcome.events += 1;
      if (eventName === "snapshot") {
        outcome.snapshots += 1;
        markSnapshotReady();
      }
    } else if (frame.startsWith(":")) {
      metrics.keepalives += 1;
    }
  }
  return buffer;
}

function waitForAbortableDelay(delayMs, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function waitForDelay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function probeStreamCapacity(eventsUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(eventsUrl, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    return status;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function runTargetResponsivenessProbe(probeUrl, signal, metrics) {
  while (!signal.aborted) {
    const startedAt = performance.now();
    try {
      const response = await fetch(probeUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
      });
      metrics.targetProbeStatuses[response.status] =
        (metrics.targetProbeStatuses[response.status] ?? 0) + 1;
      await response.arrayBuffer();
      if (response.status !== 400) metrics.targetProbeErrors += 1;
      metrics.targetProbeResponseMs.push(performance.now() - startedAt);
    } catch (error) {
      if (!signal.aborted) {
        metrics.targetProbeErrors += 1;
        console.error(
          `target responsiveness probe: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    const waitMs = Math.max(0, 1_000 - (performance.now() - startedAt));
    await waitForAbortableDelay(waitMs, signal);
  }
}

function percentile(values, requestedPercentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((requestedPercentile / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function rounded(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

async function readTargetRssKiB(pid) {
  if (process.platform === "linux") {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
      if (match) return Number(match[1]);
    } catch {
      // Fall through to the portable ps probe for non-procfs Linux setups.
    }
  }
  const { stdout } = await execFileAsync(
    "ps",
    ["-o", "rss=", "-p", String(pid)],
    { encoding: "utf8", timeout: 2_000 },
  );
  const rssKiB = Number(stdout.trim());
  if (!Number.isFinite(rssKiB) || rssKiB <= 0) {
    throw new Error(`target process ${pid} has no readable RSS`);
  }
  return rssKiB;
}

function listenerPort(url) {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

async function linuxPidOwnsListener(pid, port) {
  const fdNames = await readdir(`/proc/${pid}/fd`);
  const links = await Promise.allSettled(
    fdNames.map((name) => readlink(`/proc/${pid}/fd/${name}`)),
  );
  const socketInodes = new Set(
    links
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value.match(/^socket:\[(\d+)\]$/)?.[1])
      .filter(Boolean),
  );
  if (socketInodes.size === 0) return false;

  const tables = await Promise.allSettled([
    readFile("/proc/net/tcp", "utf8"),
    readFile("/proc/net/tcp6", "utf8"),
  ]);
  for (const table of tables) {
    if (table.status !== "fulfilled") continue;
    for (const line of table.value.split(/\r?\n/).slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 10 || fields[3] !== "0A") continue;
      const localPort = Number.parseInt(fields[1]?.split(":").at(-1) ?? "", 16);
      if (localPort === port && socketInodes.has(fields[9])) return true;
    }
  }
  return false;
}

async function lsofPidOwnsListener(pid, port) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "lsof",
      [
        "-nP",
        "-a",
        "-p",
        String(pid),
        `-iTCP:${port}`,
        "-sTCP:LISTEN",
        "-Fpn",
      ],
      { encoding: "utf8", timeout: 2_000, maxBuffer: 1024 * 1024 },
    ));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 1) {
      return false;
    }
    throw error;
  }
  return (
    stdout.split(/\r?\n/).includes(`p${pid}`) &&
    stdout.split(/\r?\n/).some((line) => line.startsWith("n") && line.includes(`:${port}`))
  );
}

async function assertTargetOwnsListener(pid, baseUrl) {
  const port = listenerPort(baseUrl);
  let ownsListener = false;
  if (process.platform === "linux") {
    try {
      ownsListener = await linuxPidOwnsListener(pid, port);
    } catch {
      ownsListener = await lsofPidOwnsListener(pid, port);
    }
  } else if (process.platform === "darwin") {
    ownsListener = await lsofPidOwnsListener(pid, port);
  } else {
    throw new Error(`listener ownership verification is unsupported on ${process.platform}`);
  }
  if (!ownsListener) {
    throw new Error(
      `target process ${pid} does not own the loopback listener on port ${port}`,
    );
  }
}

async function readTargetOpenFds(pid) {
  if (process.platform === "linux") {
    try {
      return (await readdir(`/proc/${pid}/fd`)).length;
    } catch {
      // Fall through to lsof when procfs is unavailable or permission-limited.
    }
  }
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(`open-FD sampling is unsupported on ${process.platform}`);
  }
  const { stdout } = await execFileAsync(
    "lsof",
    ["-nP", "-a", "-p", String(pid), "-d", "0-999999", "-Ff"],
    { encoding: "utf8", timeout: 2_000, maxBuffer: 2 * 1024 * 1024 },
  );
  return stdout.split(/\r?\n/).filter((line) => /^f\d+$/.test(line)).length;
}

async function sampleTargetProcess(pid, label) {
  const [rssKiB, openFds] = await Promise.all([
    readTargetRssKiB(pid),
    readTargetOpenFds(pid),
  ]);
  return {
    label,
    atMs: Date.now(),
    rssMiB: rounded(rssKiB / 1_024),
    openFds,
  };
}

function createTargetProcessSampler(pid, intervalMs) {
  const samples = [];
  const errors = [];
  let timer = null;
  let queue = Promise.resolve();

  const capture = (label) => {
    queue = queue.then(async () => {
      try {
        samples.push(await sampleTargetProcess(pid, label));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    });
    return queue;
  };

  return {
    samples,
    errors,
    async start() {
      await capture("baseline");
      timer = setInterval(() => void capture("active"), intervalMs);
      timer.unref?.();
    },
    capture,
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await capture("final");
      await queue;
    },
  };
}

function summarizeTargetProcess(sampler, options) {
  if (!sampler) return null;
  const baseline = sampler.samples[0] ?? null;
  const final = sampler.samples.at(-1) ?? null;
  const peakRssMiB = sampler.samples.reduce(
    (peak, sample) => Math.max(peak, sample.rssMiB ?? 0),
    0,
  );
  const peakOpenFds = sampler.samples.reduce(
    (peak, sample) => Math.max(peak, sample.openFds ?? 0),
    0,
  );
  return {
    pid: options.targetPid,
    sampleCount: sampler.samples.length,
    errors: [...new Set(sampler.errors)],
    rssMiB: {
      baseline: baseline?.rssMiB ?? null,
      peak: rounded(peakRssMiB),
      final: final?.rssMiB ?? null,
      limit: options.rssLimitMiB,
      headroomAtPeak:
        options.rssLimitMiB === null
          ? null
          : rounded(options.rssLimitMiB - peakRssMiB),
    },
    openFds: {
      baseline: baseline?.openFds ?? null,
      peak: peakOpenFds,
      final: final?.openFds ?? null,
      limit: options.fdLimit,
      headroomAtPeak:
        options.fdLimit === null ? null : options.fdLimit - peakOpenFds,
      recoveryTolerance: options.fdRecoveryTolerance,
      finalDelta:
        baseline && final ? final.openFds - baseline.openFds : null,
    },
    reconnectCleanup: sampler.samples
      .filter((sample) => sample.label.startsWith("reconnect_cleanup_"))
      .map((sample) => ({
        label: sample.label,
        rssMiB: sample.rssMiB,
        openFds: sample.openFds,
      })),
  };
}

async function runViewer(
  id,
  phase,
  eventsUrl,
  signal,
  metrics,
  outcome,
  markSnapshotReady,
) {
  const startedAt = performance.now();
  let connected = false;
  let sawFirstByte = false;
  metrics.viewerAttempts += 1;
  if (phase > 0) metrics.viewerReconnectAttempts += 1;
  try {
    const response = await fetch(eventsUrl, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/event-stream")) {
      throw new Error(`unexpected content-type ${contentType || "<missing>"}`);
    }
    connected = true;
    outcome.connected = true;
    metrics.viewersConnected += 1;
    if (phase > 0) metrics.viewerReconnectsConnected += 1;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        if (!signal.aborted) {
        metrics.viewerUnexpectedEnds += 1;
          metrics.viewerErrors += 1;
          console.error(`viewer ${id}: SSE stream ended before phase cancellation`);
          outcome.unexpectedEnd = true;
        }
        break;
      }
      if (!sawFirstByte && value.byteLength > 0) {
        sawFirstByte = true;
        outcome.firstByteMs = performance.now() - startedAt;
        metrics.sseFirstByteMs.push(outcome.firstByteMs);
      }
      metrics.bytesReceived += value.byteLength;
      outcome.bytesReceived += value.byteLength;
      pending += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      pending = countSseFrames(pending, metrics, outcome, markSnapshotReady);
    }
  } catch (error) {
    if (!signal.aborted) {
      metrics.viewerErrors += 1;
      console.error(`viewer ${id}: ${error instanceof Error ? error.message : error}`);
    }
  } finally {
    if (connected && !sawFirstByte && !signal.aborted) {
      metrics.viewerErrors += 1;
      console.error(`viewer ${id}: stream ended before its first SSE byte`);
    }
    outcome.closed = true;
    metrics.viewersClosed += 1;
  }
}

function startViewer(id, phase, eventsUrl, signal, metrics) {
  const outcome = {
    id,
    phase: phase + 1,
    connected: false,
    closed: false,
    unexpectedEnd: false,
    bytesReceived: 0,
    snapshots: 0,
    events: 0,
    firstByteMs: null,
  };
  let ready = false;
  let resolveReady;
  const snapshotReady = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const markSnapshotReady = () => {
    if (ready) return;
    ready = true;
    resolveReady(outcome);
  };
  metrics.viewerOutcomes.push(outcome);
  const done = runViewer(
    id,
    phase,
    eventsUrl,
    signal,
    metrics,
    outcome,
    markSnapshotReady,
  ).finally(() => {
    if (!ready) resolveReady(outcome);
  });
  return { outcome, snapshotReady, done };
}

function waitForViewerReadiness(viewerHandles, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    Promise.all(viewerHandles.map((handle) => handle.snapshotReady)).then(
      (outcomes) =>
        finish(
          outcomes.every(
            (outcome) => outcome.snapshots > 0 && !outcome.unexpectedEnd,
          ),
        ),
      () => finish(false),
    );
  });
}

function publisherBody(publisherId, sequence, realm) {
  const depthBand = (sequence + publisherId * 3) % 21;
  return {
    protocol: 1,
    kind: "state",
    tabId: `loadtest_${String(publisherId).padStart(8, "0")}`,
    seq: sequence,
    realmId: realm,
    depthBand,
    motion: sequence % 2 === 0 ? "down" : "up",
    visibility: "visible",
  };
}

async function publishOnce(
  id,
  sequence,
  stateUrl,
  origin,
  cookie,
  signal,
  metrics,
) {
  const startedAt = performance.now();
  try {
    const response = await fetch(stateUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: origin,
      },
      body: JSON.stringify(publisherBody(id, sequence, metrics.realm)),
      redirect: "manual",
      signal,
    });
    metrics.publisherRequests += 1;
    metrics.publisherStatuses[response.status] =
      (metrics.publisherStatuses[response.status] ?? 0) + 1;
    if (!response.ok && response.status !== 429) metrics.publisherHttpErrors += 1;
    if (response.ok) {
      metrics.publisherAcceptedRequests += 1;
      metrics.publisherAcceptedIds.add(id);
    }
    await response.arrayBuffer();
    metrics.publisherResponseMs.push(performance.now() - startedAt);
  } catch (error) {
    if (!signal.aborted) {
      metrics.publisherErrors += 1;
      console.error(`publisher ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function removePublishedState(
  id,
  sequence,
  stateUrl,
  origin,
  cookie,
  metrics,
) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(stateUrl, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: origin,
        },
        body: JSON.stringify({
          protocol: 1,
          tabId: `loadtest_${String(id).padStart(8, "0")}`,
          seq: sequence,
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      metrics.cleanupRequests += 1;
      metrics.cleanupStatuses[response.status] =
        (metrics.cleanupStatuses[response.status] ?? 0) + 1;
      await response.arrayBuffer();
      if (response.ok) {
        metrics.cleanupSucceeded += 1;
        return;
      }
      if (response.status !== 429) {
        metrics.cleanupHttpErrors += 1;
        return;
      }
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const retryMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(100, retryAfterSeconds * 1_000)
        : 250;
      await waitForDelay(Math.min(retryMs, Math.max(0, deadline - Date.now())));
    } catch (error) {
      metrics.cleanupErrors += 1;
      console.error(
        `publisher cleanup ${id}: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }
  }
  metrics.cleanupHttpErrors += 1;
  console.error(`publisher cleanup ${id}: rate-limit retry deadline expired`);
}

async function runPublisher(
  id,
  stateUrl,
  origin,
  cookie,
  intervalMs,
  signal,
  metrics,
) {
  let sequence = 0;
  try {
    while (!signal.aborted) {
      const startedAt = Date.now();
      await publishOnce(id, sequence, stateUrl, origin, cookie, signal, metrics);
      sequence += 1;
      const waitMs = Math.max(0, intervalMs - (Date.now() - startedAt));
      await waitForAbortableDelay(waitMs, signal);
    }
  } finally {
    await removePublishedState(id, sequence, stateUrl, origin, cookie, metrics);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      return 0;
    }
    options.baseUrl = validateLocalBaseUrl(options.baseUrl);
    validateRunContract(options);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    usage();
    return 2;
  }

  const cookies = loadCookies();
  if (options.publishers > 0 && cookies.length === 0) {
    fail(
      "--publishers requires local sessions in AOE2WAR_PRESENCE_TEST_COOKIES",
    );
    return 2;
  }
  if (options.targetPid) {
    try {
      await assertTargetOwnsListener(options.targetPid, options.baseUrl);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  const metrics = {
    startedAt: Date.now(),
    realm: options.realm,
    viewerAttempts: 0,
    viewersConnected: 0,
    viewersClosed: 0,
    viewerErrors: 0,
    viewerUnexpectedEnds: 0,
    viewerReconnectAttempts: 0,
    viewerReconnectsConnected: 0,
    viewerReadinessFailures: 0,
    viewerPhases: [],
    viewerOutcomes: [],
    capacityProbeStatuses: [],
    sseFirstByteMs: [],
    bytesReceived: 0,
    events: 0,
    keepalives: 0,
    eventTypes: {},
    publisherRequests: 0,
    publisherAcceptedRequests: 0,
    publisherAcceptedIds: new Set(),
    publisherErrors: 0,
    publisherHttpErrors: 0,
    publisherStatuses: {},
    publisherResponseMs: [],
    targetProbeErrors: 0,
    targetProbeStatuses: {},
    targetProbeResponseMs: [],
    cleanupRequests: 0,
    cleanupSucceeded: 0,
    cleanupErrors: 0,
    cleanupHttpErrors: 0,
    cleanupStatuses: {},
  };
  const eventsUrl = new URL(EVENTS_PATH, options.baseUrl);
  eventsUrl.searchParams.set("realm", options.realm);
  const stateUrl = new URL(STATE_PATH, options.baseUrl);
  const targetProbeUrl = new URL(EVENTS_PATH, options.baseUrl);

  console.log(
    `Living Kingdom local probe: ${options.viewers} viewers, ` +
      `${options.publishers} publishers, ${options.reconnects} reconnect wave(s), ` +
      `${options.durationSeconds}s, ` +
      `${options.baseUrl.origin}`,
  );

  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  const sampler = options.targetPid
    ? createTargetProcessSampler(options.targetPid, options.sampleIntervalMs)
    : null;
  if (sampler) {
    await sampler.start();
    if (sampler.errors.length > 0) {
      await sampler.stop();
      eventLoop.disable();
      fail("target-process RSS/FD baseline could not be sampled");
      return 2;
    }
  }

  const publisherController = new AbortController();
  const publisherTasks = [];
  for (let id = 0; id < options.publishers; id += 1) {
    const cookie = cookies[id % cookies.length];
    publisherTasks.push(
      runPublisher(
        id,
        stateUrl,
        options.baseUrl.origin,
        cookie,
        options.publishIntervalMs,
        publisherController.signal,
        metrics,
      ),
    );
  }
  const targetProbeController = new AbortController();
  const targetProbeTask = options.proof
    ? runTargetResponsivenessProbe(
        targetProbeUrl,
        targetProbeController.signal,
        metrics,
      )
    : Promise.resolve();

  const phaseCount = options.reconnects + 1;
  const activeDurationMs =
    options.durationSeconds * 1_000 - options.reconnects * options.reconnectGapMs;
  const phaseDurationMs = activeDurationMs / phaseCount;

  for (let phase = 0; phase < phaseCount; phase += 1) {
    const phaseController = new AbortController();
    const before = {
      connected: metrics.viewersConnected,
      closed: metrics.viewersClosed,
      errors: metrics.viewerErrors,
      unexpectedEnds: metrics.viewerUnexpectedEnds,
      bytes: metrics.bytesReceived,
      firstBytes: metrics.sseFirstByteMs.length,
    };
    const viewerHandles = [];
    for (let id = 0; id < options.viewers; id += 1) {
      viewerHandles.push(
        startViewer(id, phase, eventsUrl, phaseController.signal, metrics),
      );
    }

    const readinessTimeoutMs = Math.max(1_000, options.ttfbLimitMs ?? 5_000);
    const phaseReady = await waitForViewerReadiness(
      viewerHandles,
      readinessTimeoutMs,
    );
    if (phaseReady) {
      if (options.proof) {
        try {
          metrics.capacityProbeStatuses.push(await probeStreamCapacity(eventsUrl));
        } catch (error) {
          metrics.capacityProbeStatuses.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      await waitForDelay(phaseDurationMs);
    } else metrics.viewerReadinessFailures += 1;
    phaseController.abort();
    await Promise.all(viewerHandles.map((handle) => handle.done));
    const phaseOutcomes = viewerHandles.map((handle) => handle.outcome);
    metrics.viewerPhases.push({
      phase: phase + 1,
      kind: phase === 0 ? "initial" : "reconnect",
      expected: options.viewers,
      connected: metrics.viewersConnected - before.connected,
      closed: metrics.viewersClosed - before.closed,
      errors: metrics.viewerErrors - before.errors,
      unexpectedEnds: metrics.viewerUnexpectedEnds - before.unexpectedEnds,
      bytesReceived: metrics.bytesReceived - before.bytes,
      firstBytes: metrics.sseFirstByteMs.length - before.firstBytes,
      snapshotReady: phaseOutcomes.filter((outcome) => outcome.snapshots > 0).length,
      allReadyBeforeHold: phaseReady,
    });

    if (phase < phaseCount - 1) {
      await waitForDelay(options.reconnectGapMs);
      await sampler?.capture(`reconnect_cleanup_${phase + 1}`);
    }
  }

  publisherController.abort();
  await Promise.all(publisherTasks);
  targetProbeController.abort();
  await targetProbeTask;
  if (sampler) {
    await waitForDelay(options.fdRecoveryWaitMs);
    await sampler.stop();
  }
  eventLoop.disable();

  const elapsedSeconds = Math.max(0.001, (Date.now() - metrics.startedAt) / 1_000);
  const expectedViewerConnections = options.viewers * phaseCount;
  const sseP95Ms = percentile(metrics.sseFirstByteMs, 95);
  const sseFirstByte = {
    samples: metrics.sseFirstByteMs.length,
    p50Ms: rounded(percentile(metrics.sseFirstByteMs, 50)),
    p95Ms: rounded(sseP95Ms),
    p99Ms: rounded(percentile(metrics.sseFirstByteMs, 99)),
    maxMs: rounded(
      metrics.sseFirstByteMs.length > 0 ? Math.max(...metrics.sseFirstByteMs) : Number.NaN,
    ),
    limitMs: options.ttfbLimitMs,
    headroomAtP95Ms:
      options.ttfbLimitMs === null || sseP95Ms === null
        ? null
        : rounded(options.ttfbLimitMs - sseP95Ms),
  };
  const generatorP99Ms = eventLoop.percentile(99) / 1_000_000;
  const generatorEventLoop = {
    source: "load-generator-process",
    p95Ms: rounded(eventLoop.percentile(95) / 1_000_000),
    p99Ms: rounded(generatorP99Ms),
    maxMs: rounded(eventLoop.max / 1_000_000),
    limitMs: options.eventLoopLimitMs,
    headroomAtP99Ms:
      options.eventLoopLimitMs === null
        ? null
        : rounded(options.eventLoopLimitMs - generatorP99Ms),
  };
  const targetProcess = summarizeTargetProcess(sampler, options);
  const targetProbeP95Ms = percentile(metrics.targetProbeResponseMs, 95);
  const targetResponsiveness = {
    description:
      "loopback invalid-realm control requests throughout the hold; not direct target event-loop instrumentation",
    samples: metrics.targetProbeResponseMs.length,
    errors: metrics.targetProbeErrors,
    statuses: metrics.targetProbeStatuses,
    p50Ms: rounded(percentile(metrics.targetProbeResponseMs, 50)),
    p95Ms: rounded(targetProbeP95Ms),
    p99Ms: rounded(percentile(metrics.targetProbeResponseMs, 99)),
    maxMs: rounded(
      metrics.targetProbeResponseMs.length > 0
        ? Math.max(...metrics.targetProbeResponseMs)
        : Number.NaN,
    ),
    limitMs: options.ttfbLimitMs,
    headroomAtP95Ms:
      options.ttfbLimitMs === null || targetProbeP95Ms === null
        ? null
        : rounded(options.ttfbLimitMs - targetProbeP95Ms),
  };
  const failures = [];

  if (metrics.viewerErrors > 0) failures.push("viewer request errors occurred");
  if (metrics.viewerUnexpectedEnds > 0) {
    failures.push("SSE streams ended before their staged cancellation");
  }
  if (metrics.viewerReadinessFailures > 0) {
    failures.push("a viewer phase did not become snapshot-ready before its hold");
  }
  if (metrics.viewerAttempts !== expectedViewerConnections) {
    failures.push("viewer attempt count did not match the staged plan");
  }
  if (metrics.viewersConnected !== expectedViewerConnections) {
    failures.push("not every initial/reconnect viewer was admitted");
  }
  if (metrics.viewersClosed !== expectedViewerConnections) {
    failures.push("not every viewer task closed after its phase");
  }
  if (
    metrics.viewerOutcomes.some(
      (outcome) => outcome.bytesReceived <= 0 || outcome.snapshots < 1,
    )
  ) {
    failures.push("not every admitted viewer received bytes and its own snapshot frame");
  }
  if (
    metrics.viewerReconnectsConnected !==
    options.viewers * options.reconnects
  ) {
    failures.push("reconnect admission did not recover to the requested viewer count");
  }
  if (options.viewers > 0 && metrics.bytesReceived <= 0) {
    failures.push("SSE viewers received zero bytes");
  }
  if (metrics.publisherErrors > 0 || metrics.publisherHttpErrors > 0) {
    failures.push("publisher request errors occurred");
  }
  if (metrics.cleanupErrors > 0 || metrics.cleanupHttpErrors > 0) {
    failures.push("publisher cleanup errors occurred");
  }
  if (options.proof && metrics.cleanupSucceeded !== options.publishers) {
    failures.push("not every publisher cleanup completed with a 2xx response");
  }
  if (options.proof && (metrics.publisherStatuses[429] ?? 0) > 0) {
    failures.push("publisher cadence was rate-limited during proof mode");
  }
  if (options.proof && metrics.publisherAcceptedIds.size !== options.publishers) {
    failures.push("not every configured publisher completed a 2xx state update");
  }
  if (
    options.proof &&
    (metrics.capacityProbeStatuses.length !== phaseCount ||
      metrics.capacityProbeStatuses.some((status) => status !== 429))
  ) {
    failures.push("the cap-plus-one SSE probe was not rejected with HTTP 429");
  }
  if (
    options.proof &&
    (metrics.targetProbeErrors > 0 || metrics.targetProbeResponseMs.length === 0)
  ) {
    failures.push("loopback target-responsiveness probes failed during the hold");
  }
  if (targetProcess?.errors.length) {
    failures.push("target-process telemetry sampling failed");
  }
  if (
    options.rssLimitMiB !== null &&
    (targetProcess?.rssMiB.peak ?? Number.POSITIVE_INFINITY) > options.rssLimitMiB
  ) {
    failures.push("target-process peak RSS exceeded its reviewed ceiling");
  }
  if (
    options.fdLimit !== null &&
    (targetProcess?.openFds.peak ?? Number.POSITIVE_INFINITY) > options.fdLimit
  ) {
    failures.push("target-process peak open FDs exceeded its reviewed ceiling");
  }
  if (
    options.proof &&
    (targetProcess?.openFds.finalDelta ?? Number.POSITIVE_INFINITY) >
      options.fdRecoveryTolerance
  ) {
    failures.push("target-process FDs did not recover to the baseline tolerance");
  }
  if (
    options.eventLoopLimitMs !== null &&
    (generatorEventLoop.p99Ms ?? Number.POSITIVE_INFINITY) > options.eventLoopLimitMs
  ) {
    failures.push("load-generator event-loop p99 exceeded its reviewed ceiling");
  }
  if (
    options.ttfbLimitMs !== null &&
    (sseFirstByte.p95Ms ?? Number.POSITIVE_INFINITY) > options.ttfbLimitMs
  ) {
    failures.push("loopback SSE first-byte p95 exceeded its reviewed ceiling");
  }
  if (
    options.ttfbLimitMs !== null &&
    (targetResponsiveness.p95Ms ?? Number.POSITIVE_INFINITY) > options.ttfbLimitMs
  ) {
    failures.push("loopback control-request p95 exceeded its reviewed ceiling");
  }

  const summary = {
    target: options.baseUrl.origin,
    elapsedSeconds: rounded(elapsedSeconds, 3),
    configured: {
      viewers: options.viewers,
      perIpCap: options.perIpCap,
      publishers: options.publishers,
      publishIntervalMs: options.publishIntervalMs,
      realm: options.realm,
      reconnects: options.reconnects,
      reconnectGapMs: options.reconnectGapMs,
      fdRecoveryWaitMs: options.fdRecoveryWaitMs,
      phaseDurationMs: rounded(phaseDurationMs),
      proof: options.proof,
    },
    viewers: {
      attempts: metrics.viewerAttempts,
      connected: metrics.viewersConnected,
      closed: metrics.viewersClosed,
      errors: metrics.viewerErrors,
      unexpectedEnds: metrics.viewerUnexpectedEnds,
      readinessFailures: metrics.viewerReadinessFailures,
      reconnectAttempts: metrics.viewerReconnectAttempts,
      reconnectsConnected: metrics.viewerReconnectsConnected,
      phases: metrics.viewerPhases,
      bytesReceived: metrics.bytesReceived,
      bytesPerSecond: Math.round(metrics.bytesReceived / elapsedSeconds),
      events: metrics.events,
      keepalives: metrics.keepalives,
      eventTypes: metrics.eventTypes,
      sseFirstByte,
      perViewer: metrics.viewerOutcomes,
      capPlusOneStatuses: metrics.capacityProbeStatuses,
    },
    publishers: {
      requests: metrics.publisherRequests,
      acceptedRequests: metrics.publisherAcceptedRequests,
      acceptedPublishers: metrics.publisherAcceptedIds.size,
      requestsPerSecond: Number(
        (metrics.publisherRequests / elapsedSeconds).toFixed(2),
      ),
      errors: metrics.publisherErrors,
      httpErrors: metrics.publisherHttpErrors,
      statuses: metrics.publisherStatuses,
      responseMs: {
        samples: metrics.publisherResponseMs.length,
        p50: rounded(percentile(metrics.publisherResponseMs, 50)),
        p95: rounded(percentile(metrics.publisherResponseMs, 95)),
        max: rounded(
          metrics.publisherResponseMs.length > 0
            ? Math.max(...metrics.publisherResponseMs)
            : Number.NaN,
        ),
      },
      cleanup: {
        requests: metrics.cleanupRequests,
        succeeded: metrics.cleanupSucceeded,
        errors: metrics.cleanupErrors,
        httpErrors: metrics.cleanupHttpErrors,
        statuses: metrics.cleanupStatuses,
      },
    },
    headroom: {
      targetProcess,
      generatorEventLoop,
      targetResponsivenessProxy: {
        sseFirstByte: {
          description:
            "loopback SSE request-to-first-byte latency; not direct target event-loop instrumentation",
          ...sseFirstByte,
        },
        controlRequests: targetResponsiveness,
      },
    },
    proof: {
      requested: options.proof,
      passed: failures.length === 0,
      failures,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  return failures.length > 0 ? 1 : 0;
}

process.exitCode = await main();
