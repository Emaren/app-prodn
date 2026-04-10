import { mkdir } from "node:fs/promises";
import path from "node:path";

const targetPath = path.join(process.cwd(), ".next", "cache", "images");

try {
  await mkdir(targetPath, { recursive: true });
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EACCES") {
    console.error(
      [
        `Cannot prepare ${targetPath}.`,
        "This is usually ownership drift inside /var/www/AoE2HDBets/app-prodn/.next.",
        "Fix it before restart so Next image caching does not fail at runtime:",
        "sudo chown -R tony:tony /var/www/AoE2HDBets/app-prodn/.next",
      ].join("\n")
    );
    process.exit(1);
  }

  throw error;
}
