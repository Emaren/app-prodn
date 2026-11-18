import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync("app/AppShell.tsx", "utf8");
const start = source.indexOf("function KingdomMenuPanel(");
const end = source.indexOf("function HeaderLiveGamesLink(", start);
const panel = source.slice(start, end);
const originalSlate500 = [100, 116, 139]; // Tailwind slate-500: #64748b
const fixedSlate400 = [148, 163, 184];    // Tailwind slate-400: #94a3b8

const luminance = ([r, g, b]) => {
  const c = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (rgb, under) => rgb.map(v => Math.round(v * 0.98 + under * 0.02));

test("Kingdom dropdown still uses the pinned live dark-gradient rail", () => {
  assert.ok(start > 0 && end > start, "source must contain KingdomMenuPanel");
  assert.match(panel,
    /bg-\[linear-gradient\(145deg,rgba\(13,25,42,0\.98\),rgba\(5,12,22,0\.98\)\)\]/,
    "the contrast proof must be recalculated if the gradient changes");
  assert.match(panel, /className="mt-0\.5 text-xs text-slate-400"/,
    "Kingdom body labels must retain normal-text AA contrast");
  assert.doesNotMatch(panel, /className="mt-0\.5 text-xs text-slate-500"/);
});

test("original 12px slate-500 fails WCAG AA on both observed gradient stops", () => {
  const backgrounds = [[13, 25, 42], [5, 12, 22]];
  for (const bg of backgrounds) {
    for (const underneath of [0, 255]) {
      assert.ok(contrast(originalSlate500, over(bg, underneath)) < 4.5,
        "original 12px normal-weight label should demonstrably fail");
    }
  }
});

test("slate-400 text has at least 4.5:1 at both gradient stops and extreme underlays", () => {
  const backgrounds = [[13, 25, 42], [5, 12, 22]];
  for (const bg of backgrounds) {
    for (const underneath of [0, 255]) {
      assert.ok(contrast(fixedSlate400, over(bg, underneath)) >= 4.5,
        "menu label contrast must satisfy WCAG AA small text");
    }
  }
});
