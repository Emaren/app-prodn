import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import models from "../config/aoe2war-os-models.json" with { type: "json" };

function source(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("AoE2WAR OS model atlas enumerates exactly 213 distinct real schema models", () => {
  const schema = source("prisma/schema.prisma");
  const names = [...schema.matchAll(/^model\s+([A-Za-z]\w*)\s*\{/gm)].map(match => match[1]);
  assert.equal(names.length, 213);
  assert.deepEqual(models.models, names);
  assert.equal(new Set(models.models).size, models.models.length);
  assert.ok(models.models.includes("WarSatchelLedgerJournal"));
});

test("both castle navigation surfaces gain AoE2WAR OS and Television WOLO without altering primary chips", () => {
  const shell = source("app/AppShell.tsx");
  for (const href of ["/aoe2war-os", "/television-wolo"]) {
    assert.match(shell, new RegExp('href: "' + href + '".*body:'));
    assert.match(shell, new RegExp('prefix: "' + href + '".*title:'));
  }
  assert.match(shell, /const KINGDOM_LINKS = \[/);
  assert.match(shell, /const HEADER_LINKS:/);
  assert.match(shell, /href: "\/bets", label: "Bets"/);
});

test("public OS page exposes no admin route or mutation and safely distinguishes build from deployment", () => {
  const publicApi = source("app/api/aoe2war-os/route.ts");
  const evidence = source("lib/aoe2warOsPublic.ts");
  const deck = source("app/aoe2war-os/Aoe2warOsDeck.tsx");
  assert.match(publicApi, /export async function GET\(/);
  assert.doesNotMatch(publicApi, /export async function (?:POST|PATCH|PUT|DELETE)\(/);
  assert.match(evidence, /RELEASE_ACTIONS = new Set\(\["deploy", "finish", "rollback"\]\)/);
  assert.match(evidence, /RUNNING = new Set\(\["queued", "claimed", "running"\]\)/);
  assert.match(evidence, /Math\.abs\(Date\.now\(\) - Date\.parse\(beat\)\) > 90_000/);
  assert.match(evidence, /lastDeployAt: certifiedAt/);
  assert.match(evidence, /constants\.O_RDONLY \| constants\.O_NOFOLLOW/);
  assert.match(evidence, /const entry = await handle\.stat\(\)/);
  assert.match(evidence, /maxBytes = 128_000/);
  assert.match(evidence, /entry\.size > maxBytes/);
  assert.match(evidence, /await handle\.read\(bytes/);
  assert.match(evidence, /const receipt = await safeJson\(file, 750_000\)/);
  assert.doesNotMatch(evidence, /await lstat\(file\)|await readFile\(file/);
  assert.match(evidence, /await handle\?\.close\(\)/);
  assert.match(evidence, /receipt.production_deployed === true/);
  assert.match(evidence, /source === releaseSha/);
  assert.match(deck, /NO VERIFIED ACTIVE DEPLOY/);
  assert.match(deck, /BUILD ≠ DEPLOY/);
  assert.doesNotMatch(evidence, /bridgeTokenConfigured|stdoutTail|requestedByUid|requestedByUserId/);
  assert.doesNotMatch(deck, /\/api\/admin\//);
});

test("OS telemetry is bounded, user-visibility gated and fails closed on source loss", () => {
  const evidence = source("lib/aoe2warOsPublic.ts");
  const deck = source("app/aoe2war-os/Aoe2warOsDeck.tsx");
  assert.match(evidence, /next: \{ revalidate: REFRESH_SECONDS \}/);
  assert.match(evidence, /AbortSignal\.timeout\(4500\)/);
  assert.match(evidence, /Array\.isArray\(commits\) \? commits\.slice\(0, 7\)/);
  assert.match(evidence, /safeUrl\(item\.html_url\)/);
  assert.match(evidence, /lastDeployAt: certifiedAt/);
  assert.match(evidence, /receipt.production_deployed === true/);
  assert.match(evidence, /source === releaseSha/);
  assert.match(deck, /document\.hidden/);
  assert.match(deck, /45_000/);
  assert.match(deck, /poll\(\);/);
  assert.match(source("app/aoe2war-os/page.tsx"), /includeGithub: false/);
  assert.match(deck, /controller\.abort\(\)/);
});

test("AoE2WAR OS change-notice version hashes exactly the three route source files", () => {
  const files = [
    "app/aoe2war-os/Aoe2warOsDeck.module.css",
    "app/aoe2war-os/Aoe2warOsDeck.tsx",
    "app/aoe2war-os/page.tsx",
  ];
  const digest = createHash("sha256");
  for (const path of files) {
    digest.update(path);
    // Match the canonical Python generator's literal backslash-zero separator.
    digest.update(Buffer.from("\\0"));
    digest.update(readFileSync(new URL("../" + path, import.meta.url)));
    // Match the canonical Python generator's literal backslash-zero separator.
    digest.update(Buffer.from("\\0"));
  }
  const edition = "src-" + digest.digest("hex").slice(0, 20);
  const manifest = source("lib/pageChangeManifest.generated.ts");
  const generator = source("scripts/generate_page_change_manifest.py");
  assert.match(generator, /\("\/aoe2war-os", "AoE2WAR OS"\)/);
  assert.ok(manifest.includes('href: "/aoe2war-os"'));
  assert.ok(manifest.includes('version: "' + edition + '"'),
    "Page edition must be regenerated whenever the command deck source changes");
});
