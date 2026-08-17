import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync(
  "lib/kingdomKnowledgeRouter.ts",
  "utf8",
);

function sliceBetween(
  source: string,
  startToken: string,
  endToken: string,
) {
  const start =
    source.indexOf(startToken);
  const end =
    source.indexOf(
      endToken,
      start,
    );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(
    start,
    end,
  );
}

test("two-player rivalry questions execute only the authoritative rivalry repository", () => {
  const planner =
    sliceBetween(
      router,
      "function planKingdomKnowledgeRepositoryExecution(",
      "\nexport async function loadKingdomKnowledgeContext(",
    );

  assert.match(
    planner,
    /evidenceQueryTerms\(/,
  );

  assert.match(
    planner,
    /pairTerms\.length === 2/,
  );

  assert.match(
    planner,
    /routedRepositories\.includes\([\s\S]*?"rivalries"/,
  );

  assert.match(
    planner,
    /return \["rivalries"\];/,
  );
});

test("non-pair questions preserve the semantic router fanout", () => {
  const planner =
    sliceBetween(
      router,
      "function planKingdomKnowledgeRepositoryExecution(",
      "\nexport async function loadKingdomKnowledgeContext(",
    );

  assert.match(
    planner,
    /return routedRepositories;/,
  );
});

test("semantic routing happens before pair execution planning and only planned repositories are launched", () => {
  const load =
    router.slice(
      router.indexOf(
        "export async function loadKingdomKnowledgeContext(",
      ),
    );

  const routed =
    load.indexOf(
      "const routedRepositories =",
    );
  const args =
    load.indexOf(
      "const repositoryArgs: RepositoryArgs =",
      routed,
    );
  const planned =
    load.indexOf(
      "planKingdomKnowledgeRepositoryExecution(",
      args,
    );
  const fanout =
    load.indexOf(
      "selectedRepositories.map((id) =>",
      planned,
    );

  assert.notEqual(routed, -1);
  assert.notEqual(args, -1);
  assert.notEqual(planned, -1);
  assert.notEqual(fanout, -1);

  assert.ok(routed < args);
  assert.ok(args < planned);
  assert.ok(planned < fanout);
});

test("pair execution planning does not loosen the repository watchdog", () => {
  assert.match(
    router,
    /const DEFAULT_REPOSITORY_TIMEOUT_MS = 4_000;/,
  );
});
