import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Execute the actual production TSX components and the real TanStack useQuery
// hook without an HTTP server, production credentials, or a chain query.
// A route's provider ancestry is an executable contract, not a regex match.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map<string, Record<string, unknown>>();
const DISCONNECTED_KEPLR = {
  useKeplr: () => ({
    status: "disconnected",
    address: undefined,
    connect: async () => { throw new Error("Fixture must not connect a wallet"); },
  }),
};

function loadProductionModule(relativePath: string): Record<string, unknown> {
  const filename = path.resolve(ROOT, relativePath);
  if (cache.has(filename)) return cache.get(filename)!;
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = createRequire(filename);
  mod.require = (specifier: string): unknown => {
    if (specifier === "@/hooks/use-keplr") return DISCONNECTED_KEPLR;
    if (specifier === "@/hooks/useWoloBalance") {
      return loadProductionModule("hooks/useWoloBalance.ts");
    }
    if (specifier === "@/lib/woloBalanceRead") {
      return loadProductionModule("lib/woloBalanceRead.ts");
    }
    if (specifier === "@/lib/woloChain") {
      return {
        WOLO_BASE_DENOM: "uwolo",
        WOLO_CHAIN_ID: "wolo-1",
        WOLO_COIN_DECIMALS: 6,
      };
    }
    if (specifier === "@/app/Providers") {
      return loadProductionModule("app/Providers.tsx");
    }
    return originalRequire(specifier);
  };
  cache.set(filename, mod.exports as Record<string, unknown>);
  mod._compile(output, filename);
  cache.set(filename, mod.exports as Record<string, unknown>);
  return mod.exports as Record<string, unknown>;
}

const E2 = loadProductionModule("components/profile/MechaAutoBetCard.tsx").default as React.ComponentType<{ displayName: string }>;
const ProfileLayout = loadProductionModule("app/profile/layout.tsx").default as React.ComponentType<{ children: React.ReactNode }>;

test("negative control: the real E2 component rejects a missing QueryClient", () => {
  assert.throws(
    () => renderToStaticMarkup(React.createElement(E2, { displayName: "Fixture" })),
    /No QueryClient set/,
  );
});

test("profile layout supplies the real QueryClient and renders E2's visible triad", () => {
  const tree = React.createElement(
    ProfileLayout,
    {},
    React.createElement(E2, { displayName: "Fixture" }),
  );
  const html = renderToStaticMarkup(tree);
  for (const label of ["AUTO BETTING", "Mecha Fixture", "WALLET", "WAR SATCHEL", "NEXT MATCH BET", "LOAD SATCHEL", "BET PLAN", "DESYNC"]) {
    assert.ok(html.includes(label), `E2 runtime render missing: ${label}`);
  }
  assert.match(html, /COMING SOON|PREVIEW ONLY/);
  assert.doesNotMatch(html, /No QueryClient set|Application error/);
});

test("runtime fixture remains offline: no wallet transfer or custody authorization", () => {
  assert.equal(DISCONNECTED_KEPLR.useKeplr().status, "disconnected");
  const card = readFileSync(path.resolve(ROOT, "components/profile/MechaAutoBetCard.tsx"), "utf8");
  assert.match(card, /LOAD FROM WALLET · COMING SOON/);
  assert.match(card, /disabled aria-disabled="true"/);
});
