import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildBridgeGeneralInspectionsSnapshot } from "../lib/generalInspections/bridgeSnapshot.ts";

const RELEASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function mkdir(target: string) {
  mkdirSync(target, { recursive: true });
}

function writeJson(target: string, value: unknown) {
  mkdir(path.dirname(target));
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
}

function command(label: string, stdout = "") {
  return {
    label,
    returncode: 0,
    stdout_tail: stdout,
    stderr_tail: "",
  };
}

function bridgePayload(speedCurrent = true) {
  return {
    bridgeId: "test-bridge",
    generatedAt: "2026-09-19T03:09:00Z",
    receivedAt: "2026-09-19T03:09:10Z",
    payload: {
      schema: 1,
      kind: "aoe2war-kingdom-intelligence",
      generated_at: "2026-09-19T03:09:00Z",
      source: {
        exact: true,
        implementation_equivalent: true,
        local: { head: RELEASE, clean: true },
        github: { main_sha: RELEASE },
        production: {
          source_sha: RELEASE,
          clean: true,
          service: "active",
          active_build_id: "build-current",
          version_parity: true,
        },
        certification: {
          status: "CERTIFIED",
          release_sha: RELEASE,
          active_build_id: "build-current",
        },
      },
      finish: {
        status: "CERTIFIED",
        certified_runtime: true,
        closure_complete: true,
        completed_at: "2026-09-19T03:09:00Z",
        release_outcome: "CERTIFIED",
      },
      health: {
        estate: "HEALTHY",
        p0: 0,
        p1: 0,
        doctor_score: 100,
        doctor_status: "HEALTHY",
      },
      host: {
        web: "active",
        api: "active",
        failed_all: 0,
        failed_transient: 0,
        updates_total: 0,
        updates_actionable: 0,
        updates_phased_deferred: 0,
        reboot_required: false,
        wolo_8092_count: 1,
        wolo_8093_count: 1,
      },
      recovery: {
        status: "VERIFIED",
        operator_free_gib: 52,
        progress: {
          status: "COMPLETE",
          proven_count: 10,
          required_count: 10,
        },
      },
      workspace: {
        cleanup_candidates: 0,
        preserved_dirty_count: 0,
        preserved_unmerged_count: 0,
        canonical_drift_count: 0,
      },
      documentation: {
        captured_at: "2026-09-19T03:09:00Z",
        estate_gate: "PASS",
        docs_control_pass: true,
        strict_build_pass: true,
        taxonomy_audit_pass: true,
        source_checkers_passed: 5,
        source_checkers_total: 5,
        taxonomy: {
          corpus_total: 195,
          indexed_total: 191,
          intentionally_unindexed: 4,
        },
        system_map_source_sha: RELEASE,
        storage_map_source_sha: RELEASE,
        central_docs_synced: true,
        source_repositories_synced: 5,
        source_repositories_total: 5,
        watcher_version: "1.6.0",
      },
      knowledge: {
        docs_due_7d: 0,
      },
      storage: {
        health: "HEALTHY",
        root_free_bytes: 8 * 1024 ** 3,
        volume_free_bytes: 70 * 1024 ** 3,
        volume_used_percent: 78,
        protected_newest_count: 2,
        eligible_expanded_count: 0,
        verified_receipt_count: 80,
      },
      performance: {
        cold_lcp: {
          available: true,
          release_sha: RELEASE,
          matches_current_release: speedCurrent,
          generated_at: "2026-09-19T03:08:00Z",
          samples: 20,
          top_lcp_target_count: 20,
          mutation_boundary: {
            production_mutated: false,
            database_mutated: false,
            wolo_mutated: false,
          },
          metrics: {
            lcp_ms: { count: 20, p50: 780, p75: 832, p95: 898.4, max: 1020 },
            ready_ms: { count: 20, p50: 967, p75: 1004, p95: 1415, max: 1555 },
            document_ttfb_ms: { count: 20, p50: 401, p75: 414, p95: 639, max: 650 },
          },
        },
        edge_delivery: {
          available: true,
          release_sha: RELEASE,
          matches_current_release: speedCurrent,
          generated_at: "2026-09-19T03:08:00Z",
          ok: true,
          static: { passed: 27, total: 27 },
          dynamic: { passed: 20, total: 20 },
          featured_avatar: { passed: 24, total: 24 },
        },
      },
      replay_truth: {
        available: true,
        accounted_percent: 100,
        unclassified: 0,
        matches_current_release: true,
        freshness: {
          generated_at: "2026-09-19T03:00:00Z",
          age_seconds: 600,
          stale: false,
        },
      },
    },
  };
}

