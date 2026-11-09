#!/usr/bin/env node
/** Source-only nonfunded heartbeat decoder, to be enrolled during C03. */
import { readFileSync } from "node:fs";
const file = process.argv[2];
try {
  if (!file || process.argv.length !== 3) throw Error("missing_result_file");
  const raw = readFileSync(file, "utf8");
  if (raw.length > 65536) throw Error("oversized_result");
  const result = JSON.parse(raw);
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      result.ok !== true || result.chainId !== "wolo-1" ||
      !Array.isArray(result.errors) || result.errors.length !== 0 ||
      !["created", "updated", "txsSeen", "latestHeight"].every(
        (key) => Number.isSafeInteger(result[key]) &&
          result[key] >= (key === "latestHeight" ? 1 : 0)
      )) {
    throw Error("incomplete_or_false_success");
  }
  console.log("wolo-transfer-heartbeat ok height=" + result.latestHeight +
    " seen=" + result.txsSeen + " created=" + result.created +
    " updated=" + result.updated);
} catch {
  console.error("HOLD_WOLO_HEARTBEAT_RESULT_NOT_CONFIRMED");
  process.exitCode = 3;
}
