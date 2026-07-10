import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);

const version = `${timestamp}-${randomBytes(5).toString("hex")}`;
const target = resolve(process.cwd(), ".aoe2war-build-version");

writeFileSync(target, `${version}\n`, "utf8");

console.log(`AoE2WAR build version: ${version}`);
