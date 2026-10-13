import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditCatalog, buildTranslationAudit } from "../lib/i18n/translationAudit.ts";

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const json = (relative: string) => JSON.parse(source(relative)) as unknown;

test("shell and homepage compare keys without claiming native linguistic quality", () => {
  const en = { top: { greeting: "Hello", count: "{count} users" }, tasks: ["One", "Two"] };
  const fr = { top: { greeting: "Bonjour", count: "{count} utilisateurs" }, tasks: ["Un", ""] };
  const outcome = auditCatalog(en, fr);
  assert.equal(outcome.expected, 4);
  assert.equal(outcome.translated, 3);
  assert.equal(outcome.missing, 1);
  assert.equal(outcome.coveragePercent, 75);
  assert.deepEqual(outcome.missingExamples, ["tasks.1"]);
  assert.equal(outcome.identicalToEnglish, 0);
  assert.equal(outcome.extra, 0);
  assert.equal(auditCatalog(en, { ...fr, foreign: "untracked" }).extra, 1);
});

test("ship readiness is distinct from catalog coverage and whole-site truth", () => {
  const snapshot = buildTranslationAudit({
    languages: [
      { code: "en", nativeName: "English", englishName: "English" },
      { code: "fr", nativeName: "Français", englishName: "French" },
    ],
    shell: { en: { a: "Hello" }, fr: { a: "Bonjour" } },
    home: { en: { static: ["Hello"], dynamic: ["{name}"] }, fr: { static: ["Bonjour"], dynamic: ["{name}"] } },
  });
  const [tr, el, fr] = snapshot.rows;
  assert.deepEqual([tr.code, el.code, fr.code], ["tr", "el", "fr"]);
  assert.equal(tr.shipped, false);
  assert.equal(el.shipped, false);
  assert.equal(fr.shipped, true);
  assert.equal(fr.shell.coveragePercent, 100);
  assert.equal(fr.home.coveragePercent, 100);
  assert.equal(fr.wholeSiteCoverage, null);
  assert.equal(fr.chatTranslationQuality, "NOT_AUDITED");
  assert.equal(fr.freshness, "NOT_ATTESTED");
  assert.equal(snapshot.mutationAllowed, false);
});

test("canonical language registry has committed, nonempty shell/home catalogs", () => {
  const registry = source("../lib/i18n/languages.ts");
  const codes = [...registry.matchAll(/^\s+code:\s+"([a-zA-Z-]+)",/gm)].map((m) => m[1]);
  assert.equal(codes.length, 16);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("fr"));
  assert.ok(!codes.includes("tr"));
  assert.ok(!codes.includes("el"));
  const enShell = json("../messages/en.json");
  const enHome = json("../messages/home/en.json");
  for (const code of codes) {
    const shell = json("../messages/" + code + ".json");
    const home = json("../messages/home/" + code + ".json");
    const outcome = auditCatalog(enShell, shell);
    const homepage = auditCatalog(enHome, home);
    assert.ok(outcome.expected > 0);
    assert.ok(homepage.expected > 0);
    assert.equal(typeof outcome.coveragePercent, "number");
    assert.equal(typeof homepage.coveragePercent, "number");
  }
});

test("translation control tower is admin-only, non-mutating, and never advertises full-site completeness", () => {
  const api = source("../app/api/admin/translations/route.ts");
  const page = source("../app/admin/translations/page.tsx");
  const menu = source("../components/admin/command-tower/AdminCommandTowerPage.tsx");
  assert.match(api, /await requireAdmin\(request\)/);
  assert.match(api, /"private, no-store/);
  assert.doesNotMatch(api, /export async function POST|export async function PUT|openai|keplr/i);
  assert.match(page, /Whole site: unknown/);
  assert.match(page, /Chat quality: not audited/);
  assert.match(menu, /\/admin\/translations/);
  assert.match(page, /Türkçe/);
  assert.match(page, /Ελληνικά/);
});
