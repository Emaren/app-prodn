/**
 * Offline Kingdom Index signed-criterion replay ledger.
 *
 * Caller provisions an independently controlled, persistent LOCAL filesystem
 * directory OUTSIDE the repository and web root, owned by the invoking process
 * with mode 0700. A single ledger MUST be shared across all verifier processes
 * for an authority domain. No distributed/NFS guarantee, no remote consumer,
 * and no cleanup/TTL mechanism is provided: deleting a record re-enables replay.
 *
 * This is a durable nonce primitive only. It does NOT validate a proof, enroll
 * signing keys, authorize a release, or publish a Kingdom Index score.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const HEX64 = /^[a-f0-9]{64}$/;
const hash = text => createHash("sha256").update(text).digest("hex");
const stop = message => { throw Error("KINGDOM NONCE STOP: " + message); };

/**
 * Returns the consumeNonce(namespace, nonce, payloadSha256) callback expected by
 * inspectSignedCriterionSubmission. Returns true only after both file + parent
 * directory are fsynced; returns false on an existing nonce. All I/O/permission
 * failures throw, so the verifier refuses the submission.
 *
 * Creating a token consumes the nonce even if a subsequent write/sync fails.
 * This is intentional: uncertainty never restores reuse permission.
 */
export function createDurableCriterionNonceConsumer(root) {
  if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0"))
    stop("Root must be an explicit absolute local directory");
  return async (namespace, nonce, payloadSha256) => {
    if (typeof namespace !== "string" || namespace.length < 1 || namespace.length > 512 ||
        typeof nonce !== "string" || nonce.length < 1 || nonce.length > 128 ||
        !HEX64.test(payloadSha256))
      stop("Invalid namespace, nonce or payload SHA-256");

    const dir = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const stat = await dir.stat();
      if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 ||
          (typeof process.geteuid === "function" && stat.uid !== process.geteuid()))
        stop("Replay directory must be process-owned and private (0700)");
      // Domain separation, explicit lengths, and only a hex basename prevent
      // traversal, ambiguity and disclosure of untrusted nonce bytes in paths.
      const identity = hash("aoe2war.kingdom-index.nonce.v1\0" +
        namespace.length + ":" + namespace + "\0" + nonce.length + ":" + nonce);
      const file = join(root, identity + ".nonce");
      let handle;
      try {
        handle = await open(file,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600);
      } catch (error) {
        if (error?.code === "EEXIST") return false;
        throw error;
      }
      try {
        await handle.writeFile(JSON.stringify({
          schema: 1,
          kind: "aoe2war-criterion-nonce-consumption",
          identitySha256: identity,
          payloadSha256,
        }) + "\n", "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await dir.sync();
      return true;
    } finally {
      await dir.close();
    }
  };
}
