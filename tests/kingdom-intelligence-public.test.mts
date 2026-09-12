import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAoe2OsRun, writeAoe2OsKingdomIntelligence } from "../lib/aoe2Os.ts";
import { loadPublicKingdomIntelligence } from "../lib/kingdomIntelligencePublic.ts";
import { buildWorkshopBrainSnapshot } from "../lib/workshopBrain.ts";

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
        system_agents: [
          {
            key: "recovery",
            label: "Recovery OS",
            state: "ACTIVE",
            summary: "Ordinary encrypted capture 1/5.",
            progress_percent: 84.6,
            progress_label: "4/5 ordinary classes · 21 chunks",
            active_process: true,
            active_since: "2026-09-07T20:00:00Z",
            current_step: "raw replay archive",
            eta_seconds: 1234,
            elapsed_seconds: 4567,
            sealed_chunks: 21,
            observed_bytes: 5800000000,
            expected_bytes: 21400000000,
            throughput_bytes_per_second: 720000,
            progress_basis: "sealed + active encrypted chunk bytes",
            private_path: "/Users/operator/recovery",
          },
          {
            key: "doctor",
            label: "System Doctor",
            state: "ATTENTION",
            summary: "Doctor 94/100.",
            progress_percent: 94,
            progress_label: "system health",
          },
          {
            key: "secret",
            label: "Secret OS",
            state: "ACTIVE",
            summary: "must not publish",
          },
        ],
        recent_source_activity: [
          {
            sha: "d".repeat(40),
            created_at: new Date().toISOString(),
            title: "Seal Recovery OS key authority",
            system: "Recovery OS",
            status: "SUCCEEDED",
            private_path: "/Users/operator/source",
          },
        ],
        memory_seals: [
          {
            sha: "e".repeat(40),
            created_at: new Date().toISOString(),
            title: "Record Recovery OS invariant",
            status: "SEALED",
            private_detail: "do not publish",
          },
        ],
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

    await createAoe2OsRun({
      action: "doctor",
      requestedByUserId: 1,
      requestedByUid: "operator",
    });

    const publicView = await loadPublicKingdomIntelligence();
    assert.equal(publicView.available, true);
    assert.equal(publicView.warDate, "2026.249.1720Z");
    assert.equal(publicView.source?.productionRelease, "aaaaaaaaaaaa");
    assert.equal(publicView.storageCampaign?.active, true);
    assert.equal(publicView.storageCampaign?.completedGenerations, 1);
    assert.equal(publicView.workspace?.activeAgentCount, 1);
    assert.equal(publicView.activity24h?.sourceCommits, 48);
    assert.equal(publicView.systemAgents.length, 2);
    assert.equal(publicView.systemAgents[0]?.label, "Recovery OS");
    assert.equal(publicView.systemAgents[0]?.progressPercent, 84.6);
    assert.equal(publicView.systemAgents[0]?.activeProcess, true);
    assert.equal(publicView.systemAgents[0]?.currentStep, "raw replay archive");
    assert.equal(publicView.systemAgents[0]?.etaSeconds, 1234);
    assert.equal(publicView.systemAgents[0]?.sealedChunks, 21);
    assert.equal(publicView.systemAgents[0]?.observedBytes, 5800000000);
    assert.equal(publicView.systemAgents[0]?.expectedBytes, 21400000000);
    assert.equal(
      publicView.systemAgents[0]?.progressBasis,
      "sealed + active encrypted chunk bytes",
    );
    assert.equal(publicView.systemAgents[1]?.etaSeconds, null);
    assert.equal(publicView.systemAgents[1]?.observedBytes, null);
    assert.equal(publicView.recentSourceActivity[0]?.sha, "dddddddddddd");
    assert.equal(publicView.memorySeals[0]?.sha, "eeeeeeeeeeee");
    assert.equal(publicView.liveActivity[0]?.system, "System Doctor");
    assert.equal(publicView.liveActivity[0]?.status, "QUEUED");
    assert.equal(publicView.directive?.title, "Return Storage OS to healthy band");

    const workshopBrain = buildWorkshopBrainSnapshot(publicView);
    assert.equal(workshopBrain.available, true);
    assert.equal(workshopBrain.warDate, "2026.249.1720Z");
    assert.equal(workshopBrain.productionRelease, "aaaaaaaaaaaa");
    assert.equal(workshopBrain.doctorScore, 94);
    assert.equal(workshopBrain.p0, 0);
    assert.equal(workshopBrain.activeSystemCount, 1);
    assert.equal(workshopBrain.attentionSystemCount, 1);
    assert.equal(workshopBrain.directiveTitle, "Return Storage OS to healthy band");

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
  const pulse = fs.readFileSync(
    "app/kingdom-intelligence/WarPulsePanel.tsx",
    "utf8",
  );
  const constellation = fs.readFileSync(
    "app/kingdom-intelligence/AgentConstellationPanel.tsx",
    "utf8",
  );
  const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

  assert.match(page, /THE KINGDOM/);
  assert.match(page, /HAS A MIND/);
  assert.match(page, /Truth · Provenance · Invariants · Action/);
  assert.match(page, /Public projection · sensitive operator evidence withheld/);
  assert.match(page, /WarPulsePanel/);
  assert.match(pulse, /War Pulse · live chronicle/);
  assert.match(page, /AgentConstellationPanel/);
  assert.match(constellation, /Eight OS agents\. One Doctor\./);
  assert.match(page, /Victory ledger/);
  assert.match(page, /Memory vault/);
  assert.match(page, /chain-of-thought/);
  assert.match(page, /loadPublicKingdomIntelligence/);
  assert.doesNotMatch(page, /fetch\("\/api\/kingdom-intelligence"/);
  assert.match(shell, /\/kingdom-intelligence/);
  assert.match(shell, /Kingdom Intelligence/);
});

test("Workshop carries one bounded Brain panel in every presentation variant", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync("app/workshop/page.tsx", "utf8");
  const experience = fs.readFileSync(
    "components/workshop/WorkshopExperience.tsx",
    "utf8",
  );
  const panel = fs.readFileSync(
    "components/workshop/WorkshopBrainPanel.tsx",
    "utf8",
  );
  const snapshot = fs.readFileSync("lib/workshopBrain.ts", "utf8");

  assert.match(page, /loadPublicKingdomIntelligence/);
  assert.match(page, /buildWorkshopBrainSnapshot/);
  assert.equal((experience.match(/<WorkshopBrainPanel brain=\{brain\} \/>/g) ?? []).length, 3);
  assert.match(panel, /Kingdom Intelligence · The Brain/);
  assert.match(panel, /Open Kingdom Intelligence/);
  assert.match(panel, /Public-safe projection only/);
  assert.match(panel, /data-workshop-brain-panel/);
  assert.match(snapshot, /WorkshopBrainSnapshot/);
  assert.doesNotMatch(panel, /chain_of_thought|private_prompt|secret_receipt_path|log_path|private_operator_path/);
  assert.doesNotMatch(snapshot, /chain_of_thought|private_prompt|secret_receipt_path|log_path|private_operator_path/);
});
