import assert from "node:assert/strict";
import test from "node:test";

import {
  assessFundedMechaAdmission,
  type FundedAutoAdmissionInput,
} from "../lib/warSatchelFundedAdmission.ts";

const vaultAddress = "wolo1" + "a".repeat(38);
const digest = "A".repeat(64);

function fixture(): FundedAutoAdmissionInput {
  return {
    admission: {
      eligible: true,
      gameIdentityKey: "watcher:hd:game-12",
      sessionKey: "watcher:hd:game-12",
      selectedSide: "left",
      desyncMarketId: null,
      evidence: {
        mode: "shadow",
        exactSteamRosterMatch: true,
        exactUploaderUidMatch: true,
        marketIntegrityStatus: "verified",
        teamResolutionStatus: "resolved",
        teamConfidence: "high",
        propositionHash: digest,
      },
    },
    preset: {
      id: 18,
      version: 4,
      enabled: true,
      winnerStakeWolo: 250,
      desyncSide: "none",
      desyncStakeWolo: 0,
      untilOut: false,
      gamesRemaining: 4,
      selfOnly: true,
    },
    execution: {
      id: 910,
      presetId: 18,
      presetVersion: 4,
      ownerUid: "steam-owner",
      status: "shadow_ready",
      gameIdentityKey: "watcher:hd:game-12",
      winnerMarketId: 410,
      desyncMarketId: null,
      propositionHash: digest,
      selectedSide: "left",
      ticketId: null,
      reservationId: null,
      attemptCount: 0,
    },
    consent: {
      ownerUid: "steam-owner",
      version: 4,
      enabled: true,
      selfOnly: true,
      signedBudgetVerified: true,
      expiresAtUtc: "2026-10-17T01:00:00.000Z",
      perGameCapWolo: 1000,
      dailyCapWolo: 1000,
      dailyCommittedWolo: 100,
      dailyReservedWolo: 200,
    },
    balance: {
      ownerUid: "steam-owner",
      availableUwolo: "600000000",
      reservedUwolo: "200000000",
      committedUwolo: "100000000",
      withdrawalPendingUwolo: "100000000",
    },
    vault: {
      chainId: "wolo-1",
      denom: "uwolo",
      address: vaultAddress,
      bankBalanceUwolo: "2000000000",
      aggregateLiabilityUwolo: "2000000000",
      headHeight: "1200",
      observedAtUtc: "2026-10-17T00:05:00.000Z",
      evidenceHash: digest,
    },
    expectedVaultAddress: vaultAddress,
    latestCreditedDepositHeight: "1195",
    nowUtc: "2026-10-17T00:05:20.000Z",
  };
}

test("exact Watcher/Steam admission produces one *proposal*, not a spend or wager", () => {
  const result = assessFundedMechaAdmission(fixture());
  assert.deepEqual(result, {
    ready: true,
    kind: "PROPOSAL_ONLY_NOT_WAGER_AUTHORIZATION",
    executionId: 910,
    presetId: 18,
    presetVersion: 4,
    ownerUid: "steam-owner",
    gameIdentityKey: "watcher:hd:game-12",
    winnerMarketId: 410,
    desyncMarketId: null,
    selectedSide: "left",
    propositionHash: digest,
    reserveUwolo: "250000000",
    vaultEvidenceHash: digest,
  });
  assert.equal(Object.isFrozen(result), true);
});

function rejects(reason: string, alter: (f: FundedAutoAdmissionInput) => void) {
  const f = fixture();
  alter(f);
  const result = assessFundedMechaAdmission(f);
  assert.deepEqual(result, { ready: false, reason });
}

test("ineligible Watcher matching cannot become a funded proposal", () => {
  rejects("watcher_admission_not_eligible", f => {
    f.admission = {eligible:false, reason:"owner_not_exact_uploader"};
  });
});
test("stale owner identity, plan versions and consent fail closed", () => {
  rejects("owner_or_preset_version_mismatch", f => { f.balance.ownerUid="other-owner"; });
  rejects("owner_or_preset_version_mismatch", f => { f.consent.version=3; });
  rejects("owner_or_preset_version_mismatch", f => { f.execution.ownerUid="other-owner"; });
});
test("funded proposal refuses tampered Watcher evidence even if eligible is asserted", () => {
  const mutators: Array<(admission: Record<string, unknown>) => void> = [
    a => { a.gameIdentityKey = ""; },
    a => { a.sessionKey = "another-session"; },
    a => { a.selectedSide = "spectator"; },
    a => { a.desyncMarketId = -9; },
    a => { a.evidence = null; },
    a => { (a.evidence as Record<string, unknown>).mode = "replay"; },
    a => { (a.evidence as Record<string, unknown>).exactSteamRosterMatch = false; },
    a => { (a.evidence as Record<string, unknown>).exactUploaderUidMatch = false; },
    a => { (a.evidence as Record<string, unknown>).marketIntegrityStatus = "pending"; },
    a => { (a.evidence as Record<string, unknown>).teamResolutionStatus = "unknown"; },
    a => { (a.evidence as Record<string, unknown>).teamConfidence = "low"; },
    a => { (a.evidence as Record<string, unknown>).propositionHash = "  "; },
  ];
  for (const mutate of mutators) {
    const input = fixture();
    const a = structuredClone(input.admission) as unknown as Record<string, unknown>;
    mutate(a);
    input.admission = a as unknown as FundedAutoAdmissionInput["admission"];
    const result = assessFundedMechaAdmission(input);
    assert.deepEqual(result, {
      ready: false, reason: "watcher_admission_provenance_incomplete",
    });
  }
});

