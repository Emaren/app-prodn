import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const market = fs.readFileSync("app/market/page.tsx", "utf8");
const expansion = fs.readFileSync(
  "components/market/MarketplaceExpansionStreets.tsx",
  "utf8"
);
const inquiry = fs.readFileSync(
  "components/market/MarketplaceInquiryComposer.tsx",
  "utf8"
);

test("sacred Market Street remains byte-identical", () => {
  const sha = crypto.createHash("sha256").update(market).digest("hex");
  assert.equal(
    sha,
    "d4be74f966cdd5f9e283e7cb6d6b726962907f8fce7636c5fdb0bfd07fc421ba"
  );
});

test("expansion streets preserve the Market Street spacing grammar", () => {
  assert.match(expansion, /min-h-\[22rem\]/);
  assert.match(expansion, /mt-5 grid gap-4 lg:grid-cols-3/);
  assert.match(expansion, /grid-rows-\[1\.25rem_5rem_3\.25rem_auto\]/);
  assert.match(
    expansion,
    /mt-auto flex items-center justify-between gap-3 border-t border-white\/10 pt-4/
  );
});

test("2nd, 3rd, and 4th Street retain distinct multicolor awning palettes", () => {
  for (const token of [
    "border-blue-100/18",
    "border-rose-100/17",
    "border-violet-100/17",
    "border-sky-100/17",
    "border-indigo-100/17",
    "border-amber-100/17",
    "border-lime-100/15",
    "border-red-100/16",
    "border-cyan-100/16",
  ]) {
    assert.match(expansion, new RegExp(token.replace("/", "\\/")));
  }
});

test("Onager Repair owns the deep-blue founding awning", () => {
  assert.match(expansion, /#091a38/);
  assert.match(expansion, /#173b70_0_44px,#b89a61_44px_88px/);
  assert.doesNotMatch(expansion, /#0b2926/);
  assert.match(expansion, /compactTone=/);
  assert.match(inquiry, /compactTone\?: "teal" \| "blue"/);
  assert.match(inquiry, /compactTone === "blue"/);
});

test("occupied shop hero text uses one shared row grid", () => {
  assert.match(
    expansion,
    /mt-6 grid flex-1 grid-rows-\[1\.25rem_5rem_3\.25rem_auto\]/
  );
  assert.match(expansion, /\{shopEyebrow\(shop\)\}/);
  assert.match(expansion, /\{shop\.name\}/);
  assert.match(expansion, /\{shop\.offer\}/);
});

test("a road-sign divider sits immediately before 2nd Street", () => {
  assert.match(expansion, /function StreetArrivalSign/);
  assert.match(expansion, /The marketplace continues/);
  assert.match(expansion, /The road opens ahead\./);
  assert.match(expansion, /2nd Street is just ahead\./);
  assert.match(expansion, /Continue to 2nd Street/);
  assert.match(
    expansion,
    /<StreetArrivalSign street=\{secondStreet\} \/>\s*<MarketplaceStreet street=\{secondStreet\}/
  );
});

test("compact inquiry remains an overlay and cannot stretch its awning", () => {
  assert.match(inquiry, /absolute inset-x-3 bottom-3 top-\[6\.65rem\]/);
  assert.match(inquiry, /Open counter · 100 WOLO/);
});
