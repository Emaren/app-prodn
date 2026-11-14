// Restricted UID650: request canonical Git metadata only around synchronous,
 // explicitly read-only Git HEAD inventory probes. Never grant it to a whole
 // test process or to temporary Git fixture subprocesses.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function withRestrictedReadOnlyGitHead(fn) {
  if (typeof fn !== "function") throw new TypeError("read-only probe required");
  const root = process.cwd();
  const isRestricted =
    typeof process.getuid === "function" && process.getuid() === 650 &&
    root.endsWith("/PRODUCT/.aoe2_product_uid650_source_build_v1") &&
    !existsSync(join(root, ".git"));
  const dir = join(homedir(), "uid650_product_git_metadata_v1.git");
  if (!isRestricted || !existsSync(dir)) return fn();
  if (process.env.GIT_DIR || process.env.GIT_WORK_TREE) {
    throw new Error("RESTRICTED_GIT_HEAD_PROBE_INHERITED_AUTHORITY");
  }
  process.env.GIT_DIR = dir;
  process.env.GIT_WORK_TREE = root;
  try { return fn(); }
  finally {
    delete process.env.GIT_DIR;
    delete process.env.GIT_WORK_TREE;
  }
}