test("a previously accepted, leased or attempted preview cannot re-enter", () => {
  rejects("execution_already_claimed_or_not_shadow_ready", f => { f.execution.ticketId=44; });
  rejects("execution_already_claimed_or_not_shadow_ready", f => { f.execution.reservationId="old-hold"; });
  rejects("execution_already_claimed_or_not_shadow_ready", f => { f.execution.attemptCount=1; });
  rejects("execution_already_claimed_or_not_shadow_ready", f => { f.execution.status="accepted"; });
});
test("proposition or market identity drift rejects a funded conversion", () => {
  rejects("frozen_watcher_proposition_mismatch", f => { f.execution.propositionHash="B".repeat(64); });
  rejects("frozen_watcher_proposition_mismatch", f => { f.execution.gameIdentityKey="different-game"; });
  rejects("frozen_watcher_proposition_mismatch", f => { f.execution.selectedSide="right"; });
  rejects("frozen_watcher_proposition_mismatch", f => { f.execution.desyncMarketId=8; });
});
test("zero, exhausted, malformed and over-cap presets cannot initiate funding", () => {
  rejects("preset_invalid_or_exhausted", f => { f.preset.enabled=false; });
  rejects("preset_invalid_or_exhausted", f => { f.preset.gamesRemaining=0; });
  rejects("preset_invalid_or_exhausted", f => { f.preset.winnerStakeWolo=1001; });
  rejects("preset_invalid_or_exhausted", f => { f.preset.desyncSide="yes"; });
});
test("unauthenticated, expired, paused and non-self consent fail closed", () => {
  rejects("authenticated_spend_consent_absent", f => { f.consent.signedBudgetVerified=false; });
  rejects("authenticated_spend_consent_absent", f => { f.consent.enabled=false; });
  rejects("authenticated_spend_consent_absent", f => { f.consent.selfOnly=false; });
  rejects("expired_consent_or_stale_vault_evidence", f => { f.consent.expiresAtUtc=f.nowUtc; });
});
test("noncanonical and stale bank attestations never create a proposal", () => {
  rejects("expired_consent_or_stale_vault_evidence", f => { f.vault.observedAtUtc="2026-10-17T00:03:00.000Z"; });
  rejects("expired_consent_or_stale_vault_evidence", f => { f.vault.observedAtUtc="2026-10-17T00:08:00.000Z"; });
  rejects("uncertified_or_mismatched_vault_identity", f => { f.vault.chainId="foreign"; });
  rejects("uncertified_or_mismatched_vault_identity", f => { f.vault.denom="wolo"; });
  rejects("uncertified_or_mismatched_vault_identity", f => { f.vault.address="wolo1"+"b".repeat(38); });
  rejects("uncertified_or_mismatched_vault_identity", f => { f.vault.evidenceHash="not-a-digest"; });
  rejects("vault_head_does_not_cover_credited_receipt", f => { f.vault.headHeight="1194"; });
  rejects("vault_head_does_not_cover_credited_receipt", f => { f.vault.headHeight="0"; });
});
test("bank shortfalls, uncounted user liabilities and overflowed money refuse entry", () => {
  rejects("physical_vault_or_global_liability_shortfall", f => { f.vault.bankBalanceUwolo="1999999999"; });
  rejects("physical_vault_or_global_liability_shortfall", f => { f.vault.aggregateLiabilityUwolo="899999999"; });
  rejects("noncanonical_or_overflowing_uwolo", f => { f.vault.bankBalanceUwolo="1.5"; });
  rejects("noncanonical_or_overflowing_uwolo", f => { f.balance.availableUwolo="-1"; });
  rejects("noncanonical_or_overflowing_uwolo", f => { f.vault.bankBalanceUwolo="9223372036854775808"; });
});
test("daily risk exposure and verified owner balance enforce exact 1,000,000 uwolo / WOLO", () => {
  rejects("owner_signed_budget_exceeded", f => { f.consent.perGameCapWolo=200; });
  rejects("owner_signed_budget_exceeded", f => { f.consent.dailyCommittedWolo=900; });
  rejects("owner_signed_budget_exceeded", f => { f.consent.dailyCapWolo=10001; });
  rejects("insufficient_owner_available_balance", f => { f.balance.availableUwolo="249999999"; });
});
test("verified optional Desync reserves both exact stakes in one proposed ticket", () => {
  const f = fixture();
  f.preset.winnerStakeWolo=200;
  f.preset.desyncSide="yes";
  f.preset.desyncStakeWolo=50;
  f.admission = {
    ...f.admission,
    eligible: true,
    desyncMarketId: 411,
  } as typeof f.admission;
  f.execution.desyncMarketId=411;
  const result=assessFundedMechaAdmission(f);
  assert.equal(result.ready,true);
  if (result.ready) {
    assert.equal(result.desyncMarketId,411);
    assert.equal(result.reserveUwolo,"250000000");
  }
});
