/** Purpose-specific, independently provisioned ED25519 authority for auto-wagers.
 * NEVER silently substitute the withdrawal approval key: WoloChain enforces
 * distinct activation, wager and withdrawal roles. This module contains no
 * signing key, custody address, bearer, receipt signer or spending toggle.
 */
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { readWithdrawalReviewerKey } from "./warSatchelWithdrawalReview.ts";

const HEX = /^[a-f0-9]{64}$/;

function refuse(): never {
  throw Error("SATCHEL_WAGER_REVIEW_AUTHORITY_UNAVAILABLE");
}

/** The operator must provision a DIFFERENT private, absolute, nonsymlink
 * file from WAR_SATCHEL_VERIFIER_AUTHORITY_FILE. Only a wager-role public
 * key is allowed in this file; neither key is selected by an HTTP response.
 * Missing authority or role collision is a hard stop before any new bet.
 */
export async function readWagerReviewerKey(): Promise<string> {
  const path = process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE || "";
  const withdrawalPath = process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE || "";
  if (!isAbsolute(path) || !isAbsolute(withdrawalPath) || path === withdrawalPath) refuse();
  let fd;
  try {
    if (await realpath(path) !== path || await realpath(withdrawalPath) !== withdrawalPath) refuse();
    fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await fd.stat();
    if (!before.isFile() || before.nlink !== 1 ||
        before.size < 1 || before.size > 4096 ||
        (before.mode & 0o077) !== 0) refuse();
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) refuse();
    const body = await fd.readFile({ encoding: "utf8" });
    const after = await fd.stat();
    if (Buffer.byteLength(body, "utf8") !== before.size ||
        after.size !== before.size || after.ino !== before.ino ||
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) refuse();
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        Object.getPrototypeOf(payload) !== Object.prototype) refuse();
    const keys = Reflect.ownKeys(payload);
    if (keys.length !== 1 || keys[0] !== "wager_approval_public_key_hex") refuse();
    const descriptor = Object.getOwnPropertyDescriptor(payload, "wager_approval_public_key_hex");
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) refuse();
    const wagerKey = descriptor.value;
    if (typeof wagerKey !== "string" || !HEX.test(wagerKey) ||
        wagerKey === "0".repeat(64)) refuse();
    // Role separation is enforced locally as well as by the WoloChain
    // signer config. Do not use the withdrawal key for a wager receipt.
    const withdrawalKey = await readWithdrawalReviewerKey();
    if (!HEX.test(withdrawalKey) || wagerKey === withdrawalKey) refuse();
    return wagerKey;
  } catch {
    refuse();
  } finally {
    await fd?.close();
  }
}
