#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [, , sourceArg, titleArg, aliasesArg = ""] = process.argv;

if (!sourceArg || !titleArg) {
  console.error('Usage: node scripts/register-watch-preview.mjs "/tmp/clip.mp4" "Emaren vs Divided" "divided,emaren vs divided"');
  process.exit(1);
}

const root = process.cwd();
const sourceAbs = path.resolve(sourceArg);
const registryAbs = path.join(root, "public/watch/previews/registry.json");

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

if (!fs.existsSync(sourceAbs)) {
  console.error(`Missing source MP4: ${sourceAbs}`);
  process.exit(1);
}

const slug = slugify(titleArg);
if (!slug) {
  console.error(`Could not create slug from title: ${titleArg}`);
  process.exit(1);
}

const destRel = `/watch/previews/${slug}.mp4`;
const destAbs = path.join(root, "public", destRel);

fs.mkdirSync(path.dirname(destAbs), { recursive: true });

if (fs.existsSync(destAbs) && path.resolve(destAbs) !== sourceAbs) {
  fs.copyFileSync(destAbs, `${destAbs}.bak.${Date.now()}`);
}

if (path.resolve(destAbs) !== sourceAbs) {
  fs.copyFileSync(sourceAbs, destAbs);
}

fs.chmodSync(destAbs, 0o644);

let registry = { items: [] };
if (fs.existsSync(registryAbs)) {
  try {
    registry = JSON.parse(fs.readFileSync(registryAbs, "utf8"));
  } catch {
    registry = { items: [] };
  }
}

if (!Array.isArray(registry.items)) {
  registry.items = [];
}

const aliases = unique([
  titleArg,
  slug.replaceAll("-", " "),
  ...aliasesArg.split(","),
]);

const entry = {
  slug,
  title: titleArg,
  aliases,
  previewUrl: `${destRel}?v=${Date.now()}`,
  bestOfUrl: `${destRel}?v=${Date.now()}`,
  thumbnailUrl: "/watch/aoe2hd-screen.svg",
  updatedAt: new Date().toISOString(),
};

const index = registry.items.findIndex((item) => item.slug === slug || item.title === titleArg);
if (index >= 0) {
  registry.items[index] = { ...registry.items[index], ...entry };
} else {
  registry.items.push(entry);
}

registry.items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

if (fs.existsSync(registryAbs)) {
  fs.copyFileSync(registryAbs, `${registryAbs}.bak.${Date.now()}`);
}

fs.writeFileSync(registryAbs, `${JSON.stringify(registry, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, title: titleArg, slug, previewUrl: entry.previewUrl }, null, 2));
