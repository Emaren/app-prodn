import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeAoe2OsKingdomIntelligence } from "../lib/aoe2Os.ts";
import { loadPublicKingdomIntelligence } from "../lib/kingdomIntelligencePublic.ts";

async function withStore(fn: () => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aoe2war-ki-public-"));
  const previous = process.env.AOE2WAR_OS_STORE_DIR;
  process.env.AOE2WAR_OS_STORE_DIR = root;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.AOE2WAR_OS_STORE_DIR;
    else process.env.AOE2WAR_OS_STORE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("public Kingdom Intelligence is a bounded sanitized projection", async () => {
  await withStore(async () => {
    await writeAoe2OsKingdomIntelligence({
      bridgeId: "test-bridge",
      runId: null,
      sourceAction: "brain",
      payload: {
        kind: "aoe2war-kingdom-intelligence",
        generated_at: new Date().toISOString(),
        war_date: "2026.249.1720Z",
        operating_state: "ATTENTION",
        source: {
          exact: true,
          production: { source_sha: "a".repeat(40) },
          certification: { status: "CERTIFIED" },
          private_operator_path: "/Users/operator/private/repo",
        },
        health: {
          estate: "HEALTHY",
          doctor_score: 94,
          doctor_status: "ATTENTION",
          p0: 0,
          p1: 0,
        },
        storage: {
          health: "MAINTENANCE_DUE",
          volume_used_percent: 84.1,
          healthy_target_percent: 78,
          secret_receipt_path: "/mnt/private/receipt.json",
        },
        storage_campaign: {
          status: "RUNNING_TRANSACTION",
          completed_generations: 1,
          max_generations: 2,
          current_generation: "activate-20260905T021820Z-67c390cf47f4",
          pid: 16155,
          log_path: "/Users/operator/private/campaign.log",
        },
        replay_truth: {
          available: true,
          resolved: 3190,
          final_games: 4442,
          accounted_percent: 100,
          parser_work_candidates: 1150,
          matches_current_release: true,
          evidence_path: "/private/replay.json",
        },
        performance: {
          available: true,
          status: "analyzed",
          route_count: 77,
          matches_current_release: false,
          baseline: {
            ttfb_p50_ms: 398.3,
            total_p50_ms: 583.5,
          },
        },
        workspace: {
          canonical_drift_count: 0,
          active_agent_count: 1,
          dirty_agent_count: 1,
          unmerged_count: 7,
          cleanup_candidates: 17,
          private_path: "/Users/operator/agent",
        },
        activity_24h: {
          source_commits: 48,
          finish_runs: 3,
          certified_finishes: 1,
        },
        invariants: [
          {
            key: "source-authority-exact",
            status: "PASS",
            evidence: "/Users/operator/private/source",
          },
          {
            key: "private-secret-invariant",
            status: "FAIL",
            evidence: "secret-token",
          },
        ],
        best_next_action: {
          key: "storage-health",
          title: "Return Storage OS to healthy band",
          level: "DO NOW",
          action: "aoe2war storage maintain --apply --secret",
          reason: "private operator reason",
        },
        private_prompt: "do not publish me",
        chain_of_thought: "do not publish me either",
      },
    });

    const publicView = await loadPublicKingdomIntelligence();
    assert.equal(publicView.available, true);
    assert.equal(publicView.warDate, "2026.249.1720Z");
    assert.equal(publicView.source?.productionRelease, "aaaaaaaaaaaa");
    assert.equal(publicView.storageCampaign?.active, true);
    assert.equal(publicView.storageCampaign?.completedGenerations, 1);
    assert.equal(publicView.workspace?.activeAgentCount, 1);
    assert.equal(publicView.activity24h?.sourceCommits, 48);
    assert.equal(publicView.directive?.title, "Return Storage OS to healthy band");
    assert.deepEqual(publicView.invariants, [
      {
        key: "source-authority-exact",
        label: "One source of truth",
        status: "PASS",
      },
    ]);

    const rendered = JSON.stringify(publicView);
    for (const forbidden of [
      "/Users/",
      "/mnt/private",
      "secret-token",
      "private operator reason",
      "aoe2war storage maintain",
      "do not publish me",
      "chain_of_thought",
      "log_path",
      '"pid"',
      '"evidence"',
    ]) {
      assert.equal(rendered.includes(forbidden), false, forbidden);
    }
  });
});

test("public Kingdom Intelligence page makes its authority and privacy boundary explicit", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync("app/kingdom-intelligence/page.tsx", "utf8");
  const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

  assert.match(page, /THE KINGDOM/);
  assert.match(page, /HAS A MIND/);
  assert.match(page, /Truth · Provenance · Invariants · Action/);
  assert.match(page, /Public projection · sensitive operator evidence withheld/);
  assert.match(page, /chain-of-thought/);
  assert.match(page, /api\/kingdom-intelligence/);
  assert.match(shell, /\/kingdom-intelligence/);
  assert.match(shell, /Kingdom Intelligence/);
});