function makeEstate(speedCurrent = true) {
  const root = mkdtempSync(path.join(tmpdir(), "aoe2war-inspections-"));
  const volumeRoot = path.join(root, "volume");
  const aoe2war = path.join(volumeRoot, "aoe2war");
  const bridgePath = path.join(
    aoe2war,
    "os-control",
    "state",
    "kingdom-intelligence.json",
  );
  const deployRoot = path.join(aoe2war, "deploy-receipts");
  const downloadRoot = path.join(volumeRoot, "aoe2-downloads");
  const expiryRoot = path.join(aoe2war, "os-control", "storage-expiry");
  const activation = path.join(
    deployRoot,
    "activate-20260919T030800Z-" + RELEASE.slice(0, 12),
  );

  writeJson(bridgePath, bridgePayload(speedCurrent));
  writeJson(path.join(activation, "gate-receipt.json"), {
    schema: 2,
    kind: "gate-receipt",
    status: "PASS",
    target_sha: RELEASE,
    generated_at: "2026-09-19T03:07:00Z",
    required_commands: [
      "active-node-test-contract",
      "active-python-test-contract",
      "documentation-control-plane",
      "tracked-secret-scan",
      "dependency-contract",
      "prisma-generate",
      "typescript",
      "eslint-changed",
    ],
    commands: [
      command(
        "active-node-test-contract",
        "Running 330 active Node test files; 0 explicitly quarantined.\n",
      ),
      command(
        "active-python-test-contract",
        "Running 47 Python contract files.\n",
      ),
      command("documentation-control-plane"),
      command("tracked-secret-scan"),
      command("dependency-contract"),
      command("prisma-generate"),
      command("typescript"),
      command("eslint-changed"),
    ],
  });
  writeJson(path.join(activation, "stage-receipt.json"), {
    schema: 1,
    status: "STAGED",
    release_sha: RELEASE,
    candidate_build_version: "20260919030800-testbuild",
    generated_at: "2026-09-19T03:08:00Z",
    completed_at: "2026-09-19T03:08:30Z",
    wolo_mutated: false,
  });
  mkdir(activation);
  writeFileSync(
    path.join(activation, "certification.txt"),
    [
      "status=CERTIFIED",
      "release_sha=" + RELEASE,
      "source_sha=" + RELEASE,
      "active_build_id=build-current",
      "candidate_build_version=20260919030800-testbuild",
      "build_version_file=20260919030800-testbuild",
      "",
    ].join("\n"),
  );

  mkdir(downloadRoot);
  writeFileSync(path.join(downloadRoot, "AoE2HDBets Watcher 1.6.0.exe"), "");
  writeFileSync(path.join(downloadRoot, "AoE2HDBets Watcher 1.5.13.exe"), "");
  writeFileSync(path.join(downloadRoot, "watcher-release-manifest-1.5.10.json"), "{}\n");

  const campaign = path.join(expiryRoot, "campaign-20260919T030000Z");
  writeJson(path.join(campaign, "ledger.json"), {
    schema: 1,
    protected_hot: ["hot-a", "hot-b"],
    protected_cold: ["cold-a", "cold-b", "cold-c"],
    rows: [],
  });

  for (const name of [
    "build-scratch",
    "recovery-staging",
    "watcher-release-staging",
    "watcher-staging",
  ]) {
    mkdir(path.join(aoe2war, name));
  }

  return {
    root,
    options: {
      bridgePath,
      volumeRoot,
      deployRoot,
      downloadRoot,
      expiryRoot,
      rootFsPath: volumeRoot,
      now: Date.parse("2026-09-19T03:10:00Z"),
    },
  };
}

