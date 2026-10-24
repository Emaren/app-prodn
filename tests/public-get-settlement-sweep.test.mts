/**
 * Repository-wide public GET boundary: prevent accidentally reintroducing
 * direct settlement/reconciliation entrypoints into new HTTP read routes.
 *
 * This is a SOURCE regression tripwire, not a complete transitive call graph,
 * runtime custody guard, authorization permit or production safety proof.
 * Existing public SSR and projection-helper boundaries are covered separately
 * by the financial-producer census and public-read-finance-boundary contract.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "..");
const API = join(ROOT, "app", "api");
const RECONCILER_CALLS = new Set([
  "queueBetMarketEnsure",
  "ensureBetMarkets",
  "ensureBetMarketsAfterCommit",
  "admitCommittedLiveWatcherMarkets",
  "coordinateReplayPostIngest",
  "settleResolvedMarketWagers",
  "settleMarketIntegrityCorrections",
  "settleFounderBonuses",
  "reconcilePendingCoreBetClaims",
  "reconcileTournamentMatchProofs",
  "reconcileChampionshipEvidence",
  "executeWoloEscrowSettlementRun",
  "executeFounderWoloPayout",
  "retryPendingClaimSettlement",
]);

function apiRouteFiles(directory: string): string[] {
  const routes: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const p = join(directory, item.name);
    if (item.isDirectory()) routes.push(...apiRouteFiles(p));
    else if (item.isFile() && (item.name === "route.ts" || item.name === "route.tsx")) {
      routes.push(p);
    }
  }
  return routes.sort();
}

function exported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
}

type NamedHandler = { name: string; body: ts.Node };
type Inspection = { handlers: number; calls: string[]; unsupported: string[] };

function inspectRoute(source: string, filename = "route.ts"): Inspection {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const handlers: ts.Node[] = [];
  const definitions = new Map<string, ts.Node>();
  const importedFinancialNames = new Set<string>(RECONCILER_CALLS);
  const unsupported: string[] = [];
  const named: NamedHandler[] = [];

  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const spec of statement.importClause.namedBindings.elements) {
        if (RECONCILER_CALLS.has(spec.propertyName?.text ?? spec.name.text)) {
          importedFinancialNames.add(spec.name.text);
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      definitions.set(statement.name.text, statement);
      if (statement.name.text === "GET" && exported(statement)) {
        handlers.push(statement);
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        definitions.set(decl.name.text, decl.initializer);
        if (decl.name.text === "GET" && exported(statement)) {
          handlers.push(decl.initializer);
        }
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause &&
        ts.isNamedExports(statement.exportClause)) {
      for (const spec of statement.exportClause.elements) {
        if (spec.name.text !== "GET") continue;
        if (statement.moduleSpecifier) {
          unsupported.push("GET re-export from another module is not inspected");
        } else {
          named.push({ name: spec.propertyName?.text ?? spec.name.text, body: statement });
        }
      }
    }
  }
  for (const item of named) {
    const target = definitions.get(item.name);
    if (target) handlers.push(target);
    else unsupported.push("GET named export has no local definition");
  }

  const calls = new Set<string>();
  const visited = new Set<ts.Node>();
  function walk(node: ts.Node) {
    if (visited.has(node)) return;
    visited.add(node);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        if (importedFinancialNames.has(expr.text)) calls.add(expr.text);
        const local = definitions.get(expr.text);
        if (local) walk(local);
      } else if (ts.isPropertyAccessExpression(expr)) {
        if (RECONCILER_CALLS.has(expr.name.text)) calls.add(expr.name.text);
      } else if (ts.isElementAccessExpression(expr) &&
                 ts.isStringLiteral(expr.argumentExpression) &&
                 RECONCILER_CALLS.has(expr.argumentExpression.text)) {
        calls.add(expr.argumentExpression.text);
      }
    }
    ts.forEachChild(node, walk);
  }
  for (const handler of handlers) walk(handler);
  return { handlers: handlers.length, calls: [...calls].sort(), unsupported };
}

test("AST correctly detects direct, aliased, local-helper and property calls", () => {
  for (const code of [
    "export async function GET() { queueBetMarketEnsure(null); }",
    'import { ensureBetMarkets as wake } from "@/lib/bets"; export const GET = () => wake(null);',
    "function helper() { settleFounderBonuses(null) } export function GET() { return helper() }",
    "export const GET = async () => ops['settleMarketIntegrityCorrections'](null);",
  ]) {
    assert.ok(inspectRoute(code).calls.length > 0, code);
  }
  assert.deepEqual(inspectRoute("export async function GET(){return Response.json({value:1})}").calls, []);
  assert.equal(inspectRoute("export async function POST(){queueBetMarketEnsure(null)}").handlers, 0);
  assert.deepEqual(inspectRoute("export { GET } from './financial'").unsupported,
    ["GET re-export from another module is not inspected"]);
  assert.equal(inspectRoute("function handler(){ensureBetMarkets(null)} export { handler as GET }").calls[0],
    "ensureBetMarkets");
});

test("all API GET handlers are free from known direct finance producers", () => {
  const paths = apiRouteFiles(API);
  assert.ok(paths.length >= 200, "Unexpectedly few API routes; source census may be incomplete");
  const problems: string[] = [];
  let getters = 0;
  for (const file of paths) {
    const { handlers, calls, unsupported } = inspectRoute(readFileSync(file, "utf8"), file);
    getters += handlers;
    for (const problem of [...calls, ...unsupported]) {
      problems.push(`${relative(ROOT, file)}: ${problem}`);
    }
  }
  assert.ok(getters >= 75, "GET handler count collapsed; inspect route parser coverage");
  assert.deepEqual(problems, [], "Public GET route includes known settlement entrypoint;\n" +
    problems.join("\n"));
});