test("bridge-backed General Inspections can reach green from certified evidence", () => {
  const estate = makeEstate(true);
  try {
    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    assert.equal(snapshot.releaseSha, RELEASE);
    assert.equal(snapshot.buildVersion, "20260919030800-testbuild");
    assert.equal(snapshot.categories.length, 7);

    const byId = new Map(snapshot.categories.map((item) => [item.id, item]));
    assert.equal(byId.get("speed")?.score, 100);
    assert.equal(byId.get("documentation")?.score, 100);
    assert.equal(byId.get("organization")?.score, 100);
    assert.equal(byId.get("tests")?.score, 100);
    assert.equal(byId.get("release")?.score, 100);
    assert.equal(byId.get("security")?.score, 100);
    assert.equal(byId.get("data")?.score, 100);
    assert.equal(snapshot.overallScore, 100);
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});

test("passed Python contract remains authoritative when bounded receipt tail omits the count banner", () => {
  const estate = makeEstate(true);
  try {
    const gatePath = path.join(
      estate.options.deployRoot,
      "activate-20260919T030800Z-" + RELEASE.slice(0, 12),
      "gate-receipt.json",
    );
    const gate = JSON.parse(readFileSync(gatePath, "utf8"));
    const python = gate.commands.find(
      (item: { label?: string }) => item.label === "active-python-test-contract",
    );
    assert.ok(python);
    python.stdout_tail = "OK\n";
    python.stderr_tail = "";
    writeJson(gatePath, gate);

    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    const tests = snapshot.categories.find((item) => item.id === "tests");
    assert.ok(tests);
    assert.equal(tests.score, 100);
    const pythonCheck = tests.checks.find((item) => item.id === "python-tests");
    assert.equal(pythonCheck?.earned, 10);
    assert.equal(
      pythonCheck?.detail,
      "PASS · file count omitted from bounded receipt tail",
    );
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});

test("scope-aware certified gate does not score intentionally skipped validators as failures", () => {
  const estate = makeEstate(true);
  try {
    const gatePath = path.join(
      estate.options.deployRoot,
      "activate-20260919T030800Z-" + RELEASE.slice(0, 12),
      "gate-receipt.json",
    );
    writeJson(gatePath, {
      schema: 2,
      kind: "gate-receipt",
      status: "PASS",
      target_sha: RELEASE,
      generated_at: "2026-09-19T03:07:00Z",
      risk_class: "DOCUMENTATION",
      required_commands: [
        "documentation-control-plane",
        "tracked-secret-scan",
      ],
      commands: [
        command("documentation-control-plane"),
        command("tracked-secret-scan"),
      ],
    });

    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    const tests = snapshot.categories.find((item) => item.id === "tests");
    assert.ok(tests);
    assert.equal(tests.score, 100);
    const typescript = tests.checks.find((item) => item.id === "typescript");
    assert.equal(typescript?.detail, "Not required by certified gate scope");
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});

test("required validator missing from certified gate still fails closed", () => {
  const estate = makeEstate(true);
  try {
    const gatePath = path.join(
      estate.options.deployRoot,
      "activate-20260919T030800Z-" + RELEASE.slice(0, 12),
      "gate-receipt.json",
    );
    writeJson(gatePath, {
      schema: 2,
      kind: "gate-receipt",
      status: "PASS",
      target_sha: RELEASE,
      generated_at: "2026-09-19T03:07:00Z",
      required_commands: [
        "documentation-control-plane",
        "tracked-secret-scan",
        "typescript",
      ],
      commands: [
        command("documentation-control-plane"),
        command("tracked-secret-scan"),
      ],
    });

    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    const tests = snapshot.categories.find((item) => item.id === "tests");
    assert.ok(tests);
    assert.ok(tests.score < 100);
    const typescript = tests.checks.find((item) => item.id === "typescript");
    assert.equal(typescript?.earned, 0);
    assert.equal(typescript?.detail, "Required TypeScript proof missing");
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});

test("previous-release Speed proof visibly degrades instead of staying green", () => {
  const estate = makeEstate(false);
  try {
    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    const speed = snapshot.categories.find((item) => item.id === "speed");
    assert.ok(speed);
    assert.ok(speed.score < 100);
    assert.ok(
      snapshot.notes.some((note) =>
        note.includes("previous production release"),
      ),
    );
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});

test("governed host deferrals, review worktrees, and verified recovery staging stay green", () => {
  const estate = makeEstate(true);
  try {
    const envelope = bridgePayload(true);
    envelope.payload.host.updates_total = 5;
    envelope.payload.host.updates_actionable = 0;
    envelope.payload.host.updates_phased_deferred = 5;
    envelope.payload.workspace.preserved_dirty_count = 1;
    envelope.payload.workspace.preserved_unmerged_count = 1;

    const protectedStage = path.join(
      estate.options.volumeRoot,
      "aoe2war",
      "recovery-staging",
      "wolo",
      "verified-snapshot",
    );
    envelope.payload.recovery_campaign = {
      verification_status: "VERIFIED",
      remote_stage: protectedStage,
    };
    mkdir(protectedStage);
    const watcherEvidence = path.join(
      estate.options.volumeRoot,
      "aoe2war",
      "watcher-release-staging",
      "historical-unique-release",
    );
    const watcherDirectZip = path.join(
      estate.options.volumeRoot,
      "aoe2war",
      "watcher-staging",
      "previous-direct-zip",
    );
    mkdir(watcherEvidence);
    mkdir(watcherDirectZip);
    writeFileSync(path.join(watcherEvidence, "unique.exe"), "unique historical bytes");
    writeFileSync(path.join(watcherDirectZip, "unique.zip"), "unique direct zip bytes");
    writeJson(estate.options.bridgePath, envelope);

    const snapshot = buildBridgeGeneralInspectionsSnapshot(estate.options);
    assert.ok(snapshot);
    const organization = snapshot.categories.find(
      (item) => item.id === "organization",
    );
    const security = snapshot.categories.find((item) => item.id === "security");
    assert.ok(organization);
    assert.ok(security);

    const organizationChecks = new Map(
      organization.checks.map((item) => [item.id, item]),
    );
    const securityChecks = new Map(
      security.checks.map((item) => [item.id, item]),
    );
    assert.equal(organizationChecks.get("staging")?.state, "green");
    assert.equal(organizationChecks.get("worktrees")?.state, "green");
    assert.equal(securityChecks.get("updates")?.state, "green");
    assert.match(
      securityChecks.get("updates")?.detail || "",
      /0 actionable .* 5 phased/,
    );
  } finally {
    rmSync(estate.root, { recursive: true, force: true });
  }
});
